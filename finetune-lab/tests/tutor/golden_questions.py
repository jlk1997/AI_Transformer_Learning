# -*- coding: utf-8 -*-
"""Phase 4 golden-question set: four courses, first screen + mid beats, plus library/magnifier see-then-name."""
from __future__ import annotations

from copy import deepcopy
from typing import Any


def _cands(rows: list[tuple[str, float]]) -> list[dict[str, Any]]:
    return [{"token": t, "percent": p} for t, p in rows]


def snap(
    course: str,
    station: str,
    *,
    stationIndex: int = 0,
    generated: bool = False,
    allowedMathWalks: list[str] | None = None,
    locale: str = "zh-CN",
    topCandidates: list[dict[str, Any]] | None = None,
    live: dict[str, Any] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "course": course,
        "station": station,
        "stationTitle": station,
        "stationIndex": stationIndex,
        "locale": locale,
        "unlocked": {
            "sampling": False,
            "imageKnobs": False,
            "musicKnobs": False,
            "textPathDone": False,
        },
        "topCandidates": topCandidates
        if topCandidates is not None
        else (
            _cands([("A4", 38.2), ("G4", 26.3), ("F4", 20.5)])
            if course == "music"
            else _cands([("visualize", 54.7), ("create", 20.9), ("see", 12.1)])
        ),
        "allowedMathWalks": list(allowedMathWalks or []),
        "generated": generated,
        "visibleRegions": ["task-cluster", "guide-slot"],
        "live": dict(live or {}),
        "recentQA": [],
        "taughtIds": [],
    }
    if course == "image" and "imageStep" not in out["live"]:
        step = extra.pop("imageStep", 0)
        out["live"]["imageStep"] = step
        out["imageStep"] = step
        out["live"]["imageSteps"] = extra.pop("imageSteps", 8)
    out.update(extra)
    return out


TEXT_FIRST = snap("text", "generate")
TEXT_MID = snap("text", "tokens", stationIndex=1, generated=True, allowedMathWalks=["prob"])
MUSIC_FIRST = snap("music", "map")
MUSIC_MID = snap("music", "step", stationIndex=2, generated=True, allowedMathWalks=["musicProb"])
IMAGE_FIRST = snap("image", "map", imageStep=0)
IMAGE_MID = snap("image", "step", stationIndex=1, generated=True, allowedMathWalks=["denoise"], imageStep=1)
FT_FIRST = snap("finetune", "explain", topCandidates=[])
FT_MID = snap("finetune", "pack", stationIndex=1, generated=True, topCandidates=[], live={"ftTokenCount": 12, "ftSpine": "preview"})
FT_LOSS = snap("finetune", "loss", stationIndex=5, generated=True, allowedMathWalks=["loss"], topCandidates=_cands([("后", 4.0), ("的", 22.0), ("了", 18.0), ("一", 11.0)]), live={"ftSpine": "loss"})
FT_LOSS_EN = snap("finetune", "loss", stationIndex=5, generated=True, allowedMathWalks=["loss"], topCandidates=_cands([("后", 4.0), ("的", 22.0), ("了", 18.0), ("一", 11.0)]), live={"ftSpine": "loss"}, locale="en")
FT_LOSS_WEIGHT = snap("finetune", "loss", stationIndex=5, generated=True, allowedMathWalks=["loss", "weight"], topCandidates=_cands([("后", 4.0), ("的", 22.0), ("了", 18.0), ("一", 11.0)]), live={"ftSpine": "loss", "ftWeightMove": True})
FT_LOSS_WEIGHT_EN = snap("finetune", "loss", stationIndex=5, generated=True, allowedMathWalks=["loss", "weight"], topCandidates=_cands([("后", 4.0), ("的", 22.0), ("了", 18.0), ("一", 11.0)]), live={"ftSpine": "loss", "ftWeightMove": True}, locale="en")

TEXT_FIRST_EN = snap("text", "generate", locale="en")
TEXT_MID_EN = snap("text", "tokens", stationIndex=1, generated=True, allowedMathWalks=["prob"], locale="en")

TEXT_KNOBS = snap(
    "text",
    "knobs",
    stationIndex=5,
    generated=True,
    allowedMathWalks=["prob", "attn", "residual", "temp"],
    unlocked={"sampling": True, "imageKnobs": False, "musicKnobs": False, "textPathDone": False},
    live={"temperature": 1.0},
)
TEXT_KNOBS_EN = snap(
    "text",
    "knobs",
    stationIndex=5,
    generated=True,
    allowedMathWalks=["prob", "attn", "residual", "temp"],
    unlocked={"sampling": True, "imageKnobs": False, "musicKnobs": False, "textPathDone": False},
    live={"temperature": 1.0},
    locale="en",
)
IMAGE_MID_EN = snap("image", "denoise", stationIndex=1, generated=True, allowedMathWalks=["denoise"], imageStep=1, locale="en")


# Shared control labels the student should hear in the matching locale.
CTRL = {
    "zh": {
        "text_first": "生成下一个词",
        "text_mid": "推进一步",
        "image": "再去噪一步",
        "music": "生成下一个音符",
        "finetune": "推进一步",
        "cite": "出处",
    },
    "en": {
        "text_first": "Generate the next word",
        "text_mid": "Take one step",
        "image": "Denoise one step",
        "music": "Generate the next note",
        "finetune": "Take one step",
        "cite": "Source:",
    },
}


def case(
    id: str,
    question: str,
    snapshot: dict[str, Any],
    *,
    intent: str,
    must: tuple[str, ...] = (),
    must_not: tuple[str, ...] = (),
    walk: str | None = None,
    walk_forbidden: bool = False,
    highlight_any: tuple[str, ...] = (),
    next_label: str | None = None,
    cite: bool = True,
) -> dict[str, Any]:
    return {
        "id": id,
        "question": question,
        "snapshot": deepcopy(snapshot),
        "expect": {
            "intent": intent,
            "must": list(must),
            "must_not": list(must_not),
            "walk": walk,
            "walk_forbidden": walk_forbidden,
            "highlight_any": list(highlight_any),
            "next_label": next_label,
            "cite": cite,
        },
    }


EARLY_SPOIL = ("温度", "LoRA", "QLoRA", "DPO", "CFG", "学习率", "temperature", "learning rate")
GRAD_SPOIL = ("梯度", "反向传播", "gradient", "backprop", "backpropagation")

LMHEAD_SPOIL = ("输出头", "解嵌入", "lm_head", "unembedding", "unembed", "output head")
CUTOFF_SPOIL = ("Top-k", "Top-p", "top-k", "top-p", "截断核采样", "核采样", "nucleus")

TEXT_MID_LMHEAD = snap(
    "text",
    "tokens",
    stationIndex=1,
    generated=True,
    allowedMathWalks=["prob", "lmhead"],
    topCandidates=[
        {"token": "visualize", "percent": 54.7, "score": 2.10, "kept": True},
        {"token": "create", "percent": 20.9, "score": 1.14, "kept": True},
        {"token": "see", "percent": 12.1, "score": 0.59, "kept": True},
    ],
)
TEXT_MID_LMHEAD_EN = snap(
    "text",
    "tokens",
    stationIndex=1,
    generated=True,
    allowedMathWalks=["prob", "lmhead"],
    locale="en",
    topCandidates=[
        {"token": "visualize", "percent": 54.7, "score": 2.10, "kept": True},
        {"token": "create", "percent": 20.9, "score": 1.14, "kept": True},
        {"token": "see", "percent": 12.1, "score": 0.59, "kept": True},
    ],
)
TEXT_KNOBS_TOPK = snap(
    "text",
    "knobs",
    stationIndex=5,
    generated=True,
    allowedMathWalks=["prob", "attn", "residual", "temp", "cutoff", "lmhead"],
    unlocked={"sampling": True, "imageKnobs": False, "musicKnobs": False, "textPathDone": False},
    live={"temperature": 1.0, "samplingType": "top-k", "samplingValue": 5, "topK": 5, "candidateKept": 5},
    topCandidates=[
        {"token": "visualize", "percent": 40.0, "score": 2.10, "kept": True},
        {"token": "create", "percent": 25.0, "score": 1.14, "kept": True},
        {"token": "see", "percent": 15.0, "score": 0.59, "kept": True},
        {"token": "make", "percent": 12.0, "score": 0.40, "kept": True},
        {"token": "look", "percent": 8.0, "score": 0.20, "kept": True},
        {"token": "view", "percent": 0.0, "score": -0.10, "kept": False},
    ],
)
TEXT_KNOBS_TOPP = snap(
    "text",
    "knobs",
    stationIndex=5,
    generated=True,
    allowedMathWalks=["prob", "attn", "residual", "temp", "cutoff", "lmhead"],
    unlocked={"sampling": True, "imageKnobs": False, "musicKnobs": False, "textPathDone": False},
    live={"temperature": 1.0, "samplingType": "top-p", "samplingValue": 0.5, "topP": 0.5, "candidateKept": 1},
    topCandidates=[
        {"token": "visualize", "percent": 54.7, "score": 2.10, "kept": True},
        {"token": "create", "percent": 20.9, "score": 1.14, "kept": False},
        {"token": "see", "percent": 12.1, "score": 0.59, "kept": False},
    ],
)
MUSIC_KNOBS_TOPK = snap(
    "music",
    "knobs",
    stationIndex=3,
    generated=True,
    allowedMathWalks=["musicProb", "temp", "cutoff"],
    unlocked={"sampling": False, "imageKnobs": False, "musicKnobs": True, "textPathDone": False},
    live={"musicTemp": 1.0, "temperature": 1.0, "samplingType": "top-k", "samplingValue": 5, "topK": 5, "candidateKept": 3},
    topCandidates=[
        {"token": "A4", "percent": 38.2, "kept": True},
        {"token": "G4", "percent": 26.3, "kept": True},
        {"token": "F4", "percent": 20.5, "kept": True},
        {"token": "E4", "percent": 0.0, "kept": False},
    ],
)
GENERIC_ZH = "先看眼前的画面，用你看见的数字理解这一步"
GENERIC_EN = "Look at the screen in front of you and use the numbers you can see"


QKV_SPOIL = ("Q/K/V", "Q、K、V", "Q, K, V", "查询向量", "K^T", "softmax(Q")

MASK_SPOIL = ("因果掩码", "causal mask")
LN_SPOIL = ("层归一化", "LayerNorm", "layer normalization")
EMBED_MATRIX_SPOIL = ("嵌入矩阵",)

TEXT_ATTN_MASK = snap(
    "text",
    "attention",
    stationIndex=2,
    generated=True,
    allowedMathWalks=["prob", "attn", "mask"],
    token="visualize",
    layer=0,
    head=0,
    live={
        "token": "visualize",
        "layer": 0,
        "head": 0,
        "attnReady": True,
        "modelReady": True,
        "attnWeights": [
            {"token": "Attention", "percent": 42.0},
            {"token": "is", "percent": 18.0},
        ],
    },
)
TEXT_ATTN_MASK_EN = snap(
    "text",
    "attention",
    stationIndex=2,
    generated=True,
    allowedMathWalks=["prob", "attn", "mask"],
    token="visualize",
    layer=0,
    head=0,
    locale="en",
    live={
        "token": "visualize",
        "layer": 0,
        "head": 0,
        "attnReady": True,
        "modelReady": True,
        "attnWeights": [
            {"token": "Attention", "percent": 42.0},
            {"token": "is", "percent": 18.0},
        ],
    },
)
TEXT_ATTN_QKV = snap(
    "text",
    "attention",
    stationIndex=2,
    generated=True,
    allowedMathWalks=["prob", "attn", "mask"],
    token="visualize",
    layer=0,
    head=0,
    live={
        "token": "visualize",
        "layer": 0,
        "head": 0,
        "attnReady": True,
        "modelReady": True,
        "attnWeights": [
            {"token": "Attention", "percent": 42.0},
            {"token": "is", "percent": 18.0},
        ],
        "popover": "qkv",
    },
)
FAKE_ATTN_PCT = ("45.0%", "0.45", "12.3%", "99.9%")

TEXT_ATTN = snap(
    "text",
    "attention",
    stationIndex=2,
    generated=True,
    allowedMathWalks=["prob", "attn"],
    token="visualize",
    layer=0,
    head=0,
    live={
        "token": "visualize",
        "layer": 0,
        "head": 0,
        "attnReady": True,
        "modelReady": True,
        "attnWeights": [
            {"token": "Attention", "percent": 42.0},
            {"token": "is", "percent": 18.0},
        ],
    },
)
TEXT_ATTN_PENDING = snap(
    "text",
    "attention",
    stationIndex=2,
    generated=True,
    allowedMathWalks=["prob", "attn"],
    token="visualize",
    layer=0,
    head=0,
    live={
        "token": "visualize",
        "layer": 0,
        "head": 0,
        "attnReady": False,
        "modelReady": False,
    },
)
TEXT_LAYERS = snap(
    "text",
    "layers",
    stationIndex=3,
    generated=True,
    allowedMathWalks=["prob", "attn"],
    token="visualize",
    layer=0,
    head=1,
    live={"token": "visualize", "layer": 0, "head": 1, "attnReady": True, "modelReady": True},
)
TEXT_RESIDUAL = snap(
    "text",
    "residual",
    stationIndex=4,
    generated=True,
    allowedMathWalks=["prob", "attn", "residual"],
    token="visualize",
    layer=0,
    head=0,
    live={"token": "visualize", "layer": 0, "head": 0},
)
TEXT_ATTN_EN = snap(
    "text",
    "attention",
    stationIndex=2,
    generated=True,
    allowedMathWalks=["prob", "attn"],
    token="visualize",
    layer=0,
    head=0,
    locale="en",
    live={
        "token": "visualize",
        "layer": 0,
        "head": 0,
        "attnReady": True,
        "modelReady": True,
        "attnWeights": [
            {"token": "Attention", "percent": 42.0},
            {"token": "is", "percent": 18.0},
        ],
    },
)
TEXT_LAYERS_EN = snap(
    "text",
    "layers",
    stationIndex=3,
    generated=True,
    allowedMathWalks=["prob", "attn"],
    token="visualize",
    layer=0,
    head=1,
    locale="en",
    live={"token": "visualize", "layer": 0, "head": 1, "attnReady": True, "modelReady": True},
)
TEXT_RESIDUAL_EN = snap(
    "text",
    "residual",
    stationIndex=4,
    generated=True,
    allowedMathWalks=["prob", "attn", "residual"],
    token="visualize",
    layer=0,
    head=0,
    locale="en",
    live={"token": "visualize", "layer": 0, "head": 0},
)
TEXT_ATTN_PENDING_EN = snap(
    "text",
    "attention",
    stationIndex=2,
    generated=True,
    allowedMathWalks=["prob", "attn"],
    token="visualize",
    layer=0,
    head=0,
    locale="en",
    live={"token": "visualize", "layer": 0, "head": 0, "attnReady": False, "modelReady": False},
)



IMAGE_KNOBS = snap(
    "image",
    "knobs",
    stationIndex=3,
    generated=True,
    allowedMathWalks=["denoise", "cfg"],
    imageStep=2,
    unlocked={"sampling": False, "imageKnobs": True, "musicKnobs": False, "textPathDone": False},
)
IMAGE_KNOBS_EN = snap(
    "image",
    "knobs",
    stationIndex=3,
    generated=True,
    allowedMathWalks=["denoise", "cfg"],
    imageStep=2,
    locale="en",
    unlocked={"sampling": False, "imageKnobs": True, "musicKnobs": False, "textPathDone": False},
)
MUSIC_KNOBS = snap(
    "music",
    "knobs",
    stationIndex=3,
    generated=True,
    allowedMathWalks=["musicProb", "temp"],
    unlocked={"sampling": False, "imageKnobs": False, "musicKnobs": True, "textPathDone": False},
    live={"musicTemp": 1.0, "temperature": 1.0},
)
MUSIC_KNOBS_EN = snap(
    "music",
    "knobs",
    stationIndex=3,
    generated=True,
    allowedMathWalks=["musicProb", "temp"],
    locale="en",
    unlocked={"sampling": False, "imageKnobs": False, "musicKnobs": True, "textPathDone": False},
    live={"musicTemp": 1.0, "temperature": 1.0},
)



FT_METHOD = snap(
    "finetune",
    "method",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    live={"ftSpine": "method"},
    spineView="method",
)
FT_METHOD_EN = snap(
    "finetune",
    "method",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    locale="en",
    live={"ftSpine": "method"},
    spineView="method",
)
FT_EXPLORE = snap(
    "finetune",
    "explore",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    live={"ftSpine": "explore", "ftLater": "overfit"},
    spineView="explore",
)
FT_DPO = snap(
    "finetune",
    "explore",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    live={"ftSpine": "explore", "ftLater": "dpo"},
    spineView="explore",
)
FT_QLORA = snap(
    "finetune",
    "explore",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    live={"ftSpine": "explore", "ftLater": "qlora"},
    spineView="explore",
)

RANK_SPOIL = ("低秩", "low-rank", "low rank")
FORWARD_SPOIL = ("正向加噪", "forward process")

IMAGE_MID_FORWARD = snap(
    "image",
    "step",
    stationIndex=1,
    generated=True,
    allowedMathWalks=["denoise", "forward"],
    imageStep=1,
    imageSteps=8,
)
FT_METHOD_RANK = snap(
    "finetune",
    "method",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    live={"ftSpine": "method"},
    spineView="method",
)
FT_METHOD_RANK_EN = snap(
    "finetune",
    "method",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    locale="en",
    live={"ftSpine": "method"},
    spineView="method",
)
FT_QLORA_EN = snap(
    "finetune",
    "explore",
    stationIndex=5,
    generated=True,
    topCandidates=[],
    locale="en",
    live={"ftSpine": "explore", "ftLater": "qlora"},
    spineView="explore",
)


CASES: list[dict[str, Any]] = [
    # ---- text first ----
    case("zh-text-first-what", "这是什么", TEXT_FIRST, intent="what", must=("猜词机", "出处"), must_not=EARLY_SPOIL + (GENERIC_ZH,), highlight_any=("generate", "task-cluster", "task")),
    case("zh-text-first-right", "右边是什么", TEXT_FIRST, intent="what", must=("visualize", "54.7%", "出处"), must_not=EARLY_SPOIL + (GENERIC_ZH,), highlight_any=("right", "zone")),
    case("zh-text-first-how", "这个数怎么来的", TEXT_FIRST, intent="how_number", must=("54.7%", "出处"), must_not=EARLY_SPOIL, walk_forbidden=True, highlight_any=("right", "zone")),
    case("zh-text-first-next", "下一步怎么做", TEXT_FIRST, intent="next", must=("生成下一个词", "不会替你点", "出处"), next_label="生成下一个词", highlight_any=("generate", "task")),
    case("zh-text-first-check", "我还没看懂", TEXT_FIRST, intent="check", must=("visualize", "54.7%", "出处"), highlight_any=("right", "zone")),
    case("zh-text-first-deeper", "更深一点", TEXT_FIRST, intent="deeper", must=("出处",), must_not=EARLY_SPOIL, walk_forbidden=True),
    # ---- text mid ----
    case("zh-text-mid-what", "这是什么", TEXT_MID, intent="what", must=("出处", "词片"), must_not=(GENERIC_ZH, "第一关", "first station", "切换")),
    case("zh-text-mid-how", "这个数怎么来的", TEXT_MID, intent="how_number", must=("54.7%", "出处", "推演"), walk="prob", highlight_any=("right", "math", "zone")),
    case("zh-text-mid-next", "下一步怎么做", TEXT_MID, intent="next", must=("推进一步", "不会替你点", "出处"), next_label="推进一步", highlight_any=("coach-next", "guide", "slot")),
    case("zh-text-mid-check", "我还没看懂", TEXT_MID, intent="check", must=("54.7%", "出处")),
    case("zh-text-mid-deeper", "更深一点", TEXT_MID, intent="deeper", must=("出处",), walk="prob"),
    # ---- music first ----
    case("zh-music-first-what", "这是什么", MUSIC_FIRST, intent="what", must=("音", "出处"), must_not=EARLY_SPOIL + (GENERIC_ZH,)),
    case("zh-music-first-right", "右边是什么", MUSIC_FIRST, intent="what", must=("A4", "38.2%", "出处"), highlight_any=("right", "music-probs", "zone")),
    case("zh-music-first-how", "这个数怎么来的", MUSIC_FIRST, intent="how_number", must=("38.2%", "出处"), walk_forbidden=True),
    case("zh-music-first-next", "下一步怎么做", MUSIC_FIRST, intent="next", must=("生成下一个音符", "不会替你点", "出处"), next_label="生成下一个音符", highlight_any=("music", "task")),
    case("zh-music-first-check", "我还没看懂", MUSIC_FIRST, intent="check", must=("A4", "38.2%", "出处")),
    case("zh-music-first-deeper", "更深一点", MUSIC_FIRST, intent="deeper", must=("出处",), walk_forbidden=True),
    # ---- music mid ----
    case("zh-music-mid-what", "这是什么", MUSIC_MID, intent="what", must=("出处", "音"), must_not=(GENERIC_ZH, "第一关", "first station")),
    case("zh-music-mid-how", "这个数怎么来的", MUSIC_MID, intent="how_number", must=("38.2%", "出处"), walk="musicProb", highlight_any=("right", "math", "zone", "music")),
    case("zh-music-mid-next", "下一步怎么做", MUSIC_MID, intent="next", must=("生成下一个音符", "不会替你点", "出处"), next_label="生成下一个音符"),
    case("zh-music-mid-deeper", "更深一点", MUSIC_MID, intent="deeper", must=("出处",), walk="musicProb"),
    # ---- image first ----
    case("zh-image-first-what", "这是什么", IMAGE_FIRST, intent="what", must=("出处",), must_not=EARLY_SPOIL + (GENERIC_ZH,)),
    case("zh-image-first-right", "右边是什么", IMAGE_FIRST, intent="what", must=("出处",), must_not=(GENERIC_ZH,)),
    case("zh-image-first-how", "这个数怎么来的", IMAGE_FIRST, intent="how_number", must=("第 0 步", "出处"), walk_forbidden=True, highlight_any=("image", "canvas", "step")),
    case("zh-image-first-next", "下一步怎么做", IMAGE_FIRST, intent="next", must=("再去噪一步", "不会替你点", "出处"), next_label="再去噪一步", highlight_any=("denoise", "image")),
    case("zh-image-first-check", "我还没看懂", IMAGE_FIRST, intent="check", must=("第 0 步", "出处")),
    case("zh-image-first-deeper", "更深一点", IMAGE_FIRST, intent="deeper", must=("出处",), walk_forbidden=True),
    # ---- image mid ----
    case("zh-image-mid-what", "这是什么", IMAGE_MID, intent="what", must=("出处",), must_not=(GENERIC_ZH, "第一关", "first station")),
    case("zh-image-mid-how", "这个数怎么来的", IMAGE_MID, intent="how_number", must=("第 1 步", "出处"), walk="denoise", highlight_any=("image", "canvas", "math")),
    case("zh-image-mid-next", "下一步怎么做", IMAGE_MID, intent="next", must=("再去噪一步", "不会替你点", "出处"), next_label="再去噪一步"),
    case("zh-image-mid-check", "我还没看懂", IMAGE_MID, intent="check", must=("第 1 步", "出处")),
    # ---- finetune first (no train) ----
    case("zh-ft-first-what", "这是什么", FT_FIRST, intent="what", must=("出处", "权重"), must_not=("LoRA", "QLoRA", "DPO", "学习率", "CFG", GENERIC_ZH, "自动开训") + GRAD_SPOIL),
    case("zh-ft-first-right", "右边是什么", FT_FIRST, intent="what", must=("出处",), must_not=(GENERIC_ZH,) + GRAD_SPOIL),
    case("zh-ft-first-how", "这个数怎么来的", FT_FIRST, intent="how_number", must=("出处",), walk_forbidden=True),
    case("zh-ft-first-next", "下一步怎么做", FT_FIRST, intent="next", must=("推进一步", "出处"), next_label="推进一步", highlight_any=("task", "cluster")),
    case("zh-ft-first-check", "我还没看懂", FT_FIRST, intent="check", must=("出处",)),
    case("zh-ft-first-deeper", "更深一点", FT_FIRST, intent="deeper", must=("出处",), walk_forbidden=True, must_not=EARLY_SPOIL + GRAD_SPOIL),
    # ---- finetune mid, still no train / no loss walk ----
    case("zh-ft-mid-what", "这是什么", FT_MID, intent="what", must=("出处", "词片"), must_not=(GENERIC_ZH, "第一关", "first station", "LoRA", "QLoRA", "DPO") + GRAD_SPOIL),
    case("zh-ft-mid-how", "这个数怎么来的", FT_MID, intent="how_number", must=("出处",), walk_forbidden=True),
    case("zh-ft-mid-next", "下一步怎么做", FT_MID, intent="next", must=("推进一步", "出处"), next_label="推进一步"),
    # ---- finetune loss station (no new train; sketch numbers only) ----
    case("zh-ft-loss-what", "这是什么", FT_LOSS, intent="what", must=("出处", "概率表", "示意"), must_not=(GENERIC_ZH, "自动开训", "LoRA", "QLoRA", "DPO")),
    case("zh-ft-loss-how", "这个数怎么来的", FT_LOSS, intent="how_number", must=("出处", "4%", "1/25", "示意"), walk="loss", highlight_any=("loss-table", "loss-walk", "loss")),
    case("zh-ft-loss-table", "和这张表有什么关系", FT_LOSS, intent="what", must=("出处", "概率表", "示意"), must_not=(GENERIC_ZH, "自动开训")),
    # ---- EN subset ----

    # Unlocked knobs station: see the table, then name temperature. Point at the task-cluster controls.
    case("zh-text-knobs-what", "这是什么", TEXT_KNOBS, intent="what", must=("出处", "任务区", "抽"), must_not=(GENERIC_ZH, "顶部温度滑条", "顶部选词", "自动开训"), walk="temp", highlight_any=("sampling", "panel", "right")),
    case("zh-text-knobs-table", "表怎么变了", TEXT_KNOBS, intent="how_number", must=("出处", "变尖", "抽"), must_not=(GENERIC_ZH, "顶部温度滑条", "自动开训"), walk="temp", highlight_any=("sampling", "panel", "right")),
    case("zh-text-knobs-knob", "这个旋钮干什么", TEXT_KNOBS, intent="what", must=("出处", "温度", "第一名"), must_not=(GENERIC_ZH, "顶部温度滑条", "自动开训"), walk="temp", highlight_any=("sampling", "panel", "right")),
    case("zh-text-first-temp", "温度是什么", TEXT_FIRST, intent="other", must=("锁", "任务区"), must_not=("顶部温度滑条", "顶部选词"), walk_forbidden=True),
    case("en-text-knobs-table", "How did the table change?", TEXT_KNOBS_EN, intent="how_number", must=("Source:", "sharpen", "draw"), must_not=(GENERIC_EN, "slider on top", "control on top"), walk="temp", highlight_any=("sampling", "panel", "right")),

    case("en-text-first-what", "What is this?", TEXT_FIRST_EN, intent="what", must=("Source:",), must_not=(GENERIC_EN, "出处")),
    case("en-text-first-right", "What is the table on the right?", TEXT_FIRST_EN, intent="what", must=("visualize", "54.7%", "Source:"), highlight_any=("right", "zone")),
    case("en-text-first-how", "How did this number come from?", TEXT_FIRST_EN, intent="how_number", must=("54.7%", "Source:"), walk_forbidden=True),
    case("en-text-first-next", "What should I do next?", TEXT_FIRST_EN, intent="next", must=("Generate the next word", "Source:"), next_label="Generate the next word", highlight_any=("generate", "task")),
    case("en-text-first-check", "I don't understand", TEXT_FIRST_EN, intent="check", must=("54.7%", "Source:")),
    case("en-text-first-deeper", "Go deeper", TEXT_FIRST_EN, intent="deeper", must=("Source:",), walk_forbidden=True),
    case("en-text-mid-how", "How did this number come from?", TEXT_MID_EN, intent="how_number", must=("54.7%", "Source:"), walk="prob"),
    case("en-text-mid-next", "What should I do next?", TEXT_MID_EN, intent="next", must=("Take one step", "Source:"), next_label="Take one step"),
    case("en-image-mid-how", "How did this number come from?", IMAGE_MID_EN, intent="how_number", must=("step 1", "Source:"), walk="denoise"),
    case("en-image-mid-next", "What should I do next?", IMAGE_MID_EN, intent="next", must=("Denoise one step", "Source:"), next_label="Denoise one step"),
    case("en-ft-loss-how", "How did this number come from?", FT_LOSS_EN, intent="how_number", must=("Source:", "4%", "1/25", "sketch"), walk="loss", highlight_any=("loss-table", "loss-walk", "loss")),

    # ---- text late path: attention, layers, residual (and honest pending weights) ----
    case("zh-text-attn-line", "这根线是什么", TEXT_ATTN, intent="what", must=("出处", "亮", "visualize", "42.0%"), must_not=EARLY_SPOIL + QKV_SPOIL + (GENERIC_ZH,), walk="attn", highlight_any=("mid", "attention", "sankey", "zone")),
    case("zh-text-attn-pending", "这根线是什么", TEXT_ATTN_PENDING, intent="what", must=("出处", "亮", "准备"), must_not=EARLY_SPOIL + QKV_SPOIL + FAKE_ATTN_PCT + ("42.0%",), walk="attn", highlight_any=("mid", "attention", "sankey", "zone")),
    case("zh-text-layers-swap", "换一层能看见什么", TEXT_LAYERS, intent="what", must=("出处", "层", "头", "亮"), must_not=EARLY_SPOIL + QKV_SPOIL + (GENERIC_ZH,), walk="attn", highlight_any=("transformer-bounding-title", "attention-head", "mid", "zone")),
    case("zh-text-residual-why", "为什么要残差", TEXT_RESIDUAL, intent="why", must=("出处", "旁路", "示意"), must_not=EARLY_SPOIL + QKV_SPOIL + (GENERIC_ZH,), walk="residual", highlight_any=("residual", "mid", "zone")),
    case("en-text-attn-line", "What is this line?", TEXT_ATTN_EN, intent="what", must=("Source:", "lit", "visualize", "42.0%"), must_not=QKV_SPOIL + (GENERIC_EN, "出处"), walk="attn", highlight_any=("mid", "attention", "sankey", "zone")),
    case("en-text-attn-pending", "What is this line?", TEXT_ATTN_PENDING_EN, intent="what", must=("Source:", "preparing"), must_not=QKV_SPOIL + FAKE_ATTN_PCT + ("42.0%", "出处"), walk="attn", highlight_any=("mid", "attention", "sankey", "zone")),
    case("en-text-layers-swap", "What changes if I switch a layer?", TEXT_LAYERS_EN, intent="what", must=("Source:", "layer", "head"), must_not=QKV_SPOIL + (GENERIC_EN, "出处"), walk="attn", highlight_any=("transformer-bounding-title", "attention-head", "mid", "zone")),
    case("en-text-residual-why", "Why is there a residual?", TEXT_RESIDUAL_EN, intent="why", must=("Source:", "bypass", "sketch"), must_not=QKV_SPOIL + (GENERIC_EN, "出处"), walk="residual", highlight_any=("residual", "mid", "zone")),

    # ---- image CFG knobs (after denoise, knobs unlocked) ----
    case("zh-image-knobs-what", "这个旋钮干什么", IMAGE_KNOBS, intent="what", must=("出处", "听话", "不是", "温度"), must_not=(GENERIC_ZH, "自动开训"), walk="cfg", highlight_any=("cfg", "knobs", "compare", "cluster")),
    case("zh-image-knobs-thumbs", "对照小图怎么变了", IMAGE_KNOBS, intent="how_number", must=("出处", "1 / 7 / 15", "听话"), must_not=(GENERIC_ZH, "自动开训"), walk="cfg", highlight_any=("cfg", "knobs", "compare", "cluster")),
    case("zh-image-knobs-not-temp", "这是温度吗", IMAGE_KNOBS, intent="what", must=("出处", "不是", "温度", "听话"), must_not=(GENERIC_ZH, "自动开训"), walk="cfg", highlight_any=("cfg", "knobs", "compare", "cluster")),
    case("en-image-knobs-thumbs", "How did the thumbnails change?", IMAGE_KNOBS_EN, intent="how_number", must=("Source:", "1 / 7 / 15", "guidance"), must_not=(GENERIC_EN, "出处"), walk="cfg", highlight_any=("cfg", "knobs", "compare", "cluster")),
    # ---- music sampling knobs (existing temp walk, no second dock) ----
    case("zh-music-knobs-what", "这个旋钮干什么", MUSIC_KNOBS, intent="what", must=("出处", "意外", "温度", "第一名"), must_not=(GENERIC_ZH, "自动开训"), walk="temp", highlight_any=("knobs", "music", "probs", "cluster")),
    case("zh-music-knobs-table", "排行怎么变了", MUSIC_KNOBS, intent="how_number", must=("出处", "变尖", "抽"), must_not=(GENERIC_ZH, "自动开训"), walk="temp", highlight_any=("knobs", "music", "probs", "cluster")),
    case("en-music-knobs-table", "How did the ranking change?", MUSIC_KNOBS_EN, intent="how_number", must=("Source:", "sharpen", "draw"), must_not=(GENERIC_EN, "出处"), walk="temp", highlight_any=("knobs", "music", "probs", "cluster")),
    # ---- cross-course analogy after a course switch ----
    case("zh-text-cross-same", "这和音乐课是一件事吗", TEXT_MID, intent="what", must=("出处", "下一", "词", "猜词机"), must_not=(GENERIC_ZH, "自动开训"), highlight_any=("right", "zone")),
    case("zh-music-cross-text", "这和文字课是一件事吗", MUSIC_MID, intent="what", must=("出处", "下一", "音", "猜词机"), must_not=(GENERIC_ZH, "自动开训"), highlight_any=("music-probs", "cluster", "probs")),
    case("zh-image-cross-text", "这和文字课是一件事吗", IMAGE_MID, intent="what", must=("出处", "去噪", "猜词机"), must_not=(GENERIC_ZH, "自动开训"), highlight_any=("canvas", "denoise", "cluster", "image")),
    case("zh-ft-cross-text", "这和文字课是一件事吗", FT_LOSS, intent="what", must=("出处", "损失", "表", "猜词机"), must_not=(GENERIC_ZH, "自动开训"), highlight_any=("loss-table", "first-line", "loss")),

    # ---- later-lab / method (optional stops; not on the required 第6/6 coach path) ----
    case("zh-ft-method-what", "这是什么", FT_METHOD, intent="what", must=("出处", "旁边", "一小块", "LoRA"), must_not=(GENERIC_ZH, "自动开训", "完整平台"), highlight_any=("method", "bridge")),
    case("zh-ft-overfit", "多训一定更好吗", FT_EXPLORE, intent="what", must=("出处", "不一定", "示意"), must_not=(GENERIC_ZH, "自动开训"), highlight_any=("overfit", "depth")),
    case("zh-ft-dpo-sketch", "这个对照是一次完整训练吗", FT_DPO, intent="what", must=("出处", "示意", "不是"), must_not=(GENERIC_ZH, "自动开训"), highlight_any=("dpo", "horizon", "sketch")),
    case("zh-ft-qlora-bar", "这块小条是什么", FT_QLORA, intent="what", must=("出处", "显存", "8"), must_not=(GENERIC_ZH, "自动开训"), highlight_any=("qlora", "horizon", "board")),
    case("en-ft-method-what", "What is this?", FT_METHOD_EN, intent="what", must=("Source:", "LoRA", "add-on"), must_not=(GENERIC_EN, "出处", "full platform"), highlight_any=("method", "bridge")),
    case("en-ft-qlora-bar", "What is this bar?", FT_QLORA_EN, intent="what", must=("Source:", "8", "memor"), must_not=(GENERIC_EN, "出处"), highlight_any=("qlora", "horizon", "board")),
    # ---- loss-station weight nudge (still 第6/6; names 梯度 only after the visible move) ----
    case("zh-ft-loss-weight", "这个数怎么让权重动", FT_LOSS_WEIGHT, intent="what", must=("出处", "示意", "权重", "4%"), walk="weight", highlight_any=("weight-move", "weight-walk", "loss-table", "loss"), must_not=(GENERIC_ZH, "自动开训")),
    case("zh-ft-grad-what", "梯度是什么", FT_LOSS_WEIGHT, intent="what", must=("出处", "示意", "梯度", "权重"), walk="weight", highlight_any=("weight-move", "weight-walk", "loss-table", "loss"), must_not=(GENERIC_ZH, "自动开训", "实时平均")),
    case("en-ft-grad-what", "What is a gradient?", FT_LOSS_WEIGHT_EN, intent="what", must=("Source:", "sketch", "gradient", "weight"), walk="weight", highlight_any=("weight-move", "weight-walk", "loss-table", "loss"), must_not=(GENERIC_EN, "出处", "live average")),
    case("zh-ft-first-grad", "梯度是什么", FT_FIRST, intent="what", must=("出处",), walk_forbidden=True, must_not=GRAD_SPOIL + (GENERIC_ZH, "自动开训", "LoRA", "QLoRA", "DPO")),

    # ---- Phase 3: output head (tokens or later) and Top-k / Top-p cutoff (knobs only) ----
    case("zh-text-lmhead-what", "输出头是什么", TEXT_MID_LMHEAD, intent="what", must=("出处", "输出头", "向量"), walk="lmhead", highlight_any=("right", "math", "zone"), must_not=(GENERIC_ZH, "第一关")),
    case("zh-text-lmhead-how", "这些百分比从哪条向量来", TEXT_MID_LMHEAD, intent="how_number", must=("出处", "向量", "分数"), walk="lmhead", highlight_any=("right", "math", "zone"), must_not=(GENERIC_ZH, "第一关")),
    case("en-text-lmhead-what", "What is the output head?", TEXT_MID_LMHEAD_EN, intent="what", must=("Source:", "output head", "vector"), walk="lmhead", highlight_any=("right", "math", "zone"), must_not=(GENERIC_EN, "出处")),
    case("zh-text-topk-set", "候选怎么变少了", TEXT_KNOBS_TOPK, intent="how_number", must=("出处", "Top-k", "k=5"), walk="cutoff", highlight_any=("sampling", "panel", "right"), must_not=(GENERIC_ZH, "自动开训")),
    case("zh-text-topp-set", "Top-p是什么", TEXT_KNOBS_TOPP, intent="what", must=("出处", "Top-p", "p=0.5"), walk="cutoff", highlight_any=("sampling", "panel", "right"), must_not=(GENERIC_ZH, "自动开训")),
    case("zh-music-topk-set", "候选音怎么变少了", MUSIC_KNOBS_TOPK, intent="how_number", must=("出处", "Top-k", "抽音"), walk="cutoff", highlight_any=("knobs", "music", "probs", "cluster"), must_not=(GENERIC_ZH, "自动开训", "抽词")),
    case("zh-text-first-lmhead", "输出头是什么", TEXT_FIRST, intent="what", must=("出处",), walk_forbidden=True, must_not=LMHEAD_SPOIL + EARLY_SPOIL + (GENERIC_ZH, "自动开训")),
    case("zh-text-first-topk", "Top-k是什么", TEXT_FIRST, intent="what", must=("锁", "任务区"), walk_forbidden=True, must_not=CUTOFF_SPOIL + ("顶部温度滑条", "顶部选词")),

    # ---- Phase 4: library / magnifier parts start from a visible phenomenon ----
    case("zh-text-qkv-mag", "我点开了放大镜，这是什么", TEXT_ATTN_QKV, intent="what", must=("出处", "亮", "提问", "示意"), must_not=EARLY_SPOIL + ("K^T", "softmax(Q", GENERIC_ZH, "第一关"), highlight_any=("mid", "attention", "popover", "zone")),
    case("zh-text-mask-see", "右上为什么是暗的", TEXT_ATTN_MASK, intent="why", must=("出处", "暗", "因果", "偷看"), walk="mask", highlight_any=("mid", "attention", "sankey", "zone"), must_not=EARLY_SPOIL + QKV_SPOIL + (GENERIC_ZH, "第一关")),
    case("en-text-mask-see", "Why is the upper right dark?", TEXT_ATTN_MASK_EN, intent="why", must=("Source:", "dark", "causal", "peek"), walk="mask", highlight_any=("mid", "attention", "sankey", "zone"), must_not=QKV_SPOIL + (GENERIC_EN, "出处")),
    case("zh-text-ln-what", "层归一化是什么", TEXT_RESIDUAL, intent="what", must=("出处", "层归一化", "尺度"), must_not=EARLY_SPOIL + (GENERIC_ZH, "第一关", "自动开训"), highlight_any=("mid", "residual", "zone")),
    case("zh-text-pe-what", "位置编码是什么", TEXT_MID, intent="what", must=("出处", "位置", "学", "示意"), must_not=EARLY_SPOIL + (GENERIC_ZH, "第一关", "本课演示 RoPE", "正弦就是现场"), highlight_any=("left", "token-column", "position", "emb")),
    case("zh-text-first-mask", "因果掩码是什么", TEXT_FIRST, intent="what", must=("出处",), walk_forbidden=True, must_not=MASK_SPOIL + LN_SPOIL + EMBED_MATRIX_SPOIL + QKV_SPOIL + EARLY_SPOIL + (GENERIC_ZH, "自动开训")),

    # ---- Phase 5: later sketches (forward noise, LoRA rank, DPO pair, music yellow) ----
    case("zh-image-forward-see", "图是怎么一步步变吵的", IMAGE_MID_FORWARD, intent="how_number", must=("出处", "变吵", "示意"), walk="forward", highlight_any=("forward", "canvas", "image", "step"), must_not=(GENERIC_ZH, "自动开训", "第一关")),
    case("zh-ft-lora-rank", "为什么是低秩", FT_METHOD_RANK, intent="why", must=("出处", "低秩", "r=4", "r=16", "示意"), must_not=(GENERIC_ZH, "自动开训", "完整平台"), highlight_any=("rank", "method", "bridge")),
    case("en-ft-lora-rank", "Why is this low-rank?", FT_METHOD_RANK_EN, intent="why", must=("Source:", "low-rank", "r=4", "r=16", "sketch"), must_not=(GENERIC_EN, "出处", "full platform", "自动开训"), highlight_any=("rank", "method", "bridge")),
    case("zh-ft-dpo-pair", "更喜欢的那句是怎么被抬高的", FT_DPO, intent="how_number", must=("出处", "0.08", "0.74", "示意"), must_not=(GENERIC_ZH, "自动开训", "完整平台"), highlight_any=("pair-walk", "dpo", "sketch", "horizon")),
    case("zh-music-yellow-see", "黄边是什么", MUSIC_MID, intent="what", must=("出处", "黄", "示意"), must_not=(GENERIC_ZH, "自动开训", "42.0%", "45.0%", "99.9%"), highlight_any=("yellow", "piano", "roll", "music")),
    case("zh-image-first-forward", "图是怎么一步步变吵的", IMAGE_FIRST, intent="how_number", must=("出处",), walk_forbidden=True, must_not=FORWARD_SPOIL + EARLY_SPOIL + (GENERIC_ZH, "自动开训")),
    case("zh-ft-first-rank", "为什么是低秩", FT_FIRST, intent="why", must=("出处",), walk_forbidden=True, must_not=RANK_SPOIL + EARLY_SPOIL + (GENERIC_ZH, "自动开训", "完整平台")),
]



def all_cases() -> list[dict[str, Any]]:
    return deepcopy(CASES)
