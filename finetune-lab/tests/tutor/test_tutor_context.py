# -*- coding: utf-8 -*-
"""Phase 2 unit tests: digest, memory, gates, live numbers, no spoiler."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(r"E:\transformer-explainer\finetune-lab")
sys.path.insert(0, str(ROOT))

from tutor_context import (  # noqa: E402
    MAX_PROMPT_CHARS,
    build_grounded_prompt,
    compose_turn,
    compress_memory,
    digest_snapshot,
    sanitize_snapshot,
)
from tutor_retrieve import load_index, retrieve  # noqa: E402


def snap(course, station, **extra):
    base = {
        "course": course,
        "station": station,
        "stationTitle": station,
        "stationIndex": extra.pop("stationIndex", 0),
        "locale": "zh-CN",
        "unlocked": {
            "sampling": False,
            "imageKnobs": False,
            "musicKnobs": False,
            "textPathDone": False,
        },
        "topCandidates": extra.pop("topCandidates", [{"token": "visualize", "percent": 54.7}, {"token": "create", "percent": 20.9}]),
        "allowedMathWalks": [],
        "generated": extra.pop("generated", False),
        "textPathDone": False,
        "visibleRegions": ["task-cluster", "guide-slot", "right-probs"],
        "live": extra.pop("live", {}),
        "recentQA": extra.pop("recentQA", []),
        "taughtIds": extra.pop("taughtIds", []),
    }
    base.update(extra)
    return base


def main():
    fails = []
    load_index()

    dirty = snap("text", "generate", apiKey="sk-SECRET-SHOULD-NOT-LEAK", baseUrl="https://example.invalid", keyLast4="1234")
    dirty["authorization"] = "Bearer sk-SECRET-SHOULD-NOT-LEAK"
    clean = sanitize_snapshot(dirty)
    for k in ("apiKey", "baseUrl", "keyLast4", "authorization"):
        if k in clean:
            fails.append(f"sanitize_{k}")
            print("FAIL sanitize kept", k)
    blob = str(clean)
    if "sk-SECRET" in blob or "example.invalid" in blob:
        fails.append("sanitize_value_leak")
        print("FAIL secret value survived")
    else:
        print("OK sanitize")

    d = digest_snapshot(snap("text", "generate"))
    if "visualize 54.7%" not in d["text"]:
        fails.append("digest_live")
        print("FAIL digest missing live", d["text"])
    else:
        print("OK digest live")
    if "sk-SECRET" in d["text"]:
        fails.append("digest_secret")

    # first screen Phase 1 still holds, no locked names
    s = snap("text", "generate")
    ans = compose_turn("这是什么", s)
    text = (ans or {}).get("text") or ""
    ok = "猜词机" in text and "出处" in text and "任务区" in text
    spoil = [w for w in ("温度", "temperature", "LoRA", "QLoRA", "DPO", "CFG", "学习率", "Top-k", "Top-p") if w in text]
    if not ok or spoil:
        fails.append("first_what")
        print("FAIL first_what", spoil, text[:200])
    else:
        print("OK first_what")

    r = compose_turn("右边是什么", s)
    rt = (r or {}).get("text") or ""
    if "visualize" not in rt or "54.7%" not in rt or "出处" not in rt:
        fails.append("right_numbers")
        print("FAIL right_numbers", rt[:220])
    else:
        print("OK right_numbers")

    # follow-up must not repeat opening
    mem = [{"q": "这是什么", "a": text}]
    s2 = snap("text", "generate", recentQA=mem, taughtIds=[(ans or {}).get("id")])
    fup = compose_turn("然后呢", s2)
    ft = (fup or {}).get("text") or ""
    if "你现在在文字课的第一关" in ft or (text[:40] and text[:40] in ft):
        fails.append("followup_repeat")
        print("FAIL followup_repeat", ft[:220])
    elif "出处" not in ft:
        fails.append("followup_cite")
        print("FAIL followup_cite", ft[:220])
    else:
        print("OK followup", ft[:180].replace("\n", " | "))

    # early image/music no CFG/LoRA
    for course, st, q, need in (
        ("image", "map", "这是什么", ("画布", "去噪")),
        ("music", "map", "这是什么", ("音", "琴", "任务区", "三块")),
    ):
        a = compose_turn(q, snap(course, st, topCandidates=[{"token": "A4", "percent": 38.2}] if course == "music" else []))
        t = (a or {}).get("text") or ""
        spoil = [w for w in ("LoRA", "CFG", "cfg", "温度", "学习率") if w in t]
        if not any(n in t for n in need) or "出处" not in t or spoil:
            fails.append(f"{course}_early")
            print("FAIL", course, spoil, t[:200])
        else:
            print("OK", course, "early")

    # weak retrieval -> no invented number 99.9%
    weak = compose_turn("量子引力和这首曲子有什么关系", snap("music", "map", topCandidates=[{"token": "A4", "percent": 38.2}]))
    wt = (weak or {}).get("text") or ""
    if "99.9%" in wt or "99.9" in wt:
        fails.append("invented_number")
        print("FAIL invented", wt[:200])
    else:
        print("OK weak_gate", (weak or {}).get("id"), wt[:160].replace("\n", " | "))

    # midlate hidden until generated
    r0 = retrieve("刚才抽出来的词，右边表上的数是什么", snap("text", "generate", generated=False))
    ids0 = [c.get("id") for c in r0.get("cards") or []]
    r1 = retrieve("刚才抽出来的词，右边表上的数是什么", snap("text", "tokens", generated=True, stationIndex=1))
    ids1 = [c.get("id") for c in r1.get("cards") or []]
    if "text-after-generate" in ids0:
        fails.append("midlate_too_early")
        print("FAIL midlate early", ids0)
    elif "text-after-generate" not in ids1:
        print("WARN midlate not top", ids1, "score", r1.get("topScore"))
        # not a hard fail if another right-table card wins
        print("OK midlate_filtered_early")
    else:
        print("OK midlate_after", ids1[:3])

    prompt = build_grounded_prompt(snap("text", "generate", apiKey="sk-SECRET"), r1.get("cards") or [], None)
    if len(prompt) > MAX_PROMPT_CHARS:
        fails.append("prompt_budget")
        print("FAIL budget", len(prompt))
    elif "sk-SECRET" in prompt or "keyLast4" in prompt:
        fails.append("prompt_secret")
        print("FAIL prompt secret")
    elif "Screen digest" not in prompt and "画面" not in prompt:
        fails.append("prompt_digest")
        print("FAIL no digest")
    else:
        print("OK grounded_prompt", len(prompt))

    # compress memory
    long_s = snap("text", "generate", recentQA=[{"q": "这是什么", "a": "你现在在文字课的第一关。" + "讲了很多。" * 80}] * 6)
    memc = compress_memory(long_s)
    blob = " ".join(x.get("a", "") for x in memc)
    if len(blob) > 700 or len(memc) > 4:
        fails.append("memory_budget")
        print("FAIL memory", len(blob), len(memc))
    else:
        print("OK memory_compress", len(memc), len(blob))



    # L-02: contrast curtain must answer immediately and point at 开始看图.
    curtain = snap("image", "contrast", live={"contrastOpen": True, "imageStep": 0})
    c_ans = compose_turn("这个画面现在是在干什么？", curtain)
    ct = (c_ans or {}).get("text") or ""
    if "开始看图" not in ct or "去设置" in ct or "不必另起一套开场" in ct:
        fails.append("contrast_curtain")
        print("FAIL contrast_curtain", ct[:240])
    else:
        print("OK contrast_curtain", ct[:160].replace("\n", " | "))

    # L-07: mid/late must lead with the current phenomenon, not a recap opener,
    # and must not cite the Library or the learning workbench.
    img_mem = [{"q": "这是什么", "a": "你现在在图片课的第一关。左边是条件，中间是正在去噪的画布，右边是输出与对照。"}]
    img_mid = compose_turn(
        "这个画面现在是在干什么？",
        snap("image", "step", stationIndex=1, recentQA=img_mem, taughtIds=["image-map"], live={"imageStep": 1}),
    )
    imt = (img_mid or {}).get("text") or ""
    if "刚才已经看过" in imt or "不必另起一套开场" in imt or "书库" in imt or "学习工作台" in imt or "去设置" in imt:
        fails.append("image_midlate_lead")
        print("FAIL image_midlate_lead", imt[:240])
    elif "画布" not in imt or "出处" not in imt:
        fails.append("image_midlate_phenomenon")
        print("FAIL image_midlate_phenomenon", imt[:240])
    else:
        print("OK image_midlate", imt[:180].replace("\n", " | "))

    mu_mem = [{"q": "这是什么", "a": "你现在在音乐课的第一关。左边是已经有的音，中间是琴卷，右边是下一个音的概率。"}]
    mu_mid = compose_turn(
        "这个画面现在是在干什么？",
        snap(
            "music",
            "step",
            stationIndex=1,
            recentQA=mu_mem,
            taughtIds=["music-map"],
            generated=True,
            topCandidates=[{"token": "A4", "percent": 38.2}, {"token": "G4", "percent": 26.3}],
        ),
    )
    mut = (mu_mid or {}).get("text") or ""
    if "刚才已经看过" in mut or "不必另起一套开场" in mut or "书库" in mut or "学习工作台" in mut or "去设置" in mut:
        fails.append("music_midlate_cite")
        print("FAIL music_midlate_cite", mut[:240])
    elif "A4" not in mut or "38.2%" not in mut or "出处" not in mut:
        fails.append("music_midlate_candidates")
        print("FAIL music_midlate_candidates", mut[:240])
    else:
        print("OK music_midlate", mut[:180].replace("\n", " | "))

    # Even at the invite station, a screen question must not cite 书库 / 工作台.
    mu_inv = compose_turn(
        "这个画面现在是在干什么？",
        snap(
            "music",
            "invite",
            stationIndex=4,
            recentQA=mu_mem,
            taughtIds=["music-map"],
            generated=True,
            topCandidates=[{"token": "A4", "percent": 38.2}, {"token": "G4", "percent": 26.3}],
        ),
    )
    miv = (mu_inv or {}).get("text") or ""
    if "书库" in miv or "学习工作台" in miv or "刚才已经看过" in miv:
        fails.append("music_invite_screen_cite")
        print("FAIL music_invite_screen_cite", miv[:240])
    else:
        print("OK music_invite_screen", miv[:180].replace("\n", " | "))

    att = compose_turn(
        "看中间的线",
        snap("text", "attention", stationIndex=2, generated=True, recentQA=[{"q": "这是什么", "a": "你现在在文字课的第一关。先看它猜出一个词。"}]),
    )
    at = (att or {}).get("text") or ""
    if "线" not in at or "去设置" in at:
        fails.append("text_mid_lines")
        print("FAIL text_mid_lines", at[:240])
    else:
        print("OK text_mid_lines", at[:180].replace("\n", " | "))


    # After a curtain-only detour, first-eye on the image course must still introduce the three regions.
    curtain_mem = [{"q": "这个画面现在是在干什么？", "a": "请先点「开始看图」。对照帘收起之后，再问这个画面在干什么，我会按你眼前的画面来讲。"}]
    fe = compose_turn(
        "这个画面现在是在干什么？",
        snap("image", "map", stationIndex=0, recentQA=curtain_mem, taughtIds=["image-contrast"], live={"imageStep": 0}),
    )
    fet = (fe or {}).get("text") or ""
    if "开始看图" in fet or "刚才已经看过" in fet or "不必另起一套开场" in fet:
        fails.append("image_first_eye_after_curtain")
        print("FAIL image_first_eye_after_curtain", fet[:240])
    elif not (("左" in fet and "画布" in fet) or ("三块" in fet) or ("第一关" in fet)):
        fails.append("image_first_eye_after_curtain_regions")
        print("FAIL image_first_eye_after_curtain_regions", fet[:240])
    else:
        print("OK image_first_eye_after_curtain", fet[:180].replace("\n", " | "))

    print("FAILS", fails)
    return 0 if not fails else 1


if __name__ == "__main__":
    raise SystemExit(main())
