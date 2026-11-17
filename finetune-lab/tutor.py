# -*- coding: utf-8 -*-
"""Local teaching-tutor service: settings, MiniMax proxy, knowledge-base answers.

Secrets live in the user profile, never in the repo or in API responses.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from tutor_kb import retrieve_cards, answer_from_kb, redact_secrets, retrieve, should_answer_from_corpus
from tutor_context import build_grounded_prompt, compose_turn, sanitize_snapshot
from tutor_agent import FORBIDDEN_TOOLS, run_agent, sanitize_agent_tools

DEFAULT_CN = "https://api.minimax.cn/v1"
DEFAULT_OVERSEAS = "https://api.minimax.io/v1"
DEFAULT_MODEL = "MiniMax-M3.1-Flash"
DEFAULT_EFFORT = "medium"
ALLOWED_EFFORTS = ("low", "medium", "high", "xhigh", "max")
PLATFORM_DOCS = {
    "cn": "https://platform.minimaxi.com",
    "overseas": "https://platform.minimax.io",
}

HOME = Path(os.environ.get("YISUAN_TUTOR_HOME") or (Path.home() / ".yisuan-transformer"))
SECRETS_PATH = Path(os.environ.get("YISUAN_TUTOR_SECRETS") or (HOME / "tutor-secrets.json"))

router = APIRouter(prefix="/tutor-api", tags=["tutor"])


def _secrets_path() -> Path:
    return Path(os.environ.get("YISUAN_TUTOR_SECRETS") or (Path(os.environ.get("YISUAN_TUTOR_HOME") or (Path.home() / ".yisuan-transformer")) / "tutor-secrets.json"))


def _empty_secrets() -> dict[str, Any]:
    return {
        "apiKey": "",
        "platform": "cn",
        "baseUrl": DEFAULT_CN,
        "model": DEFAULT_MODEL,
        "reasoningEffort": DEFAULT_EFFORT,
        "showThinking": False,
    }


def load_secrets() -> dict[str, Any]:
    path = _secrets_path()
    data = _empty_secrets()
    try:
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data.update({k: raw[k] for k in data.keys() if k in raw})
    except Exception:
        pass
    if data.get("platform") == "overseas" and not (data.get("baseUrl") or "").strip():
        data["baseUrl"] = DEFAULT_OVERSEAS
    if data.get("platform") == "cn" and not (data.get("baseUrl") or "").strip():
        data["baseUrl"] = DEFAULT_CN
    effort = str(data.get("reasoningEffort") or DEFAULT_EFFORT).lower()
    if effort not in ALLOWED_EFFORTS:
        effort = DEFAULT_EFFORT
    data["reasoningEffort"] = effort
    data["showThinking"] = bool(data.get("showThinking"))
    data["model"] = (data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    data["apiKey"] = str(data.get("apiKey") or "").strip()
    return data


def save_secrets(data: dict[str, Any]) -> dict[str, Any]:
    path = _secrets_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    current = load_secrets()
    current.update({k: data[k] for k in current.keys() if k in data and data[k] is not None})
    # never write None key
    current["apiKey"] = str(current.get("apiKey") or "").strip()
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return current


def public_settings(data: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    data = data or load_secrets()
    key = data.get("apiKey") or ""
    last4 = key[-4:] if len(key) >= 4 else (key if key else "")
    return {
        "configured": bool(key),
        "keyLast4": last4 if key else "",
        "platform": data.get("platform") or "cn",
        "baseUrl": data.get("baseUrl") or DEFAULT_CN,
        "model": data.get("model") or DEFAULT_MODEL,
        "reasoningEffort": data.get("reasoningEffort") or DEFAULT_EFFORT,
        "showThinking": bool(data.get("showThinking")),
        "privacyNoteZh": "提问时会把当前关卡和画面上的数字发给 MiniMax，不会发送 API key，默认也不会上传训练文本。",
        "privacyNoteEn": "Asking sends the current station and on-screen numbers to MiniMax, never the API key, and does not upload training text by default.",
        "platformDocs": PLATFORM_DOCS,
        "defaults": {
            "cn": DEFAULT_CN,
            "overseas": DEFAULT_OVERSEAS,
            "model": DEFAULT_MODEL,
            "reasoningEffort": DEFAULT_EFFORT,
        },
    }


class SettingsIn(BaseModel):
    apiKey: Optional[str] = None
    clearKey: Optional[bool] = None
    platform: Optional[str] = None
    baseUrl: Optional[str] = None
    model: Optional[str] = None
    reasoningEffort: Optional[str] = None
    showThinking: Optional[bool] = None


class AskIn(BaseModel):
    question: str = Field(..., min_length=1)
    snapshot: dict[str, Any] = Field(default_factory=dict)
    target: Optional[dict[str, Any]] = None


class RetrieveIn(BaseModel):
    question: str = Field(..., min_length=1)
    snapshot: dict[str, Any] = Field(default_factory=dict)
    target: Optional[dict[str, Any]] = None


def _base_url(data: dict[str, Any]) -> str:
    platform = (data.get("platform") or "cn").strip()
    custom = (data.get("baseUrl") or "").strip().rstrip("/")
    if platform == "overseas":
        return custom or DEFAULT_OVERSEAS
    if platform == "custom":
        return custom or DEFAULT_CN
    return custom or DEFAULT_CN


def _chat_url(data: dict[str, Any]) -> str:
    base = _base_url(data)
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def _opener(url: str):
    host = (url or "").lower()
    if "127.0.0.1" in host or "localhost" in host:
        return urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return urllib.request.build_opener()


def _headers(data: dict[str, Any]) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {data.get('apiKey') or ''}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "highlight_ui",
            "description": "Point at a region of the explainer UI the student should look at now.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "A CSS selector that already exists, e.g. [data-te-zone='right']"},
                    "reason": {"type": "string"},
                },
                "required": ["selector"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_math_walk",
            "description": "Open an already-unlocked worked-example card that uses on-screen numbers. Never force a card on the first screen (station generate / before the student has generated).",
            "parameters": {
                "type": "object",
                "properties": {
                    "cardId": {"type": "string", "enum": ["prob", "attn", "residual", "denoise", "cfg", "musicProb", "loss", "temp"]},
                },
                "required": ["cardId"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_next_step",
            "description": "Remind the student which station this belongs to and what the next step can show. Never auto-click 推进一步.",
            "parameters": {
                "type": "object",
                "properties": {"hint": {"type": "string"}},
                "required": ["hint"],
            },
        },
    },
]


def _locale(snapshot: dict[str, Any]) -> str:
    loc = str(snapshot.get("locale") or "zh-CN")
    return "en" if loc.startswith("en") else "zh-CN"


def _station(snapshot: dict[str, Any]) -> str:
    return str(snapshot.get("station") or snapshot.get("stationId") or "generate")


def _course(snapshot: dict[str, Any]) -> str:
    return str(snapshot.get("course") or "text")


def _unlocked(snapshot: dict[str, Any]) -> dict[str, Any]:
    u = snapshot.get("unlocked") or {}
    return u if isinstance(u, dict) else {}


def is_common_question(question: str) -> bool:
    """True only for the beginner chip questions, not for every unmatched ask."""
    q = (question or "").strip().lower()
    q = q.replace("？", "?").replace("“", '"').replace("”", '"')
    phrases = (
        "这是什么",
        "这是啥",
        "这在干嘛",
        "这页是什么",
        "what is this",
        "what's this",
        "whats this",
        "what is it",
        "右边表是什么",
        "右边是什么",
        "右表是什么",
        "右边那张表",
        "what is the table",
        "what's the table",
        "whats the table",
        "the table on the right",
        "right-hand table",
        "right table",
    )
    return any(p in q for p in phrases)


def _is_first_screen(snapshot: dict[str, Any]) -> bool:
    course = _course(snapshot)
    station = _station(snapshot)
    if course == "text" and station in {"", "generate"} and not snapshot.get("textPathDone"):
        idx = snapshot.get("stationIndex")
        if idx is None or int(idx) <= 0:
            return True
    return False


def _sampling_locked(snapshot: dict[str, Any]) -> bool:
    return not bool(_unlocked(snapshot).get("sampling"))


SPOILER_RE = re.compile(
    r"(温度|temperature|top-?k|top-?p|softmax|logit|交叉熵|cross-?entropy|qlora|dpo|采样旋钮)",
    re.I,
)


def build_system_prompt(snapshot: dict[str, Any], cards: list[dict[str, Any]], target: Optional[dict[str, Any]]) -> str:
    """MiniMax path: retrieved snippets + compact screen digest, never a raw snapshot dump."""
    return build_grounded_prompt(snapshot, cards, target)


def _http_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: int = 45) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with _opener(url).open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        raise RuntimeError(f"HTTP {e.code}: {err[:500]}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"network: {e.reason}") from e


def test_connection(data: dict[str, Any]) -> dict[str, Any]:
    if not data.get("apiKey"):
        return {"ok": False, "error": "no_key", "messageZh": "还没有配置 API key。", "messageEn": "No API key is configured."}
    payload = {
        "model": data.get("model") or DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": "Reply with the single word pong."},
            {"role": "user", "content": "ping"},
        ],
        "max_tokens": 16,
        "stream": False,
        "reasoning_effort": data.get("reasoningEffort") or DEFAULT_EFFORT,
        "reasoning_split": True,
    }
    try:
        t0 = time.time()
        resp = _http_json(_chat_url(data), _headers(data), payload, timeout=40)
        elapsed = int((time.time() - t0) * 1000)
        choice = ((resp.get("choices") or [{}])[0].get("message") or {})
        content = choice.get("content") or ""
        # never include key or raw auth
        return {
            "ok": True,
            "model": resp.get("model") or data.get("model"),
            "latencyMs": elapsed,
            "preview": str(content)[:80],
            "messageZh": "连接成功。",
            "messageEn": "Connection succeeded.",
        }
    except Exception as e:
        msg = redact_secrets(str(e), data.get("apiKey") or "")
        return {
            "ok": False,
            "error": "upstream",
            "messageZh": f"连接失败：{msg}",
            "messageEn": f"Connection failed: {msg}",
        }


def _sanitize_tool(name: str, args: dict[str, Any], snapshot: dict[str, Any]) -> Optional[dict[str, Any]]:
    # Hard ban: the tutor must never operate the product.
    if name in FORBIDDEN_TOOLS:
        return None
    if name == "highlight_ui":
        sel = str(args.get("selector") or "").strip()
        if not sel or len(sel) > 240:
            return None
        # refuse whole-screen cover
        if sel in {"body", "html", "#app", "#landing", "main", "#main"}:
            return None
        return {"name": "highlight_ui", "selector": sel, "reason": str(args.get("reason") or "")[:200]}
    if name == "open_math_walk":
        if _is_first_screen(snapshot):
            return None
        card_id = str(args.get("cardId") or "").strip()
        allowed = snapshot.get("allowedMathWalks") or []
        if allowed and card_id not in allowed:
            return None
        if card_id in {"prob", "attn", "residual", "denoise", "cfg", "musicProb", "loss", "temp"}:
            return {"name": "open_math_walk", "cardId": card_id}
        return None
    if name == "suggest_next_step":
        hint = str(args.get("hint") or "").strip()[:400]
        if not hint:
            return None
        return {"name": "suggest_next_step", "hint": hint}
    return None


def _sse(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


def stream_ask(question: str, snapshot: dict[str, Any], target: Optional[dict[str, Any]]) -> Iterator[bytes]:
    data = load_secrets()
    snapshot = sanitize_snapshot(snapshot if isinstance(snapshot, dict) else {})
    zh = _locale(snapshot) != "en"
    retrieval = retrieve(question, snapshot, target)
    cards = retrieval.get("cards") or retrieve_cards(question, snapshot, target)
    agent = run_agent(question, snapshot, target, retrieval)
    kb_ans = agent.get("answer") or compose_turn(question, snapshot, target, retrieval) or answer_from_kb(question, snapshot, target, cards)
    use_corpus = bool(kb_ans) and (
        agent.get("handled")
        or should_answer_from_corpus(question, retrieval)
        or (not data.get("apiKey") and bool(kb_ans))
    )

    # Intent router + tool loop (retrieve / point / highlight / math-walk / cite).
    # Common and mid questions, and all routed intents, stay on the local path
    # even when a key is configured. The tutor never clicks, trains, or switches courses.
    if use_corpus and kb_ans:
        configured = bool(data.get("apiKey"))
        yield _sse("meta", {
            "source": "corpus",
            "needKey": False,
            "configured": configured,
            "ids": kb_ans.get("ids") or [kb_ans.get("id")],
            "taughtId": kb_ans.get("id"),
            "strength": retrieval.get("strength") or kb_ans.get("strength"),
            "intent": agent.get("intent"),
        })
        for tool in sanitize_agent_tools(agent.get("tools") or [], snapshot):
            yield _sse("tool", tool)
        yield _sse("token", {"text": kb_ans.get("text") or ""})
        yield _sse("done", {"source": "corpus", "needKey": False, "intent": agent.get("intent")})
        return

    if not data.get("apiKey"):
        msg = (
            "还没有配置 API key。请先打开设置，填入 MiniMax 的密钥后再问更深的问题。常见问题（例如「这是什么」「右边表是什么」）即使不配密钥也可以问。"
            if zh
            else "No API key is configured. Open Settings and add a MiniMax key to ask deeper questions. Common questions such as “what is this” or “what is the table on the right” still work without a key."
        )
        yield _sse("meta", {"source": "need_key", "needKey": True, "configured": False})
        yield _sse("token", {"text": msg})
        yield _sse("done", {"source": "need_key", "needKey": True, "openSettings": True})
        return

    system = build_system_prompt(snapshot, cards, target)
    system += (
        "\n\nYou may only use the tools highlight_ui, open_math_walk, and suggest_next_step. "
        "Never click a button, never start training, never switch courses. "
        "suggest_next_step is text-only advice for the student."
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": question.strip()[:2000]},
    ]
    payload = {
        "model": data.get("model") or DEFAULT_MODEL,
        "messages": messages,
        "stream": True,
        "tools": TOOLS,
        "tool_choice": "auto",
        "reasoning_effort": data.get("reasoningEffort") or DEFAULT_EFFORT,
        "reasoning_split": True,
        "max_tokens": 800,
    }
    yield _sse("meta", {"source": "model", "configured": True, "model": payload["model"]})
    # Pre-highlight from the top KB card so the UI is pointed at even if the model forgets the tool.
    if cards and cards[0].get("highlightSel"):
        yield _sse("tool", {"name": "highlight_ui", "selector": cards[0]["highlightSel"]})

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(_chat_url(data), data=body, headers=_headers(data), method="POST")
    show_thinking = bool(data.get("showThinking"))
    buf = b""
    tool_buf: dict[int, dict[str, str]] = {}
    try:
        with _opener(_chat_url(data)).open(req, timeout=90) as resp:
            while True:
                chunk = resp.read(256)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    line = line.strip()
                    if not line or not line.startswith(b"data:"):
                        continue
                    data_s = line[5:].strip()
                    if data_s == b"[DONE]":
                        break
                    try:
                        ev = json.loads(data_s.decode("utf-8", errors="replace"))
                    except Exception:
                        continue
                    choice = (ev.get("choices") or [{}])[0]
                    delta = choice.get("delta") or {}
                    content = delta.get("content")
                    if content:
                        # Hide leaked <think> blocks unless debug is on
                        if not show_thinking:
                            content = re.sub(r"<think>.*?</think>", "", str(content), flags=re.S)
                            if "<think>" in str(content):
                                content = str(content).split("<think>")[0]
                        if content:
                            yield _sse("token", {"text": content})
                    if show_thinking and delta.get("reasoning_content"):
                        yield _sse("thinking", {"text": delta.get("reasoning_content")})
                    for tc in delta.get("tool_calls") or []:
                        idx = int(tc.get("index") or 0)
                        slot = tool_buf.setdefault(idx, {"name": "", "arguments": ""})
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            slot["name"] += fn["name"]
                        if fn.get("arguments"):
                            slot["arguments"] += fn["arguments"]
                    if choice.get("finish_reason") == "tool_calls" or ev.get("choices") and choice.get("finish_reason"):
                        pass
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        msg = redact_secrets(f"HTTP {e.code}: {err[:400]}", data.get("apiKey") or "")
        fallback = kb_ans.get("text") if kb_ans else ""
        text = (
            (fallback + "\n\n" if fallback else "")
            + (f"导师服务刚才没有从 MiniMax 拿到回答（{msg}）。下面先用当前这一关的讲解。" if zh else f"The tutor service could not get an answer from MiniMax ({msg}). Here is the current-station explanation first.")
        )
        if not fallback:
            text = f"调用 MiniMax 失败：{msg}" if zh else f"MiniMax call failed: {msg}"
        yield _sse("token", {"text": text})
        yield _sse("done", {"source": "error"})
        return
    except Exception as e:
        msg = redact_secrets(str(e), data.get("apiKey") or "")
        yield _sse("token", {"text": (f"调用失败：{msg}" if zh else f"Call failed: {msg}")})
        yield _sse("done", {"source": "error"})
        return

    for slot in tool_buf.values():
        name = slot.get("name") or ""
        try:
            args = json.loads(slot.get("arguments") or "{}")
        except Exception:
            args = {}
        if not isinstance(args, dict):
            args = {}
        tool = _sanitize_tool(name, args, snapshot)
        if tool:
            yield _sse("tool", tool)

    if kb_ans and kb_ans.get("nextHint"):
        yield _sse("tool", {"name": "suggest_next_step", "hint": kb_ans["nextHint"]})
    yield _sse("done", {"source": "model"})


@router.get("/health")
def tutor_health():
    data = load_secrets()
    return {"ok": True, "configured": bool(data.get("apiKey")), "service": "tutor"}


@router.post("/retrieve")
def post_retrieve(body: RetrieveIn):
    """Lexical retrieval only. Never reads or returns secrets."""
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(400, "question is required")
    snapshot = sanitize_snapshot(body.snapshot if isinstance(body.snapshot, dict) else {})
    target = body.target if isinstance(body.target, dict) else None
    result = retrieve(question, snapshot, target)
    cards = result.get("cards") or []
    return {
        "ok": True,
        "source": "corpus",
        "strength": result.get("strength"),
        "topScore": result.get("topScore"),
        "ids": [c.get("id") for c in cards],
        "titles": [c.get("titleZh") or c.get("titleEn") for c in cards],
        "cites": [c.get("citeZh") or c.get("citeEn") for c in cards],
        "intents": result.get("intents") or [],
    }


@router.get("/settings")
def get_settings():
    return public_settings()


@router.post("/settings")
def post_settings(body: SettingsIn):
    current = load_secrets()
    update: dict[str, Any] = {}
    if body.clearKey:
        update["apiKey"] = ""
    elif body.apiKey is not None:
        key = body.apiKey.strip()
        # ignore masked placeholders like ••••1234 or ···1234
        if key and not re.fullmatch(r"[•·.*]{2,}\s*\w{0,4}", key):
            update["apiKey"] = key
    if body.platform:
        plat = body.platform.strip()
        if plat not in {"cn", "overseas", "custom"}:
            raise HTTPException(400, "platform must be cn, overseas, or custom")
        update["platform"] = plat
        if plat == "cn" and not body.baseUrl:
            update["baseUrl"] = DEFAULT_CN
        if plat == "overseas" and not body.baseUrl:
            update["baseUrl"] = DEFAULT_OVERSEAS
    if body.baseUrl is not None:
        url = body.baseUrl.strip().rstrip("/")
        if url and not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(400, "baseUrl must start with http:// or https://")
        if url:
            update["baseUrl"] = url
    if body.model:
        update["model"] = body.model.strip()
    if body.reasoningEffort:
        effort = body.reasoningEffort.strip().lower()
        if effort == "none":
            raise HTTPException(400, "MiniMax-M3.1-Flash cannot turn thinking off; use low, medium, high, xhigh, or max.")
        if effort not in ALLOWED_EFFORTS:
            raise HTTPException(400, "invalid reasoningEffort")
        update["reasoningEffort"] = effort
    if body.showThinking is not None:
        update["showThinking"] = bool(body.showThinking)
    saved = save_secrets({**current, **update})
    return public_settings(saved)


@router.post("/test")
def post_test():
    result = test_connection(load_secrets())
    status = 200 if result.get("ok") else 400
    return JSONResponse(result, status_code=status)


@router.post("/ask")
def post_ask(body: AskIn):
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(400, "question is required")
    snapshot = sanitize_snapshot(body.snapshot if isinstance(body.snapshot, dict) else {})
    target = body.target if isinstance(body.target, dict) else None

    def gen():
        try:
            yield from stream_ask(question, snapshot, target)
        except Exception as e:
            msg = redact_secrets(str(e), load_secrets().get("apiKey") or "")
            yield _sse("token", {"text": msg})
            yield _sse("done", {"source": "error"})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def mount_tutor(app) -> None:
    # Warm the in-memory corpus so the first common question is already fast.
    try:
        from tutor_kb import load_cards
        load_cards()
    except Exception:
        pass
    app.include_router(router)
