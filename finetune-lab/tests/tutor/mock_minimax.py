# -*- coding: utf-8 -*-
"""OpenAI-compatible mock for MiniMax. No real keys. Used only by tutor tests."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


def _blob(payload: dict) -> str:
    parts = []
    for m in payload.get("messages") or []:
        c = m.get("content")
        if isinstance(c, str):
            parts.append(c)
    return "\n".join(parts)


def craft_answer(payload: dict) -> str:
    blob = _blob(payload)
    user = ""
    for m in reversed(payload.get("messages") or []):
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            user = m["content"]
            break
    q = user.lower()
    zh = "用中文回答" in blob or "zh-CN" in blob or any("\u4e00" <= ch <= "\u9fff" for ch in user)
    # station
    station = "generate"
    for line in blob.splitlines():
        if line.strip().startswith("- station:"):
            station = line.split(":", 1)[-1].strip().split()[0]
            break
    # numbers from context
    nums = []
    if "right-table top rows:" in blob:
        for line in blob.splitlines():
            if "right-table top rows:" in line:
                nums.append(line.split(":", 1)[-1].strip())
    top = nums[0] if nums else ""

    temp_q = any(w in q for w in ("温度", "temperature", "top-k", "top-p"))
    table_q = any(w in q for w in ("右边", "右表", "概率", "table", "percent", "probability"))
    what_q = any(w in q for w in ("这是什么", "what is this", "what's this"))

    if temp_q and station in {"generate", "tokens", "attention", "layers", "residual"}:
        if zh:
            return (
                f"你现在还在「{station}」这一关。温度现在还锁着，先看它怎么抽出一个词，"
                "走到「现在才拧抽词旋钮」再动手。现在不要展开公式，继续看当前这一步，然后可以点「推进一步」。"
            )
        return (
            f"You are still at the “{station}” station. Temperature is locked. First watch how it draws a word; "
            "the knobs unlock later. No formulas now — stay on this step, then you can press 推进一步."
        )
    if table_q:
        extra = f"眼下最靠前的是 {top}。" if (zh and top) else (f"The top rows right now are {top}." if top else "")
        if zh:
            return (
                f"请看右边那张下一个词的表。每一行是一个候选词和它的百分比。{extra}"
                f"这件事属于「{station}」这一关。先把表看清楚，再点「推进一步」看下一步能看见什么。"
            )
        return (
            f"Look at the next-word table on the right. Each row is a candidate and its percentage. {extra} "
            f"This belongs to the “{station}” station. Read the table, then press 推进一步 to see what the next step can show."
        )
    if zh:
        return (
            f"你现在在「{station}」这一关。先看眼前的画面，用你看见的数字理解这一步。"
            "有问题就指着那一块继续问。下一步可以点「推进一步」，我不会替你点。"
        )
    return (
        f"You are at the “{station}” station. Look at the screen in front of you and use the numbers you can see. "
        "You can keep asking about that region. Next, you may press 推进一步 — I will not click it for you."
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Never log Authorization or keys
        sys_stderr = __import__("sys").stderr
        msg = fmt % args
        if "Authorization" in msg or "Bearer" in msg or "apiKey" in msg:
            return
        sys_stderr.write("mock-minimax %s\n" % msg)

    def _send(self, code: int, body: bytes, typ: str = "application/json"):
        self.send_response(code)
        self.send_header("Content-Type", typ)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        if urlparse(self.path).path in {"/health", "/v1/health"}:
            self._send(200, json.dumps({"ok": True, "mock": True}).encode())
            return
        self._send(404, b'{"error":"not found"}')

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            payload = {}
        if not path.endswith("/chat/completions"):
            self._send(404, b'{"error":"not found"}')
            return
        text = craft_answer(payload)
        if payload.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            # optional tool call for highlight
            chunks = [text[i : i + 24] for i in range(0, len(text), 24)] or [text]
            for ch in chunks:
                ev = {"choices": [{"index": 0, "delta": {"content": ch}, "finish_reason": None}]}
                self.wfile.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode("utf-8"))
            if "右边" in text or "table on the right" in text:
                tool = {
                    "choices": [
                        {
                            "index": 0,
                            "delta": {
                                "tool_calls": [
                                    {
                                        "index": 0,
                                        "id": "call_mock_1",
                                        "type": "function",
                                        "function": {
                                            "name": "highlight_ui",
                                            "arguments": json.dumps({"selector": '[data-te-zone="right"]'}),
                                        },
                                    }
                                ]
                            },
                            "finish_reason": None,
                        }
                    ]
                }
                self.wfile.write(f"data: {json.dumps(tool)}\n\n".encode("utf-8"))
                tool2 = {
                    "choices": [
                        {
                            "index": 0,
                            "delta": {
                                "tool_calls": [
                                    {
                                        "index": 1,
                                        "id": "call_mock_2",
                                        "type": "function",
                                        "function": {
                                            "name": "suggest_next_step",
                                            "arguments": json.dumps({"hint": "先看清右表，再点「推进一步」。"}),
                                        },
                                    }
                                ]
                            },
                            "finish_reason": "tool_calls",
                        }
                    ]
                }
                self.wfile.write(f"data: {json.dumps(tool2, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.write(b"data: [DONE]\n\n")
            return
        body = {
            "id": "mock-chat",
            "model": payload.get("model") or "MiniMax-M3.1-Flash",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "pong"}, "finish_reason": "stop"}],
        }
        self._send(200, json.dumps(body).encode())


def main():
    port = int((__import__("sys").argv[1] if len(__import__("sys").argv) > 1 else 8799))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"mock-minimax listening on 127.0.0.1:{port}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
