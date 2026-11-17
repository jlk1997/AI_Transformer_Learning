# -*- coding: utf-8 -*-
"""Backend checks that do not need a browser or a real MiniMax key."""
from __future__ import annotations

import json, os, urllib.request, urllib.error
from pathlib import Path

os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

TUTOR = "http://127.0.0.1:8787/tutor-api"
out = Path(r"C:\Users\10552\agent-tools\ft-tutor\api-unit.json")
rows = []


def rec(name, ok, detail=""):
    rows.append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS" if ok else "FAIL"), name, detail, flush=True)


def req(path, method="GET", body=None, timeout=30):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(TUTOR + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw.startswith("{") or raw.startswith("[") else raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return e.code, parsed


def read_sse(question, snapshot):
    body = json.dumps({"question": question, "snapshot": snapshot}, ensure_ascii=False).encode()
    request = urllib.request.Request(TUTOR + "/ask", data=body, method="POST", headers={"Content-Type": "application/json", "Accept": "text/event-stream"})
    tokens = []
    tools = []
    meta = {}
    with urllib.request.urlopen(request, timeout=30) as resp:
        buf = b""
        while True:
            chunk = resp.read(256)
            if not chunk:
                break
            buf += chunk
            while b"\n\n" in buf:
                raw, buf = buf.split(b"\n\n", 1)
                ev, data = "message", ""
                for line in raw.decode("utf-8", errors="replace").splitlines():
                    if line.startswith("event:"):
                        ev = line[6:].strip()
                    elif line.startswith("data:"):
                        data = line[5:].strip()
                if not data:
                    continue
                try:
                    obj = json.loads(data)
                except Exception:
                    continue
                if ev == "token":
                    tokens.append(obj.get("text") or "")
                elif ev == "tool":
                    tools.append(obj)
                elif ev == "meta":
                    meta = obj
                elif ev == "done":
                    meta.update(obj)
    return "".join(tokens), tools, meta


def main():
    import urllib.error
    st, health = req("/health")
    rec("health", st == 200 and health.get("ok") is True, str(health))

    req("/settings", "POST", {"clearKey": True})
    st, s = req("/settings")
    rec("cleared-not-configured", st == 200 and s.get("configured") is False and s.get("keyLast4") == "", str(s))
    rec("settings-redacts-key", "apiKey" not in s, "")

    snap = {
        "course": "text",
        "station": "generate",
        "stationTitle": "先看它猜出一个词",
        "stationIndex": 0,
        "locale": "zh-CN",
        "unlocked": {"sampling": False},
        "topCandidates": [{"token": "the", "percent": 12.3}, {"token": "a", "percent": 8.1}],
        "allowedMathWalks": [],
    }
    text, tools, meta = read_sse("右边表是什么？", snap)
    rec("kb-right-table-no-key", "右边" in text and "12.3" in text and ("key" in text.lower() or "密钥" in text or "配置" in text), text[:240])
    rec("kb-highlights-right", any(t.get("selector") and "right" in t.get("selector") for t in tools), str(tools))

    text2, _, _ = read_sse("温度是什么？给我 softmax 公式", snap)
    rec("kb-early-temp-no-formula", "温度" in text2 and "e^" not in text2 and "交叉熵" not in text2 and ("锁" in text2 or "先看" in text2), text2[:240])

    st, after = req("/settings", "POST", {"apiKey": "test-key-xxxx1234", "platform": "custom", "baseUrl": "http://127.0.0.1:8799/v1"})
    rec("save-last4", after.get("keyLast4") == "1234" and "test-key-xxxx1234" not in json.dumps(after), json.dumps(after))

    st, test = req("/test", "POST")
    rec("connection-test-mock", (st in (200, 400) and (test.get("ok") is True or "pong" in json.dumps(test))), str(test)[:200])

    out.write_text(json.dumps({"results": rows, "passed": sum(1 for r in rows if r["ok"]), "failed": sum(1 for r in rows if not r["ok"])}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("UNIT passed=%s failed=%s" % (sum(1 for r in rows if r["ok"]), sum(1 for r in rows if not r["ok"])))
    return 0 if all(r["ok"] for r in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
