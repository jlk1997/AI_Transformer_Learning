# -*- coding: utf-8 -*-
"""Phase 3: teaching-agent intent router and tool loop.

The tutor may retrieve, point, highlight, open a math-walk, and cite live numbers.
Suggested next step is text only. It must never click, train, or switch courses.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from tutor_context import (
    compose_turn,
    contrast_curtain_answer,
    digest_snapshot,
    live_numbers,
    sanitize_snapshot,
    scrub_locked,
    one_idea,
    ground_live_numbers,
)
from tutor_retrieve import is_common_question, is_right_question, retrieve, should_answer_from_corpus

# Tools the tutor is allowed to emit to the frontend.
ALLOWED_TOOLS = ("highlight_ui", "open_math_walk", "suggest_next_step", "cite_live_numbers")

# Names that must never be executed, even if a model invents them.
FORBIDDEN_TOOLS = frozenset(
    {
        "click",
        "click_ui",
        "click_button",
        "press",
        "press_button",
        "auto_click",
        "take_step",
        "push_step",
        "coach_next",
        "fire_click",
        "start_train",
        "train",
        "run_train",
        "auto_train",
        "launch_train",
        "switch_course",
        "set_course",
        "change_course",
        "navigate_course",
        "auto_switch",
    }
)

INTENTS = ("what", "why", "check", "next", "deeper", "how_number", "other")

_INTENT_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    # More specific first.
    (
        "how_number",
        (
            "这个数怎么来",
            "这个数字怎么来",
            "百分比是怎么",
            "这个百分比",
            "怎么算出来",
            "怎么算的",
            "表怎么变",
            "表是怎么变",
            "数是怎么来",
            "从哪来的",
            "how did this number",
            "how is this number",
            "where does this number",
            "where do these numbers",
            "how is the percent",
            "how are the percentages",
            "how was this calculated",
            "table change",
            "how did the table",
            "how the table changed",
            "对照小图怎么变",
            "小图怎么变",
            "排行怎么变",
            "how did the ranking",
            "how the ranking",
            "从哪条向量",
            "哪条向量来",
            "候选怎么变",
            "候选音怎么变",
            "how the candidate",
            "how did the candidate",
            "how did the thumbs",
            "how did the thumbnails",
            "how the thumbnails",
            "thumbnails",
            "contrast thumbs",
            "第几步",
            "现在是第几",
            "现在第几步",
            "刚才那一步",
            "which step",
            "what step is",
        ),
    ),
    (
        "check",
        (
            "我看懂了吗",
            "我看懂了没有",
            "还没看懂",
            "我没看懂",
            "我懂了吗",
            "会了吗",
            "看明白了吗",
            "没有看懂",
            "没看懂",
            "did i get it",
            "do i understand",
            "have i understood",
            "i don't understand",
            "i dont understand",
            "not sure i get",
            "still confused",
        ),
    ),
    (
        "next",
        (
            "下一步怎么做",
            "下一步点哪",
            "下一步该点",
            "接下来怎么做",
            "接下来点哪",
            "然后怎么做",
            "该点什么",
            "点哪个按钮",
            "what should i click",
            "what do i click",
            "what next",
            "what's next",
            "whats next",
            "next step",
            "what should i do next",
        ),
    ),
    (
        "deeper",
        (
            "更深一点",
            "再讲深",
            "再往下讲",
            "再深入",
            "讲深一点",
            "更详细",
            "go deeper",
            "more detail",
            "more deeply",
            "dig deeper",
        ),
    ),
    (
        "why",
        (
            "为什么",
            "为啥",
            "怎么会",
            "为何",
            "why is",
            "why are",
            "why does",
            "why do ",
            "how come",
        ),
    ),
    (
        "what",
        (
            "这是什么",
            "这是啥",
            "这在干嘛",
            "这页是什么",
            "画面现在是在干什么",
            "这个画面现在是在干什么",
            "这个画面是在干什么",
            "画面在干什么",
            "这个画面在干什么",
            "现在是在干什么",
            "在干什么",
            "我刚进来",
            "这个画面",
            "what is this screen",
            "what's this screen",
            "whats this screen",
            "what is the screen doing",
            "what is this page doing",
            "右边是什么",
            "右边表是什么",
            "损失是什么",
            "和这张表",
            "跟这张表",
            "what is this",
            "what's this",
            "whats this",
            "what is the table",
            "what's the table",
            "the table on the right",
            "这个旋钮干什么",
            "旋钮干什么",
            "这个旋钮",
            "what does this knob",
            "what is this knob",
            "what's this knob",
            "whats this knob",
            "what is loss",
            "what's loss",
            "whats loss",
            "梯度是什么",
            "反向传播是什么",
            "反向是什么",
            "这个数怎么让权重",
            "怎么让权重动",
            "权重怎么动",
            "权重动",
            "what is a gradient",
            "what is gradient",
            "what's a gradient",
            "whats a gradient",
            "what is backprop",
            "what is backpropagation",
            "how does this number move",
            "how does the loss move",
            "move a weight",
            "这根线",
            "这条线",
            "这根亮线",
            "换一层",
            "换一个头",
            "能看见什么",
            "what is this line",
            "what's this line",
            "whats this line",
            "what changes if i switch",
            "what happens if i change a layer",
            "what do i see if i change a layer",
            "switch a layer",
            "这是温度吗",
            "是温度吗",
            "听话程度",
            "对照小图",
            "这三张小图",
            "is this temperature",
            "is cfg temperature",
            "what does guidance",
            "what is guidance",
            "what is cfg",
            "what's cfg",
            "是一件事",
            "同一件事",
            "这和文字课",
            "和音乐课",
            "和图片课",
            "和微调课",
            "is this the same",
            "same as the text",
            "same idea as",
            "这块小条",
            "小条是什么",
            "多训一定更好",
            "一定更好吗",
            "这个对照是一次完整",
            "完整训练吗",
            "完整对齐",
            "what is this bar",
            "is more training always",
            "is this a full training",
            "full alignment",
        ),
    ),
]


def classify_intent(question: str) -> str:
    q = (question or "").strip().lower()
    q = q.replace("？", "?").replace("“", '"').replace("”", '"')
    raw = question or ""
    # Specific Phase 3 nests before the generic phrase table.
    try:
        from tutor_retrieve import (
            is_lmhead_question,
            is_cutoff_question,
            is_mask_question,
            is_qkv_mag_question,
            is_ln_question,
            is_pe_question,
            is_ffn_question,
            is_embed_question,
            is_dropout_question,
        )
    except Exception:
        is_lmhead_question = is_cutoff_question = None  # type: ignore
        is_mask_question = is_qkv_mag_question = is_ln_question = None  # type: ignore
        is_pe_question = is_ffn_question = is_embed_question = is_dropout_question = None  # type: ignore
    try:
        from tutor_retrieve import (
            is_forward_question,
            is_lora_rank_question,
            is_dpo_pair_question,
            is_music_yellow_question,
        )
    except Exception:
        is_forward_question = is_lora_rank_question = None  # type: ignore
        is_dpo_pair_question = is_music_yellow_question = None  # type: ignore
    if is_forward_question and is_forward_question(raw):
        if any(k in q or k in raw for k in ("怎么", "how", "step by step", "一步步")):
            return "how_number"
        return "what"
    if is_lora_rank_question and is_lora_rank_question(raw):
        if any(k in q or k in raw for k in ("为什么", "why")):
            return "why"
        return "what"
    if is_dpo_pair_question and is_dpo_pair_question(raw):
        if any(k in q or k in raw for k in ("怎么", "how", "为什么", "why")):
            return "how_number"
        return "what"
    if is_music_yellow_question and is_music_yellow_question(raw):
        return "what"
    if is_mask_question and is_mask_question(raw):
        if any(k in q or k in raw for k in ("为什么", "why", "怎么暗", "how is the upper")):
            return "why"
        return "what"
    if is_qkv_mag_question and is_qkv_mag_question(raw):
        return "what"
    if is_ln_question and is_ln_question(raw):
        return "what"
    if is_pe_question and is_pe_question(raw):
        return "what"
    if is_ffn_question and is_ffn_question(raw):
        return "what"
    if is_embed_question and is_embed_question(raw):
        return "what"
    if is_dropout_question and is_dropout_question(raw):
        return "what"
    if is_lmhead_question and is_lmhead_question(raw):
        if any(k in q or k in raw for k in ("从哪", "怎么来", "哪条向量来", "which vector", "where do those", "how did those percent")):
            return "how_number"
        return "what"
    if is_cutoff_question and is_cutoff_question(raw):
        if any(k in q or k in raw for k in ("是什么", "what is", "what's", "whats")):
            return "what"
        return "how_number"
    for intent, phrases in _INTENT_PATTERNS:
        for p in phrases:
            if p in q:
                return intent
    if is_right_question(question) or is_common_question(question):
        return "what"
    return "other"


def _course(snapshot: dict[str, Any]) -> str:
    return str((snapshot or {}).get("course") or "text")


def _zh(snapshot: dict[str, Any]) -> bool:
    return str((snapshot or {}).get("locale") or "zh-CN") != "en"


def _allowed_walks(snapshot: dict[str, Any]) -> list[str]:
    raw = snapshot.get("allowedMathWalks") or []
    return [str(x) for x in raw] if isinstance(raw, list) else []


def _is_early_first(snapshot: dict[str, Any]) -> bool:
    course = _course(snapshot)
    try:
        idx = int(snapshot.get("stationIndex") or 0)
    except (TypeError, ValueError):
        idx = 0
    st = str(snapshot.get("station") or "")
    if course == "text":
        return (not snapshot.get("generated")) and idx <= 0 and st in {"", "generate"}
    if course == "image":
        step = live_numbers(snapshot).get("imageStep")
        try:
            step_n = int(step) if step is not None else 0
        except (TypeError, ValueError):
            step_n = 0
        return step_n <= 0 and idx <= 0
    return idx <= 0 and not snapshot.get("generated")


def next_control(snapshot: dict[str, Any]) -> dict[str, str]:
    """The control the student should click themselves. Never fired by the tutor."""
    course = _course(snapshot)
    zh = _zh(snapshot)
    if course == "text":
        if _is_early_first(snapshot):
            return {
                "selector": '[data-te-path="generate"], [data-te-task="cluster"]',
                "label": "生成下一个词" if zh else "Generate the next word",
                "region": "任务区" if zh else "the task cluster",
            }
        return {
            "selector": '[data-te-guide="slot"] [data-te-path="coach-next"], [data-te-path="coach-next"]',
            "label": "推进一步" if zh else "Take one step",
            "region": "底部讲解槽" if zh else "the docked guide",
        }
    if course == "image":
        return {
            "selector": '[data-te-image="denoise"], .denoise-button',
            "label": "再去噪一步" if zh else "Denoise one step",
            "region": "任务区" if zh else "the task cluster",
        }
    if course == "music":
        return {
            "selector": '[data-te-music="generate"], [data-te-task="cluster"]',
            "label": "生成下一个音符" if zh else "Generate the next note",
            "region": "任务区" if zh else "the task cluster",
        }
    return {
        "selector": '[data-te-task="cluster"]',
        "label": "推进一步" if zh else "Take one step",
        "region": "任务区" if zh else "the task cluster",
    }


def _wants_temp_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    st = str((snapshot or {}).get("station") or "")
    q = (question or "").lower()
    knobish = any(
        p in q
        for p in (
            "温度",
            "temperature",
            "旋钮",
            "knob",
            "表怎么变",
            "变尖",
            "变平",
            "怎么抽",
            "sampling",
            "how did the table",
            "how the table",
            "surprise",
            "意外程度",
        )
    )
    if "temp" not in _allowed_walks(snapshot):
        return False
    if st == "knobs" and intent in {"what", "how_number", "why", "deeper"}:
        return True
    return knobish


def _wants_residual_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if "residual" not in _allowed_walks(snapshot):
        return False
    st = str((snapshot or {}).get("station") or "")
    q = (question or "").lower()
    residualish = any(
        p in q
        for p in (
            "残差",
            "旁路",
            "加到后面",
            "residual",
            "bypass",
            "为什么要残差",
            "plus sign",
        )
    )
    if st == "residual" and intent in {"what", "how_number", "why", "deeper"}:
        return True
    return residualish


def _wants_attn_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if "attn" not in _allowed_walks(snapshot):
        return False
    st = str((snapshot or {}).get("station") or "")
    q = (question or "").lower()
    attnish = any(
        p in q
        for p in (
            "这根线",
            "这条线",
            "亮线",
            "注意力",
            "换一层",
            "换一个头",
            "层和头",
            "attention",
            "lit line",
            "this line",
            "look back",
            "switch a layer",
            "change a layer",
            "change the head",
        )
    )
    try:
        from tutor_retrieve import is_mask_question, is_qkv_mag_question
    except Exception:
        is_mask_question = is_qkv_mag_question = None  # type: ignore
    if is_mask_question and is_mask_question(question):
        return False
    if is_qkv_mag_question and is_qkv_mag_question(question):
        return False
    if st in {"attention", "layers"} and intent in {"what", "how_number", "why", "deeper"}:
        return True
    return attnish


def _wants_cfg_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if "cfg" not in _allowed_walks(snapshot):
        return False
    st = str((snapshot or {}).get("station") or "")
    q = (question or "").lower()
    cfgish = any(
        p in q
        for p in (
            "听话程度",
            "对照小图",
            "对照图",
            "这三张",
            "引导",
            "cfg",
            "guidance",
            "这是温度吗",
            "是温度吗",
            "is this temperature",
            "is cfg",
            "thumbnail",
        )
    )
    if st == "knobs" and intent in {"what", "how_number", "why", "deeper"}:
        return True
    return cfgish


def _wants_weight_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if _course(snapshot) != "finetune":
        return False
    q = (question or "").strip().lower()
    keys = (
        "梯度", "反向传播", "反向", "权重动", "怎么让权重",
        "gradient", "backprop", "backpropagation", "move a weight",
        "number move", "loss move", "nudg",
    )
    return any(k in q for k in keys)


def _wants_cutoff_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if "cutoff" not in _allowed_walks(snapshot):
        return False
    try:
        from tutor_retrieve import is_cutoff_question
    except Exception:
        is_cutoff_question = None  # type: ignore
    if is_cutoff_question:
        return bool(is_cutoff_question(question))
    q = (question or "").strip().lower()
    keys = (
        "top-k", "top-p", "topk", "topp", "top k", "top p",
        "截断核采样", "核采样", "截断着抽", "候选怎么", "候选集合", "候选音",
        "还能抽哪些", "candidate set", "next-note set", "nucleus",
    )
    return any(k in q for k in keys)


def _wants_lmhead_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if "lmhead" not in _allowed_walks(snapshot):
        return False
    try:
        from tutor_retrieve import is_lmhead_question
    except Exception:
        is_lmhead_question = None  # type: ignore
    if is_lmhead_question:
        return bool(is_lmhead_question(question))
    q = (question or "").strip().lower()
    keys = (
        "输出头", "解嵌入", "哪条向量", "从哪条向量", "输出权重", "隐藏向量",
        "lm_head", "unembedding", "unembed", "output head", "which vector",
    )
    return any(k in q or k in (question or "") for k in keys)



def _wants_mask_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if "mask" not in _allowed_walks(snapshot):
        return False
    try:
        from tutor_retrieve import is_mask_question
    except Exception:
        is_mask_question = None  # type: ignore
    if is_mask_question:
        return bool(is_mask_question(question))
    q = (question or "").strip().lower()
    keys = (
        "右上", "因果掩码", "偷看未来", "看见未来", "causal mask",
        "upper right", "upper-right", "peek into the future", "see the future",
    )
    return any(k in q or k in (question or "") for k in keys)



def _wants_forward_walk(intent: str, question: str, snapshot: dict[str, Any]) -> bool:
    if "forward" not in _allowed_walks(snapshot):
        return False
    try:
        from tutor_retrieve import is_forward_question
    except Exception:
        is_forward_question = None  # type: ignore
    if is_forward_question:
        return bool(is_forward_question(question))
    q = (question or "").strip().lower()
    keys = ("变吵", "get noisier", "forward process", "become noisy")
    return any(k in q or k in (question or "") for k in keys)


def math_walk_for(snapshot: dict[str, Any], question: str = "", intent: str = "") -> Optional[str]:
    allowed = _allowed_walks(snapshot)
    if not allowed:
        return None
    if _wants_cutoff_walk(intent, question, snapshot) and "cutoff" in allowed:
        return "cutoff"
    if _wants_temp_walk(intent, question, snapshot) and "temp" in allowed:
        return "temp"
    if _wants_cfg_walk(intent, question, snapshot) and "cfg" in allowed:
        return "cfg"
    if _wants_residual_walk(intent, question, snapshot) and "residual" in allowed:
        return "residual"
    if _wants_mask_walk(intent, question, snapshot) and "mask" in allowed:
        return "mask"
    if _wants_attn_walk(intent, question, snapshot) and "attn" in allowed:
        return "attn"
    if _wants_weight_walk(intent, question, snapshot) and "weight" in allowed:
        return "weight"
    if _wants_lmhead_walk(intent, question, snapshot) and "lmhead" in allowed:
        return "lmhead"
    if _wants_forward_walk(intent, question, snapshot) and "forward" in allowed:
        return "forward"
    course = _course(snapshot)
    prefer = {"text": "prob", "image": "denoise", "music": "musicProb", "finetune": "loss"}
    want = prefer.get(course)
    if want and want in allowed:
        return want
    return allowed[0]


def _cite(text: str, cite: str, zh: bool) -> str:
    if not cite:
        return text
    if cite in text:
        return text
    prefix = "出处：" if zh else "Source: "
    line = cite if cite.startswith("出处") or cite.lower().startswith("source") else prefix + cite
    return text.rstrip() + "\n\n" + line


def _tool_highlight(selector: str, reason: str = "") -> dict[str, Any]:
    return {"name": "highlight_ui", "selector": selector, "reason": (reason or "")[:200]}


def _tool_walk(card_id: str) -> dict[str, Any]:
    return {"name": "open_math_walk", "cardId": card_id}


def _tool_hint(hint: str) -> dict[str, Any]:
    return {"name": "suggest_next_step", "hint": (hint or "")[:400]}


def plan_tools(intent: str, question: str, snapshot: dict[str, Any], retrieval: dict[str, Any], answer: dict[str, Any]) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    ctrl = next_control(snapshot)
    highlight = answer.get("highlightSel") or ""
    walk = answer.get("mathWalkId")
    if intent == "next":
        tools.append(_tool_highlight(ctrl["selector"], "next control, do not click"))
        tools.append(_tool_hint(answer.get("nextHint") or ctrl["label"]))
        return tools
    if highlight:
        tools.append(_tool_highlight(str(highlight)))
    station_walks = {"temp", "attn", "residual", "cfg", "loss", "weight", "lmhead", "cutoff", "mask", "forward"}
    if intent == "how_number":
        mid = math_walk_for(snapshot, question, intent)
        if walk and str(walk) in _allowed_walks(snapshot) and str(walk) in station_walks:
            if not (mid in {"cutoff", "lmhead"} and str(walk) != mid):
                mid = str(walk)
        elif not mid and walk and str(walk) in _allowed_walks(snapshot):
            mid = str(walk)
        if mid and not _is_early_first(snapshot):
            tools.append(_tool_walk(mid))
    elif walk and not _is_early_first(snapshot) and str(walk) in _allowed_walks(snapshot) and (
        intent in {"deeper", "why"} or (intent == "what" and str(walk) in station_walks)
    ):
        tools.append(_tool_walk(str(walk)))
    if answer.get("nextHint") and intent in {"deeper", "what", "why"}:
        tools.append(_tool_hint(str(answer["nextHint"])))
    return tools


def sanitize_agent_tools(tools: list[dict[str, Any]], snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    """Drop anything that would operate the product."""
    out: list[dict[str, Any]] = []
    allowed_walks = _allowed_walks(snapshot)
    early = _is_early_first(snapshot)
    for t in tools or []:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or "").strip()
        if name in FORBIDDEN_TOOLS or name not in ALLOWED_TOOLS:
            continue
        if name == "highlight_ui":
            sel = str(t.get("selector") or "").strip()
            if not sel or len(sel) > 240:
                continue
            if sel in {"body", "html", "#app", "#landing", "main", "#main"}:
                continue
            out.append({"name": "highlight_ui", "selector": sel, "reason": str(t.get("reason") or "")[:200]})
        elif name == "open_math_walk":
            if early:
                continue
            card_id = str(t.get("cardId") or "").strip()
            if card_id not in {"prob", "attn", "residual", "denoise", "cfg", "musicProb", "loss", "temp", "weight", "lmhead", "cutoff", "mask", "forward"}:
                continue
            if allowed_walks and card_id not in allowed_walks:
                continue
            out.append({"name": "open_math_walk", "cardId": card_id})
        elif name == "suggest_next_step":
            hint = str(t.get("hint") or "").strip()[:400]
            if hint:
                out.append({"name": "suggest_next_step", "hint": hint})
        elif name == "cite_live_numbers":
            # Internal only; numbers are already in the answer text.
            continue
    return out


def _answer_next(snapshot: dict[str, Any]) -> dict[str, Any]:
    zh = _zh(snapshot)
    ctrl = next_control(snapshot)
    course = _course(snapshot)
    if zh:
        ban = "我只会指给你看，不会替你点，也不会自动开训或换课。"
        if course == "finetune":
            body = f"下一步请你自己点{ctrl['region']}的「{ctrl['label']}」。它只讲解，不会开训。{ban}"
        else:
            body = f"下一步请你自己点{ctrl['region']}的「{ctrl['label']}」。看它在画面上引起的变化。{ban}"
        cite = f"出处：{ctrl['region']}的「{ctrl['label']}」。"
        hint = f"请你点「{ctrl['label']}」。我不会替你点。"
    else:
        ban = "I will only point at it. I will not click it, start training, or switch courses for you."
        if course == "finetune":
            body = f"Next, click “{ctrl['label']}” in {ctrl['region']} yourself. It only teaches; it does not start a train. {ban}"
        else:
            body = f"Next, click “{ctrl['label']}” in {ctrl['region']} yourself, then watch what changes on the screen. {ban}"
        cite = f"Source: “{ctrl['label']}” in {ctrl['region']}."
        hint = f"Please click “{ctrl['label']}” yourself. I will not click it."
    return {
        "id": "agent-next",
        "text": _cite(body, cite, zh),
        "highlightSel": ctrl["selector"],
        "mathWalkId": None,
        "nextHint": hint,
        "cite": cite,
        "source": "corpus",
        "ids": ["agent-next"],
        "kind": "ui",
    }


def _answer_check(question: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    zh = _zh(snapshot)
    nums = live_numbers(snapshot)
    course = _course(snapshot)
    confused = any(p in (question or "") for p in ("还没看懂", "没看懂", "没有看懂", "don't understand", "dont understand", "still confused"))
    top = (nums.get("tops") or [{}])
    tok = (top[0].get("token") if top and isinstance(top[0], dict) else "") or ""
    pct = top[0].get("percent") if top and isinstance(top[0], dict) else None
    line = nums.get("topLine") or ""
    if course in {"text", "music"} and line:
        if zh:
            body = (
                f"还没对上也没关系，先只核对右边这一行：{line}。对得上，这一处就看懂了；对不上，就只盯这一行，先别跳到公式。"
                if confused
                else f"先核对眼前这一处：右边现在最靠前的是{line}。如果和你看见的一样，这一处就看懂了。一次只核对这一行。"
            )
        else:
            body = (
                f"That is fine. Check only this row on the right: {line}. If it matches, you have this part."
                if confused
                else f"Check this one thing: the leading rows on the right are {line}. If that matches what you see, you have this part."
            )
        highlight = '[data-te-zone="right"], .music-probs'
        cite = "出处：右边正在显示的数。" if zh else "Source: the live numbers on the right."
    elif course == "image":
        step = nums.get("imageStep")
        body = (
            (f"先只看中间画布现在是第 {step} 步。看清有没有更清楚一点点，就算看懂这一步。" if zh else f"Look only at the canvas: it is on step {step}. If you can see whether it got a little clearer, you have this step.")
            if step is not None
            else ("先只看中间画布有没有变化。" if zh else "Look only at whether the middle canvas changed.")
        )
        highlight = '[data-te-image="canvas"], [data-te-image="step"]'
        cite = "出处：中间画布和步数。" if zh else "Source: the canvas and its step."
    else:
        n = nums.get("ftTokenCount")
        body = (
            (f"先核对数据台或对照板旁的分词预览：现在是 {n} 个词片。能对上这一处就够了。" if zh else f"Check the tokenize preview: it now shows {n} pieces. Matching that is enough.")
            if n is not None
            else ("先看对照板上「改的是权重」这一条，不必先跳到开训。" if zh else "First see the comparison board: this course changes weights. Do not jump to training.")
        )
        highlight = '[data-te-ft="tokenize"], [data-te-ft="first-line"]'
        cite = "出处：对照板和分词预览。" if zh else "Source: the comparison board and tokenize preview."
    return {
        "id": "agent-check",
        "text": _cite(body, cite, zh),
        "highlightSel": highlight,
        "mathWalkId": None,
        "nextHint": None,
        "cite": cite,
        "source": "corpus",
        "ids": ["agent-check"],
        "kind": "ui",
    }


def _answer_how_number(question: str, snapshot: dict[str, Any], retrieval: dict[str, Any]) -> dict[str, Any]:
    zh = _zh(snapshot)
    nums = live_numbers(snapshot)
    line = nums.get("topLine") or ""
    walk = math_walk_for(snapshot, question, "how_number")
    early = _is_early_first(snapshot)
    course = _course(snapshot)
    if course == "image":
        step = nums.get("imageStep")
        if early or not walk:
            body = (
                f"中间画布现在是第 {step} 步。这一关先看画面变了没有；走完一步后，推演卡才会用这一步的数把去噪算给你看。"
                if zh
                else f"The canvas is on step {step}. See whether it changed first; the worked example uses this step’s numbers after you have taken a denoise step."
            )
            cite = "出处：中间画布的当前步数。" if zh else "Source: the current step on the canvas."
            highlight = '[data-te-image="step"], [data-te-image="canvas"]'
            walk_id = None
        elif walk == "cfg":
            if zh:
                body = (
                    "先看右边 1 / 7 / 15 三张对照小图，再看任务区里的听话程度旋钮。"
                    "同一提示词、同一种子，听话程度不同：1 更淡更泛，7 通常更贴题，15 可能过饱和。"
                    "这个旋钮的名字叫听话程度，也叫 CFG。它不是文字课里的温度：温度改的是抽词时表的尖或平，这里改的是有多听提示词。"
                    "画布仍是预先设计的示例轨迹，不是浏览器里跑的大模型。下面的推演会先让你看对照，再起名字。"
                )
            else:
                body = (
                    "First look at the 1 / 7 / 15 contrast thumbnails on the right, then at the guidance knob in the task cluster. "
                    "They share the same prompt and seed, with different guidance: 1 is flatter and vaguer, 7 usually follows the prompt, 15 can oversaturate. "
                    "The knob is called guidance, or CFG. It is not temperature from the text course: temperature sharpens or flattens a sampling table; this knob changes how closely the picture follows the prompt. "
                    "The canvas is still a pre-designed example trajectory, not a live large model in the browser. The walk lets you see the contrast first, then names the knob."
                )
            cite = "出处：右边 1 / 7 / 15 对照小图，以及任务区的听话程度旋钮。" if zh else "Source: the 1 / 7 / 15 contrast thumbnails on the right, and the guidance knob in the task cluster."
            highlight = '.cfg-compare, [data-te-image="cfg"], [data-te-image="knobs"], [data-te-task="cluster"]'
            walk_id = "cfg"
        elif walk == "forward":
            base = compose_turn(question, snapshot, None, retrieval) or {}
            if (base.get("text") or "").strip():
                base["mathWalkId"] = "forward"
                if not base.get("highlightSel"):
                    base["highlightSel"] = '[data-te-image="forward"], [data-te-image="canvas"], [data-te-image="step"]'
                return base
            body = (
                f"现在画布是第 {step} 步。先看中间已经走过的几步，再把同一条预先设计的示例轨迹反过来看：往第 0 步走，图一步步变吵。这是示意，不是浏览器里跑的大模型。"
                if zh
                else f"The canvas is on step {step}. First look at the steps already taken, then read the same pre-designed example trajectory the other way: toward step 0 the picture gets noisier. This is a sketch, not a live large model in the browser."
            )
            cite = "出处：中间画布的时间轴，以及「反过来看」的示意小图。" if zh else "Source: the canvas timeline and the ‘other way’ sketch thumbnails."
            highlight = '[data-te-image="forward"], [data-te-image="canvas"], [data-te-image="step"]'
            walk_id = "forward"
        else:
            body = (
                f"现在画布是第 {step} 步。推演卡会用眼前这一步的变化，把「再去噪一步」怎么走讲清楚。先看卡，不必先背公式名字。"
                if zh
                else f"The canvas is on step {step}. The worked example uses this step. Watch the card first; the formula name can wait."
            )
            cite = "出处：中间画布，以及去噪推演卡。" if zh else "Source: the canvas and the denoise walk."
            highlight = '[data-te-image="canvas"], [data-te-math="dock"]'
            walk_id = walk
    elif course == "finetune":
        n = nums.get("ftTokenCount")
        extra = f"预览里现在是 {n} 个词片。" if n is not None and zh else (f"The preview now shows {n} tokens." if n is not None else "")
        try:
            from tutor_retrieve import is_dpo_pair_question
        except Exception:
            is_dpo_pair_question = None  # type: ignore
        if is_dpo_pair_question and is_dpo_pair_question(question):
            base = compose_turn(question, snapshot, None, retrieval) or {}
            if (base.get("text") or "").strip():
                return base
        if walk == "weight":
            body = (
                f"{extra}先看示意表：「后」只有 4%，账大约 3.2，偏高。所以表下面那条通向「后」的示意权重被轻轻推高了一点。先看见这一推；方向和大小后来叫梯度，把账往回传叫反向传播。这是示意，不是实时训练平均，也不会在这里开训。".strip()
                if zh
                else f"{extra} First look at the sketch table: “后” has only 4%, and the tally is about 3.2 — too high. So the sketch weight toward “后” under the table is nudged up a little. See that move first; the direction and size is later called the gradient, and sending the tally back is backpropagation. This is a sketch, not a live average, and it does not start a train.".strip()
            )
            cite = "出处：损失示意表，以及表下「一条权重被推了一下」的短条。" if zh else "Source: the loss sketch table and the weight-nudge bar under it."
            highlight = '[data-te-ft="weight-move"], [data-te-math="weight-walk"], [data-te-bridge="loss-table"]'
            walk_id = "weight"
        elif walk:
            body = (
                f"{extra}画面上这张示意表里，正确的下一个字「后」只有 4%，也就是 1/25。把这个偏低的数写成越大越糟的账，大约是 3.2。这些都是示意，不是刚才那次训练的实时平均。先看表，再看表下面的推演。".strip()
                if zh
                else f"{extra} On the sketch table, the true next character has only 4%, which is 1/25. Written as a larger-when-worse tally, that is about 3.2. These are a sketch, not the live average of the run you just did. See the table first, then the walk under it.".strip()
            )
            cite = "出处：损失示意表，以及表下的推演。" if zh else "Source: the loss sketch table and the walk under it."
            highlight = '[data-te-bridge="loss-table"], [data-te-math="loss-walk"], [data-te-ft="loss"]'
            walk_id = walk
        else:
            body = (f"{extra}现在还不到打开损失推演的时候。先看对照板和分词预览上的数。".strip() if zh else f"{extra} The loss walk is not open yet. See the board and the tokenize preview first.".strip())
            cite = "出处：对照板和分词预览。" if zh else "Source: the board and tokenize preview."
            highlight = '[data-te-ft="tokenize"], [data-te-ft="first-line"]'
            walk_id = None
    else:
        # text / music
        live = f"眼下最靠前的是{line}。" if (zh and line) else (f"The leading rows are {line}." if line else "")
        if early or not walk:
            if zh:
                body = f"{live}这些百分比已经在右边表上。这一关先把表看清楚；你自己点过「生成下一个{'词' if course=='text' else '音符'}」之后，推演卡才会用表上的数一步步算给你看。我不会编一套不在画面上的数。".strip()
            else:
                body = f"{live} Those percentages are already on the right. Read the table first; after you generate the next item, the worked example will use these numbers. I will not invent figures that are not on screen.".strip()
            cite = "出处：右侧正在显示的概率。" if zh else "Source: the live probabilities on the right."
            highlight = '[data-te-zone="right"], .music-probs'
            walk_id = None
        elif walk in {"lmhead", "cutoff", "mask", "forward"}:
            base = compose_turn(question, snapshot, None, retrieval) or {}
            if (base.get("text") or "").strip():
                base["mathWalkId"] = walk
                if not base.get("highlightSel"):
                    if walk == "cutoff" and course == "music":
                        base["highlightSel"] = '[data-te-music="knobs-panel"], [data-te-music="knobs"], .music-probs, [data-te-zone="right"]'
                    elif walk == "cutoff":
                        base["highlightSel"] = '[data-te-sampling="panel"], [data-te-sampling="show"], [data-te-zone="right"], .sampling-input'
                    else:
                        base["highlightSel"] = '[data-te-zone="right"], [data-te-math="dock"]'
                return base
            if walk == "lmhead":
                if zh:
                    body = (
                        f"{live}这些百分比不是凭空出现的。最后一条隐藏向量和每个词的输出权重做点积，得到每个词的分数，再变成这张表。"
                        "整张词表矩阵太大，不会画出来，我也不编假矩阵。这最后一层的名字叫输出头（也叫解嵌入；英文常写成 unembedding 或 lm_head）。"
                    ).strip()
                else:
                    body = (
                        f"{live} Those percentages do not appear out of thin air. The last hidden vector is dotted with an output-weight row per word, giving each row a score that becomes this table. "
                        "The full vocabulary matrix is too large to draw, and no fake matrix is invented. That last layer is called the output head (also unembedding, or lm_head)."
                    ).strip()
                cite = "出处：右侧概率表，以及「这些百分比从哪条向量来」推演。" if zh else "Source: the right-hand table and the output-head walk."
                highlight = '[data-te-zone="right"], [data-te-math="dock"]'
            else:
                if zh:
                    draw = "抽音" if course == "music" else "抽词"
                    body = (
                        f"{live}先看右边表里还能抽的行变少还是变多。留下最高的 k 行叫 Top-k，按百分比加到 p 叫 Top-p。"
                        f"它们只改怎么{draw}，不改分数从哪来。"
                    ).strip()
                else:
                    body = (
                        f"{live} First watch the drawable set on the right shrink or grow. Keeping the highest k rows is Top-k; adding percentages down to p is Top-p. "
                        "They only change how the next item is drawn, not where the scores come from."
                    ).strip()
                cite = "出处：任务区旋钮和右侧表上的候选集合。" if zh else "Source: the task-cluster knobs and the candidate set on the right."
                highlight = (
                    '[data-te-music="knobs-panel"], [data-te-music="knobs"], .music-probs, [data-te-zone="right"]'
                    if course == "music"
                    else '[data-te-sampling="panel"], [data-te-sampling="show"], [data-te-zone="right"], .sampling-input'
                )
            return {
                "id": "agent-how-number",
                "text": _cite(body, cite, zh),
                "highlightSel": highlight,
                "mathWalkId": walk,
                "nextHint": None,
                "cite": cite,
                "source": "corpus",
                "ids": ["agent-how-number"],
                "kind": "math",
            }
        elif walk == "temp":
            knob_zh = "抽音旋钮" if course == "music" else "抽词旋钮"
            knob_en = "music knobs" if course == "music" else "sampling knobs"
            table_zh = "音高排行" if course == "music" else "概率表"
            table_en = "ranking" if course == "music" else "table"
            if zh:
                body = (
                    f"{live}先看右边这张已经算好的表：拧任务区里的{knob_zh}时，条形会变尖或变平。"
                    "这些旋钮只改怎么从表里抽，不改分数从哪来。那个让表变尖或变平的旋钮，名字叫温度。"
                    "温度更低时更常抽到第一名，但第一名仍然不是保证。下面的推演会先让你看表，再起名字。"
                ).strip()
            else:
                body = (
                    f"{live} First watch the already-computed table on the right: the bars sharpen or flatten when you turn the task-cluster {knob_en}. "
                    "The knobs only change how a row is drawn from the table, not where the scores come from. "
                    "The knob that sharpens or flattens the table is called temperature. A lower temperature more often draws first place, but first place is not a guarantee. "
                    "The walk shows the table first, then names the knob."
                ).strip()
            cite = (
                f"出处：任务区{knob_zh}、右侧{table_zh}，以及「表怎么变尖、变平」推演。"
                if zh
                else f"Source: the task-cluster {knob_en}, the right-hand {table_en}, and the sharpen-or-flatten walk."
            )
            highlight = '[data-te-sampling="panel"], [data-te-sampling="show"], [data-te-zone="right"]' if course == "text" else '[data-te-music="knobs-panel"], [data-te-music="knobs"], .music-probs, [data-te-zone="right"]'
            walk_id = "temp"
        else:
            if zh:
                body = f"{live}推演卡会用你屏幕上这些百分比，把「分数怎么变成机会」走一遍。先看表和卡，最后才记公式名字。".strip()
            else:
                body = f"{live} The worked example uses the percentages on your screen to show how scores become chances. See the table and the card first.".strip()
            cite = "出处：右侧概率表，以及当前推演卡。" if zh else "Source: the right-hand table and the current math walk."
            highlight = '[data-te-zone="right"], [data-te-math="dock"]'
            walk_id = walk
    return {
        "id": "agent-how-number",
        "text": _cite(body, cite, zh),
        "highlightSel": highlight,
        "mathWalkId": walk_id,
        "nextHint": None,
        "cite": cite,
        "source": "corpus",
        "ids": ["agent-how-number"],
        "kind": "math" if walk_id else "ui",
    }


def _answer_why(question: str, snapshot: dict[str, Any], retrieval: dict[str, Any]) -> dict[str, Any]:
    # Start from retrieved evidence, then keep it at "see the phenomenon".
    base = compose_turn(question, snapshot, None, retrieval)
    zh = _zh(snapshot)
    nums = live_numbers(snapshot)
    line = nums.get("topLine") or ""
    if base and base.get("text") and not (is_common_question(question) and "你现在在" in (base.get("text") or "")[:20]):
        text = base["text"]
        if line and "右边" in (question or "") or "数" in (question or "") or "percent" in (question or "").lower():
            text = ground_live_numbers(text, snapshot)
        return base
    if zh:
        body = "先看眼前正在发生的事，再给它起名字。"
        if line:
            body += f"右边现在最靠前的是{line}。这些百分比是这一步的机会，所以表会排成这样。"
        cite = "出处：当前画面上你能直接看见的那一块。"
    else:
        body = "See what is happening on the screen first, then name it."
        if line:
            body += f" The leading rows on the right are {line}. Those percentages are the chances for this step, which is why the table is ordered this way."
        cite = "Source: the region you can see on the current screen."
    highlight = (base or {}).get("highlightSel") or '[data-te-zone="right"], [data-te-task="cluster"]'
    return {
        "id": (base or {}).get("id") or "agent-why",
        "text": _cite(body, cite, zh),
        "highlightSel": highlight,
        "mathWalkId": None,
        "nextHint": (base or {}).get("nextHint"),
        "cite": cite,
        "source": "corpus",
        "ids": (base or {}).get("ids") or ["agent-why"],
        "kind": "teach",
    }


def _answer_deeper(question: str, snapshot: dict[str, Any], retrieval: dict[str, Any]) -> dict[str, Any]:
    base = compose_turn(question, snapshot, None, retrieval) or {}
    walk = math_walk_for(snapshot)
    zh = _zh(snapshot)
    nums = live_numbers(snapshot)
    line = nums.get("topLine") or ""
    if _is_early_first(snapshot) or not walk:
        if zh:
            body = "可以再往下看一处，但仍只看眼前。先把这一屏最要紧的一块看清；公式名字和后面的旋钮先放下。"
            if line:
                body += f"右边现在是{line}。"
            cite = "出处：当前画面上已经能看见的部分。"
        else:
            body = "We can go one step deeper, but still only with what is on this screen. See the main region first; formula names and later knobs can wait."
            if line:
                body += f" The right side now shows {line}."
            cite = "Source: what is already visible on this screen."
        text = _cite(body, cite, zh)
        if base.get("text") and "出处" in (base.get("text") or ""):
            # Prefer retrieved mid card if it is not a first-screen re-lecture.
            if "你现在在" not in (base.get("text") or "")[:10]:
                text = base["text"]
        return {
            "id": base.get("id") or "agent-deeper",
            "text": text,
            "highlightSel": base.get("highlightSel") or '[data-te-zone="right"], [data-te-task="cluster"]',
            "mathWalkId": None,
            "nextHint": base.get("nextHint"),
            "cite": base.get("cite") or cite,
            "source": "corpus",
            "ids": base.get("ids") or ["agent-deeper"],
            "kind": "teach",
        }
    # Walk is allowed: offer it, one idea, with live numbers.
    if zh:
        body = "更深一点先打开眼前的推演卡，用屏幕上的数走一步。一次只看这一张卡。"
        if line:
            body += f"卡要用的数就是现在表上的：{line}。"
        cite = "出处：当前推演卡，以及画面上的数。"
    else:
        body = "Go deeper by opening the worked example that uses the numbers on your screen. One card at a time."
        if line:
            body += f" The numbers it will use are {line}."
        cite = "Source: the current math walk and the numbers on screen."
    return {
        "id": base.get("id") or "agent-deeper",
        "text": _cite(body, cite, zh),
        "highlightSel": base.get("highlightSel") or '[data-te-math="dock"]',
        "mathWalkId": walk,
        "nextHint": base.get("nextHint"),
        "cite": cite,
        "source": "corpus",
        "ids": base.get("ids") or ["agent-deeper"],
        "kind": "math",
    }


def run_agent(
    question: str,
    snapshot: Optional[dict[str, Any]] = None,
    target: Optional[dict[str, Any]] = None,
    retrieval: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    snapshot = sanitize_snapshot(snapshot if isinstance(snapshot, dict) else {})
    curtain = contrast_curtain_answer(question, snapshot)
    if curtain:
        tools = sanitize_agent_tools(
            [_tool_highlight(str(curtain.get("highlightSel") or '[data-te-contrast="start"]'))],
            snapshot,
        )
        return {
            "intent": "what",
            "handled": True,
            "answer": curtain,
            "tools": tools,
            "retrieval": {"cards": [curtain], "strength": "high"},
            "digest": digest_snapshot(snapshot)["text"],
            "source": "corpus",
        }
    intent = classify_intent(question)
    retrieval = retrieval or retrieve(question, snapshot, target)
    if intent == "next":
        ans = _answer_next(snapshot)
        handled = True
    elif intent == "check":
        ans = _answer_check(question, snapshot)
        handled = True
    elif intent == "how_number":
        ans = _answer_how_number(question, snapshot, retrieval)
        handled = True
    elif intent == "why":
        ans = _answer_why(question, snapshot, retrieval)
        handled = True
    elif intent == "deeper":
        ans = _answer_deeper(question, snapshot, retrieval)
        handled = True
    else:
        # what / other: Phase 1–2 corpus path, with memory and live numbers.
        ans = compose_turn(question, snapshot, target, retrieval) or {}
        handled = bool(ans) and (
            intent == "what" or is_common_question(question) or should_answer_from_corpus(question, retrieval)
        )

    text = (ans or {}).get("text") or ""
    text = ground_live_numbers(text, snapshot)
    text = scrub_locked(text, snapshot)
    text = one_idea(text)
    if ans:
        ans["text"] = text

    tools = plan_tools(intent, question, snapshot, retrieval, ans or {})
    tools = sanitize_agent_tools(tools, snapshot)

    return {
        "intent": intent,
        "handled": bool(handled and ans and ans.get("text")),
        "answer": ans,
        "tools": tools,
        "retrieval": retrieval,
        "digest": digest_snapshot(snapshot)["text"],
        "source": (ans or {}).get("source") or "corpus",
    }


def tools_are_safe(tools: list[dict[str, Any]]) -> bool:
    for t in tools or []:
        name = str((t or {}).get("name") or "")
        if name in FORBIDDEN_TOOLS or name not in ALLOWED_TOOLS:
            return False
        if name == "suggest_next_step":
            # Hint may name the button; it must not be an action payload.
            if (t or {}).get("click") or (t or {}).get("auto"):
                return False
    return True
