# -*- coding: utf-8 -*-
"""Phase 3 unit tests: intent router, safe tools, no auto-operate."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(r"E:\transformer-explainer\finetune-lab")
sys.path.insert(0, str(ROOT))

from tutor_agent import (  # noqa: E402
    FORBIDDEN_TOOLS,
    classify_intent,
    run_agent,
    sanitize_agent_tools,
    tools_are_safe,
)
from tutor import _sanitize_tool  # noqa: E402
from tutor_context import compose_turn  # noqa: E402


def snap(course="text", station="generate", **extra):
    base = {
        "course": course,
        "station": station,
        "stationTitle": station,
        "stationIndex": extra.pop("stationIndex", 0),
        "locale": "zh-CN",
        "unlocked": {"sampling": False, "imageKnobs": False, "musicKnobs": False, "textPathDone": False},
        "topCandidates": extra.pop(
            "topCandidates",
            [{"token": "visualize", "percent": 54.7}, {"token": "create", "percent": 20.9}],
        ),
        "allowedMathWalks": extra.pop("allowedMathWalks", []),
        "generated": extra.pop("generated", False),
        "visibleRegions": ["task-cluster", "guide-slot", "right-probs"],
        "live": extra.pop("live", {}),
        "recentQA": extra.pop("recentQA", []),
        "taughtIds": extra.pop("taughtIds", []),
    }
    base.update(extra)
    return base


def main():
    fails = []

    cases = {
        "这是什么": "what",
        "右边是什么": "what",
        "为什么右边会排成这样": "why",
        "我看懂了吗": "check",
        "还没看懂": "check",
        "下一步怎么做": "next",
        "更深一点": "deeper",
        "这个数怎么来的": "how_number",
        "右边的百分比是怎么来的": "how_number",
    }
    for q, want in cases.items():
        got = classify_intent(q)
        if got != want:
            fails.append(f"intent_{q}")
            print("FAIL intent", q, "got", got, "want", want)
        else:
            print("OK intent", q, want)

    # Hard bans
    for name in ("click_ui", "start_train", "switch_course", "push_step", "auto_click"):
        if _sanitize_tool(name, {"selector": "[data-te-path=generate]"}, snap()) is not None:
            fails.append(f"sanitize_{name}")
            print("FAIL sanitize allowed", name)
        else:
            print("OK sanitize blocks", name)
        if name not in FORBIDDEN_TOOLS:
            fails.append(f"forbidden_set_{name}")

    # 下一步怎么做: point/highlight only, never operate
    r = run_agent("下一步怎么做", snap("text", "generate"))
    names = [t["name"] for t in r.get("tools") or []]
    text = (r.get("answer") or {}).get("text") or ""
    ok = (
        r.get("intent") == "next"
        and r.get("handled")
        and tools_are_safe(r.get("tools") or [])
        and "highlight_ui" in names
        and "suggest_next_step" in names
        and "open_math_walk" not in names
        and "生成下一个词" in text
        and ("不会替你点" in text or "不会替你" in text)
        and "出处" in text
    )
    if not ok:
        fails.append("next_tools")
        print("FAIL next", names, text[:200])
    else:
        print("OK next_tools", names)

    # Poisoned tools are dropped
    bad = sanitize_agent_tools(
        [
            {"name": "click_ui", "selector": "[data-te-path=generate]"},
            {"name": "start_train"},
            {"name": "switch_course", "course": "image"},
            {"name": "highlight_ui", "selector": "[data-te-path=\"generate\"]"},
        ],
        snap(),
    )
    if any(t["name"] in FORBIDDEN_TOOLS for t in bad) or not any(t["name"] == "highlight_ui" for t in bad):
        fails.append("drop_poison")
        print("FAIL drop_poison", bad)
    else:
        print("OK drop_poison", [t["name"] for t in bad])

    # 这个数怎么来的 — first screen does not open a walk
    r = run_agent("这个数怎么来的", snap("text", "generate", allowedMathWalks=[], generated=False))
    names = [t["name"] for t in r.get("tools") or []]
    text = (r.get("answer") or {}).get("text") or ""
    if "open_math_walk" in names or "54.7%" not in text or "出处" not in text:
        fails.append("how_number_early")
        print("FAIL how_early", names, text[:200])
    else:
        print("OK how_number_early", names)

    # After a generate step, offer/open the prob walk
    r = run_agent(
        "这个数怎么来的",
        snap("text", "tokens", stationIndex=1, generated=True, allowedMathWalks=["prob"]),
    )
    names = [t["name"] for t in r.get("tools") or []]
    walks = [t.get("cardId") for t in r.get("tools") or [] if t["name"] == "open_math_walk"]
    text = (r.get("answer") or {}).get("text") or ""
    if "open_math_walk" not in names or "prob" not in walks or "54.7%" not in text:
        fails.append("how_number_walk")
        print("FAIL how_walk", names, walks, text[:200])
    else:
        print("OK how_number_walk", names, walks)

    # Phase 1 这是什么 still corpus + 出处, no spoilers
    r = run_agent("这是什么", snap("text", "generate"))
    text = (r.get("answer") or {}).get("text") or ""
    spoil = [w for w in ("温度", "LoRA", "CFG", "学习率") if w in text]
    if r.get("intent") != "what" or "猜词机" not in text or "出处" not in text or spoil:
        fails.append("what_corpus")
        print("FAIL what", spoil, text[:200])
    else:
        print("OK what_corpus")

    # Phase 2 live numbers + no-repeat follow-up
    r = run_agent("右边是什么", snap("text", "generate"))
    text = (r.get("answer") or {}).get("text") or ""
    if "visualize" not in text or "54.7%" not in text:
        fails.append("live_numbers")
        print("FAIL numbers", text[:200])
    else:
        print("OK live_numbers")

    first = run_agent("这是什么", snap("text", "generate"))
    a1 = (first.get("answer") or {}).get("text") or ""
    r2 = run_agent(
        "然后呢",
        snap("text", "generate", recentQA=[{"q": "这是什么", "a": a1, "course": "text"}]),
    )
    a2 = (r2.get("answer") or {}).get("text") or ""
    if "你现在在文字课的第一关" in a2 or (a1[:32] and a1[:32] in a2):
        fails.append("followup_repeat")
        print("FAIL followup", a2[:200])
    elif "出处" not in a2:
        fails.append("followup_cite")
        print("FAIL followup cite", a2[:200])
    else:
        print("OK followup")

    print("FAILS", fails)
    return 0 if not fails else 1


if __name__ == "__main__":
    raise SystemExit(main())
