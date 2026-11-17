# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import math
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Optional

HAS_TORCH = False
try:
    import torch
    from torch.utils.data import DataLoader, Dataset
    HAS_TORCH = True
except Exception:
    torch = None  # type: ignore


def cuda_info() -> dict[str, Any]:
    if not HAS_TORCH:
        return {"cuda": False, "device": "cpu"}
    if not torch.cuda.is_available():
        return {"cuda": False, "device": "cpu"}
    idx = torch.cuda.current_device()
    total = torch.cuda.get_device_properties(idx).total_memory / (1024 * 1024)
    used = torch.cuda.memory_allocated(idx) / (1024 * 1024)
    return {
        "cuda": True,
        "device": torch.cuda.get_device_name(idx),
        "vramTotalMb": total,
        "vramUsedMb": used,
    }


def _approx_tokens(text: str) -> int:
    zh = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    other = max(0, len(text) - zh)
    return max(1, int(round(zh / 1.5 + other / 4)))


_TOKENIZER = None


def tokenize_preview(texts: list[str], seq_len: int) -> list[dict[str, Any]]:
    tok = _try_tokenizer("gpt2")
    out = []
    show_drop = 48
    for t in texts:
        if tok is None:
            n = _approx_tokens(t)
            kept_n = min(seq_len, n)
            pieces = _approx_pieces(t, kept_n)
            dropped_text = t[len("".join(pieces)):] if n > seq_len else ""
            dropped = _approx_pieces(dropped_text, show_drop) if dropped_text else []
            out.append(
                {
                    "count": kept_n,
                    "totalCount": n,
                    "tokens": pieces,
                    "tokenInfos": [{"text": x} for x in pieces],
                    "dropped": dropped,
                    "droppedInfos": [{"text": x} for x in dropped],
                    "truncated": n > seq_len,
                    "approx": True,
                }
            )
            continue
        ids = tok.encode(t, add_special_tokens=False)
        kept_ids = ids[: int(seq_len)]
        drop_ids = ids[int(seq_len) :]
        kept_infos = _token_infos(tok, kept_ids)
        drop_infos = _token_infos(tok, drop_ids[:show_drop]) if drop_ids else []
        out.append(
            {
                "count": min(len(ids), int(seq_len)),
                "totalCount": len(ids),
                "tokens": [x["text"] for x in kept_infos],
                "tokenInfos": kept_infos,
                "dropped": [x["text"] for x in drop_infos],
                "droppedInfos": drop_infos,
                "truncated": len(ids) > int(seq_len),
                "keptHidden": 0,
                "droppedHidden": max(0, len(drop_ids) - show_drop),
                "approx": False,
            }
        )
    return out



def _gpt2_byte_decoder() -> dict[str, int]:
    # Inverse of the GPT-2 bytes_to_unicode map (OpenAI).
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return dict(zip((chr(c) for c in cs), bs))


_GPT2_BYTE_DECODER = _gpt2_byte_decoder()


def _token_bytes(tok, token_str: str) -> bytes | None:
    dec = getattr(tok, "byte_decoder", None) or _GPT2_BYTE_DECODER
    try:
        return bytes(dec[c] for c in token_str)
    except Exception:
        return None


def _readable_pieces(tok, ids: list[int]) -> list[str]:
    """One chip per token. Incomplete UTF-8 fragments become '…'; the completing token shows the character."""
    pieces: list[str] = []
    pending = b""
    for tid in ids:
        raw = tok.convert_ids_to_tokens(tid)
        if isinstance(raw, (list, tuple)):
            raw = raw[0] if raw else ""
        chunk = _token_bytes(tok, raw) if isinstance(raw, str) else None
        if chunk is None:
            text = tok.decode([tid], clean_up_tokenization_spaces=False)
            pieces.append(text if text and text != "\ufffd" else "…")
            continue
        pending += chunk
        try:
            text = pending.decode("utf-8")
            pending = b""
            pieces.append(text)
        except UnicodeDecodeError:
            pieces.append("…")
    return pieces


def _token_infos(tok, ids: list[int]) -> list[dict[str, Any]]:
    """Like _readable_pieces, but marks chips that together make one UTF-8 character."""
    infos: list[dict[str, Any]] = []
    pending = b""
    group_start: int | None = None
    for tid in ids:
        raw = tok.convert_ids_to_tokens(tid)
        if isinstance(raw, (list, tuple)):
            raw = raw[0] if raw else ""
        chunk = _token_bytes(tok, raw) if isinstance(raw, str) else None
        if chunk is None:
            text = tok.decode([tid], clean_up_tokenization_spaces=False)
            infos.append({"text": text if text and text != "\ufffd" else "…", "id": int(tid)})
            pending = b""
            group_start = None
            continue
        pending += chunk
        try:
            text = pending.decode("utf-8")
            pending = b""
            item: dict[str, Any] = {"text": text, "id": int(tid)}
            if group_start is not None:
                item["group"] = text
                for j in range(group_start, len(infos)):
                    infos[j]["group"] = text
                    infos[j]["incomplete"] = True
                group_start = None
            infos.append(item)
        except UnicodeDecodeError:
            if group_start is None:
                group_start = len(infos)
            infos.append({"text": "…", "id": int(tid), "incomplete": True})
    return infos


def _approx_pieces(text: str, limit: int = 32) -> list[str]:
    import re
    return re.findall("[\u4e00-\u9fff]|[A-Za-z0-9]+|\\S", text)[:limit]


def _try_tokenizer(name: str):
    global _TOKENIZER
    if _TOKENIZER is not None:
        return _TOKENIZER
    cache = globals().get("_MODEL_CACHE") or {}
    cached = cache.get("tok")
    if cached is not None and cache.get("base_name") in {None, name, "gpt2"}:
        _TOKENIZER = cached
        return _TOKENIZER

    import threading

    box: dict = {"tok": None}

    def work():
        try:
            from transformers import AutoTokenizer

            box["tok"] = AutoTokenizer.from_pretrained(name, local_files_only=True)
        except Exception:
            return
        # If the request already returned approx, later clicks can use the real tokenizer.
        global _TOKENIZER
        if _TOKENIZER is None and box["tok"] is not None:
            _TOKENIZER = box["tok"]

    th = threading.Thread(target=work, daemon=True)
    th.start()
    th.join(2.0)
    if box["tok"] is not None:
        _TOKENIZER = box["tok"]
        return _TOKENIZER
    # Do not block the teaching preview on a slow first import.
    return None


class RunStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def run_dir(self, run_id: str) -> Path:
        d = self.root / run_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def write(self, run_id: str, rec: dict[str, Any]):
        path = self.run_dir(run_id) / "run.json"
        path.write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")

    def read(self, run_id: str) -> Optional[dict[str, Any]]:
        path = self.run_dir(run_id) / "run.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def list_runs(self) -> list[dict[str, Any]]:
        rows = []
        for p in sorted(self.root.iterdir(), reverse=True):
            if (p / "run.json").exists():
                try:
                    rows.append(json.loads((p / "run.json").read_text(encoding="utf-8")))
                except Exception:
                    continue
        return rows

    def append_generations(self, run_id: str, items: list[dict[str, str]]):
        rec = self.read(run_id) or {"id": run_id}
        rec.setdefault("generations", []).extend(items)
        self.write(run_id, rec)


if HAS_TORCH:
    class TextSet(Dataset):  # type: ignore[misc]
        def __init__(self, encodings):
            self.encodings = encodings

        def __len__(self):
            return self.encodings["input_ids"].size(0)

        def __getitem__(self, i):
            return {k: v[i] for k, v in self.encodings.items()}
else:
    class TextSet:  # type: ignore
        pass


def _split_texts(texts: list[str], ratio: float, seed: int, test_ratio: float = 0.0):
    clean = [t.strip() for t in texts if t and t.strip()]
    if not clean:
        return [], [], []
    g = torch.Generator().manual_seed(int(seed))
    perm = torch.randperm(len(clean), generator=g).tolist()
    n_test = 0
    if test_ratio and len(clean) >= 3:
        n_test = max(1, min(len(clean) - 2, int(round(len(clean) * float(test_ratio)))))
    n_val = max(1, min(len(clean) - 1 - n_test, int(round(len(clean) * float(ratio)))))
    test_i = set(perm[:n_test])
    val_i = set(perm[n_test : n_test + n_val])
    train = [clean[i] for i in range(len(clean)) if i not in val_i and i not in test_i]
    val = [clean[i] for i in range(len(clean)) if i in val_i]
    test = [clean[i] for i in range(len(clean)) if i in test_i]
    if not train:
        train, val = (clean[:-1] or clean), clean[-1:]
        test = []
    return train, val, test


def _encode(tok, texts, seq_len, device):
    tok.pad_token = tok.eos_token
    enc = tok(
        texts,
        max_length=int(seq_len),
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    )
    enc["labels"] = enc["input_ids"].clone()
    enc["labels"][enc["attention_mask"] == 0] = -100
    return enc


def _build_model(recipe: dict[str, Any], device: "torch.device"):
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig, TaskType, get_peft_model

    name = "gpt2-medium" if recipe.get("base") == "gpt2-medium" else "gpt2"
    tok = AutoTokenizer.from_pretrained(name)
    tok.pad_token = tok.eos_token
    dtype = torch.float16 if recipe.get("amp") == "fp16" and device.type == "cuda" else torch.float32
    model = AutoModelForCausalLM.from_pretrained(name, torch_dtype=dtype)
    model.resize_token_embeddings(len(tok))
    method = recipe.get("method") or "lora"
    if method == "lora":
        modules = recipe.get("loraModules") or ["attn.c_attn", "attn.c_proj"]
        # peft matches suffix names; also accept bare c_attn / c_proj
        targets = []
        for m in modules:
            targets.append(m.split(".")[-1])
        targets = list(dict.fromkeys(targets)) or ["c_attn", "c_proj"]
        cfg = LoraConfig(
            r=int(recipe.get("loraR") or 16),
            lora_alpha=int(recipe.get("loraAlpha") or 32),
            lora_dropout=float(recipe.get("loraDropout") or 0.05),
            target_modules=targets,
            task_type=TaskType.CAUSAL_LM,
        )
        model = get_peft_model(model, cfg)
    elif method == "freeze":
        for p in model.parameters():
            p.requires_grad = False
        if recipe.get("freezeOutputOnly"):
            for name, p in model.named_parameters():
                if "lm_head" in name:
                    p.requires_grad = True
        else:
            n_unfreeze = int(recipe.get("freezeUnfreezeLast") or 2)
            blocks = model.transformer.h
            for blk in blocks[-n_unfreeze:]:
                for p in blk.parameters():
                    p.requires_grad = True
            for p in model.transformer.ln_f.parameters():
                p.requires_grad = True
            for p in model.lm_head.parameters():
                p.requires_grad = True
    model.to(device)
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    return model, tok, name, trainable, total


class JobController:
    def __init__(self, store: RunStore):
        self.store = store
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._run_id: Optional[str] = None
        self._pause = threading.Event()
        self._stop = threading.Event()
        self._events: dict[str, list[dict[str, Any]]] = {}
        self._status: dict[str, str] = {}

    def events_since(self, run_id: str, last: int) -> list[dict[str, Any]]:
        ev = self._events.get(run_id, [])
        return ev[last:]

    def status(self, run_id: str) -> str:
        return self._status.get(run_id, "missing")

    def emit(self, run_id: str, ev: dict[str, Any]):
        ev = dict(ev)
        ev.setdefault("ts", int(time.time() * 1000))
        ev.setdefault("runId", run_id)
        self._events.setdefault(run_id, []).append(ev)

    def start(self, run_id: str, recipe: dict[str, Any], texts: list[str], resume=False, max_steps=None):
        with self._lock:
            if self._thread and self._thread.is_alive() and self._status.get(self._run_id) == "running":
                raise RuntimeError("A run is already in progress. Pause or stop it first.")
            self._run_id = run_id
            self._pause.clear()
            self._stop.clear()
            self._status[run_id] = "running"
            self._events.setdefault(run_id, [])
            t = threading.Thread(
                target=self._run,
                args=(run_id, recipe, texts, resume, max_steps),
                daemon=True,
            )
            self._thread = t
            t.start()

    def pause(self, run_id: Optional[str] = None):
        self._pause.set()
        rid = run_id or self._run_id
        if rid:
            self._status[rid] = "paused"
            self.emit(rid, {"type": "status", "status": "paused", "message": "paused"})

    def resume(self, run_id: Optional[str] = None):
        self._pause.clear()
        rid = run_id or self._run_id
        if rid:
            self._status[rid] = "running"
            self.emit(rid, {"type": "status", "status": "running", "message": "resumed"})

    def stop(self, run_id: Optional[str] = None):
        self._stop.set()
        self._pause.clear()
        rid = run_id or self._run_id
        if rid:
            self._status[rid] = "stopping"
            self.emit(rid, {"type": "status", "status": "stopping", "message": "stopping"})

    def _run(self, run_id: str, recipe: dict[str, Any], texts: list[str], resume: bool, max_steps: Optional[int]):
        rec = {
            "id": run_id,
            "createdAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "recipe": recipe,
            "status": "running",
            "metrics": [],
            "logs": [],
            "samplesCount": len(texts),
        }
        self.store.write(run_id, rec)
        try:
            self._train_loop(run_id, recipe, texts, resume, max_steps, rec)
        except Exception as e:
            msg = f"{e}\n{traceback.format_exc()}"
            self.emit(run_id, {"type": "error", "status": "error", "message": str(e)})
            rec["status"] = "error"
            rec["stoppedReason"] = str(e)
            rec.setdefault("logs", []).append(msg)
            self.store.write(run_id, rec)
            self._status[run_id] = "error"

    def _train_loop(self, run_id, recipe, texts, resume, max_steps, rec):
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.emit(run_id, {"type": "log", "message": f"device={device} base={recipe.get('base','gpt2')} method={recipe.get('method')}"})
        model, tok, name, trainable, total = _build_model(recipe, device)
        self.emit(run_id, {"type": "log", "message": f"model={name} trainable={trainable} / {total}"})

        provided_train = recipe.get("_trainTexts") or recipe.get("trainTexts")
        provided_val = recipe.get("_valTexts") or recipe.get("valTexts")
        provided_test = recipe.get("_testTexts") or recipe.get("testTexts")
        # Explicit lists (from the studio) win, so the on-screen split stays fixed.
        if isinstance(provided_train, list) and isinstance(provided_val, list) and provided_train and provided_val:
            train_texts = [str(x).strip() for x in provided_train if str(x).strip()]
            val_texts = [str(x).strip() for x in provided_val if str(x).strip()]
            test_texts = [str(x).strip() for x in (provided_test or []) if str(x).strip()]
        else:
            train_texts, val_texts, test_texts = _split_texts(
                texts,
                float(recipe.get("valRatio") or 0.1),
                int(recipe.get("seed") or 42),
                float(recipe.get("testRatio") or 0.0),
            )
        leak = bool(recipe.get("leakVal"))
        rec["leakVal"] = leak
        rec["split"] = {"train": len(train_texts), "val": len(val_texts), "test": len(test_texts), "leaked": leak}
        if leak:
            # Teach a false-good validation score: val examples are also used in the update.
            train_for_update = train_texts + val_texts
            self.emit(run_id, {"type": "log", "message": f"LEAK on: val texts were mixed into training. split train={len(train_texts)} val={len(val_texts)} test={len(test_texts)}"})
        else:
            train_for_update = train_texts
            self.emit(run_id, {"type": "log", "message": f"split train={len(train_texts)} val={len(val_texts)} test={len(test_texts)}"})
        seq = int(recipe.get("seqLen") or 512)
        train_enc = _encode(tok, train_for_update, seq, device)
        val_enc = _encode(tok, val_texts, seq, device)
        test_enc = _encode(tok, test_texts, seq, device) if test_texts else None
        bs = int(recipe.get("batchSize") or 2)
        train_loader = DataLoader(TextSet(train_enc), batch_size=bs, shuffle=True)
        val_loader = DataLoader(TextSet(val_enc), batch_size=max(1, min(bs, 2)), shuffle=False)
        test_loader = DataLoader(TextSet(test_enc), batch_size=max(1, min(bs, 2)), shuffle=False) if test_enc is not None else None

        params = [p for p in model.parameters() if p.requires_grad]
        lr = float(recipe.get("lr") or 2e-4)
        wd = float(recipe.get("weightDecay") or 0.0)
        opt = torch.optim.AdamW(params, lr=lr, weight_decay=wd)

        epochs = int(recipe.get("epochs") or 3)
        accum = int(recipe.get("gradAccum") or 4)
        steps_per_epoch = max(1, math.ceil(len(train_loader) / accum))
        total_steps = steps_per_epoch * epochs
        if max_steps:
            total_steps = min(total_steps, int(max_steps))
        warmup = int(recipe.get("warmup") or 0)
        sched_name = recipe.get("scheduler") or "cosine"

        def lr_at(step):
            if warmup and step < warmup:
                return lr * float(step + 1) / float(max(1, warmup))
            remain = max(1, total_steps - warmup)
            t = min(1.0, max(0.0, (step - warmup) / remain))
            if sched_name == "constant":
                return lr
            if sched_name == "linear":
                return lr * (1.0 - t)
            # cosine
            return lr * 0.5 * (1.0 + math.cos(math.pi * t))

        start_step = 0
        ckpt = self.store.run_dir(run_id) / "checkpoint"
        if resume and ckpt.exists():
            try:
                blob = torch.load(ckpt / "trainer.pt", map_location=device)
                opt.load_state_dict(blob["opt"])
                start_step = int(blob.get("step") or 0)
                if hasattr(model, "load_state_dict"):
                    model.load_state_dict(blob["model"], strict=False)
                self.emit(run_id, {"type": "log", "message": f"resumed from step {start_step}"})
            except Exception as e:
                self.emit(run_id, {"type": "log", "message": f"resume failed, starting fresh: {e}"})

        use_fp16 = recipe.get("amp") == "fp16" and device.type == "cuda"
        scaler = torch.cuda.amp.GradScaler(enabled=use_fp16) if device.type == "cuda" else None
        clip = recipe.get("gradClip")
        clip = float(clip) if clip else 0.0
        patience = recipe.get("earlyStop")
        patience = int(patience) if patience else 0
        best_val = None
        best_step = None
        best_state = None
        stale = 0
        step = start_step
        opt.zero_grad(set_to_none=True)
        stopped = "completed"
        model.train()
        eval_every = int(recipe.get("evalEvery") or 0)
        use_best = recipe.get("useBestCheckpoint", True)
        if use_best is None:
            use_best = True

        def evaluate(loader):
            if loader is None:
                return None
            model.eval()
            losses = []
            with torch.no_grad():
                for batch in loader:
                    batch = {k: v.to(device) for k, v in batch.items()}
                    with torch.cuda.amp.autocast(enabled=use_fp16) if device.type == "cuda" else _nullctx():
                        out = model(**batch)
                    losses.append(float(out.loss.detach().cpu()))
            model.train()
            if not losses:
                return None
            return sum(losses) / max(1, len(losses))

        global_micro = 0
        for epoch in range(epochs):
            if self._stop.is_set() or step >= total_steps:
                if self._stop.is_set():
                    stopped = "stopped"
                break
            for batch in train_loader:
                while self._pause.is_set() and not self._stop.is_set():
                    time.sleep(0.2)
                if self._stop.is_set() or step >= total_steps:
                    if self._stop.is_set():
                        stopped = "stopped"
                    break
                cur_lr = lr_at(step)
                for g in opt.param_groups:
                    g["lr"] = cur_lr
                batch = {k: v.to(device) for k, v in batch.items()}
                with torch.cuda.amp.autocast(enabled=use_fp16) if device.type == "cuda" else _nullctx():
                    out = model(**batch)
                    loss = out.loss / accum
                if scaler is not None:
                    scaler.scale(loss).backward()
                else:
                    loss.backward()
                global_micro += 1
                if global_micro % accum == 0:
                    if scaler is not None:
                        if clip:
                            scaler.unscale_(opt)
                            torch.nn.utils.clip_grad_norm_(params, clip)
                        scaler.step(opt)
                        scaler.update()
                    else:
                        if clip:
                            torch.nn.utils.clip_grad_norm_(params, clip)
                        opt.step()
                    opt.zero_grad(set_to_none=True)
                    step += 1
                    train_loss = float(loss.detach().cpu()) * accum
                    vram = None
                    if device.type == "cuda":
                        vram = torch.cuda.memory_allocated() / (1024 * 1024)
                    ev = {
                        "type": "metric",
                        "status": "running",
                        "step": step,
                        "epoch": epoch + 1,
                        "trainLoss": train_loss,
                        "lr": cur_lr,
                        "vramMb": vram,
                        "message": f"step {step}/{total_steps} train_loss={train_loss:.4f}",
                    }
                    # eval every epoch, or every evalEvery steps, and at the end
                    every = eval_every if eval_every > 0 else max(1, steps_per_epoch)
                    if step == 1 or step % every == 0 or step >= total_steps:
                        try:
                            ev["valLoss"] = evaluate(val_loader)
                            ev["message"] += f" val_loss={ev['valLoss']:.4f}"
                            if best_val is None or ev["valLoss"] < best_val - 1e-4:
                                best_val = ev["valLoss"]
                                best_step = step
                                stale = 0
                                best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
                                ev["bestVal"] = True
                                ev["bestValStep"] = best_step
                                ev["bestValLoss"] = best_val
                            else:
                                stale += 1
                        except Exception as e:
                            self.emit(run_id, {"type": "log", "message": f"eval failed: {e}"})
                    self.emit(run_id, ev)
                    rec["metrics"].append({k: ev[k] for k in ev if k in {"step", "epoch", "trainLoss", "valLoss", "lr", "vramMb"}})
                    rec["logs"].append(ev["message"])
                    rec["status"] = "running"
                    self.store.write(run_id, rec)
                    if patience and stale >= patience and ev.get("valLoss") is not None:
                        stopped = "early_stop"
                        self.emit(run_id, {"type": "log", "message": f"early stop after {stale} non-improving evals"})
                        break
            if stopped != "completed":
                break

        # save last checkpoint + adapter; prefer the best-validation weights for export/generate
        folder = self.store.run_dir(run_id)
        ckpt.mkdir(parents=True, exist_ok=True)
        try:
            torch.save({"step": step, "opt": opt.state_dict(), "model": model.state_dict()}, ckpt / "trainer.pt")
            rec["checkpoint"] = str(ckpt)
            rec["bestValLoss"] = best_val
            rec["bestValStep"] = best_step
            rec["lastStep"] = step
            used = "last"
            if use_best and best_state is not None and best_step is not None:
                model.load_state_dict(best_state, strict=False)
                used = "best"
                self.emit(run_id, {"type": "log", "message": f"kept best validation checkpoint at step {best_step} (val_loss={best_val:.4f})"})
            rec["usedCheckpoint"] = used
            if test_loader is not None:
                try:
                    rec["testLoss"] = evaluate(test_loader)
                    self.emit(run_id, {"type": "log", "message": f"test_loss={rec['testLoss']:.4f}"})
                except Exception as e:
                    self.emit(run_id, {"type": "log", "message": f"test eval failed: {e}"})
            adapter = folder / "adapter"
            adapter.mkdir(parents=True, exist_ok=True)
            if hasattr(model, "save_pretrained"):
                model.save_pretrained(adapter)
                tok.save_pretrained(adapter)
        except Exception as e:
            self.emit(run_id, {"type": "log", "message": f"save failed: {e}"})

        rec["status"] = "done" if stopped in {"completed", "early_stop"} else stopped
        rec["stoppedReason"] = stopped
        # drop bulky inline lists from the stored recipe copy if present
        if isinstance(rec.get("recipe"), dict):
            for k in ("_trainTexts", "_valTexts", "_testTexts", "trainTexts", "valTexts", "testTexts"):
                rec["recipe"].pop(k, None)
        self.store.write(run_id, rec)
        self._status[run_id] = rec["status"]
        self.emit(run_id, {"type": "done", "status": rec["status"], "step": step, "bestValStep": best_step, "bestValLoss": best_val, "message": f"finished ({stopped}) at step {step}"})


class _nullctx:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


_MODEL_CACHE: dict[str, Any] = {
    "device": None,
    "base_name": None,
    "tok": None,
    "base": None,
    "tuned_id": None,
    "tuned": None,
}


def _device():
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _release(model):
    if model is None:
        return
    try:
        del model
        if HAS_TORCH and torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _base_name_for(run_id, store: RunStore | None) -> str:
    rec = store.read(run_id) if run_id and store is not None else None
    if rec and rec.get("recipe", {}).get("base") == "gpt2-medium":
        return "gpt2-medium"
    return "gpt2"



def _from_pretrained(fn, name, **kwargs):
    """Prefer the local Hugging Face cache so a brief network blip cannot stall a contrast."""
    try:
        return fn(name, local_files_only=True, **kwargs)
    except Exception:
        return fn(name, **kwargs)


def _load_models(run_id, store: RunStore | None):
    """Load a frozen base and (if possible) a separate fine-tuned copy. Never wrap the base in-place."""
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    device = _device()
    name = _base_name_for(run_id, store)
    cache = _MODEL_CACHE
    if cache["device"] != str(device) or cache["base_name"] != name or cache["base"] is None:
        _release(cache.get("base"))
        _release(cache.get("tuned"))
        tok = _from_pretrained(AutoTokenizer.from_pretrained, name)
        tok.pad_token = tok.eos_token
        base = _from_pretrained(AutoModelForCausalLM.from_pretrained, name).to(device)
        base.eval()
        cache.update({"device": str(device), "base_name": name, "tok": tok, "base": base, "tuned_id": None, "tuned": None})

    if run_id and store is not None and cache.get("tuned_id") != run_id:
        _release(cache.get("tuned"))
        cache["tuned"] = None
        cache["tuned_id"] = None
        adapter = store.run_dir(run_id) / "adapter"
        ckpt = store.run_dir(run_id) / "checkpoint" / "trainer.pt"
        tuned = None
        if adapter.exists():
            try:
                fresh = _from_pretrained(AutoModelForCausalLM.from_pretrained, name).to(device)
                tuned = PeftModel.from_pretrained(fresh, str(adapter)).to(device)
                tuned.eval()
            except Exception:
                tuned = None
        if tuned is None and ckpt.exists():
            try:
                tuned = _from_pretrained(AutoModelForCausalLM.from_pretrained, name)
                blob = torch.load(ckpt, map_location=device)
                tuned.load_state_dict(blob["model"], strict=False)
                tuned.to(device)
                tuned.eval()
            except Exception:
                tuned = None
        cache["tuned"] = tuned
        cache["tuned_id"] = run_id if tuned is not None else None

    if not run_id:
        # keep cached tuned for a later call; just don't return it
        return cache["base"], None, cache["tok"], name, False

    has_tuned = cache.get("tuned") is not None and cache.get("tuned_id") == run_id
    return cache["base"], cache.get("tuned") if has_tuned else None, cache["tok"], name, has_tuned


def _apply_sampling_mask(logits, temperature, top_k, top_p):
    t = max(0.05, float(temperature) if temperature is not None else 1.0)
    logits = logits / t
    if top_k and int(top_k) > 0:
        k = min(int(top_k), logits.numel())
        thresh = torch.topk(logits, k).values[-1]
        logits = logits.masked_fill(logits < thresh, float("-inf"))
    p = float(top_p) if top_p is not None else 1.0
    if 0 < p < 1:
        sorted_logits, sorted_idx = torch.sort(logits, descending=True)
        cum = torch.softmax(sorted_logits, dim=-1).cumsum(dim=-1)
        mask = cum > p
        mask[..., 1:] = mask[..., :-1].clone()
        mask[..., 0] = False
        sorted_logits = sorted_logits.masked_fill(mask, float("-inf"))
        logits = torch.full_like(logits, float("-inf")).scatter(0, sorted_idx, sorted_logits)
    return logits


def next_token_ranks(model, tok, prompt: str, temperature, top_k, top_p, k: int = 10) -> list[dict[str, Any]]:
    if model is None or not prompt:
        return []
    device = next(model.parameters()).device
    model.eval()
    inputs = tok(prompt, return_tensors="pt")
    inputs = {key: val.to(device) for key, val in inputs.items()}
    with torch.no_grad():
        logits = model(**inputs).logits[0, -1].float()
        masked = _apply_sampling_mask(logits, temperature, top_k, top_p)
        probs = torch.softmax(masked, dim=-1)
        # if everything was masked (degenerate), fall back to raw softmax
        if not torch.isfinite(probs).any() or float(probs.sum()) == 0:
            probs = torch.softmax(logits / max(0.05, float(temperature) or 1.0), dim=-1)
        topv, topi = torch.topk(probs, min(int(k), probs.numel()))
    infos = _token_infos(tok, [int(i) for i in topi.tolist()])
    rows = []
    for i, info in enumerate(infos):
        text = info.get("text") or ""
        rows.append(
            {
                "token": text,
                "display": text,
                "id": int(topi[i]),
                "prob": float(topv[i]),
            }
        )
    return rows


def generate_pair(prompts, temperature, top_k, top_p, max_length, run_id, store: RunStore):
    if not HAS_TORCH:
        raise RuntimeError("torch missing")

    device = _device()
    base, tuned, tok, _name, has_tuned = _load_models(run_id, store)

    def one(model, prompt: str) -> str:
        if model is None:
            return ""
        model.eval()
        inputs = tok(prompt, return_tensors="pt")
        inputs = {key: val.to(device) for key, val in inputs.items()}
        with torch.no_grad():
            out = model.generate(
                **inputs,
                do_sample=True,
                temperature=max(0.05, float(temperature)),
                top_k=int(top_k) or 50,
                top_p=float(top_p) or 0.9,
                max_new_tokens=int(max_length) or 80,
                pad_token_id=tok.eos_token_id,
            )
        text = tok.decode(out[0], skip_special_tokens=True)
        if text.startswith(prompt):
            return text[len(prompt) :].strip() or text
        return text

    items = []
    for p in prompts:
        p = (p or "").strip()
        if not p:
            continue
        items.append(
            {
                "prompt": p,
                "base": one(base, p),
                "tuned": one(tuned, p) if has_tuned else "",
                "baseProbs": next_token_ranks(base, tok, p, temperature, top_k, top_p),
                "tunedProbs": next_token_ranks(tuned, tok, p, temperature, top_k, top_p) if has_tuned else [],
                "hasTuned": has_tuned,
            }
        )
    return items


def next_token_pair(prompts, temperature, top_k, top_p, run_id, store: RunStore, k: int = 10):
    if not HAS_TORCH:
        raise RuntimeError("torch missing")
    base, tuned, tok, _name, has_tuned = _load_models(run_id, store)
    items = []
    for p in prompts:
        p = (p or "").strip()
        if not p:
            continue
        items.append(
            {
                "prompt": p,
                "baseProbs": next_token_ranks(base, tok, p, temperature, top_k, top_p, k=k),
                "tunedProbs": next_token_ranks(tuned, tok, p, temperature, top_k, top_p, k=k) if has_tuned else [],
                "hasTuned": has_tuned,
            }
        )
    return items

# --- lora sankey forward (appended) ---

PREFERRED_LORA_RUN = "20261110-212809-032a06"
_SANKY_MAX_SEQ = 64


def _has_adapter(store: RunStore | None, run_id: str | None) -> bool:
    if not run_id or store is None:
        return False
    folder = store.run_dir(run_id)
    adapter = folder / "adapter"
    if (adapter / "adapter_config.json").exists():
        return True
    if any(adapter.glob("adapter_model.*")):
        return True
    ckpt = folder / "checkpoint" / "trainer.pt"
    return ckpt.exists()


def resolve_sankey_run_id(run_id, store: RunStore | None) -> str | None:
    requested = (run_id or "").strip() or None
    if requested and _has_adapter(store, requested):
        return requested
    if _has_adapter(store, PREFERRED_LORA_RUN):
        return PREFERRED_LORA_RUN
    if store is None:
        return None
    try:
        runs = store.list_runs()
    except Exception:
        return None
    for rec in runs:
        rid = rec.get("id") if isinstance(rec, dict) else None
        status = (rec.get("status") if isinstance(rec, dict) else "") or ""
        reason = (rec.get("stoppedReason") if isinstance(rec, dict) else "") or ""
        if rid and _has_adapter(store, rid) and status in {"done", "completed", "stopped"} or (
            rid and _has_adapter(store, rid) and reason == "completed"
        ):
            return rid
    for rec in runs:
        rid = rec.get("id") if isinstance(rec, dict) else None
        if rid and _has_adapter(store, rid):
            return rid
    return None


def _gpt2_blocks(model):
    m = model
    # PeftModel.get_base_model() returns the wrapped GPT2LMHeadModel.
    # Do not use HF PreTrainedModel.base_model: on GPT-2 that is the
    # .transformer submodule, which would skip .transformer.h below.
    if hasattr(m, "get_base_model"):
        try:
            got = m.get_base_model()
            if got is not None:
                m = got
        except Exception:
            pass
    if hasattr(m, "transformer") and hasattr(m.transformer, 'h'):
        return list(m.transformer.h)
    if hasattr(m, "h"):
        return list(m.h)
    raise RuntimeError("Could not find GPT-2 transformer blocks on the loaded model.")


def _round_num(v: float, ndigits: int = 6) -> float:
    x = float(v)
    if x != x or x in (float("inf"), float("-inf")):
        return 0.0
    return round(x, ndigits)


def _maps_from_tensors(raw, scaled, probs):
    """Build the five classroom attention maps for one layer. Shapes: [1, heads, seq, seq] or [heads, seq, seq]."""
    if raw.dim() == 4:
        raw = raw[0]
        scaled = scaled[0]
        probs = probs[0]
    n_heads, seq, _ = raw.shape
    outputs = {}
    raw_np = raw.tolist()
    scaled_np = scaled.tolist()
    prob_np = probs.tolist()
    for h in range(n_heads):
        attn_rows = []
        scaled_rows = []
        masked_rows = []
        soft_rows = []
        for i in range(seq):
            a_row, s_row, m_row, p_row = [], [], [], []
            for j in range(seq):
                a = _round_num(raw_np[h][i][j])
                s = _round_num(scaled_np[h][i][j])
                p = _round_num(max(0.0, prob_np[h][i][j]))
                a_row.append(a)
                s_row.append(s)
                if j > i:
                    m_row.append(None)
                    p_row.append(0.0)
                else:
                    m_row.append(s)
                    p_row.append(p)
            attn_rows.append(a_row)
            scaled_rows.append(s_row)
            masked_rows.append(m_row)
            soft_rows.append(p_row)
        size = seq * seq
        dims = [seq, seq]
        prefix = f"block_{None}_attn_head_{h}_"  # placeholder, filled by caller
        outputs[h] = {
            "attn": {"data": attn_rows, "dims": dims, "size": size},
            "attn_scaled": {"data": scaled_rows, "dims": dims, "size": size},
            "attn_masked": {"data": masked_rows, "dims": dims, "size": size},
            "attn_softmax": {"data": soft_rows, "dims": dims, "size": size},
            "attn_dropout": {"data": [row[:] for row in soft_rows], "dims": dims, "size": size},
        }
    return outputs


def _pack_layer_outputs(layer_idx: int, head_maps: dict) -> dict:
    out = {}
    for h, stages in head_maps.items():
        for stage, blob in stages.items():
            out[f"block_{layer_idx}_attn_head_{h}_{stage if stage != 'attn' else 'attn'}"] = blob
            # keys: block_i_attn_head_j_attn / _attn_scaled / _attn_masked / _attn_softmax / _attn_dropout
    # Fix the 'attn' key: the dict key in stages is 'attn' so f"..._{stage}" is already correct
    # for attn -> block_i_attn_head_h_attn. Good.
    return out


def _forward_sankey_one(model, tok, text: str, device) -> dict[str, Any]:
    model.eval()
    inputs = tok(text, return_tensors="pt", add_special_tokens=False)
    ids = inputs["input_ids"][0].tolist()
    truncated = False
    if len(ids) > _SANKY_MAX_SEQ:
        ids = ids[-_SANKY_MAX_SEQ:]
        truncated = True
        inputs = {"input_ids": torch.tensor([ids], device=device)}
    else:
        inputs = {k: v.to(device) for k, v in inputs.items()}

    blocks = _gpt2_blocks(model)
    captured: list = [None] * len(blocks)
    hook_errors: list[str] = []
    handles = []

    def _capture_from_qkv(idx, module, query_states, key_states, value_states):
        raw = torch.matmul(query_states, key_states.transpose(-1, -2))
        scale = getattr(module, "scaling", None)
        if scale is None:
            scale = (value_states.size(-1) ** 0.5) ** -1
        scaled = raw * scale
        if getattr(module, "scale_attn_by_inverse_layer_idx", False):
            scaled = scaled / float(idx + 1)
        seq_q = scaled.size(-2)
        seq_k = scaled.size(-1)
        i_idx = torch.arange(seq_q, device=scaled.device).unsqueeze(1) + (seq_k - seq_q)
        j_idx = torch.arange(seq_k, device=scaled.device).unsqueeze(0)
        causal = j_idx <= i_idx
        fill = torch.finfo(scaled.dtype).min
        sm_in = scaled.masked_fill(~causal, fill)
        sm = torch.softmax(sm_in, dim=-1)
        captured[idx] = (
            raw.detach().float().cpu(),
            scaled.detach().float().cpu(),
            sm.detach().float().cpu(),
        )

    for i, block in enumerate(blocks):
        attn = block.attn

        def make(idx, module):
            def hook(_mod, _inputs, output):
                try:
                    query_states, key_states, value_states = output.split(module.split_size, dim=2)
                    shape_kv = (*key_states.shape[:-1], -1, module.head_dim)
                    key_states = key_states.view(shape_kv).transpose(1, 2)
                    value_states = value_states.view(shape_kv).transpose(1, 2)
                    shape_q = (*query_states.shape[:-1], -1, module.head_dim)
                    query_states = query_states.view(shape_q).transpose(1, 2)
                    _capture_from_qkv(idx, module, query_states, key_states, value_states)
                except Exception as exc:
                    hook_errors.append(f"layer {idx}: {type(exc).__name__}: {exc}")
            return hook

        handles.append(attn.c_attn.register_forward_hook(make(i, attn)))

    try:
        with torch.no_grad():
            result = model(**inputs)
            logits = result.logits[0, -1].float().cpu()
    finally:
        for h in handles:
            try:
                h.remove()
            except Exception:
                pass

    missing = [i for i, trip in enumerate(captured) if trip is None]
    if missing:
        detail = "; ".join(hook_errors) or "hooks did not fire"
        raise RuntimeError(f"attention maps missing for layers {missing}: {detail}")

    outputs: dict[str, Any] = {}
    for i, trip in enumerate(captured):
        head_maps = _maps_from_tensors(*trip)
        for h, stages in head_maps.items():
            for stage, blob in stages.items():
                key = f"block_{i}_attn_head_{h}_{stage}"
                outputs[key] = blob

    token_ids = ids
    tokens = _readable_pieces(tok, token_ids)
    token_infos = _token_infos(tok, token_ids)
    logit_list = [_round_num(v, 5) for v in logits.tolist()]
    return {
        "tokens": tokens,
        "tokenInfos": token_infos,
        "tokenIds": token_ids,
        "logits": logit_list,
        "outputs": outputs,
        "truncated": truncated,
        "seqLen": len(token_ids),
    }


def _lora_module_list(tuned) -> list[str]:
    found: set[str] = set()
    try:
        params = list(tuned.named_parameters())
    except Exception:
        return []
    for name, _p in params:
        if "lora_" not in name:
            continue
        if ".attn.c_attn" in name:
            found.add("attn.c_attn")
        elif ".attn.c_proj" in name:
            found.add("attn.c_proj")
        elif ".mlp.c_proj" in name:
            found.add("mlp.c_proj")
        elif ".mlp.c_fc" in name:
            found.add("mlp.c_fc")
    order = ["attn.c_attn", "attn.c_proj", "mlp.c_fc", "mlp.c_proj"]
    return [m for m in order if m in found] + sorted(found - set(order))


def _adapter_meta(run_id, store: RunStore | None, tuned) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "runId": run_id,
        "r": None,
        "alpha": None,
        "dropout": None,
        "recipeModules": [],
        "actualModules": _lora_module_list(tuned) if tuned is not None else [],
        "method": "lora",
        "base": "gpt2",
    }
    if not run_id or store is None:
        return meta
    rec = store.read(run_id) or {}
    recipe = rec.get("recipe") or {}
    meta["method"] = recipe.get("method") or "lora"
    meta["base"] = recipe.get("base") or "gpt2"
    meta["r"] = recipe.get("loraR")
    meta["alpha"] = recipe.get("loraAlpha")
    meta["dropout"] = recipe.get("loraDropout")
    meta["recipeModules"] = list(recipe.get("loraModules") or [])
    adapter_cfg = store.run_dir(run_id) / "adapter" / "adapter_config.json"
    if adapter_cfg.exists():
        try:
            cfg = json.loads(adapter_cfg.read_text(encoding="utf-8"))
            meta["r"] = cfg.get("r", meta["r"])
            meta["alpha"] = cfg.get("lora_alpha", meta["alpha"])
            meta["dropout"] = cfg.get("lora_dropout", meta["dropout"])
            meta["peftTargets"] = list(cfg.get("target_modules") or [])
        except Exception:
            pass
    return meta



def _sankey_focus(base_pack, tuned_pack) -> dict[str, Any]:
    """Pick the layer/head whose displayed attention map (dropout/softmax) changes most."""
    best = (0, 0, 0.0)
    if not base_pack or not tuned_pack:
        return {"suggestBlock": 0, "suggestHead": 0, "maxAttnDelta": 0.0}
    bout = base_pack.get("outputs") or {}
    tout = tuned_pack.get("outputs") or {}
    for key, blob in bout.items():
        if not key.endswith("_attn_dropout"):
            continue
        other = tout.get(key)
        if not other:
            continue
        mid = key[len("block_") :]
        layer_s, rest = mid.split("_attn_head_")
        head_s = rest.split("_", 1)[0]
        mx = 0.0
        for i, row in enumerate(blob["data"]):
            o_row = other["data"][i]
            for j, a in enumerate(row):
                b = o_row[j]
                if a is None and b is None:
                    continue
                d = abs((a or 0.0) - (b or 0.0))
                if d > mx:
                    mx = d
        if mx > best[2]:
            best = (int(layer_s), int(head_s), mx)
    return {"suggestBlock": best[0], "suggestHead": best[1], "maxAttnDelta": round(best[2], 6)}



_SANKEY_PAIR_CACHE: dict[tuple[str, str], dict[str, Any]] = {}
_SANKEY_PAIR_CACHE_MAX = 12


def _is_kept_sankey_key(key: str) -> bool:
    """Keep raw scores and the displayed softmax/dropout map; other stages are rebuilt in the browser."""
    if key.endswith("_attn_dropout"):
        return True
    return key.endswith("_attn") and "_attn_scaled" not in key and "_attn_masked" not in key and "_attn_softmax" not in key


def _slim_pack(pack: dict[str, Any] | None) -> dict[str, Any] | None:
    if not pack:
        return pack
    outs = pack.get("outputs") or {}
    slim = {k: v for k, v in outs.items() if _is_kept_sankey_key(k)}
    next_pack = dict(pack)
    next_pack["outputs"] = slim
    return next_pack


def _sankey_scale_meta(model) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "attnScale": 0.125,
        "scaleAttnByInverseLayerIdx": False,
        "payloadSlim": True,
    }
    try:
        blocks = _gpt2_blocks(model)
        attn = blocks[0].attn if blocks else None
        if attn is not None:
            head_dim = getattr(attn, "head_dim", 64) or 64
            scale = getattr(attn, "scaling", None)
            if scale is None:
                scale = (float(head_dim) ** 0.5) ** -1
            meta["attnScale"] = float(scale)
            meta["scaleAttnByInverseLayerIdx"] = bool(getattr(attn, "scale_attn_by_inverse_layer_idx", False))
    except Exception:
        pass
    return meta


def sankey_forward_pair(text: str, run_id, store: RunStore | None) -> dict[str, Any]:
    """Run frozen PyTorch GPT-2 and (if possible) the same model plus this LoRA.

    Returns classroom-shaped tokens / logits / attention maps for both sides.
    This is inference only — it never trains, and it never touches the browser ONNX.
    Attention intermediates that the classroom can rebuild (scaled / masked / softmax)
    are omitted from the payload so the browser is not asked to parse ~14MB of JSON.
    """
    if not HAS_TORCH:
        raise RuntimeError("torch missing")
    prompt = (text or "").strip()
    if not prompt:
        raise ValueError("text is empty")

    resolved = resolve_sankey_run_id(run_id, store)
    cache_key = (prompt, resolved or "")
    cached = _SANKEY_PAIR_CACHE.get(cache_key)
    if cached is not None:
        out = dict(cached)
        meta = dict(cached.get("meta") or {})
        meta["cached"] = True
        out["meta"] = meta
        return out

    device = _device()
    base, tuned, tok, name, has_tuned = _load_models(resolved, store)
    if tok is None or base is None:
        raise RuntimeError("failed to load GPT-2 on the trainer")

    base_pack = _forward_sankey_one(base, tok, prompt, device)
    tuned_pack = _forward_sankey_one(tuned, tok, prompt, device) if has_tuned and tuned is not None else None
    meta = _adapter_meta(resolved, store, tuned if has_tuned else None)
    meta.update(
        {
            "requestedRunId": (run_id or "").strip() or None,
            "resolvedRunId": resolved,
            "hasTuned": bool(has_tuned and tuned_pack is not None),
            "baseName": name,
            "engine": "pytorch-trainer",
            "onnxUsed": False,
            "maxSeq": _SANKY_MAX_SEQ,
            "cached": False,
        }
    )
    meta.update(_sankey_focus(base_pack, tuned_pack))
    meta.update(_sankey_scale_meta(base))
    result = {
        "text": prompt,
        "base": _slim_pack(base_pack),
        "tuned": _slim_pack(tuned_pack) if tuned_pack else None,
        "meta": meta,
    }
    _SANKEY_PAIR_CACHE[cache_key] = result
    while len(_SANKEY_PAIR_CACHE) > _SANKEY_PAIR_CACHE_MAX:
        oldest = next(iter(_SANKEY_PAIR_CACHE))
        if oldest == cache_key:
            break
        _SANKEY_PAIR_CACHE.pop(oldest, None)
    return result


def _completion_logprob(model, tok, prompt: str, completion: str, device):
    """Mean log-probability of completion tokens given the prompt (teacher forcing)."""
    if model is None or not prompt or completion is None:
        return None
    model.eval()
    prompt_ids = tok.encode(prompt, add_special_tokens=False)
    full_ids = tok.encode(str(prompt) + str(completion), add_special_tokens=False)
    if not full_ids or len(full_ids) < 2:
        return None
    start = len(prompt_ids)
    if start < 1:
        start = 1
    if start >= len(full_ids):
        start = max(1, len(full_ids) // 2)
    ids = torch.tensor([full_ids], device=device)
    with torch.no_grad():
        logits = model(ids).logits[0].float()
    logp = torch.log_softmax(logits[:-1], dim=-1)
    lps = []
    for i in range(start, len(full_ids)):
        lps.append(float(logp[i - 1, int(full_ids[i])].item()))
    if not lps:
        return None
    total = float(sum(lps))
    return {"sum": total, "mean": total / len(lps), "n": float(len(lps))}


def preference_score_pairs(pairs, run_id, store: RunStore):
    """Score chosen vs rejected completions under baseline GPT-2 and this LoRA. Forward only."""
    if not HAS_TORCH:
        raise RuntimeError("torch missing")
    device = _device()
    base, tuned, tok, name, has_tuned = _load_models(run_id, store)

    def margin(a, b):
        if not a or not b:
            return None
        return a["mean"] - b["mean"]

    items = []
    for p in pairs or []:
        prompt = (p.get("prompt") or "").strip()
        chosen = p.get("chosen") or ""
        rejected = p.get("rejected") or ""
        if not prompt or not chosen or not rejected:
            continue
        b_c = _completion_logprob(base, tok, prompt, chosen, device)
        b_r = _completion_logprob(base, tok, prompt, rejected, device)
        t_c = _completion_logprob(tuned, tok, prompt, chosen, device) if has_tuned else None
        t_r = _completion_logprob(tuned, tok, prompt, rejected, device) if has_tuned else None
        items.append(
            {
                "id": p.get("id"),
                "prompt": prompt,
                "chosen": chosen,
                "rejected": rejected,
                "baseChosen": None if not b_c else b_c["mean"],
                "baseRejected": None if not b_r else b_r["mean"],
                "baseMargin": margin(b_c, b_r),
                "tunedChosen": None if not t_c else t_c["mean"],
                "tunedRejected": None if not t_r else t_r["mean"],
                "tunedMargin": margin(t_c, t_r),
                "hasTuned": has_tuned,
            }
        )
    return {
        "items": items,
        "meta": {
            "runId": run_id,
            "hasTuned": has_tuned,
            "engine": "pytorch",
            "baseName": name,
            "kind": "live-score",
        },
    }

