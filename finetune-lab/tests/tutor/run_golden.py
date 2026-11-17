# -*- coding: utf-8 -*-
"""Score the Phase 4 golden set via run_agent and optionally /tutor-api/ask."""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(r"E:\transformer-explainer\finetune-lab")
sys.path.insert(0, str(ROOT))

from golden_questions import all_cases  # noqa: E402
from tutor_agent import FORBIDDEN_TOOLS, ALLOWED_TOOLS, run_agent, tools_are_safe  # noqa: E402

PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
STEP_ZH_RE = re.compile(r"第\s*(\d+)\s*步")
STEP_EN_RE = re.compile(r"\bstep\s+(\d+)\b", re.I)
RAW_IDS = (
    "stationIndex",
    "coachLessonIdx",
    "allowedMathWalks",
    "textStations",
    "pathBeat",
    "data-te-",
    "agent-how-number",
    "agent-check",
    "agent-why",
    "agent-deeper",
    "agent-next",
    "text-first-what",
    "image-map",
    "music-map",
    "ft-map",
    "visibleRegions",
    "keyLast4",
    "apiKey",
    "baseUrl",
)
GENERIC = (
    "先看眼前的画面，用你看见的数字理解这一步",
    "Look at the screen in front of you and use the numbers you can see",
)
FORBIDDEN = set(FORBIDDEN_TOOLS)


def _num_set(snapshot: dict[str, Any]) -> set[str]:
    out: set[str] = {"0", "0.0", "100", "100.0"}  # totals / empty step are allowed
    for c in snapshot.get("topCandidates") or []:
        if isinstance(c, dict) and c.get("percent") is not None:
            try:
                out.add(f"{float(c['percent']):.1f}")
                out.add(str(c["percent"]))
            except (TypeError, ValueError):
                pass
    live = snapshot.get("live") or {}
    for key in ("imageStep", "imageSteps", "ftTokenCount", "noteCount", "seedCount"):
        val = live.get(key, snapshot.get(key))
        if val is not None:
            try:
                out.add(str(int(val)))
                out.add(f"{float(val):.1f}")
            except (TypeError, ValueError):
                pass
    preview = live.get("ftTokenPreview") if isinstance(live, dict) else None
    if isinstance(preview, dict) and preview.get("count") is not None:
        out.add(str(preview["count"]))
        out.add(f"{float(preview['count']):.1f}")
    weights = []
    if isinstance(live, dict):
        weights = list(live.get("attnWeights") or [])
    if snapshot.get("attnWeights"):
        weights.extend(snapshot.get("attnWeights") or [])
    for row in weights:
        if isinstance(row, dict) and row.get("percent") is not None:
            try:
                out.add(f"{float(row['percent']):.1f}")
                out.add(str(row["percent"]))
            except (TypeError, ValueError):
                pass
    return out


def invented_numbers(text: str, snapshot: dict[str, Any]) -> list[str]:
    allowed = _num_set(snapshot)
    bad: list[str] = []
    for raw in PCT_RE.findall(text or ""):
        try:
            norm = f"{float(raw):.1f}"
        except ValueError:
            continue
        if norm not in allowed and raw not in allowed:
            bad.append(raw + "%")
    for raw in STEP_ZH_RE.findall(text or "") + STEP_EN_RE.findall(text or ""):
        if str(int(raw)) not in allowed and raw not in allowed:
            bad.append(f"step {raw}")
    return bad


def raw_station_ids(text: str) -> list[str]:
    hits = []
    for p in RAW_IDS:
        if p in (text or ""):
            hits.append(p)
    return hits


def parse_sse(body: str) -> dict[str, Any]:
    source = None
    intent = None
    texts: list[str] = []
    tools: list[dict[str, Any]] = []
    for block in body.split("\n\n"):
        ev = "message"
        data_lines: list[str] = []
        for line in block.split("\n"):
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].strip())
        if not data_lines:
            continue
        try:
            data = json.loads("\n".join(data_lines))
        except Exception:
            continue
        if ev == "meta":
            source = data.get("source")
            intent = data.get("intent") or intent
        if ev == "token" and data.get("text"):
            texts.append(str(data["text"]))
        if ev == "tool":
            tools.append(data)
        if ev == "done":
            source = source or data.get("source")
            intent = intent or data.get("intent")
    return {"source": source, "intent": intent, "text": "".join(texts), "tools": tools}


def http_ask(question: str, snapshot: dict[str, Any], timeout: float = 8.0) -> dict[str, Any]:
    payload = json.dumps({"question": question, "snapshot": snapshot}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:8787/tutor-api/ask",
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    t0 = time.perf_counter()
    with opener.open(req, timeout=timeout) as r:
        body = r.read().decode("utf-8", "replace")
        parsed = parse_sse(body)
        parsed["elapsed"] = time.perf_counter() - t0
        parsed["status"] = r.status
        return parsed


def score_case(case: dict[str, Any], got: dict[str, Any]) -> dict[str, Any]:
    exp = case["expect"]
    text = got.get("text") or ""
    tools = got.get("tools") or []
    names = [str(t.get("name") or "") for t in tools]
    intent = got.get("intent")
    fails: list[str] = []
    scores: dict[str, bool] = {}

    if exp.get("intent") and intent != exp["intent"]:
        fails.append(f"intent:{intent}")
    missing = [m for m in exp.get("must") or [] if m.lower() not in text.lower()]
    if missing:
        fails.append("must:" + ",".join(missing))
    leaked = [m for m in exp.get("must_not") or [] if m and m in text]
    if leaked:
        fails.append("must_not:" + ",".join(leaked))

    invented = invented_numbers(text, case["snapshot"])
    raw = raw_station_ids(text)
    generic = [g for g in GENERIC if g in text]
    faith_ok = not invented and not raw and not generic
    scores["faithfulness"] = faith_ok
    if invented:
        fails.append("invented:" + ",".join(invented))
    if raw:
        fails.append("raw_ids:" + ",".join(raw))
    if generic:
        fails.append("generic_template")

    cite_ok = (not exp.get("cite")) or ("出处" in text or "Source:" in text)
    walks = [t.get("cardId") for t in tools if t.get("name") == "open_math_walk"]
    if exp.get("walk"):
        walk_ok = exp["walk"] in walks
        if not walk_ok:
            fails.append(f"walk_missing:{exp['walk']}")
    elif exp.get("walk_forbidden"):
        walk_ok = not walks
        if walks:
            fails.append("walk_unexpected:" + ",".join(str(x) for x in walks))
    else:
        walk_ok = True
    highlight_ok = True
    want_hi = exp.get("highlight_any") or []
    if want_hi:
        sels = " ".join(str(t.get("selector") or "") for t in tools if t.get("name") == "highlight_ui")
        highlight_ok = any(tok in sels for tok in want_hi)
        if not highlight_ok:
            fails.append("highlight:" + (sels or "none"))
    point_ok = cite_ok and walk_ok and highlight_ok
    scores["pointing"] = point_ok
    if not cite_ok:
        fails.append("no_cite")

    # zh/EN consistency for shared controls (when a label is required)
    locale_ok = True
    label = exp.get("next_label")
    if label and label not in text:
        locale_ok = False
        fails.append("locale_label")
    loc = str((case["snapshot"] or {}).get("locale") or "zh-CN")
    if loc == "en" and "出处" in text:
        locale_ok = False
        fails.append("zh_cite_in_en")
    if loc != "en" and "Source:" in text and "出处" not in text:
        locale_ok = False
        fails.append("en_cite_in_zh")
    scores["locale"] = locale_ok

    unsafe = [n for n in names if n in FORBIDDEN or (n and n not in ALLOWED_TOOLS and n != "cite_live_numbers")]
    # cite_live_numbers is internal and should have been stripped; if present it is not an operate tool
    operate = [n for n in names if n in FORBIDDEN]
    no_auto = (not operate) and tools_are_safe([t for t in tools if t.get("name") in ALLOWED_TOOLS or t.get("name") in FORBIDDEN])
    scores["no_auto_operate"] = no_auto and not operate
    if operate or not no_auto:
        fails.append("auto_operate:" + ",".join(operate or names))
    if unsafe and any(n in FORBIDDEN for n in unsafe):
        fails.append("forbidden_tool")

    ok = not fails and all(scores.values())
    return {
        "id": case["id"],
        "pass": ok,
        "scores": scores,
        "fails": fails,
        "intent": intent,
        "tools": [{"name": t.get("name"), "selector": t.get("selector"), "cardId": t.get("cardId")} for t in tools],
        "text": text[:400],
        "elapsed": got.get("elapsed"),
    }


def run_local() -> list[dict[str, Any]]:
    rows = []
    for case in all_cases():
        r = run_agent(case["question"], case["snapshot"])
        got = {
            "intent": r.get("intent"),
            "text": (r.get("answer") or {}).get("text") or "",
            "tools": r.get("tools") or [],
        }
        rows.append(score_case(case, got))
    return rows


def run_http() -> list[dict[str, Any]]:
    rows = []
    for case in all_cases():
        got = http_ask(case["question"], case["snapshot"])
        rows.append(score_case(case, got))
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    failed = [r for r in rows if not r["pass"]]
    return {
        "pass": not failed,
        "total": len(rows),
        "passed": len(rows) - len(failed),
        "failed": len(failed),
        "failures": [r["id"] for r in failed],
        "by_score": {
            k: sum(1 for r in rows if r["scores"].get(k))
            for k in ("faithfulness", "pointing", "locale", "no_auto_operate")
        },
        "cases": rows,
    }


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    mode = "local"
    out = None
    if "--http" in argv:
        mode = "http"
        argv.remove("--http")
    if "--out" in argv:
        i = argv.index("--out")
        out = Path(argv[i + 1])
        del argv[i : i + 2]
    rows = run_http() if mode == "http" else run_local()
    summary = summarize(rows)
    summary["mode"] = mode
    text = json.dumps(
        {k: summary[k] for k in ("pass", "mode", "total", "passed", "failed", "failures", "by_score")} | {"cases": rows},
        ensure_ascii=False,
        indent=2,
    )
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
    print("GOLDEN", mode, "pass=", summary["pass"], "total=", summary["total"], "failed=", summary["failures"])
    for r in rows:
        flag = "PASS" if r["pass"] else "FAIL"
        print(flag, r["id"], r["fails"] or r["scores"], (r.get("text") or "")[:80].replace("\n", " | "))
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
