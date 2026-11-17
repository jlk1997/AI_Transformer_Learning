# -*- coding: utf-8 -*-
"""Phase 1 unit tests: course corpus filter + ranked retrieval."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(r"E:\transformer-explainer\finetune-lab")
sys.path.insert(0, str(ROOT))

from tutor_retrieve import compose_answer, load_index, retrieve  # noqa: E402
from tutor_context import compose_turn  # noqa: E402


def snap(course: str, station: str, **extra):
    base = {
        "course": course,
        "station": station,
        "stationTitle": station,
        "stationIndex": 0,
        "locale": "zh-CN",
        "unlocked": {
            "sampling": False,
            "imageKnobs": False,
            "musicKnobs": False,
            "textPathDone": False,
        },
        "topCandidates": [{"token": "A4", "percent": 38.2}] if course == "music" else [],
        "allowedMathWalks": [],
        "generated": False,
        "textPathDone": False,
    }
    base.update(extra)
    return base


def main():
    fails = []
    idx = load_index()
    print("docs", len(idx.docs))
    if len(idx.docs) < 30:
        fails.append("too_few_docs")

    # Warm + latency
    retrieve("这是什么", snap("text", "generate"))
    t0 = time.perf_counter()
    for _ in range(20):
        retrieve("这是什么", snap("text", "generate"))
    elapsed_ms = (time.perf_counter() - t0) / 20 * 1000
    print(f"retrieve_avg_ms={elapsed_ms:.2f}")
    if elapsed_ms > 200:
        fails.append("retrieve_slow")

    cases = [
        ("text", "generate", "这是什么", ("任务区", "生成下一个词", "猜词机", "讲解槽"), ("LoRA", "QLoRA", "DPO", "去噪", "对照板")),
        ("text", "generate", "右边是什么", ("右侧", "概率"), ("LoRA", "对照板", "去噪一步")),
        ("image", "map", "这是什么", ("画布", "去噪", "任务区"), ("LoRA", "QLoRA", "猜词机", "微调")),
        ("image", "map", "右边是什么", ("对照", "输出"), ("LoRA", "猜词机", "音符", "softmax")),
        ("music", "map", "这是什么", ("音符", "琴", "任务区", "三块", "谱"), ("LoRA", "去噪", "对照板", "权重")),
        ("music", "map", "右边是什么", ("概率", "音符"), ("LoRA", "对照板", "去噪", "softmax")),
        ("finetune", "map", "这是什么", ("权重", "对照", "推进一步", "任务区"), ("LoRA", "QLoRA", "DPO", "softmax")),
        ("finetune", "map", "右边是什么", ("对照", "板"), ("softmax", "要猜的下一个词", "LoRA")),
    ]
    leak_words = ("LoRA", "QLoRA", "DPO")
    raw_ids = ("map/generate", "station=map", "station=generate")

    for course, station, q, need_any, forbid in cases:
        r = retrieve(q, snap(course, station))
        ans = compose_answer(q, snap(course, station), r)
        text = (ans or {}).get("text") or ""
        ids = [h["doc"].id for h in r.get("hits") or []]
        cite_ok = "出处" in text
        generic = "先看眼前的画面，用你看见的数字理解这一步" in text
        raw = any(s in text for s in raw_ids) or ("「map」" in text) or ("「generate」" in text)
        hit = any(w in text for w in need_any)
        leaked = [w for w in list(forbid) + list(leak_words) if w in text]
        ok = bool(ans) and cite_ok and hit and not generic and not raw and not leaked and r.get("strength") in {"high", "mid"}
        print(
            f"{'OK' if ok else 'FAIL'} {course}/{station} {q} strength={r.get('strength')} score={r.get('topScore')} ids={ids[:3]} cite={cite_ok} hit={hit} leak={leaked}"
        )
        print("   ", text.replace("\n", " | ")[:220])
        if not ok:
            fails.append(f"{course}:{q}")

    # Cross-course: LoRA question on early text must not surface LoRA
    r = retrieve("LoRA 是什么", snap("text", "generate"))
    ids = [h["doc"].id for h in r.get("hits") or []]
    blob = " ".join((h["doc"].body_zh + h["doc"].title_zh) for h in r.get("hits") or [])
    if "lora" in blob.lower() or "LoRA" in blob or any("lora" in i.lower() for i in ids):
        print("FAIL text_lora_leak", ids)
        fails.append("text_lora_leak")
    else:
        print("OK text_lora_blocked", ids[:3], "strength", r.get("strength"))

    # Textbook is not the entrance
    r = retrieve("这是什么", snap("text", "generate"))
    ids = [h["doc"].id for h in r.get("hits") or []]
    if any(i.startswith("textbook-") for i in ids):
        print("FAIL textbook_on_what", ids)
        fails.append("textbook_on_what")
    else:
        print("OK textbook_not_entrance", ids[:3])
    r2 = retrieve("教材在哪里", snap("text", "generate"))
    ids2 = [h["doc"].id for h in r2.get("hits") or []]
    if "textbook-index-text" not in ids2:
        print("FAIL textbook_when_asked", ids2)
        fails.append("textbook_when_asked")
    else:
        print("OK textbook_when_asked", ids2[:3])

    # Textbook landmark must not be stolen by the current walk / knobs / table,
    # including mid-path tokens and the invite station with live percentages.
    live_tops = [
        {"token": "visualize", "percent": 54.7},
        {"token": "create", "percent": 20.9},
        {"token": "see", "percent": 12.1},
        {"token": "make", "percent": 6.3},
    ]
    book_cases = [
        ("generate", 0, False, "教材在哪里"),
        ("tokens", 1, False, "教材在哪里？"),
        ("tokens", 1, False, "书在哪"),
        ("invite", 6, True, "教材在哪里？"),
        ("invite", 6, True, "书库在哪"),
        ("invite", 6, True, "教材"),
    ]
    for station, idx, done, q in book_cases:
        s = snap(
            "text",
            station,
            stationIndex=idx,
            generated=True,
            textPathDone=done,
            unlocked={
                "sampling": done,
                "imageKnobs": False,
                "musicKnobs": False,
                "textPathDone": done,
            },
            topCandidates=live_tops,
            live={
                "textbookOpen": True,
                "textbookPage": "intro",
                "samplingType": "top-k",
                "topK": 5,
            },
        )
        r = retrieve(q, s)
        ids = [h["doc"].id for h in r.get("hits") or []]
        ans = compose_turn(q, s, retrieval=r)
        text_ans = (ans or {}).get("text") or ""
        stolen = any(w in text_ans for w in ("温度", "54.7", "变尖", "visualize"))
        landmark = ("书库" in text_ans) and ("顶栏" in text_ans)
        book_id = str((ans or {}).get("id") or "")
        bookish = book_id.startswith("textbook-") or book_id == "mis-need-textbook-first" or "textbook-index-text" in ids
        ok = landmark and (not stolen) and bookish and not (ans or {}).get("mathWalkId")
        print(
            f"{'OK' if ok else 'FAIL'} textbook_landmark {station} {q!r} id={book_id} ids={ids[:3]} stolen={stolen} landmark={landmark}"
        )
        print("   ", text_ans.replace("\n", " | ")[:240])
        if not ok:
            fails.append(f"textbook_landmark:{station}:{q}")

    # Generic mid-path / invite questions must not be forced onto the textbook card.
    r = retrieve("这是什么", snap("text", "invite", stationIndex=6, textPathDone=True, unlocked={"sampling": True, "imageKnobs": False, "musicKnobs": False, "textPathDone": True}))
    ids = [h["doc"].id for h in r.get("hits") or []]
    if ids and ids[0].startswith("textbook-"):
        print("FAIL textbook_on_invite_what", ids)
        fails.append("textbook_on_invite_what")
    else:
        print("OK textbook_not_forced_on_what", ids[:3])

    # Locked cfg math hidden on image first screen
    r = retrieve("这是什么", snap("image", "map"))
    ids = [h["doc"].id for h in r.get("hits") or []]
    if "image-cfg-later" in ids or "image-math-denoise" in ids:
        print("FAIL image_locked_cfg", ids)
        fails.append("image_locked_cfg")
    else:
        print("OK image_locked_cfg_hidden", ids[:3])

    print("FAILS", fails)
    return 0 if not fails else 1


if __name__ == "__main__":
    raise SystemExit(main())
