# -*- coding: utf-8 -*-
"""Fine-tune lab HTTP API on 127.0.0.1:8787."""
from __future__ import annotations

import json
import shutil
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from trainer import (
    HAS_TORCH,
    JobController,
    RunStore,
    cuda_info,
    generate_pair,
    next_token_pair,
    tokenize_preview,
    sankey_forward_pair,
    preference_score_pairs,
)

ROOT = Path(__file__).resolve().parent
STORE = RunStore(ROOT / "runs")
JOBS = JobController(STORE)

app = FastAPI(title="transformer-explainer finetune-lab", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


class TokenizeIn(BaseModel):
    texts: list[str]
    seqLen: int = 512


class TrainIn(BaseModel):
    recipe: dict[str, Any]
    texts: list[str]
    resumeFrom: Optional[str] = None
    maxSteps: Optional[int] = None
    trainTexts: Optional[list[str]] = None
    valTexts: Optional[list[str]] = None
    testTexts: Optional[list[str]] = None
    leakVal: Optional[bool] = None
    useBestCheckpoint: Optional[bool] = True


class EvalCardIn(BaseModel):
    reading: Optional[str] = None
    readingEn: Optional[str] = None
    valLoss: Optional[float] = None
    testLoss: Optional[float] = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    kind: Optional[str] = None


class ControlIn(BaseModel):
    runId: Optional[str] = None


class SankeyForwardIn(BaseModel):
    text: str
    runId: Optional[str] = None


class GenerateIn(BaseModel):
    prompts: list[str]
    temperature: float = 0.8
    topK: int = 50
    topP: float = 0.9
    maxLength: int = 80
    runId: Optional[str] = None


@app.get("/health")
def health():
    info = cuda_info()
    return {
        "ok": True,
        "torch": HAS_TORCH,
        "cuda": bool(info.get("cuda")),
        "device": info.get("device", "cpu"),
        "vramTotalMb": info.get("vramTotalMb"),
        "vramUsedMb": info.get("vramUsedMb"),
        "message": None if HAS_TORCH else "PyTorch is not installed in this Python. See README.md.",
    }


@app.post("/tokenize")
def tokenize(body: TokenizeIn):
    return {"previews": tokenize_preview(body.texts, body.seqLen)}


@app.post("/train/start")
def train_start(body: TrainIn):
    if not HAS_TORCH:
        raise HTTPException(503, "PyTorch / transformers / peft are not installed. See finetune-lab/README.md.")
    if len([t for t in body.texts if t and t.strip()]) < 4:
        raise HTTPException(400, "Need at least a handful of non-empty texts.")
    run_id = body.resumeFrom or time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    recipe = dict(body.recipe or {})
    if body.trainTexts:
        recipe["_trainTexts"] = body.trainTexts
    if body.valTexts:
        recipe["_valTexts"] = body.valTexts
    if body.testTexts is not None:
        recipe["_testTexts"] = body.testTexts
    if body.leakVal is not None:
        recipe["leakVal"] = body.leakVal
    if body.useBestCheckpoint is not None:
        recipe["useBestCheckpoint"] = body.useBestCheckpoint
    try:
        JOBS.start(run_id, recipe, body.texts, resume=bool(body.resumeFrom), max_steps=body.maxSteps)
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    return {"runId": run_id}


@app.post("/train/pause")
def train_pause(body: ControlIn):
    JOBS.pause(body.runId)
    return {"ok": True}


@app.post("/train/resume")
def train_resume(body: ControlIn):
    JOBS.resume(body.runId)
    return {"ok": True}


@app.post("/train/stop")
def train_stop(body: ControlIn):
    JOBS.stop(body.runId)
    return {"ok": True}


@app.get("/train/events")
def train_events(runId: str = Query(...)):
    def gen():
        last = 0
        idle = 0
        while True:
            rows = JOBS.events_since(runId, last)
            for ev in rows:
                last += 1
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                if ev.get("type") in {"done", "error"} and ev.get("status") in {"done", "error", "stopped"}:
                    return
            if not rows:
                idle += 1
                st = JOBS.status(runId)
                if st in {"done", "error", "stopped", "missing"} and idle > 2:
                    yield f"data: {json.dumps({'type': 'done', 'status': st, 'runId': runId})}\n\n"
                    return
                time.sleep(0.4)
            else:
                idle = 0

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/runs")
def runs():
    return {"runs": STORE.list_runs()}


@app.get("/runs/{run_id}")
def run_one(run_id: str):
    rec = STORE.read(run_id)
    if not rec:
        raise HTTPException(404, "run not found")
    return rec


@app.post("/runs/{run_id}/eval")
def save_eval(run_id: str, body: EvalCardIn):
    rec = STORE.read(run_id)
    if not rec:
        raise HTTPException(404, "run not found")
    rec["evalCard"] = {
        "reading": body.reading,
        "readingEn": body.readingEn,
        "valLoss": body.valLoss,
        "testLoss": body.testLoss,
        "items": body.items,
        "kind": body.kind,
        "savedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    STORE.write(run_id, rec)
    return {"ok": True, "evalCard": rec["evalCard"]}


@app.get("/runs/{run_id}/export")
def export_run(run_id: str):
    folder = STORE.run_dir(run_id)
    adapter = folder / "adapter"
    if not adapter.exists():
        adapter = folder / "checkpoint"
    if not adapter.exists():
        raise HTTPException(404, "no adapter or checkpoint to export")
    zpath = folder / "adapter-export.zip"
    if zpath.exists():
        zpath.unlink()
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in adapter.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(adapter).as_posix())
        rec = folder / "run.json"
        if rec.exists():
            zf.write(rec, "run.json")
    return FileResponse(zpath, filename=f"{run_id}-adapter.zip", media_type="application/zip")


@app.post("/generate")
def generate(body: GenerateIn):
    if not HAS_TORCH:
        raise HTTPException(503, "PyTorch is not installed. See README.md.")
    try:
        items = generate_pair(
            prompts=body.prompts,
            temperature=body.temperature,
            top_k=body.topK,
            top_p=body.topP,
            max_length=body.maxLength,
            run_id=body.runId,
            store=STORE,
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e
    if body.runId:
        STORE.append_generations(body.runId, items)
    return {"items": items}


@app.post("/sankey-forward")
def sankey_forward(body: SankeyForwardIn):
    """Return Sankey-shaped attention maps and last-token logits for baseline GPT-2 and this LoRA."""
    if not HAS_TORCH:
        raise HTTPException(503, "PyTorch is not installed. See README.md.")
    try:
        return sankey_forward_pair(body.text, body.runId, STORE)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/next-token")
def next_token(body: GenerateIn):
    """Return next-token probability ranks for the base (and tuned, if a run exists)."""
    if not HAS_TORCH:
        raise HTTPException(503, "PyTorch is not installed. See README.md.")
    try:
        items = next_token_pair(
            prompts=body.prompts,
            temperature=body.temperature,
            top_k=body.topK,
            top_p=body.topP,
            run_id=body.runId,
            store=STORE,
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e
    return {"items": items}


class PreferencePairIn(BaseModel):
    id: Optional[str] = None
    prompt: str
    chosen: str
    rejected: str


class PreferenceScoreIn(BaseModel):
    runId: Optional[str] = None
    pairs: list[PreferencePairIn] = Field(default_factory=list)


@app.post("/preference-score")
def preference_score(body: PreferenceScoreIn):
    """Score chosen vs rejected completions under baseline GPT-2 and this LoRA. Forward only, no training."""
    if not HAS_TORCH:
        raise HTTPException(503, "PyTorch is not installed. See README.md.")
    try:
        return preference_score_pairs(
            pairs=[p.model_dump() if hasattr(p, "model_dump") else p.dict() for p in body.pairs],
            run_id=body.runId,
            store=STORE,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


from tutor import mount_tutor
mount_tutor(app)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
