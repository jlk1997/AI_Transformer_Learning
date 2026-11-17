# -*- coding: utf-8 -*-
"""Local lexical retrieval for the teaching tutor.

Chinese-capable BM25 over a curated course corpus. Filter first by course
and station / unlocked concepts, then rank. No embeddings, no cloud index,
no hub download.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

CORPUS_DIR = Path(__file__).resolve().parent / "tutor-corpus"
LEGACY_CARDS = Path(__file__).resolve().parent / "tutor-kb" / "cards.json"

# Very frequent function words; keep content characters (包括「词」「音」「图」).
_STOP = {
    "的", "了", "是", "在", "和", "与", "或", "吗", "呢", "啊", "把", "被", "也", "都",
    "就", "还", "又", "很", "到", "对", "从", "为", "以", "而", "及", "等", "这个", "那个",
    "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "it", "this",
    "that", "be", "as", "at", "by", "with",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[-'][a-z0-9]+)?", re.I)
_CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
_WS_RE = re.compile(r"\s+")

# Later-lab spoilers that must not leak into early text/image/music (or early finetune).
_LATER_TAGS = {"lora", "qlora", "dpo", "industrial"}
_GRAD_TAGS = {"gradient", "backprop"}
_GRAD_Q = (
    "梯度", "反向传播", "反向传播是", "权重动", "怎么让权重", "这个数怎么让",
    "gradient", "backprop", "backpropagation", "move a weight",
    "number move", "loss move", "nudg",
)


def is_grad_question(question: str) -> bool:
    q = (question or "").strip().lower()
    return any(k.lower() in q or k in (question or "") for k in _GRAD_Q)


_LMHEAD_TAGS = {"lmhead", "unembed", "output_head"}
_LMHEAD_Q = (
    "输出头", "解嵌入", "哪条向量", "从哪条向量", "输出权重", "最后一条向量",
    "隐藏向量", "lm_head", "unembedding", "unembed", "output head",
    "output-head", "which vector",
)
_CUTOFF_TAGS = {"cutoff"}
_CUTOFF_Q = (
    "top-k", "top-p", "topk", "topp", "top k", "top p",
    "截断核采样", "核采样", "截断着抽", "候选怎么", "候选集合", "候选音",
    "变少了", "变多了", "还能抽哪些", "留下几个", "candidate set",
    "next-note set", "nucleus",
)


def is_lmhead_question(question: str) -> bool:
    q = (question or "").strip().lower()
    raw = question or ""
    return any(k.lower() in q or k in raw for k in _LMHEAD_Q)


def is_cutoff_question(question: str) -> bool:
    q = (question or "").strip().lower()
    raw = question or ""
    return any(k.lower() in q or k in raw for k in _CUTOFF_Q)

_QKV_MAG_Q = (
    "我点开了放大镜", "点开了放大镜", "放大镜，这是什么", "放大镜是什么", "这个放大镜",
    "magnifier", "opened the magnifier", "open the magnifier",
)
_MASK_Q = (
    "右上为什么是暗的", "右上是暗的", "不能偷看未来", "能看见未来吗", "看见未来",
    "因果掩码是什么", "因果掩码", "causal mask", "peek into the future",
    "look at the future", "see the future", "why is the upper right",
    "upper-right", "upper right is dark", "upper right dark",
)
_LN_Q = (
    "层归一化是什么", "层归一化", "layernorm", "layer normalization", "layer norm",
    "ln 是什么", "ln是什么",
)
_PE_Q = (
    "位置编码是什么", "位置编码", "positional encoding", "positional embedding",
    "position embedding", "rope",
)
_FFN_Q = (
    "前馈是什么", "前馈网络", "前馈", "mlp 是什么", "mlp是什么",
    "feedforward", "feed-forward", "the mlp", "what is the mlp", "what is mlp",
)
_EMBED_Q = (
    "嵌入是什么", "词元嵌入", "embedding 是什么", "what is embedding", "token embedding",
)
_DROPOUT_Q = (
    "dropout 是什么", "dropout是什么", "what is dropout",
)
_PART_DOC_IDS = {
    "text-qkv-mag": "qkv_mag",
    "text-mask-see": "mask",
    "text-mask-early": "mask",
    "text-ln-what": "ln",
    "text-ln-early": "ln",
    "text-pe-what": "pe",
    "text-pe-early": "pe",
    "text-ffn-what": "ffn",
    "text-embed-what": "embed",
    "text-embed-early": "embed",
    "text-dropout-what": "dropout",
}


def _has_any(question: str, keys: tuple[str, ...]) -> bool:
    q = (question or "").strip().lower()
    raw = question or ""
    return any(k.lower() in q or k in raw for k in keys)


def is_qkv_mag_question(question: str) -> bool:
    return _has_any(question, _QKV_MAG_Q)


def is_mask_question(question: str) -> bool:
    return _has_any(question, _MASK_Q)


def is_ln_question(question: str) -> bool:
    return _has_any(question, _LN_Q)


def is_pe_question(question: str) -> bool:
    return _has_any(question, _PE_Q)


def is_ffn_question(question: str) -> bool:
    return _has_any(question, _FFN_Q)


def is_embed_question(question: str) -> bool:
    return _has_any(question, _EMBED_Q)


def is_dropout_question(question: str) -> bool:
    return _has_any(question, _DROPOUT_Q)


def part_kind_for_question(question: str) -> str | None:
    if is_qkv_mag_question(question):
        return "qkv_mag"
    if is_mask_question(question):
        return "mask"
    if is_ln_question(question):
        return "ln"
    if is_pe_question(question):
        return "pe"
    if is_ffn_question(question):
        return "ffn"
    if is_embed_question(question):
        return "embed"
    if is_dropout_question(question):
        return "dropout"
    return None


def _live(snapshot: dict[str, Any]) -> dict[str, Any]:
    live = (snapshot or {}).get("live")
    return live if isinstance(live, dict) else {}


def textbook_page_open(snapshot: dict[str, Any]) -> str:
    live = _live(snapshot)
    if not (live.get("textbookOpen") or live.get("textbookPage") or (snapshot or {}).get("textbookOpen")):
        # page id alone is enough when the library is open
        page = str(live.get("textbookPage") or (snapshot or {}).get("textbookPage") or "")
        if live.get("textbookOpen") or (snapshot or {}).get("textbookOpen"):
            return page
        return page if page else ""
    return str(live.get("textbookPage") or (snapshot or {}).get("textbookPage") or "")


def popover_open(snapshot: dict[str, Any]) -> str:
    live = _live(snapshot)
    return str(live.get("popover") or (snapshot or {}).get("popover") or "")


def is_attention_or_later(snapshot: dict[str, Any]) -> bool:
    if _course(snapshot) != "text":
        return False
    if _is_first_screen(snapshot):
        return False
    try:
        idx = int((snapshot or {}).get("stationIndex") or 0)
    except (TypeError, ValueError):
        idx = 0
    st = _station(snapshot)
    unlocked = _unlocked(snapshot)
    if unlocked.get("textPathDone") or (snapshot or {}).get("textPathDone"):
        return True
    return idx >= 2 or st in {"attention", "layers", "residual", "knobs", "invite"}


def is_residual_or_later(snapshot: dict[str, Any]) -> bool:
    if _course(snapshot) != "text":
        return False
    try:
        idx = int((snapshot or {}).get("stationIndex") or 0)
    except (TypeError, ValueError):
        idx = 0
    st = _station(snapshot)
    unlocked = _unlocked(snapshot)
    if unlocked.get("textPathDone") or (snapshot or {}).get("textPathDone"):
        return True
    return idx >= 4 or st in {"residual", "knobs", "invite"}





_FORWARD_Q = (
    "图是怎么一步步变吵的", "一步步变吵", "怎么变吵", "变吵的", "变吵",
    "正向加噪", "get noisier", "gets noisier", "become noisy", "becoming noisier",
    "forward process", "add noise step by step",
)
_LORA_RANK_Q = (
    "为什么是低秩", "低秩是什么", "低秩", "r=4", "r=16", "秩是什么",
    "为什么这么小", "能省多少", "why is this low-rank", "why is it low-rank",
    "low-rank", "low rank", "rank 4", "rank 16",
)
_DPO_PAIR_Q = (
    "这一对偏好分数", "偏好分数怎么变", "偏好分数", "更喜欢的那句是怎么被抬高的",
    "怎么被抬高", "偏好边际", "这一对的数", "preferred margin",
    "preferred reply", "how the preferred",
)
_MUSIC_YELLOW_Q = (
    "黄边是什么", "黄框是什么", "黄边", "黄框", "主题回看",
    "gold outline", "yellow border", "yellow outline",
)
_P5_DOC_IDS = {
    "image-forward-see": "forward",
    "image-forward-early": "forward",
    "ft-lora-rank": "lora_rank",
    "ft-lora-rank-early": "lora_rank",
    "ft-dpo-pair": "dpo_pair",
    "ft-dpo-pair-early": "dpo_pair",
    "music-yellow-see": "music_yellow",
}


def _has_any_p5(question: str, keys: tuple[str, ...]) -> bool:
    q = (question or "").strip().lower()
    raw = question or ""
    return any(k.lower() in q or k in raw for k in keys)


def is_forward_question(question: str) -> bool:
    return _has_any_p5(question, _FORWARD_Q)


def is_lora_rank_question(question: str) -> bool:
    return _has_any_p5(question, _LORA_RANK_Q)


def is_dpo_pair_question(question: str) -> bool:
    return _has_any_p5(question, _DPO_PAIR_Q)


def is_music_yellow_question(question: str) -> bool:
    return _has_any_p5(question, _MUSIC_YELLOW_Q)


def p5_kind_for_question(question: str) -> str | None:
    if is_forward_question(question):
        return "forward"
    if is_lora_rank_question(question):
        return "lora_rank"
    if is_dpo_pair_question(question):
        return "dpo_pair"
    if is_music_yellow_question(question):
        return "music_yellow"
    return None


def _image_step(snapshot: dict[str, Any]) -> int:
    live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
    raw = (live or {}).get("imageStep", snapshot.get("imageStep", 0))
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def is_tokens_or_later(snapshot: dict[str, Any]) -> bool:
    """Text course: the probability table has already been seen (tokens or later)."""
    if _course(snapshot) != "text":
        return False
    if _is_first_screen(snapshot):
        return False
    try:
        idx = int((snapshot or {}).get("stationIndex") or 0)
    except (TypeError, ValueError):
        idx = 0
    st = _station(snapshot)
    unlocked = _unlocked(snapshot)
    if unlocked.get("textPathDone") or (snapshot or {}).get("textPathDone") or (snapshot or {}).get("generated"):
        if st not in {"", "generate"} or idx >= 1:
            return True
    return idx >= 1 or st in {"tokens", "attention", "layers", "residual", "knobs", "invite"}
_KNOB_TAGS = {"sampling", "imageKnobs", "musicKnobs", "cfg"}
_TEXTBOOK_RE = re.compile(
    r"教材|教科书|textbook|20\s*步|22\s*步|18\s*步|16\s*步|图书馆|书库|打开书|"
    r"书在哪|书在哪儿|书呢|where(?:'s| is) the (?:book|textbook|library)|"
    r"where is (?:the )?(?:book|textbook|library)"
)

_COMMON_WHAT = (
    "这是什么", "这是啥", "这在干嘛", "这页是什么",
    "画面现在是在干什么", "这个画面现在是在干什么", "这个画面是在干什么",
    "画面在干什么", "这个画面在干什么", "现在是在干什么", "在干什么",
    "我刚进来", "这个画面",
    "what is this", "what's this", "whats this", "what is it",
    "what is this screen", "what's this screen", "whats this screen",
    "what is the screen doing", "what is this page doing",
)
_COMMON_RIGHT = (
    "右边表是什么", "右边是什么", "右表是什么", "右边那张表", "右边的表", "右边这块",
    "what is the table", "what's the table", "whats the table",
    "the table on the right", "right-hand table", "right table",
    "what is on the right", "what's on the right",
)


def is_common_question(question: str) -> bool:
    q = (question or "").strip().lower()
    q = q.replace("？", "?").replace("“", '"').replace("”", '"')
    return any(p in q for p in _COMMON_WHAT + _COMMON_RIGHT)


def is_right_question(question: str) -> bool:
    q = (question or "").strip().lower()
    q = q.replace("？", "?").replace("“", '"').replace("”", '"')
    return any(p in q for p in _COMMON_RIGHT) or (("右边" in q or "right" in q) and any(
        w in q for w in ("什么", "啥", "表", "what", "table", "prob")
    ))


def is_textbook_question(question: str) -> bool:
    return bool(_TEXTBOOK_RE.search(question or ""))


def is_workbench_question(question: str) -> bool:
    q = (question or "").strip().lower()
    return any(k in q for k in ("学习工作台", "工作台是什么", "workbench", "learning workbench"))


def _is_overlay_or_invite_doc(doc: "Doc") -> bool:
    cid = str(getattr(doc, "id", "") or "")
    intents = getattr(doc, "intents", None) or []
    if cid.endswith("-station-invite") or cid.endswith("-workbench") or cid.endswith("-research"):
        return True
    if is_textbook_doc(doc):
        return True
    cite = f"{getattr(doc, 'cite_zh', '')} {getattr(doc, 'cite_en', '')}"
    if any(k in cite for k in ("书库", "学习工作台", "Library", "workbench", "Workbench")):
        if "textbook" in intents or cid.endswith("-invite") or "workbench" in cid or "research" in cid:
            return True
    return False


def is_textbook_doc(doc: Any) -> bool:
    """Landmark Library cards — not math walks or the probability table."""
    cid = str(getattr(doc, "id", None) or (doc.get("id") if isinstance(doc, dict) else "") or "")
    kind = str(getattr(doc, "kind", None) or (doc.get("kind") if isinstance(doc, dict) else "") or "")
    intents = getattr(doc, "intents", None)
    if intents is None and isinstance(doc, dict):
        intents = doc.get("intents") or []
    textbook = bool(
        getattr(doc, "textbook", False)
        or (doc.get("textbook") if isinstance(doc, dict) else False)
        or kind == "textbook"
    )
    return bool(
        textbook
        or "textbook" in (intents or [])
        or cid.startswith("textbook-")
        or cid == "mis-need-textbook-first"
    )



_CROSS_PHRASES = (
    "这和文字课",
    "和文字课是一件事",
    "跟文字课",
    "同一件事",
    "是一件事吗",
    "是一件事么",
    "和音乐课",
    "和图片课",
    "和微调课",
    "其他课",
    "四门课",
    "same as the text",
    "same as text",
    "same thing as",
    "is this the same",
    "like the text course",
    "same idea as",
    "same idea",
)


def is_cross_course_question(question: str) -> bool:
    q = (question or "").strip().lower()
    q = q.replace("？", "?").replace("“", '"').replace("”", '"')
    return any(p in q for p in _CROSS_PHRASES)


def _is_cross_doc(doc: "Doc") -> bool:
    return doc.kind == "cross" or str(doc.id or "").startswith("shared-cross-")


def is_loss_or_later(snapshot: Optional[dict[str, Any]] = None) -> bool:
    """True on the loss station or later optional stops (method / 再深挖)."""
    snapshot = snapshot or {}
    if _course(snapshot) != "finetune":
        return False
    st = _station(snapshot)
    live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
    spine = str(snapshot.get("spineView") or live.get("ftSpine") or "")
    return st in {"loss", "method", "explore"} or spine in {"loss", "method", "explore"}


def is_later_lab_area(snapshot: Optional[dict[str, Any]] = None) -> bool:
    """True only when the student is already on the method stop or 再深挖 / later lab."""
    snapshot = snapshot or {}
    if _course(snapshot) != "finetune":
        return False
    st = _station(snapshot)
    live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
    spine = str(snapshot.get("spineView") or live.get("ftSpine") or "")
    later = str(live.get("ftLater") or "")
    return st in {"method", "explore"} or spine in {"method", "explore"} or later in {
        "dpo",
        "qlora",
        "overfit",
        "map",
        "eval",
        "ckpt",
        "forget",
        "sft",
    }




def tokenize(text: str) -> list[str]:
    s = (text or "").strip().lower()
    if not s:
        return []
    out: list[str] = []
    for m in _TOKEN_RE.findall(s):
        if m and m not in _STOP:
            out.append(m)
    for run in _CJK_RE.findall(s):
        chars = [ch for ch in run if ch not in _STOP]
        out.extend(chars)
        if len(run) >= 2:
            out.extend(run[i : i + 2] for i in range(len(run) - 1))
        if len(run) >= 3:
            out.extend(run[i : i + 3] for i in range(len(run) - 2))
    return out


def _listish(val: Any) -> list[str]:
    if val is None:
        return []
    if isinstance(val, str):
        return [val]
    if isinstance(val, (list, tuple)):
        return [str(x) for x in val if x is not None]
    return []


@dataclass
class Doc:
    id: str
    kind: str
    courses: list[str]
    stations: list[str]
    any_station: bool
    requires_unlocked: Optional[str]
    locked_only: bool
    intents: list[str]
    keywords: list[str]
    title_zh: str
    title_en: str
    body_zh: str
    body_en: str
    cite_zh: str
    cite_en: str
    highlight_sel: str
    next_hint_zh: str
    next_hint_en: str
    math_walk_id: Optional[str]
    textbook: bool
    spoiler_tags: list[str]
    require_station: bool = False
    requires_generated: bool = False
    tokens: list[str] = field(default_factory=list)
    tf: dict[str, int] = field(default_factory=dict)
    dl: int = 0

    def as_card(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "courses": self.courses,
            "stations": self.stations,
            "anyStation": self.any_station,
            "requiresUnlocked": self.requires_unlocked,
            "intents": self.intents,
            "keywords": self.keywords,
            "titleZh": self.title_zh,
            "titleEn": self.title_en,
            "bodyZh": self.body_zh,
            "bodyEn": self.body_en,
            "citeZh": self.cite_zh,
            "citeEn": self.cite_en,
            "highlightSel": self.highlight_sel,
            "nextStepHintZh": self.next_hint_zh,
            "nextStepHintEn": self.next_hint_en,
            "mathWalkId": self.math_walk_id,
            "textbook": self.textbook,
            "spoilerTags": self.spoiler_tags,
            "requiresGenerated": self.requires_generated,
            "requireStation": self.require_station,
        }


def _from_raw(raw: dict[str, Any]) -> Optional[Doc]:
    did = str(raw.get("id") or "").strip()
    if not did:
        return None
    courses = _listish(raw.get("courses") or raw.get("course") or [])
    stations = _listish(raw.get("stations") or [])
    body_zh = str(raw.get("bodyZh") or "")
    body_en = str(raw.get("bodyEn") or "")
    title_zh = str(raw.get("titleZh") or "")
    title_en = str(raw.get("titleEn") or "")
    keywords = _listish(raw.get("keywords") or [])
    # Repeat title and keywords so they weigh more in BM25 tf.
    index_text = " ".join(
        [title_zh, title_en, title_zh, " ".join(keywords), " ".join(keywords), body_zh, body_en, str(raw.get("citeZh") or ""), str(raw.get("citeEn") or "")]
    )
    toks = tokenize(index_text)
    tf: dict[str, int] = {}
    for t in toks:
        tf[t] = tf.get(t, 0) + 1
    return Doc(
        id=did,
        kind=str(raw.get("kind") or "teach"),
        courses=courses or ["text"],
        stations=stations or ["*"],
        any_station=bool(raw.get("anyStation") or "*" in stations),
        requires_unlocked=(str(raw["requiresUnlocked"]) if raw.get("requiresUnlocked") else None),
        locked_only=bool(raw.get("lockedOnly")),
        intents=_listish(raw.get("intents") or []),
        keywords=keywords,
        title_zh=title_zh,
        title_en=title_en,
        body_zh=body_zh,
        body_en=body_en,
        cite_zh=str(raw.get("citeZh") or ""),
        cite_en=str(raw.get("citeEn") or ""),
        highlight_sel=str(raw.get("highlightSel") or ""),
        next_hint_zh=str(raw.get("nextStepHintZh") or raw.get("nextHintZh") or ""),
        next_hint_en=str(raw.get("nextStepHintEn") or raw.get("nextHintEn") or ""),
        math_walk_id=(str(raw["mathWalkId"]) if raw.get("mathWalkId") else None),
        textbook=bool(raw.get("textbook") or raw.get("kind") == "textbook"),
        spoiler_tags=_listish(raw.get("spoilerTags") or raw.get("spoilers") or []),
        require_station=bool(raw.get("requireStation")),
        requires_generated=bool(raw.get("requiresGenerated")),
        tokens=toks,
        tf=tf,
        dl=max(1, len(toks)),
    )


def _legacy_card(raw: dict[str, Any]) -> dict[str, Any]:
    """Adapt old FAQ cards into the corpus schema (corpus file wins on id clash)."""
    return {
        "id": raw.get("id"),
        "kind": "teach",
        "courses": raw.get("courses") or raw.get("course") or ["text"],
        "stations": raw.get("stations") or [],
        "anyStation": raw.get("anyStation") or False,
        "requiresUnlocked": raw.get("requiresUnlocked"),
        "intents": raw.get("intents") or [],
        "keywords": raw.get("keywords") or [],
        "titleZh": raw.get("titleZh") or "",
        "titleEn": raw.get("titleEn") or "",
        "bodyZh": raw.get("bodyZh") or "",
        "bodyEn": raw.get("bodyEn") or "",
        "citeZh": raw.get("citeZh") or "",
        "citeEn": raw.get("citeEn") or "",
        "highlightSel": raw.get("highlightSel") or "",
        "nextStepHintZh": raw.get("nextStepHintZh") or "",
        "nextStepHintEn": raw.get("nextStepHintEn") or "",
        "mathWalkId": raw.get("mathWalkId"),
        "textbook": False,
        "spoilerTags": raw.get("spoilerTags") or [],
    }


class CorpusIndex:
    def __init__(self, docs: list[Doc]):
        self.docs = docs
        self.n = max(1, len(docs))
        self.df: dict[str, int] = {}
        total_dl = 0
        for d in docs:
            total_dl += d.dl
            for t in d.tf:
                self.df[t] = self.df.get(t, 0) + 1
        self.avgdl = total_dl / self.n
        self.idf: dict[str, float] = {}
        for t, df in self.df.items():
            # BM25 idf (positive for rare terms)
            self.idf[t] = math.log(1.0 + (self.n - df + 0.5) / (df + 0.5))

    def bm25(self, doc: Doc, qtokens: list[str], k1: float = 1.5, b: float = 0.75) -> float:
        if not qtokens:
            return 0.0
        score = 0.0
        seen: dict[str, int] = {}
        for t in qtokens:
            seen[t] = seen.get(t, 0) + 1
        for t, qf in seen.items():
            tf = doc.tf.get(t, 0)
            if not tf:
                continue
            idf = self.idf.get(t, 0.0)
            denom = tf + k1 * (1 - b + b * doc.dl / max(self.avgdl, 1.0))
            score += idf * (tf * (k1 + 1) / denom) * (1.0 + 0.1 * min(qf, 3))
        return score


_INDEX: Optional[CorpusIndex] = None


def _load_json(path: Path) -> list[dict[str, Any]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        for key in ("docs", "cards", "items"):
            if isinstance(raw.get(key), list):
                return [x for x in raw[key] if isinstance(x, dict)]
    return []


def load_index(*, force: bool = False) -> CorpusIndex:
    global _INDEX
    if _INDEX is not None and not force:
        return _INDEX
    by_id: dict[str, dict[str, Any]] = {}
    # Legacy FAQ first; curated corpus overwrites the same id.
    if LEGACY_CARDS.is_file():
        for raw in _load_json(LEGACY_CARDS):
            adapted = _legacy_card(raw)
            if adapted.get("id"):
                by_id[str(adapted["id"])] = adapted
    if CORPUS_DIR.is_dir():
        for path in sorted(CORPUS_DIR.glob("*.json")):
            for raw in _load_json(path):
                did = str(raw.get("id") or "").strip()
                if did:
                    by_id[did] = raw
    docs: list[Doc] = []
    for raw in by_id.values():
        doc = _from_raw(raw)
        if doc and (doc.body_zh or doc.body_en):
            docs.append(doc)
    _INDEX = CorpusIndex(docs)
    return _INDEX


def _course(snapshot: dict[str, Any]) -> str:
    return str((snapshot or {}).get("course") or "text")


def _station(snapshot: dict[str, Any]) -> str:
    return str((snapshot or {}).get("station") or (snapshot or {}).get("stationId") or "generate")


def _station_index(snapshot: dict[str, Any]) -> int:
    try:
        return int(snapshot.get("stationIndex") or 0)
    except (TypeError, ValueError):
        return 0


def _unlocked(snapshot: dict[str, Any]) -> dict[str, Any]:
    u = (snapshot or {}).get("unlocked") or {}
    return u if isinstance(u, dict) else {}


def _is_first_screen(snapshot: dict[str, Any]) -> bool:
    """True only on a course's opening beat, before the student has taken a visible step."""
    course = _course(snapshot)
    idx = _station_index(snapshot)
    st = _station(snapshot)
    live = snapshot.get("live") or {}
    if st in {"contrast", "workbench", "research"}:
        return False
    if isinstance(live, dict) and (live.get("contrastOpen") or live.get("workbenchOpen") or (
        live.get("textbookOpen") and str(live.get("textbookPage") or "") == "further-reading"
    )):
        return False
    if course == "text":
        return (not snapshot.get("generated")) and idx <= 0 and st in {"", "generate"}
    if course == "image":
        try:
            step = int(live.get("imageStep", snapshot.get("imageStep") or 0) or 0)
        except (TypeError, ValueError):
            step = 0
        return step <= 0 and idx <= 0
    if course == "music":
        return (not snapshot.get("generated")) and idx <= 0 and st in {"", "map"}
    if course == "finetune":
        return idx <= 0 and st in {"", "explain", "map"}
    return idx <= 0


def _is_early(snapshot: dict[str, Any]) -> bool:
    course = _course(snapshot)
    idx = _station_index(snapshot)
    st = _station(snapshot)
    if course == "text":
        return (not snapshot.get("textPathDone")) and (idx <= 1 or st in {"", "generate", "tokens"})
    if course in {"image", "music"}:
        return idx <= 1 or st in {"", "map"}
    if course == "finetune":
        if is_later_lab_area(snapshot):
            return False
        return idx <= 1 or st in {"", "map", "pack"}
    return idx <= 1


def _allowed(doc: Doc, snapshot: dict[str, Any], question: str) -> bool:
    course = _course(snapshot)
    if course not in doc.courses and "*" not in doc.courses and "any" not in doc.courses:
        return False
    unlocked = _unlocked(snapshot)
    req = doc.requires_unlocked
    if req and not bool(unlocked.get(req)):
        # Early locked-knob explanations are allowed when the student asks, or when marked lockedOnly.
        if doc.locked_only:
            pass
        else:
            return False
    if doc.locked_only:
        # Only use locked-only cards while the relevant knob is still locked.
        flag = doc.requires_unlocked or "sampling"
        # locked_only + requiresUnlocked=X means "show while X is locked"
        if bool(unlocked.get(flag)):
            return False
        if req and flag != req and bool(unlocked.get(req)):
            return False
    if doc.textbook and not is_textbook_question(question):
        return False
    if getattr(doc, "requires_generated", False) and not snapshot.get("generated"):
        return False
    tags = set(doc.spoiler_tags)
    early = _is_early(snapshot)
    later_stations = {"method", "explore"}
    stationed_later = bool(later_stations & set(doc.stations or [])) and not doc.any_station and "*" not in (doc.stations or [])
    if (tags & _LATER_TAGS) or stationed_later:
        # Only when the student is already on the method stop or 再深挖. Do not leak names earlier.
        if course != "finetune" or not is_later_lab_area(snapshot):
            return False
    if tags & _GRAD_TAGS:
        # 梯度 / 反向传播 stay locked until the loss table has been seen.
        if course != "finetune" or not is_loss_or_later(snapshot):
            return False
        # Generic “这是什么” must not steal the loss-as-table card.
        if not is_grad_question(question):
            return False
    if doc.id == "ft-grad-early" and not is_grad_question(question):
        return False
    if tags & _LMHEAD_TAGS or doc.id in {"text-lmhead-how", "text-lmhead-what"}:
        if _course(snapshot) != "text" or not is_tokens_or_later(snapshot):
            return False
        if not is_lmhead_question(question):
            return False
    if doc.id == "text-lmhead-early" and not is_lmhead_question(question):
        return False
    if doc.id == "text-lmhead-early" and is_tokens_or_later(snapshot):
        return False
    if tags & _CUTOFF_TAGS or doc.id in {"text-cutoff-set", "music-cutoff-set"}:
        if not is_cutoff_question(question):
            return False
        course = _course(snapshot)
        unlocked = _unlocked(snapshot)
        if course == "text" and not bool(unlocked.get("sampling")):
            return False
        if course == "music" and not bool(unlocked.get("musicKnobs")):
            return False
        if course not in {"text", "music"}:
            return False
    if doc.id == "text-cutoff-early" and not is_cutoff_question(question):
        return False
    # Phase 4 library / magnifier part cards: question-keyword gates so mid-path
    # generic 「这是什么」 / 「这根线是什么」 are not stolen, and early stations
    # do not jump to LayerNorm / mask / embedding names.
    part = part_kind_for_question(question)
    doc_part = _PART_DOC_IDS.get(doc.id or "")
    if doc_part:
        if part != doc_part:
            return False
        if doc.id.endswith("-early"):
            if not _is_first_screen(snapshot) and _station(snapshot) not in {"", "generate"}:
                return False
        else:
            # Later part cards stay off the first screen unless the matching
            # library page or magnifier is already open.
            page = textbook_page_open(snapshot)
            pop = popover_open(snapshot)
            if doc_part == "mask":
                if not (is_attention_or_later(snapshot) or page == "masked-self-attention" or pop in {"attention", "qkv"}):
                    return False
            elif doc_part == "qkv_mag":
                if not (is_attention_or_later(snapshot) or page == "qkv" or pop == "qkv"):
                    return False
            elif doc_part == "ln":
                if not (is_residual_or_later(snapshot) or page == "layer-normalization" or pop in {"ln", "layernorm"}):
                    return False
            elif doc_part == "pe":
                if not (is_tokens_or_later(snapshot) or page in {"positional-encoding", "token-embedding", "embedding"} or pop == "positional"):
                    return False
            elif doc_part == "embed":
                if not (is_tokens_or_later(snapshot) or page in {"embedding", "token-embedding"}):
                    return False
            elif doc_part == "ffn":
                if not (is_attention_or_later(snapshot) or page == "mlp" or pop in {"mlpUp", "mlpDown"}):
                    return False
            elif doc_part == "dropout":
                if not (is_residual_or_later(snapshot) or page == "dropout" or pop == "dropout"):
                    return False
    elif part:
        # A specific part question must not be answered by a generic station card.
        return False
    # Phase 5 later-sketch cards: keyword gates so early / generic asks are not stolen.
    p5 = p5_kind_for_question(question)
    doc_p5 = _P5_DOC_IDS.get(doc.id or "")
    if doc_p5:
        if p5 != doc_p5:
            return False
        early_doc = str(doc.id or "").endswith("-early")
        if doc_p5 == "forward":
            if _course(snapshot) != "image":
                return False
            stepped = _image_step(snapshot) > 0
            if early_doc and stepped:
                return False
            if (not early_doc) and (not stepped):
                return False
        elif doc_p5 == "lora_rank":
            later = is_later_lab_area(snapshot)
            if early_doc and later:
                return False
            if (not early_doc) and (not later):
                return False
        elif doc_p5 == "dpo_pair":
            live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
            later = str((live or {}).get("ftLater") or "")
            on_dpo = is_later_lab_area(snapshot) and (_station(snapshot) == "explore" or later == "dpo")
            if early_doc and on_dpo:
                return False
            if (not early_doc) and (not on_dpo):
                return False
        elif doc_p5 == "music_yellow":
            if _course(snapshot) != "music" or _is_first_screen(snapshot):
                return False
    elif p5:
        return False
    if doc.require_station and not doc.any_station:
        cur = _station(snapshot)
        live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
        spine = str(snapshot.get("spineView") or live.get("ftSpine") or "")
        specific = [s for s in (doc.stations or []) if s and s != "*"]
        if specific and cur not in specific and spine not in specific:
            return False
    if "cfg" in tags and course == "image" and not bool(unlocked.get("imageKnobs")):
        # Visible thumbs may be described without the formula name; cfg-named docs wait.
        if "cfg" not in (question or "").lower() and "引导" not in (question or "") and not doc.locked_only:
            if doc.kind == "math":
                return False
    return True


def _intents_for(question: str) -> list[str]:
    q = (question or "").strip().lower()
    hits: list[str] = []
    mapping = [
        ("what_is_this", _COMMON_WHAT),
        ("right_table", _COMMON_RIGHT + ("概率表", "百分比", "probability", "候选")),
        ("next_word", ("下一个词", "生成下一个词", "猜词", "next word", "generate next")),
        ("tokens", ("词片", "分词", "token", "切开", "切分")),
        ("attention", ("注意力", "亮线", "看谁", "attention", "lit line", "回头看")),
        ("layers", ("层", "头", "layer", "head", "block", "翻一层")),
        ("residual", ("残差", "旁路", "加到后面", "residual", "bypass")),
        ("knobs", ("旋钮", "抽词", "temperature", "温度", "top-k", "top-p", "top k")),
        ("temperature_early", ("温度", "temperature", "top-k", "top-p", "采样")),
        ("lmhead", ("输出头", "解嵌入", "哪条向量", "lm_head", "unembedding", "unembed", "output head", "which vector", "隐藏向量")),
        ("cutoff", ("top-k", "top-p", "topk", "候选怎么", "候选音", "截断着抽", "还能抽哪些", "candidate set", "nucleus")),
        ("loss", ("损失", "loss", "交叉熵", "1/25")),
        ("weight", ("梯度", "反向传播", "权重动", "怎么让权重", "gradient", "backprop", "nudge", "move a weight")),
        ("denoise", ("去噪", "denoise", "再去噪", "噪声", "noise")),
        ("cfg", ("对照", "cfg", "引导", "听话程度")),
        ("next_note", ("下一个音", "音符", "melody", "next note", "音高", "概率")),
        ("finetune", ("微调", "权重", "基线", "开训", "fine-tune", "finetune", "训练")),
        ("lora", ("lora", "旁边加", "一小块", "不必一次改全部")),
        ("overfit", ("过拟合", "多训", "一定更好", "overfit")),
        ("dpo", ("dpo", "rlhf", "完整对齐", "完整训练", "预计算", "偏好对")),
        ("qlora", ("qlora", "显存", "显存条", "小条", "8gb", "8GB", "量化")),
        ("ui", ("任务区", "任务条", "按钮", "在哪点", "点哪里", "界面", "dock", "task cluster")),
        ("textbook", ("教材", "教科书", "textbook", "图书馆", "书库")),
        ("followup", ("然后呢", "接下来", "再往下", "刚才讲", "刚才说", "再看一眼", "what next", "and then", "what now")),
        ("cross_course", ("这和文字课", "是一件事", "同一件事", "四门课", "和音乐课", "和图片课", "和微调课", "same as the text", "is this the same", "same idea")),
    ]
    for intent, words in mapping:
        for w in words:
            if w in q:
                hits.append(intent)
                break
    if is_common_question(question) and "what_is_this" not in hits and not is_right_question(question):
        hits.append("what_is_this")
    return hits


def retrieve(
    question: str,
    snapshot: Optional[dict[str, Any]] = None,
    target: Optional[dict[str, Any]] = None,
    limit: int = 5,
) -> dict[str, Any]:
    snapshot = snapshot or {}
    index = load_index()
    q = (question or "").strip()
    q_extra = q
    if target and isinstance(target, dict):
        q_extra = q + " " + str(target.get("label") or target.get("region") or "")
    qtokens = tokenize(q_extra)
    intents = _intents_for(q_extra)
    course = _course(snapshot)
    station = _station(snapshot)
    candidates: list[tuple[float, Doc]] = []
    for doc in index.docs:
        if not _allowed(doc, snapshot, q):
            continue
        # Soft station filter: keep, but boost matches.
        score = index.bm25(doc, qtokens)
        if station in doc.stations or "*" in doc.stations or doc.any_station:
            score += 1.6 if station in doc.stations else 0.3
        else:
            score -= 0.4
        # Mid-path: do not re-lecture the opening "第一关" card. Cheap lexical rerank only.
        if not _is_first_screen(snapshot):
            blob = f"{doc.title_zh} {doc.body_zh} {doc.title_en} {doc.body_en}"
            if "第一关" in blob or "first station" in blob.lower():
                score -= 6.0
            specific = [s for s in (doc.stations or []) if s and s != "*"]
            if "*" in (doc.stations or []) and station not in specific:
                score -= 5.0
            if station in doc.stations:
                score += 1.8
            if doc.stations and station == doc.stations[0]:
                score += 1.0
            # Mid-path "这是什么" should keep the stationed phenomenon card in the top hits,
            # ahead of a first-screen layout card whose keyword is also "这是什么".
            if is_common_question(q) and station in [s for s in (doc.stations or []) if s and s != "*"]:
                score += 8.0
            if getattr(doc, "requires_generated", False) and snapshot.get("generated"):
                score += 0.6
        for intent in intents:
            if intent in doc.intents:
                score += 2.4
        if is_right_question(q):
            rightish = (
                "right_table" in doc.intents
                or "右边" in (doc.title_zh + " ".join(doc.keywords))
                or "right" in " ".join(doc.keywords).lower()
            )
            if rightish:
                score += 3.8
            else:
                # A general first-screen card that merely mentions 右边 must not beat the region card.
                score -= 3.2
        if is_common_question(q) and not is_right_question(q) and "what_is_this" in doc.intents:
            score += 2.0
        if doc.kind == "ui" and (is_common_question(q) or "ui" in intents):
            score += 0.8
        if "followup" in intents and "followup" in doc.intents:
            score += 2.2
        if getattr(doc, "requires_generated", False) and snapshot.get("generated"):
            score += 1.2
        if doc.kind == "math" and _is_early(snapshot) and "math" not in q.lower() and "怎么算" not in q and "百分比是怎么" not in q:
            score -= 1.0
        # Keyword substring bonus (short teaching terms).
        blob = " ".join(doc.keywords).lower()
        for kw in doc.keywords:
            if kw and kw.lower() in q.lower():
                score += 0.6
        part = part_kind_for_question(q)
        if part and _PART_DOC_IDS.get(doc.id or "") == part:
            score += 6.0
        p5 = p5_kind_for_question(q)
        if p5 and _P5_DOC_IDS.get(doc.id or "") == p5:
            score += 6.0
        if is_qkv_mag_question(q) and is_common_question(q) and "what_is_this" in doc.intents and doc.id != "text-qkv-mag":
            score -= 8.0
        if any(k in q for k in ("看中间的线", "中间的线", "亮线", "这根线", "这条线", "lit line", "lit lines")):
            if doc.id == "text-attention" or "attention" in (doc.intents or []):
                score += 8.0
            if doc.id == "text-layers":
                score -= 4.0
        # Cross-course analogy cards stay out of ordinary station questions,
        # but become easy to retrieve after a course switch when the student asks.
        if _is_cross_doc(doc):
            if is_cross_course_question(q):
                score += 8.0
            else:
                score -= 8.0
        later = ""
        live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
        later = str(live.get("ftLater") or "")
        if later and is_later_lab_area(snapshot):
            if later in (doc.id or "") or later in " ".join(doc.keywords).lower() or later in " ".join(doc.intents).lower():
                score += 3.0
        # On-screen mid/late questions must stay on the current phenomenon,
        # not drift to the Library or the learning workbench.
        if (
            is_common_question(q)
            and not is_textbook_question(q)
            and not is_workbench_question(q)
            and _is_overlay_or_invite_doc(doc)
        ):
            live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
            keep = False
            if (station == "workbench" or (isinstance(live, dict) and live.get("workbenchOpen"))) and (
                "workbench" in (doc.id or "") or "workbench" in (doc.stations or [])
            ):
                keep = True
            if (station == "research" or (isinstance(live, dict) and live.get("textbookOpen") and str(live.get("textbookPage") or "") == "further-reading")) and (
                "research" in (doc.id or "") or "research" in (doc.stations or [])
            ):
                keep = True
            if (station == "contrast" or (isinstance(live, dict) and live.get("contrastOpen"))) and (
                "contrast" in (doc.id or "") or "contrast" in (doc.stations or [])
            ):
                keep = True
            if not keep:
                score -= 12.0
        # Landmark questions (教材 / 书库 / 书在哪) must point at the top-bar Library,
        # not the current math walk, sampling knobs, or the probability table.
        if is_textbook_question(q):
            if is_textbook_doc(doc):
                score += 12.0
            elif doc.math_walk_id or doc.kind == "math" or "knobs" in doc.intents or "temperature_early" in doc.intents:
                score -= 12.0
        if score > 0:
            candidates.append((score, doc))
    candidates.sort(key=lambda x: (-x[0], x[1].id))
    hits = candidates[: max(1, limit)]
    top_score = hits[0][0] if hits else 0.0
    if top_score >= 6.0:
        strength = "high"
    elif top_score >= 3.0:
        strength = "mid"
    elif top_score > 0:
        strength = "low"
    else:
        strength = "none"
    return {
        "course": course,
        "station": station,
        "intents": intents,
        "strength": strength,
        "topScore": round(top_score, 4),
        "hits": [{"score": round(s, 4), "doc": d} for s, d in hits],
        "cards": [d.as_card() for _, d in hits],
    }


def _live_dict(snapshot: dict[str, Any]) -> dict[str, Any]:
    live = (snapshot or {}).get("live")
    return live if isinstance(live, dict) else {}


def _display_axis(snapshot: dict[str, Any], key: str) -> str:
    """Store indices are 0-based (blockIdx / headIdx). Show the on-screen 1-based label."""
    live = _live_dict(snapshot)
    val = snapshot.get(key)
    if val is None or val == "":
        val = live.get(key)
    if val is None or val == "":
        return ""
    try:
        return str(int(val) + 1)
    except (TypeError, ValueError):
        return str(val)


def _token_label(snapshot: dict[str, Any]) -> str:
    live = _live_dict(snapshot)
    return str(snapshot.get("token") or live.get("token") or "").strip()


def _fmt_weight_pct(val: Any) -> str:
    try:
        return f"{float(val):.1f}%"
    except (TypeError, ValueError):
        return str(val)


def _attn_ready_note(snapshot: dict[str, Any]) -> str:
    live = _live_dict(snapshot)
    zh = str((snapshot or {}).get("locale") or "zh-CN") != "en"
    weights = live.get("attnWeights") or snapshot.get("attnWeights") or []
    ready = live.get("attnReady")
    if ready is None:
        ready = live.get("modelReady")
    if ready is None:
        ready = bool(weights)
    bits: list[str] = []
    if isinstance(weights, list):
        for row in weights[:4]:
            if not isinstance(row, dict):
                continue
            tok = str(row.get("token") or row.get("label") or "").strip()
            if not tok:
                continue
            pct = row.get("percent")
            bits.append(f"{tok} {_fmt_weight_pct(pct)}" if pct is not None else tok)
    if ready and bits:
        line = "，".join(bits)
        return (
            f"这一行现在大约是：{line}。更亮就是权重大。"
            if zh
            else f"This row is currently about: {line}. Brighter means a larger weight."
        )
    if ready:
        return (
            "屏幕上更亮的线，就是这一步看得更多的词。"
            if zh
            else "A brighter line is the word this step looks at more."
        )
    return (
        "眼下权重还没落到屏幕上（可能还在准备），我不会编一套假的百分比。权重出现以后加起来是 100%，更亮的线就是被多看的词。"
        if zh
        else "The weights are not on the screen yet (they may still be preparing), so I will not invent fake percentages. When they appear they add to 100%, and the brighter line is the word looked at more."
    )



def format_token_for_display(token: str, zh: bool = True) -> str:
    """Never leak internal names such as [NEWLINE] into student-facing text."""
    newline = "换行" if zh else "line break"
    tab = "制表符" if zh else "tab"
    cr = "回车" if zh else "carriage return"
    text = str(token or "")
    return (
        text.replace("[NEWLINE]", newline)
        .replace(chr(10), newline)
        .replace("[TAB]", tab)
        .replace(chr(9), tab)
        .replace("[CR]", cr)
        .replace(chr(13), cr)
    )


def humanize_special_tokens_in_text(text: str, zh: bool = True) -> str:
    newline = "换行" if zh else "line break"
    tab = "制表符" if zh else "tab"
    cr = "回车" if zh else "carriage return"
    return (
        (text or "")
        .replace("[NEWLINE]", newline)
        .replace("[TAB]", tab)
        .replace("[CR]", cr)
    )


def _fill(template: str, snapshot: dict[str, Any]) -> str:
    zh = str((snapshot or {}).get("locale") or "zh-CN") != "en"
    tops = snapshot.get("topCandidates") or []
    top_tok = "?"
    top_pct = "?"
    top_list = ""
    if isinstance(tops, list) and tops:
        bits = []
        for i, row in enumerate(tops[:4]):
            if not isinstance(row, dict):
                continue
            tok = format_token_for_display(str(row.get("token") or row.get("label") or "?"), zh=True)
            pct = row.get("percent")
            if i == 0:
                top_tok = tok
                if pct is not None:
                    try:
                        top_pct = f"{float(pct):.1f}%"
                    except (TypeError, ValueError):
                        top_pct = str(pct)
            if pct is not None:
                try:
                    bits.append(f"{tok} {float(pct):.1f}%")
                except (TypeError, ValueError):
                    bits.append(f"{tok} {pct}")
            else:
                bits.append(tok)
        top_list = "，".join(bits) if bits else ""
    token = format_token_for_display(_token_label(snapshot) or ("当前点亮的那个词" if zh else "the currently lit token"), zh)
    layer = _display_axis(snapshot, "layer") or ("当前" if zh else "the current")
    head = _display_axis(snapshot, "head") or ("当前" if zh else "the current")
    live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
    kept_bits = []
    score_bits = []
    if isinstance(tops, list):
        for row in tops[:8]:
            if not isinstance(row, dict):
                continue
            tok = format_token_for_display(str(row.get("token") or row.get("label") or ""), zh)
            if not tok:
                continue
            kept = row.get("kept")
            pct = row.get("percent")
            try:
                pct_n = float(pct) if pct is not None else None
            except (TypeError, ValueError):
                pct_n = None
            if kept is False or (pct_n is not None and pct_n <= 0):
                pass
            else:
                if pct_n is not None:
                    kept_bits.append(f"{tok} {pct_n:.1f}%")
                else:
                    kept_bits.append(tok)
            score = row.get("score")
            if score is not None:
                try:
                    score_bits.append(f"{tok} {float(score):.2f}")
                except (TypeError, ValueError):
                    score_bits.append(f"{tok} {score}")
    samp_type = str(live.get("samplingType") or "")
    samp_val = live.get("samplingValue", live.get("topK", live.get("topP")))
    if samp_type == "top-k" or live.get("topK") is not None:
        try:
            sampling_knob = f"k={int(float(live.get('topK', samp_val)))}"
        except (TypeError, ValueError):
            sampling_knob = "k"
    elif samp_type == "top-p" or live.get("topP") is not None:
        try:
            sampling_knob = f"p={float(live.get('topP', samp_val)):.2g}"
        except (TypeError, ValueError):
            sampling_knob = "p"
    else:
        sampling_knob = str(samp_val or "")
    values = {
        "topToken": top_tok,
        "topPercent": top_pct,
        "topList": top_list or (top_tok if top_tok != "?" else ""),
        "keptList": "，".join(kept_bits) if kept_bits else (top_list or (top_tok if top_tok != "?" else "")),
        "scoreList": "，".join(score_bits),
        "samplingKnob": sampling_knob,
        "station": str(snapshot.get("stationTitle") or snapshot.get("station") or ""),
        "token": token,
        "layer": layer,
        "head": head,
        "attnReadyNote": _attn_ready_note(snapshot),
    }

    def repl(m: re.Match) -> str:
        return str(values.get(m.group(1), m.group(0)))

    return re.sub(r"\{(\w+)\}", repl, template or "")


def compose_answer(
    question: str,
    snapshot: dict[str, Any],
    retrieval: Optional[dict[str, Any]] = None,
    target: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    retrieval = retrieval or retrieve(question, snapshot, target)
    cards = retrieval.get("cards") or []
    if not cards:
        return None
    zh = str(snapshot.get("locale") or "zh-CN") != "en"
    card = cards[0]
    body = humanize_special_tokens_in_text(_fill(card.get("bodyZh") if zh else card.get("bodyEn"), snapshot), zh)
    if not (body or "").strip():
        body = humanize_special_tokens_in_text(_fill(card.get("bodyEn") if zh else card.get("bodyZh"), snapshot), zh)
    if not (body or "").strip():
        return None
    cite = (card.get("citeZh") if zh else card.get("citeEn")) or ""
    if not cite:
        cite = "出处：当前画面上被点亮的区域。" if zh else "Source: the highlighted region on the current screen."
    if cite and cite not in body:
        prefix = "出处：" if zh else "Source: "
        cite_line = cite if cite.startswith("出处") or cite.lower().startswith("source") else prefix + cite
        body = body.rstrip() + "\n\n" + cite_line
    nxt = card.get("nextStepHintZh") if zh else card.get("nextStepHintEn")
    return {
        "id": card.get("id"),
        "text": body,
        "highlightSel": card.get("highlightSel"),
        "mathWalkId": card.get("mathWalkId"),
        "nextHint": nxt,
        "cite": cite,
        "kind": card.get("kind"),
        "strength": retrieval.get("strength"),
        "source": "corpus",
        "ids": [c.get("id") for c in cards],
    }


def should_answer_from_corpus(question: str, retrieval: dict[str, Any]) -> bool:
    if not retrieval or not retrieval.get("cards"):
        return False
    if is_textbook_question(question):
        return True
    if is_common_question(question):
        return True
    strength = retrieval.get("strength")
    if strength in {"high", "mid"}:
        return True
    return False


def retrieve_cards(question: str, snapshot: dict[str, Any], target: Optional[dict[str, Any]] = None, limit: int = 4) -> list[dict[str, Any]]:
    return retrieve(question, snapshot, target, limit=limit).get("cards") or []


def answer_from_corpus(question: str, snapshot: dict[str, Any], target: Optional[dict[str, Any]] = None, cards: Optional[list[dict[str, Any]]] = None) -> Optional[dict[str, Any]]:
    retrieval = {"cards": cards, "strength": "high"} if cards else None
    return compose_answer(question, snapshot, retrieval, target)
