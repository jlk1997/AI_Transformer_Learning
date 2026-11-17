# -*- coding: utf-8 -*-
"""Phase 2: teaching memory, snapshot digest, relevance gates, context budget.

Never dumps the raw snapshot into a prompt or a student-facing answer.
Never logs or forwards API keys, base URLs, or keyLast4.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from tutor_retrieve import (
    compose_answer,
    is_common_question,
    is_right_question,
    is_cross_course_question,
    retrieve,
    is_loss_or_later,
    should_answer_from_corpus,
    is_textbook_question,
    is_later_lab_area,
    _is_first_screen,
    format_token_for_display,
    humanize_special_tokens_in_text,
)

# Strict prompt/context budget (characters, compact Chinese + English).
MAX_DIGEST_CHARS = 1100
MAX_MEMORY_CHARS = 560
MAX_EVIDENCE_CHARS = 1500
MAX_EVIDENCE_CARDS = 3
MAX_PROMPT_CHARS = 3800
MAX_TURN_ANSWER_CHARS = 520

SECRET_KEYS = {
    "apikey",
    "api_key",
    "authorization",
    "baseurl",
    "base_url",
    "keylast4",
    "key_last4",
    "secret",
    "secrets",
    "access_token",
    "accesstoken",
    "password",
    "bearer",
}

# Student-facing spoilers while the matching knob is still locked.
LOCKED_TERMS = {
    "sampling": (
        "温度",
        "temperature",
        "top-k",
        "top-p",
        "topk",
        "topp",
        "抽词旋钮",
        "sampling knob",
        "截断核采样",
        "核采样",
        "nucleus sampling",
    ),
    "imageKnobs": ("CFG", "cfg", "classifier-free", "引导尺度", "引导旋钮"),
    "musicKnobs": ("温度", "temperature", "top-k", "top-p", "topk", "topp", "截断核采样", "核采样", "nucleus sampling"),
    "lmhead": ("输出头", "解嵌入", "lm_head", "unembedding", "unembed", "output head", "output-head"),
    "mask": ("因果掩码", "causal mask"),
    "layernorm": ("层归一化", "LayerNorm", "layer normalization", "layer-normalization"),
    "embed_matrix": ("嵌入矩阵",),
    "qkv": ("Q/K/V", "查询向量", "K^T", "softmax(Q"),
    "lowrank": ("低秩", "low-rank", "low rank"),
}
ALWAYS_EARLY_SPOILERS = ("LoRA", "QLoRA", "DPO", "学习率", "learning rate", "learning-rate")


def _course(snapshot: dict[str, Any]) -> str:
    return str((snapshot or {}).get("course") or "text")


def _locale_zh(snapshot: dict[str, Any]) -> bool:
    return str((snapshot or {}).get("locale") or "zh-CN") != "en"


def _unlocked(snapshot: dict[str, Any]) -> dict[str, Any]:
    u = (snapshot or {}).get("unlocked") or {}
    return u if isinstance(u, dict) else {}


def _is_early(snapshot: dict[str, Any]) -> bool:
    course = _course(snapshot)
    try:
        idx = int(snapshot.get("stationIndex") or 0)
    except (TypeError, ValueError):
        idx = 0
    st = str(snapshot.get("station") or "")
    if course == "text":
        return (not snapshot.get("textPathDone")) and (idx <= 1 or st in {"", "generate", "tokens"})
    if course in {"image", "music"}:
        return idx <= 1 or st in {"", "map"}
    if course == "finetune":
        if is_later_lab_area(snapshot):
            return False
        return idx <= 1 or st in {"", "map", "pack", "see"}
    return idx <= 1


def sanitize_snapshot(snapshot: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Drop secrets and obviously oversized blobs. Keep teaching fields only."""
    if not isinstance(snapshot, dict):
        return {}
    out: dict[str, Any] = {}
    for key, val in snapshot.items():
        lk = str(key).replace("-", "_").lower()
        if lk in SECRET_KEYS or lk.endswith("apikey") or lk.endswith("api_key"):
            continue
        if lk in {"authorization", "auth"}:
            continue
        out[key] = _sanitize_value(val, depth=0)
    out.pop("apiKey", None)
    out.pop("authorization", None)
    out.pop("baseUrl", None)
    out.pop("keyLast4", None)
    return out


def _sanitize_value(val: Any, depth: int) -> Any:
    if depth > 4:
        return None
    if isinstance(val, dict):
        clean: dict[str, Any] = {}
        for k, v in val.items():
            lk = str(k).replace("-", "_").lower()
            if lk in SECRET_KEYS or lk in {"apikey", "baseurl", "keylast4"}:
                continue
            clean[k] = _sanitize_value(v, depth + 1)
        return clean
    if isinstance(val, list):
        return [_sanitize_value(v, depth + 1) for v in val[:12]]
    if isinstance(val, str) and len(val) > 2000:
        return val[:2000]
    return val


def _fmt_pct(val: Any) -> str:
    try:
        return f"{float(val):.1f}%"
    except (TypeError, ValueError):
        return str(val)


def live_top_line(snapshot: dict[str, Any], limit: int = 4) -> str:
    tops = (snapshot or {}).get("topCandidates") or []
    live = (snapshot or {}).get("live") or {}
    if not tops and isinstance(live, dict):
        tops = live.get("topCandidates") or []
    bits = []
    if isinstance(tops, list):
        for row in tops[:limit]:
            if not isinstance(row, dict):
                continue
            tok = format_token_for_display(str(row.get("token") or row.get("label") or "").strip(), _locale_zh(snapshot))
            if not tok:
                continue
            pct = row.get("percent")
            if pct is not None:
                bits.append(f"{tok} {_fmt_pct(pct)}")
            else:
                bits.append(tok)
    return "，".join(bits)


def live_numbers(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Structured live figures the tutor is allowed to mention."""
    live = (snapshot or {}).get("live")
    live = live if isinstance(live, dict) else {}
    tops = (snapshot or {}).get("topCandidates") or live.get("topCandidates") or []
    nums: dict[str, Any] = {
        "topLine": live_top_line(snapshot),
        "tops": [],
        "token": format_token_for_display(str(snapshot.get("token") or live.get("token") or ""), _locale_zh(snapshot)),
        "layer": snapshot.get("layer") if snapshot.get("layer") is not None else live.get("layer"),
        "head": snapshot.get("head") if snapshot.get("head") is not None else live.get("head"),
        "imageStep": live.get("imageStep", snapshot.get("imageStep")),
        "imageSteps": live.get("imageSteps"),
        "ftTokenCount": None,
        "ftTokens": [],
        "ftApprox": False,
        "generated": bool(snapshot.get("generated")),
    }
    if isinstance(tops, list):
        for row in tops[:6]:
            if isinstance(row, dict) and (row.get("token") or row.get("label")):
                nums["tops"].append(
                    {
                        "token": format_token_for_display(str(row.get("token") or row.get("label")), _locale_zh(snapshot)),
                        "percent": row.get("percent"),
                    }
                )
    tokprev = live.get("ftTokenPreview") or snapshot.get("ftTokenPreview") or {}
    if isinstance(tokprev, dict):
        try:
            nums["ftTokenCount"] = int(tokprev.get("count")) if tokprev.get("count") is not None else None
        except (TypeError, ValueError):
            nums["ftTokenCount"] = None
        toks = tokprev.get("tokens") or []
        if isinstance(toks, list):
            nums["ftTokens"] = [str(t) for t in toks[:8]]
        nums["ftApprox"] = bool(tokprev.get("approx"))
    return nums


def digest_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Compact, student-safe digest. Not a raw snapshot dump."""
    zh = _locale_zh(snapshot)
    course = _course(snapshot)
    unlocked = _unlocked(snapshot)
    nums = live_numbers(snapshot)
    live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
    regions = snapshot.get("visibleRegions") or live.get("visibleRegions") or []
    last = snapshot.get("lastAction") or live.get("lastAction")
    lines: list[str] = []
    title = snapshot.get("stationTitle") or snapshot.get("station") or ""
    lines.append(f"course={course} station={title} idx={snapshot.get('stationIndex')}")
    if regions:
        if isinstance(regions, list):
            lines.append("visible: " + ", ".join(str(r) for r in regions[:8]))
        else:
            lines.append(f"visible: {regions}")
    if nums.get("topLine"):
        lines.append("live numbers (must match the screen; do not invent): " + nums["topLine"])
    if nums.get("token"):
        lines.append(f"current token: {nums['token']}")
    if nums.get("layer") is not None or nums.get("head") is not None:
        lines.append(f"layer={nums.get('layer')} head={nums.get('head')}")
    if course == "image" and nums.get("imageStep") is not None:
        total = nums.get("imageSteps")
        step_s = f"{nums['imageStep']}" + (f"/{total}" if total is not None else "")
        lines.append(f"denoise step now: {step_s}")
    if course == "finetune":
        if nums.get("ftTokenCount") is not None:
            approx = " approx" if nums.get("ftApprox") else ""
            bits = " ".join(nums.get("ftTokens") or [])
            lines.append(f"tokenize preview: {nums['ftTokenCount']} pieces{approx}" + (f" e.g. {bits}" if bits else ""))
        spine = live.get("ftSpine") or snapshot.get("spineView")
        if spine:
            lines.append(f"studio view: {spine}")
        status = live.get("ftStatus")
        if status:
            lines.append(f"train status: {status} (do not start a train)")
    locked = []
    if course == "text" and not unlocked.get("sampling"):
        locked.append("sampling-knobs")
    if course == "image" and not unlocked.get("imageKnobs"):
        locked.append("image-knobs")
    if course == "music" and not unlocked.get("musicKnobs"):
        locked.append("music-knobs")
    if (course != "finetune" or _is_early(snapshot)) and not is_later_lab_area(snapshot):
        locked.append("later-lab (LoRA/QLoRA/DPO)")
    if locked:
        lines.append("still locked (do not name these in the answer): " + ", ".join(locked))
    if snapshot.get("generated") is not None:
        lines.append(f"has already taken a visible step: {bool(snapshot.get('generated'))}")
    if last and isinstance(last, dict):
        lines.append("last student action: " + str(last.get("label") or last.get("kind") or "")[:80])
    text = "\n".join(lines)
    if len(text) > MAX_DIGEST_CHARS:
        text = text[: MAX_DIGEST_CHARS - 1] + "…"
    return {"text": text, "lines": lines, "live": nums, "lockedFlags": locked, "zh": zh}


def compress_memory(snapshot: dict[str, Any], limit: int = 3) -> list[dict[str, str]]:
    recent = snapshot.get("recentQA") or []
    taught = snapshot.get("taughtIds") or []
    out: list[dict[str, str]] = []
    course = _course(snapshot)
    if isinstance(recent, list):
        for item in recent[-limit:]:
            if not isinstance(item, dict):
                continue
            item_course = str(item.get("course") or "")
            if item_course and item_course != course:
                continue
            q = re.sub(r"\s+", " ", str(item.get("q") or "")).strip()[:80]
            a = re.sub(r"\s+", " ", str(item.get("a") or "")).strip()
            # Compress prior answers to one idea, not a re-lecture.
            a = a.split("出处")[0].split("Source:")[0].strip()
            if len(a) > 120:
                a = a[:117] + "…"
            if q or a:
                out.append({"q": q, "a": a})
    if isinstance(taught, list) and taught:
        out.append({"q": "", "a": "already taught cards: " + ", ".join(str(x) for x in taught[-8:])})
    # Budget
    blob = " ".join(f"{x.get('q')} {x.get('a')}" for x in out)
    while out and len(blob) > MAX_MEMORY_CHARS:
        out.pop(0)
        blob = " ".join(f"{x.get('q')} {x.get('a')}" for x in out)
    return out


def memory_text(memory: list[dict[str, str]], zh: bool) -> str:
    if not memory:
        return ""
    lines = ["Already explained in this session (do not repeat the same opening):" if not zh else "本会话已经讲过（不要把同一段开头再讲一遍）："]
    for item in memory:
        if item.get("q"):
            lines.append(f"Q: {item['q']}")
        if item.get("a"):
            lines.append(f"A: {item['a']}")
    text = "\n".join(lines)
    return text[:MAX_MEMORY_CHARS]



def _is_curtain_memory_item(item: dict[str, str]) -> bool:
    a = str((item or {}).get("a") or "")
    q = str((item or {}).get("q") or "")
    blob = a + " " + q
    return any(
        s in blob
        for s in (
            "请先点「开始看图」",
            "请先点「开始看谱」",
            "请先点「开始微调课」",
            "对照帘收起之后",
            "After the contrast curtain closes",
            "Please click “Start the image course”",
            "Please click “Start the music course”",
            "Please click “Start the fine-tune course”",
        )
    )


def _has_real_prior_teaching(memory: list[dict[str, str]]) -> bool:
    for item in memory or []:
        if _is_curtain_memory_item(item):
            continue
        if str((item or {}).get("q") or "").strip() or str((item or {}).get("a") or "").strip():
            if str((item or {}).get("a") or "").startswith("already taught cards:"):
                continue
            return True
    return False


def is_followup_cue(question: str) -> bool:
    q = (question or "").strip().lower()
    cues = ("然后呢", "接下来", "再往下", "刚才讲", "刚才说", "再看一眼", "what next", "and then", "what now")
    return any(c in q for c in cues)


def teaching_goal(question: str, retrieval: dict[str, Any], snapshot: dict[str, Any], memory: list[dict[str, str]]) -> str:
    zh = _locale_zh(snapshot)
    if is_right_question(question):
        return "看清右边正在显示的数或对照，只讲这一处。" if zh else "See the live numbers or comparison on the right, and only that."
    if is_common_question(question) and memory:
        return "在已经认识画面的基础上往前走一步，不要重复开场。" if zh else "Advance one step from what was already seen; do not repeat the opening."
    if is_common_question(question):
        return "先让学生看见当前这一屏最要紧的一块。" if zh else "Let the student see the most important region on this screen first."
    cards = (retrieval or {}).get("cards") or []
    if cards:
        title = cards[0].get("titleZh") if zh else cards[0].get("titleEn")
        return f"只讲一个点：{title}" if title else ("只讲眼前这一个点。" if zh else "Teach only one point now on screen.")
    return "只指到眼前看得见的东西，不要编造。" if zh else "Point at what is actually visible; do not invent."


def _opening_fingerprint(text: str) -> str:
    s = re.sub(r"\s+", "", text or "")
    s = s.split("出处")[0].split("Source:")[0]
    return s[:80]


def is_repeat_of_memory(text: str, memory: list[dict[str, str]]) -> bool:
    fp = _opening_fingerprint(text)
    if len(fp) < 16:
        return False
    for item in memory:
        prev = _opening_fingerprint(item.get("a") or "")
        if len(prev) < 16:
            continue
        if fp == prev or fp.startswith(prev[:40]) or prev.startswith(fp[:40]):
            return True
        # crude overlap
        common = 0
        for i in range(0, min(len(fp), len(prev))):
            if fp[i] == prev[i]:
                common += 1
            else:
                break
        if common >= 28:
            return True
    return False


def locked_term_patterns(snapshot: dict[str, Any]) -> list[str]:
    unlocked = _unlocked(snapshot)
    course = _course(snapshot)
    terms: list[str] = []
    if course == "text" and not unlocked.get("sampling"):
        terms.extend(LOCKED_TERMS["sampling"])
    if course == "image" and not unlocked.get("imageKnobs"):
        terms.extend(LOCKED_TERMS["imageKnobs"])
    if course == "music" and not unlocked.get("musicKnobs"):
        terms.extend(LOCKED_TERMS["musicKnobs"])
    if course == "text" and _is_first_screen(snapshot):
        terms.extend(LOCKED_TERMS["lmhead"])
        terms.extend(LOCKED_TERMS["mask"])
        terms.extend(LOCKED_TERMS["layernorm"])
        terms.extend(LOCKED_TERMS["embed_matrix"])
        terms.extend(LOCKED_TERMS["qkv"])
    elif course == "text":
        live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
        page = str((live or {}).get("textbookPage") or snapshot.get("textbookPage") or "")
        pop = str((live or {}).get("popover") or snapshot.get("popover") or "")
        try:
            idx = int(snapshot.get("stationIndex") or 0)
        except (TypeError, ValueError):
            idx = 0
        st = str(snapshot.get("station") or "")
        attn_or_later = idx >= 2 or st in {"attention", "layers", "residual", "knobs", "invite"} or bool(_unlocked(snapshot).get("textPathDone"))
        residual_or_later = idx >= 4 or st in {"residual", "knobs", "invite"} or bool(_unlocked(snapshot).get("textPathDone"))
        if not (attn_or_later or page == "masked-self-attention" or pop in {"attention", "qkv"}):
            terms.extend(LOCKED_TERMS["mask"])
        if not (attn_or_later or page == "qkv" or pop == "qkv"):
            terms.extend(LOCKED_TERMS["qkv"])
        if not (residual_or_later or page == "layer-normalization" or pop in {"ln", "layernorm"}):
            terms.extend(LOCKED_TERMS["layernorm"])
        if _is_first_screen(snapshot):
            terms.extend(LOCKED_TERMS["embed_matrix"])
    early = _is_early(snapshot)
    if (course != "finetune" or early) and not is_later_lab_area(snapshot):
        terms.extend(ALWAYS_EARLY_SPOILERS)
    if course == "finetune" and not is_loss_or_later(snapshot):
        terms.extend(("梯度", "反向传播", "gradient", "backprop", "backpropagation", "back-propagation"))
    if course == "finetune" and not is_later_lab_area(snapshot):
        terms.extend(LOCKED_TERMS["lowrank"])
    if course in {"text", "image", "music"}:
        terms.extend(LOCKED_TERMS["lowrank"])
    # unique, longer first
    seen = set()
    out = []
    for t in sorted(terms, key=len, reverse=True):
        k = t.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
    return out


def scrub_locked(text: str, snapshot: dict[str, Any]) -> str:
    if not text:
        return text
    terms = locked_term_patterns(snapshot)
    if not terms:
        return text
    # Drop clauses / short sentences that mention a locked term.
    parts = re.split(r"(?<=[。！？.!?\n])", text)
    kept: list[str] = []
    for part in parts:
        raw = part
        low = part.lower()
        if any(t.lower() in low or t in part for t in terms):
            # Keep the surrounding teaching if we can just drop a trailing clause.
            cleaned = part
            for t in terms:
                cleaned = re.sub(r"[，,、][^。；;\n]{0,24}" + re.escape(t) + r"[^。；;\n]{0,24}", "", cleaned, flags=re.I)
                cleaned = re.sub(re.escape(t), "", cleaned, flags=re.I)
            cleaned = re.sub(r"（\s*[/、, ]*\s*）", "", cleaned)
            cleaned = re.sub(r"\(\s*[/,\s]*\)", "", cleaned)
            cleaned = re.sub(r"也不用拧。", "。", cleaned)
            cleaned = re.sub(r"任务区里的现在还锁着。", "任务区里有些控件现在还锁着。", cleaned)
            cleaned = re.sub(r" +", " ", cleaned).strip()
            if cleaned and not any(t.lower() in cleaned.lower() or t in cleaned for t in terms):
                if not cleaned.endswith(("。", "！", "？", ".", "!", "?", "\n")) and raw.endswith(("。", "！", "？", ".", "!", "?")):
                    cleaned += "。" if "。" in text or "你" in text else "."
                kept.append(cleaned if cleaned.endswith("\n") else cleaned)
            continue
        kept.append(part)
    out = "".join(kept)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r"[，,]\s*。", "。", out)
    return humanize_special_tokens_in_text(out.strip(), _locale_zh(snapshot))


def ground_live_numbers(text: str, snapshot: dict[str, Any]) -> str:
    """If we mention a candidate list, use the live on-screen figures only."""
    nums = live_numbers(snapshot)
    line = nums.get("topLine") or ""
    if not text:
        return text
    if line and "{topList}" in text:
        text = text.replace("{topList}", line)
    # If the answer talks about the right-hand table but has no live figures, attach them.
    if line and any(w in text for w in ("右边", "右表", "百分比", "概率", "right", "percent", "probability", "候选")):
        # Replace an obviously stale list if present? Only inject if no live token appears.
        tokens = [t["token"] for t in nums.get("tops") or [] if t.get("token")]
        if tokens and not any(tok in text for tok in tokens[:3]):
            # don't duplicate if already has a filled list with percents of these tokens
            text = text.rstrip()
            insert = f"眼下最靠前的是{line}。" if _locale_zh(snapshot) else f"The leading rows right now are {line}."
            if "出处" in text:
                text = text.replace("出处", insert + "\n\n出处", 1)
            elif "Source:" in text:
                text = text.replace("Source:", insert + "\n\nSource:", 1)
            else:
                text = text + "\n" + insert
    if _course(snapshot) == "image" and nums.get("imageStep") is not None:
        step = nums["imageStep"]
        if "第" in text and "步" in text:
            text = re.sub(r"第\s*\d+\s*步", f"第 {step} 步", text)
        elif any(w in text for w in ("去噪", "denoise", "画布")) and f"第 {step} 步" not in text and "step " + str(step) not in text.lower():
            if int(step or 0) > 0:
                clause = f"现在画布是第 {step} 步。" if _locale_zh(snapshot) else f"The canvas is on step {step}."
                if clause not in text:
                    if "出处" in text:
                        text = text.replace("出处", clause + "\n\n出处", 1)
                    else:
                        text = text.rstrip() + "\n" + clause
    if _course(snapshot) == "finetune" and nums.get("ftTokenCount") is not None:
        n = nums["ftTokenCount"]
        if any(w in text for w in ("词片", "分词", "token", "切开")) and str(n) not in text:
            approx = "约 " if nums.get("ftApprox") else ""
            clause = f"预览里现在是{approx}{n} 个词片。" if _locale_zh(snapshot) else f"The preview now shows {approx}{n} tokens."
            if "出处" in text:
                text = text.replace("出处", clause + "\n\n出处", 1)
            else:
                text = text.rstrip() + "\n" + clause
    return text



def contrast_open(snapshot: dict[str, Any]) -> bool:
    st = str((snapshot or {}).get("station") or (snapshot or {}).get("stationId") or "")
    live = (snapshot or {}).get("live")
    live = live if isinstance(live, dict) else {}
    return st == "contrast" or bool(live.get("contrastOpen"))


_CONTRAST_START = {
    "image": ("开始看图", "Start the image course"),
    "music": ("开始看谱", "Start the music course"),
    "finetune": ("开始微调课", "Start the fine-tune course"),
}


def contrast_curtain_answer(question: str, snapshot: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Immediate short reply while the contrast curtain is still up. Never waits on a model."""
    if not contrast_open(snapshot):
        return None
    zh = _locale_zh(snapshot)
    course = _course(snapshot)
    lab_zh, lab_en = _CONTRAST_START.get(course, _CONTRAST_START["image"])
    if zh:
        text = (
            f"请先点「{lab_zh}」。对照帘收起之后，再问这个画面在干什么，我会按你眼前的画面来讲。"
            f"\n\n出处：换课对照帘，以及帘上的「{lab_zh}」。"
        )
        cite = f"出处：换课对照帘，以及帘上的「{lab_zh}」。"
    else:
        text = (
            f"Please click “{lab_en}” first. After the contrast curtain closes, ask again and I will teach from the screen in front of you."
            f"\n\nSource: the course-contrast curtain, and “{lab_en}” on it."
        )
        cite = f"Source: the course-contrast curtain, and “{lab_en}” on it."
    return {
        "id": f"{course}-contrast" if course in _CONTRAST_START else "contrast",
        "text": text,
        "highlightSel": '[data-te-contrast="overlay"], [data-te-contrast="start"]',
        "mathWalkId": None,
        "nextHint": ("先点「" + lab_zh + "」，再看当前画面。我不会替你点。") if zh else ("Click “" + lab_en + ",” then look at the screen. I will not click it."),
        "cite": cite,
        "kind": "ui",
        "strength": "high",
        "source": "corpus",
        "ids": [f"{course}-contrast" if course in _CONTRAST_START else "contrast"],
    }


def _screen_cite(course: str, station: str, zh: bool, base_cite: str = "") -> str:
    cite = str(base_cite or "").strip()
    landmark = any(k in cite for k in ("书库", "学习工作台", "Library", "workbench", "Workbench"))
    if cite and not landmark:
        return cite if cite.startswith("出处") or cite.lower().startswith("source") else (("出处：" if zh else "Source: ") + cite)
    if course == "image":
        return "出处：中间正在去噪的画布，以及任务区的「再去噪一步」。" if zh else "Source: the canvas being denoised, and Denoise one step in the task cluster."
    if course == "music":
        return "出处：右边下一个音的候选，以及中间的琴卷。" if zh else "Source: the next-note candidates on the right, and the piano roll in the middle."
    if course == "text" and station == "attention":
        return "出处：中间被点亮的注意线。" if zh else "Source: the lit attention lines in the middle."
    if course == "text":
        return "出处：右边下一个词的候选表。" if zh else "Source: the next-word table on the right."
    if course == "finetune":
        return "出处：当前工作室对照板和任务区。" if zh else "Source: the studio comparison board and the task cluster."
    return "出处：当前画面上你能直接看见的那一块。" if zh else "Source: the region you can see on the current screen."


def visible_fallback(question: str, snapshot: dict[str, Any], retrieval: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    zh = _locale_zh(snapshot)
    nums = live_numbers(snapshot)
    course = _course(snapshot)
    regions = snapshot.get("visibleRegions") or []
    region_s = "、".join(str(r) for r in regions[:5]) if isinstance(regions, list) else ""
    bits = []
    if zh:
        bits.append("我还不够确定更深的部分，先只讲你眼前能看见的。")
        if course == "text" and nums.get("topLine"):
            bits.append(f"右边表上现在最靠前的是{nums['topLine']}。这些数以你屏幕上的为准，我不会另编一套。")
        elif course == "image":
            step = nums.get("imageStep")
            bits.append("中间是正在去噪的画布" + (f"，现在是第 {step} 步。" if step is not None else "。"))
        elif course == "music" and nums.get("topLine"):
            bits.append(f"右边下一个音的候选现在是{nums['topLine']}。")
        elif course == "finetune":
            if nums.get("ftTokenCount") is not None:
                bits.append(f"数据台预览里现在能看见 {nums['ftTokenCount']} 个词片。")
            else:
                bits.append("先看工作室里的对照板和任务区，不要先想开训。")
        elif region_s:
            bits.append(f"你现在能看见的区域是：{region_s}。")
        cite = "出处：当前画面上你能直接看见的那一块。"
    else:
        bits.append("I am not sure enough about a deeper claim, so I will only talk about what is visible now.")
        if nums.get("topLine"):
            bits.append(f"The leading rows on the right are {nums['topLine']}. I will not invent other numbers.")
        cite = "Source: the region you can see on the current screen."
    text = " ".join(bits) + "\n\n" + cite
    highlight = "[data-te-zone=\"right\"]" if course in {"text", "music"} else "[data-te-task=\"cluster\"]"
    if course == "image":
        highlight = "[data-te-image=\"canvas\"]"
    if course == "finetune":
        highlight = "[data-te-ft=\"first-line\"], [data-te-ft=\"now\"]"
    return {
        "id": "visible-fallback",
        "text": text,
        "highlightSel": highlight,
        "mathWalkId": None,
        "nextHint": None,
        "cite": cite,
        "kind": "ui",
        "strength": (retrieval or {}).get("strength") or "low",
        "source": "corpus",
        "ids": ["visible-fallback"],
        "goal": teaching_goal(question, retrieval or {}, snapshot, []),
    }


def _continuation(question: str, snapshot: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
    zh = _locale_zh(snapshot)
    nums = live_numbers(snapshot)
    course = _course(snapshot)
    station = str(snapshot.get("station") or snapshot.get("stationId") or "")
    cite = _screen_cite(course, station, zh, str(base.get("cite") or ""))
    if course == "text":
        if station == "attention":
            body = (
                "先看中间被点亮的那些线。它们表示这一步在看哪些词。"
                if zh
                else "First look at the lit lines in the middle. They show which words this step is attending to."
            )
            highlight = "[data-te-zone=\"center\"], [data-te-attn=\"lines\"], .attention, [data-te-path=\"attention\"]"
        else:
            body = (
                f"先看右边表上现在的候选：{nums.get('topLine') or '先看最上面几行的百分比'}。这些数以你屏幕上的为准。"
                if zh
                else f"Look at the candidates on the right-hand table now: {nums.get('topLine') or 'the top rows'}. Use the numbers on your screen."
            )
            highlight = "[data-te-zone=\"right\"]"
    elif course == "image":
        step = nums.get("imageStep")
        step_s = f"第 {step} 步" if step is not None else "当前这一步"
        body = (
            f"现在看中间画布：这是{step_s}的去噪。看着噪声被再抹掉一点，这就是「再去噪一步」。"
            if zh
            else f"Look at the middle canvas now: this is denoise step {step if step is not None else 'on the canvas'}. Watch a little more noise get wiped away — that is “Denoise one step.”"
        )
        highlight = "[data-te-image=\"canvas\"]"
    elif course == "music":
        body = (
            f"现在看右边下一个音的候选：{nums.get('topLine') or '先看最靠前的几个百分比'}。中间是琴卷，左边是已经写出的音。"
            if zh
            else f"Look at the next-note candidates on the right now: {nums.get('topLine') or 'the leading rows'}. The middle is the piano roll; the left holds the notes already written."
        )
        highlight = ".music-probs, [data-te-zone=\"right\"]"
    else:
        n = nums.get("ftTokenCount")
        extra = f"预览里现在能看见 {n} 个词片。" if n is not None else "先看对照板，不要想到开训。"
        body = (
            f"现在看工作室里的对照。这一课改的是权重。{extra}"
            if zh
            else f"Look at the comparison in the studio now. This course changes weights. {extra}"
        )
        highlight = "[data-te-ft=\"first-line\"], .ft-tok-panel"
    if cite and cite not in body:
        body = body.rstrip() + "\n\n" + cite
    out = dict(base)
    out["text"] = body
    out["cite"] = cite
    out["highlightSel"] = base.get("highlightSel") or highlight
    out["followup"] = True
    return out

def one_idea(text: str) -> str:
    if not text:
        return text
    # Keep at most two short paragraphs plus the cite line.
    cite = ""
    body = text
    for mark in ("\n\n出处", "\n出处", "\n\nSource:", "\nSource:"):
        if mark.strip() in text or mark in text:
            idx = text.find("出处") if "出处" in text else text.find("Source:")
            if idx >= 0:
                body, cite = text[:idx].rstrip(), text[idx:].strip()
            break
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if len(paras) > 2:
        body = "\n\n".join(paras[:2])
    if len(body) > MAX_TURN_ANSWER_CHARS:
        # cut at sentence end
        cut = body[:MAX_TURN_ANSWER_CHARS]
        m = re.search(r"[。！？.!?][^\n]*$", cut)
        if m:
            cut = cut[: m.end()]
        body = cut.strip()
    if cite:
        return body.rstrip() + "\n\n" + cite
    return body



def question_is_grounded(question: str, retrieval: dict[str, Any]) -> bool:
    """True when the question is a teaching chip, a follow-up cue, or clearly matches retrieved evidence."""
    if is_common_question(question) or is_followup_cue(question) or is_right_question(question):
        return True
    try:
        if is_textbook_question(question):
            return True
    except Exception:
        pass
    cards = (retrieval or {}).get("cards") or []
    if not cards:
        return False
    if _card_matches_question(cards[0], question):
        return True
    strength = (retrieval or {}).get("strength") or "none"
    card = cards[0]
    keys = " ".join(
        [
            str(card.get("titleZh") or ""),
            str(card.get("titleEn") or ""),
            " ".join(card.get("keywords") or []),
            str(card.get("citeZh") or ""),
        ]
    )
    q = question or ""
    hits = 0
    for i in range(max(0, len(q) - 1)):
        gram = q[i : i + 2]
        if gram.strip() and gram in keys:
            hits += 1
    ql = q.lower()
    for kw in card.get("keywords") or []:
        if kw and str(kw).lower() in ql:
            hits += 3
    if strength == "high" and hits >= 2:
        return True
    if strength in {"high", "mid"} and hits >= 5:
        return True
    return False



def _card_matches_question(card: dict[str, Any], question: str) -> bool:
    q = (question or "").strip().lower()
    if not q or not card:
        return False
    kws = card.get("keywords") or []
    if not isinstance(kws, list):
        kws = [kws]
    if any(str(kw).strip().lower() in q for kw in kws if str(kw).strip() and len(str(kw).strip()) >= 2):
        return True
    blob = " ".join(
        str(card.get(k) or "")
        for k in ("id", "titleZh", "titleEn", "title_zh", "title_en")
    ).lower()
    if any(tok in q for tok in ("看中间的线", "中间的线", "亮线", "这根线", "这条线", "lit line", "lit lines")):
        if any(tok in blob for tok in ("亮线", "attention", "注意力", "lit line")):
            return True
    return any(tok in q and tok in blob for tok in ("残差", "residual", "亮线", "attention", "层", "头", "layer", "head"))


def compose_turn(
    question: str,
    snapshot: dict[str, Any],
    target: Optional[dict[str, Any]] = None,
    retrieval: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    snapshot = sanitize_snapshot(snapshot)
    curtain = contrast_curtain_answer(question, snapshot)
    if curtain:
        curtain["goal"] = teaching_goal(question, {"cards": [curtain], "strength": "high"}, snapshot, compress_memory(snapshot))
        return curtain
    retrieval = retrieval or retrieve(question, snapshot, target)
    memory = compress_memory(snapshot)
    goal = teaching_goal(question, retrieval, snapshot, memory)
    strength = (retrieval or {}).get("strength") or "none"
    cards = (retrieval or {}).get("cards") or []

    # Relevance gate: off-topic or weak retrieval → say so and point at what is visible.
    if not question_is_grounded(question, retrieval) and not is_common_question(question):
        ans = visible_fallback(question, snapshot, retrieval)
        ans["goal"] = goal
        return ans
    if (not should_answer_from_corpus(question, retrieval)) and strength in {"none", "low"} and not is_common_question(question):
        if not cards:
            ans = visible_fallback(question, snapshot, retrieval)
            ans["goal"] = goal
            return ans

    taught = set()
    for item in memory:
        a = item.get("a") or ""
        if "already taught cards:" in a:
            for part in a.split(":", 1)[-1].split(","):
                tid = part.strip()
                if tid:
                    taught.add(tid)
    # If the top card was already taught, prefer the next unused relevant card.
    use_cards = list(cards)
    if is_textbook_question(question):
        # Keep the Library landmark first; do not let a stationed knobs/math
        # card jump ahead after mid-path reordering.
        def _is_book_card(c: dict[str, Any]) -> bool:
            cid = str(c.get("id") or "")
            return bool(
                c.get("textbook")
                or c.get("kind") == "textbook"
                or "textbook" in (c.get("intents") or [])
                or cid.startswith("textbook-")
                or cid == "mis-need-textbook-first"
            )

        book_cards = [c for c in use_cards if _is_book_card(c)]
        book_cards.sort(key=lambda c: (0 if str(c.get("id") or "").startswith("textbook-") else 1, str(c.get("id") or "")))
        if book_cards:
            rest = [c for c in use_cards if c.get("id") not in {x.get("id") for x in book_cards}]
            use_cards = book_cards + rest
    elif is_right_question(question):
        right_cards = [c for c in use_cards if "right_table" in (c.get("intents") or [])]
        if right_cards:
            rest = [c for c in use_cards if c.get("id") not in {x.get("id") for x in right_cards}]
            use_cards = right_cards + rest
    elif is_cross_course_question(question):
        # Keep the shared analogy first after a course switch; do not bury it
        # behind a same-station card such as tokens / next-note / denoise / loss.
        def _is_cross_card(c: dict[str, Any]) -> bool:
            return (c.get("kind") == "cross") or str(c.get("id") or "").startswith("shared-cross-")

        cross_cards = [c for c in use_cards if _is_cross_card(c)]
        if cross_cards:
            rest = [c for c in use_cards if c.get("id") not in {x.get("id") for x in cross_cards}]
            use_cards = cross_cards + rest
    elif use_cards and use_cards[0].get("id") in taught and len(use_cards) > 1:
        # Only skip a already-taught card when this question is not clearly about it.
        # Retrieval hit lists used to be written into taughtIds; a later-path
        # question such as 「为什么要残差」 must not be rotated to a softmax card.
        if not _card_matches_question(use_cards[0], question):
            use_cards = use_cards[1:] + use_cards[:1]
    # Mid-path "这是什么" must not re-lecture the opening 第一关 card.
    # Textbook location questions keep the Library card on top.
    if use_cards and not _is_first_screen(snapshot) and not is_textbook_question(question):
        later = []
        opening = []
        for c in use_cards:
            blob = " ".join(
                str(c.get(k) or "")
                for k in ("titleZh", "titleEn", "bodyZh", "bodyEn", "text", "title_zh", "body_zh")
            )
            if "第一关" in blob or "first station" in blob.lower():
                opening.append(c)
            else:
                later.append(c)
        if later:
            st = str(snapshot.get("station") or "")
            stationed, rest = [], []
            for c in later:
                sts = [s for s in (c.get("stations") or []) if s and s != "*"]
                is_cross = (c.get("kind") == "cross") or str(c.get("id") or "").startswith("shared-cross-")
                (stationed if (st and st in sts) or (is_cross and is_cross_course_question(question)) else rest).append(c)
            use_cards = (stationed + rest + opening) if (stationed or rest) else later + opening

    ans = compose_answer(question, snapshot, {"cards": use_cards, "strength": strength}, target)
    if not ans:
        if is_common_question(question) or strength != "none":
            ans = visible_fallback(question, snapshot, retrieval)
        else:
            return None

    text = ans.get("text") or ""
    follow_cue = is_followup_cue(question)
    prior_turns = [m for m in memory if (m.get("q") or "").strip() and not _is_curtain_memory_item(m)]
    # A contrast-curtain short reply is only a detour ("click start first").
    # After the curtain is dismissed, the first-eye ask must still teach the current screen.
    # A right-side question should stay on the right-region card, not a generic continuation.
    if (
        (not is_textbook_question(question))
        and (not is_right_question(question))
        and _has_real_prior_teaching(memory)
        and (
            is_repeat_of_memory(text, prior_turns)
            or follow_cue
            or is_common_question(question)
        )
    ):
        # Follow-ups must advance, not re-lecture the opening — even if the same chip is clicked again.
        ans = _continuation(question, snapshot, ans)

    text = ans.get("text") or ""
    if not is_textbook_question(question):
        text = ground_live_numbers(text, snapshot)
    text = scrub_locked(text, snapshot)
    text = one_idea(text)
    ans["text"] = text
    if is_textbook_question(question):
        ans["mathWalkId"] = None
    ans["goal"] = goal
    ans["source"] = ans.get("source") or "corpus"
    return ans


def build_grounded_prompt(
    snapshot: dict[str, Any],
    cards: list[dict[str, Any]],
    target: Optional[dict[str, Any]] = None,
) -> str:
    snapshot = sanitize_snapshot(snapshot)
    zh = _locale_zh(snapshot)
    digest = digest_snapshot(snapshot)
    memory = compress_memory(snapshot)
    goal = teaching_goal("", {"cards": cards, "strength": "high" if cards else "none"}, snapshot, memory)
    if zh:
        lines = [
            "你是「蚁算Transformer」里的同一位教学导师。一次只讲一个想法。教学语法：先看见，再起名字，最后才调。",
            "必须把每个论断落在下面的检索证据和画面摘要上。不要把摘要或证据整段倒给学生。不要编造数字；没有的数就说还没出现在画面上。",
            "若检索证据不够，就明说不确定，只指到眼前看得见的区域。",
            "不要剧透仍锁着的旋钮或后期实验室概念（不要点名这些锁项）。不要替学生点「推进一步」，不要自动开训，不要自动换课。不要倾倒教材。",
            "不要重复本会话刚刚讲过的开场。跟进问要往前走一步。",
            "用中文，短而具体。",
        ]
    else:
        lines = [
            "You are the same teaching tutor in Transformer Explainer. One idea per turn. Grammar: see first, name second, adjust last.",
            "Ground every claim in the retrieved evidence and the screen digest below. Do not dump either into the answer. Do not invent numbers; if a figure is not on screen, say so.",
            "If the evidence is weak, say you are not sure enough and point at what is actually visible.",
            "Do not name still-locked knobs or later-lab topics. Never click 推进一步 for the student, never auto-train, never auto-switch courses, never dump the textbook.",
            "Do not repeat the opening already given in this session. Follow-ups must advance.",
            "Answer in English, short and concrete.",
        ]
    lines.append("")
    lines.append("Teaching goal for this turn: " + goal)
    lines.append("")
    lines.append("Screen digest (internal; never paste verbatim):")
    lines.append(digest["text"])
    mem = memory_text(memory, zh)
    if mem:
        lines.append("")
        lines.append(mem)
    if target:
        label = ""
        if isinstance(target, dict):
            label = str(target.get("label") or target.get("region") or "")[:80]
        if label:
            lines.append(f"The student pointed at: {label}")
    if cards:
        lines.append("")
        lines.append("Retrieved course evidence (MUST ground here; do not invent LoRA/QLoRA/DPO unless they appear below):")
        used = 0
        for card in cards[:MAX_EVIDENCE_CARDS]:
            body = card.get("bodyEn") if not zh else card.get("bodyZh")
            body = re.sub(r"\s+", " ", str(body or "")).strip()
            if len(body) > 400:
                body = body[:397] + "…"
            title = card.get("titleEn") if not zh else card.get("titleZh")
            chunk = f"- {card.get('id')}: {title} — {body}"
            if used + len(chunk) > MAX_EVIDENCE_CHARS:
                break
            lines.append(chunk)
            used += len(chunk)
            if card.get("citeZh") or card.get("citeEn"):
                cite = card.get("citeZh") if zh else card.get("citeEn")
                lines.append(f"  cite: {cite}")
    prompt = "\n".join(lines)
    if len(prompt) > MAX_PROMPT_CHARS:
        prompt = prompt[: MAX_PROMPT_CHARS - 1] + "…"
    return prompt
