# -*- coding: utf-8 -*-
"""Playwright checks for the teaching tutor. MiniMax is always mocked. No real keys."""
from __future__ import annotations

import json
import threading
import os
import re
import time
import traceback
import urllib.request
from pathlib import Path

os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
TUTOR = "http://127.0.0.1:8787/tutor-api"
SHOT = Path(r"C:\Users\10552\agent-tools\ft-tutor\shots")
REPORT = Path(r"C:\Users\10552\agent-tools\ft-tutor\e2e-report.json")

results = []


def rec(name: str, ok: bool, detail: str = ""):
    results.append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS" if ok else "FAIL"), name, detail, flush=True)


def shot(page, name: str):
    SHOT.mkdir(parents=True, exist_ok=True)
    path = SHOT / name
    print("SHOT-START", name, flush=True)
    try:
        page.screenshot(path=str(path), full_page=False, timeout=5000, animations="disabled")
        print("SHOT-OK", name, flush=True)
    except Exception as e:
        print("SHOT-FAIL", name, e, flush=True)
    return str(path)


def api(path: str, method: str = "GET", body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        TUTOR + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8")
        return resp.status, json.loads(raw) if raw else {}


def _unstick(page):
    print("EV-WATCHDOG closing wedged page", flush=True)
    try:
        page.close()
    except Exception as e:
        print("EV-WATCHDOG close err", e, flush=True)


def ev(page, js, arg=None, timeout=8000):
    # This Playwright Python build has no evaluate(timeout=...). Use
    # wait_for_function, which does time out, plus a thread watchdog: if the
    # renderer is stuck, Playwright's own timeout may never fire.
    payload = {"src": js, "arg": arg}
    timer = threading.Timer((timeout + 1500) / 1000.0, _unstick, args=(page,))
    timer.daemon = True
    timer.start()
    try:
        handle = page.wait_for_function(
            """(payload) => {
              try {
                const fn = eval('(' + payload.src + ')');
                return {ok: true, result: fn(payload.arg)};
              } catch (e) {
                return {ok: false, error: String((e && e.message) || e)};
              }
            }""",
            arg=payload,
            timeout=timeout,
        )
        boxed = handle.json_value()
    except Exception as e:
        raise TimeoutError(f"evaluate timed out or failed: {e}") from e
    finally:
        timer.cancel()
    if not boxed or not boxed.get("ok"):
        raise RuntimeError((boxed or {}).get("error") or "evaluate failed")
    return boxed.get("result")


def js_click(page, sel):
    # Schedule the click on the next turn so evaluate cannot hang inside a Svelte flush.
    ok = ev(
        page,
        """(sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          setTimeout(() => el.click(), 0);
          return true;
        }""",
        sel,
    )
    page.wait_for_timeout(250)
    return ok


def vis_state(page, *sels):
    return ev(
        page,
        """(sels) => {
          const vis = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
          const out = {};
          for (const s of sels) {
            const el = document.querySelector(s);
            out[s] = {count: document.querySelectorAll(s).length, visible: vis(el), text: el ? (el.innerText || el.textContent || '').slice(0, 200) : ''};
          }
          return out;
        }""",
        list(sels),
    )


def wait_ready(page, timeout=120000):
    page.wait_for_selector('[data-te-tutor="ask"]', timeout=timeout)
    page.wait_for_function(
        """() => document.documentElement.getAttribute("data-te-hydrated") === "1" || !!document.getElementById("svelte-announcer")""",
        timeout=timeout,
    )
    page.wait_for_timeout(200)


def install_routes(page):
    page.route("**/model-v2/**", lambda route: route.abort())
    page.route("**/*fonts.googleapis.com/**", lambda route: route.abort())
    page.route("**/*fonts.gstatic.com/**", lambda route: route.abort())
    page.route("**/*.wasm", lambda route: route.abort())


def arm_page(page):
    install_routes(page)
    page.add_init_script(
        """
        try {
          localStorage.setItem('te-locale', 'zh-CN');
          localStorage.removeItem('te-sampling-unlocked');
          localStorage.removeItem('te-text-path-done');
          localStorage.removeItem('te-image-knobs-unlocked');
          localStorage.removeItem('te-music-knobs-unlocked');
          sessionStorage.removeItem('te-tutor-qa');
        } catch (e) {}
        """
    )
    page.set_default_timeout(15000)


def goto_home(page, course_hash=""):
    print("GOTO", BASE + course_hash, flush=True)
    page.goto(BASE + course_hash, wait_until="domcontentloaded", timeout=60000)
    wait_ready(page)
    print("READY", flush=True)


def close_overlays(page):
    ev(
        page,
        """() => {
          const sels = [
            '[data-te-tutor="settings-close"]',
            '[data-te-tutor="ask-close"]',
            '[data-te-contrast="dismiss"]',
            '[data-te-contrast="close"]',
            '[data-te-contrast="skip"]',
          ];
          for (const s of sels) {
            const el = document.querySelector(s);
            if (el) setTimeout(() => el.click(), 0);
          }
          return true;
        }""",
    )
    page.wait_for_timeout(250)


def text_of(page, sel):
    return ev(page, """(s) => { const el = document.querySelector(s); return el ? (el.innerText || el.textContent || '') : ''; }""", sel)


def wait_answer(page, pred, seconds=15):
    deadline = time.time() + seconds
    answer = ""
    while time.time() < deadline:
        try:
            answer = text_of(page, '[data-te-tutor="transcript"]')
        except Exception as e:
            print("WAIT-ANSWER ev failed", e, flush=True)
            break
        if pred(answer or ""):
            break
        page.wait_for_timeout(300)
    return answer or ""


def fill_ask(page, text):
    print("FILL-ASK", text[:40], flush=True)
    page.locator('[data-te-tutor="ask-input"]').fill(text, timeout=8000)
    page.wait_for_timeout(150)


def main():
    SHOT.mkdir(parents=True, exist_ok=True)

    try:
        st, health = api("/health")
        rec("api-health", st == 200 and health.get("ok") is True, str(health))
    except Exception as e:
        rec("api-health", False, str(e))

    try:
        st, settings = api("/settings")
        rec(
            "settings-open-api",
            st == 200 and "configured" in settings and "keyLast4" in settings,
            f"configured={settings.get('configured')} last4={settings.get('keyLast4')!r}",
        )
        rec("settings-no-full-key", "apiKey" not in settings and "Authorization" not in json.dumps(settings), "")
    except Exception as e:
        rec("settings-open-api", False, str(e))
        rec("settings-no-full-key", False, str(e))

    try:
        st, after = api("/settings", "POST", {"apiKey": "test-key-xxxx1234", "platform": "custom", "baseUrl": "http://127.0.0.1:8799/v1", "model": "MiniMax-M3.1-Flash", "reasoningEffort": "medium"})
        rec("settings-save-last4", st == 200 and after.get("configured") is True and after.get("keyLast4") == "1234" and "test-key" not in json.dumps(after), json.dumps(after))
    except Exception as e:
        rec("settings-save-last4", False, str(e))

    try:
        api("/settings", "POST", {"clearKey": True})
    except Exception as e:
        rec("settings-clear-prep", False, str(e))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-proxy-server", "--proxy-bypass-list=*"])
        context = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")

        def new_page():
            page = context.new_page()
            arm_page(page)
            return page

        page = new_page()

        # 01 first screen
        try:
            goto_home(page)
            stt = vis_state(page, '[data-te-tutor="ask"]', '[data-te-tutor="settings"]', '[data-te-locale="toggle"]', '[data-te-math="card"]', '[data-te-sampling="locked"]', '.temperature-input input')
            ask_vis = stt['[data-te-tutor="ask"]']['visible']
            set_vis = stt['[data-te-tutor="settings"]']['visible']
            locale_vis = stt['[data-te-locale="toggle"]']['visible']
            math_cards = stt['[data-te-math="card"]']['count']
            rec("first-screen-entries", ask_vis and set_vis and locale_vis, f"ask={ask_vis} settings={set_vis} locale={locale_vis}")
            rec("first-screen-no-formula-wall", math_cards == 0, f"math_cards={math_cards}")
            if ev(page, """() => !!document.querySelector('[data-te-sampling="show"]')"""):
                js_click(page, '[data-te-sampling="show"]')
                page.wait_for_timeout(300)
            locked_hint = ev(page, """() => document.querySelectorAll('[data-te-sampling="locked"]').length > 0 || document.querySelectorAll('.temperature-input input').length === 0""")
            rec("early-knobs-locked", bool(locked_hint), f"hint_or_hidden={locked_hint}")
            shot(page, "01-text-first-screen.png")
        except Exception:
            rec("first-screen-entries", False, traceback.format_exc())
            rec("first-screen-no-formula-wall", False, "")
            rec("early-knobs-locked", False, "")
            try:
                shot(page, "01-text-first-screen.png")
            except Exception:
                pass

        # 03 ask without key leads to settings
        try:
            print("ASK-NO-KEY start", flush=True)
            close_overlays(page)
            print("ASK-NO-KEY click", flush=True)
            js_click(page, '[data-te-tutor="ask"]')
            print("ASK-NO-KEY clicked", flush=True)
            page.wait_for_timeout(600)
            stt = vis_state(page, '[data-te-tutor="settings-panel"]', '[data-te-tutor="need-key"]', '[data-te-tutor="ask-panel"]')
            print("ASK-NO-KEY state", stt, flush=True)
            settings_open = stt['[data-te-tutor="settings-panel"]']['visible']
            need_key = stt['[data-te-tutor="need-key"]']['count'] > 0
            rec("ask-without-key-leads-to-settings", settings_open or need_key, f"settings={settings_open} needKey={need_key}")
            shot(page, "03-ask-without-key.png")
            if not settings_open:
                js_click(page, '[data-te-tutor="settings"]')
                page.wait_for_function("""() => !!document.querySelector('[data-te-tutor="settings-panel"]')""", timeout=8000)
            panel_text = text_of(page, '[data-te-tutor="settings-panel"]')
            rec("settings-ui-no-full-key", "test-key-xxxx1234" not in panel_text and "Bearer " not in panel_text, "")
            privacy = "不会发送 API key" in panel_text or "never the API key" in panel_text
            rec("settings-privacy-copy", privacy, "")
            shot(page, "02-settings.png")
            close_overlays(page)
        except Exception:
            rec("ask-without-key-leads-to-settings", False, traceback.format_exc())
            rec("settings-ui-no-full-key", False, "")
            rec("settings-privacy-copy", False, "")
            try:
                shot(page, "03-ask-without-key.png")
                shot(page, "02-settings.png")
            except Exception:
                pass

        # Restore mock key
        try:
            st, after = api("/settings", "POST", {"apiKey": "test-key-xxxx1234", "platform": "custom", "baseUrl": "http://127.0.0.1:8799/v1"})
            rec("restore-mock-key", after.get("keyLast4") == "1234" and after.get("configured"), after.get("keyLast4"))
        except Exception as e:
            rec("restore-mock-key", False, str(e))

        # Fresh page so a wedged renderer cannot poison later checks
        try:
            page.close()
        except Exception:
            pass
        page = new_page()

        try:
            goto_home(page)
            print("ASK-PROB home", flush=True)
            # Do not click 生成下一个词 here: with the ONNX/wasm routes aborted
            # that click can stall the page. Cached first-screen numbers are enough.
            close_overlays(page)
            print("ASK-PROB click ask", flush=True)
            js_click(page, '[data-te-tutor="ask"]')
            print("ASK-PROB ask clicked", flush=True)
            page.wait_for_function("""() => !!document.querySelector('[data-te-tutor="ask-panel"]')""", timeout=8000)
            print("ASK-PROB panel", flush=True)
            print("ASK-PROB vis start", flush=True)
            stt = vis_state(page, '[data-te-tutor="settings-panel"]')
            print("ASK-PROB vis", stt, flush=True)
            if stt['[data-te-tutor="settings-panel"]']['visible']:
                print("ASK-PROB close settings", flush=True)
                js_click(page, '[data-te-tutor="settings-close"]')
            print("ASK-PROB click q-table", flush=True)
            js_click(page, '[data-te-tutor="q-table"]')
            print("ASK-PROB waiting answer", flush=True)
            answer = wait_answer(page, lambda a: ("右边" in a or "表" in a))
            print("ASK-PROB answer", (answer or "")[:200], flush=True)
            rec("ask-prob-points-at-table", ("右边" in answer or "表" in answer) and ("%" in answer or "百分比" in answer or "候选" in answer or "generate" in answer or "关" in answer), answer[:240])
            shot(page, "04-ask-prob.png")

            coach = ev(page, """() => {
              const coach = document.querySelector('[data-te-coach]');
              const panel = document.querySelector('[data-te-tutor="ask-panel"]');
              const yielded = !!(coach && coach.getAttribute('data-te-coach') === 'yield');
              let overlap_ok = true;
              if (coach && panel) {
                const c = coach.getBoundingClientRect();
                const a = panel.getBoundingClientRect();
                const ix = Math.max(0, Math.min(c.right, a.right) - Math.max(c.left, a.left));
                const iy = Math.max(0, Math.min(c.bottom, a.bottom) - Math.max(c.top, a.top));
                overlap_ok = (ix * iy) < 8000;
              }
              return {yielded, overlap_ok};
            }""")
            rec("ask-and-coach-yield", bool(coach.get("yielded")) and bool(coach.get("overlap_ok")), f"yield={coach.get('yielded')} overlap_ok={coach.get('overlap_ok')}")
            shot(page, "06-ask-and-coach.png")
            hi = ev(page, """() => ({
              hl: document.querySelectorAll('[data-te-tutor-hl], .te-tutor-flash, [data-te-flash]').length,
              math: document.querySelectorAll('[data-te-math="card"], [data-te-math-walk], .math-walk').length,
              hint: !!(document.querySelector('[data-te-tutor="next-hint"]'))
            })""")
            rec("ask-highlight-or-math-or-hint", bool(hi.get("hl") or hi.get("math") or hi.get("hint")), str(hi))
            shot(page, "12-highlight-or-math.png")
        except Exception:
            rec("ask-prob-points-at-table", False, traceback.format_exc())
            rec("ask-and-coach-yield", False, "")
            try:
                shot(page, "04-ask-prob.png")
                shot(page, "06-ask-and-coach.png")
            except Exception:
                pass

        # 05 early temperature on a fresh load of the first station
        try:
            close_overlays(page)
            try:
                page.close()
            except Exception:
                pass
            page = new_page()
            goto_home(page)
            js_click(page, '[data-te-tutor="ask"]')
            page.wait_for_function("""() => !!document.querySelector('[data-te-tutor="ask-panel"]')""", timeout=8000)
            if vis_state(page, '[data-te-tutor="settings-panel"]')['[data-te-tutor="settings-panel"]']['visible']:
                js_click(page, '[data-te-tutor="settings-close"]')
            print("ASK-TEMP fill", flush=True)
            fill_ask(page, '温度是什么？怎么用 softmax 算？')
            js_click(page, '[data-te-tutor="ask-send"]')
            print("ASK-TEMP waiting", flush=True)
            answer = wait_answer(page, lambda a: ("温度" in a or "锁" in a or "旋钮" in a))
            print("ASK-TEMP answer", (answer or "")[:200], flush=True)
            dumped = bool(re.search(r"e\^|exp\(|交叉熵|Σ|除以总和", answer))
            redirects = any(w in answer for w in ("锁", "先看", "推进一步", "当前", "抽出一个词", "旋钮"))
            rec("ask-early-temp-no-formula-dump", (not dumped) and redirects, answer[:300])
            shot(page, "05-ask-early-temp.png")
            close_overlays(page)
        except Exception:
            rec("ask-early-temp-no-formula-dump", False, traceback.format_exc())
            try:
                shot(page, "05-ask-early-temp.png")
            except Exception:
                pass

        # 07 learning map
        try:
            js_click(page, '[data-te-tutor="map"]')
            page.wait_for_function("""() => !!document.querySelector('[data-te-tutor="map-panel"]')""", timeout=5000)
            text = text_of(page, '[data-te-tutor="map-panel"]')
            here = ev(page, """() => document.querySelectorAll('[data-te-tutor-station].here, button.here[data-te-tutor-station]').length > 0""")
            rec("learning-map-current-station", (("猜出一个词" in text or "generate" in text.lower()) and here) or ("文字" in text), f"here={here}")
            shot(page, "07-learning-map.png")
            js_click(page, '[data-te-tutor="map"]')
        except Exception:
            rec("learning-map-current-station", False, traceback.format_exc())
            try:
                shot(page, "07-learning-map.png")
            except Exception:
                pass

        # ask-anywhere ?
        try:
            try:
                page.close()
            except Exception:
                pass
            page = new_page()
            goto_home(page)
            page.wait_for_timeout(1000)
            nspots = ev(page, """() => document.querySelectorAll('[data-te-tutor="ask-spot"]').length""")
            rec("ask-anywhere-spots", nspots > 0, f"count={nspots}")
            shot(page, "11-ask-anywhere.png")
            if nspots:
                js_click(page, '[data-te-tutor="ask-spot"]')
                page.wait_for_timeout(400)
                rec("ask-anywhere-opens-panel", ev(page, """() => document.querySelectorAll('[data-te-tutor="ask-panel"]').length > 0""") > 0, "")
                shot(page, "11b-ask-anywhere-open.png")
            else:
                rec("ask-anywhere-opens-panel", False, "no spots")
            close_overlays(page)
        except Exception:
            rec("ask-anywhere-spots", False, traceback.format_exc())
            rec("ask-anywhere-opens-panel", False, "")

        # 08 fine-tune course
        try:
            js_click(page, '[data-te-course="finetune"]')
            page.wait_for_timeout(1200)
            close_overlays(page)
            clean = ev(page, """() => {
              const body = (document.body.innerText || '').slice(0, 1500);
              return body.indexOf('QLoRA') < 0 || document.querySelectorAll('[data-te-ft="first-line"], .ft-first-line').length > 0;
            }""")
            js_click(page, '[data-te-tutor="ask"]')
            page.wait_for_function("""() => !!document.querySelector('[data-te-tutor="ask-panel"]')""", timeout=8000)
            if vis_state(page, '[data-te-tutor="settings-panel"]')['[data-te-tutor="settings-panel"]']['visible']:
                js_click(page, '[data-te-tutor="settings-close"]')
            print("FT click q-what", flush=True)
            js_click(page, '[data-te-tutor="q-what"]')
            answer = wait_answer(page, lambda a: ("微调" in a or "权重" in a or "温度" in a))
            print("FT answer", (answer or "")[:200], flush=True)
            rec("finetune-askable", "微调" in answer or "权重" in answer or "温度" in answer, answer[:240])
            rec("finetune-station1-clean", bool(clean), "")
            shot(page, "08-finetune-ask.png")
            close_overlays(page)
        except Exception:
            rec("finetune-askable", False, traceback.format_exc())
            rec("finetune-station1-clean", False, "")
            try:
                shot(page, "08-finetune-ask.png")
            except Exception:
                pass

        # 09 image course
        try:
            js_click(page, '[data-te-course="image"]')
            page.wait_for_timeout(1200)
            close_overlays(page)
            js_click(page, '[data-te-tutor="ask"]')
            page.wait_for_function("""() => !!document.querySelector('[data-te-tutor="ask-panel"]')""", timeout=8000)
            if vis_state(page, '[data-te-tutor="settings-panel"]')['[data-te-tutor="settings-panel"]']['visible']:
                js_click(page, '[data-te-tutor="settings-close"]')
            print("IMG click q-what", flush=True)
            js_click(page, '[data-te-tutor="q-what"]')
            answer = wait_answer(page, lambda a: ("图" in a or "去噪" in a or "画布" in a))
            print("IMG answer", (answer or "")[:200], flush=True)
            rec("image-askable", "图" in answer or "去噪" in answer or "画布" in answer, answer[:240])
            shot(page, "09-image-ask.png")
            close_overlays(page)
        except Exception:
            rec("image-askable", False, traceback.format_exc())
            try:
                shot(page, "09-image-ask.png")
            except Exception:
                pass

        # 10 locale EN on a fresh text page
        try:
            try:
                page.close()
            except Exception:
                pass
            page = new_page()
            goto_home(page)
            js_click(page, '[data-te-locale="toggle"]')
            page.wait_for_function(
                """() => (document.querySelector('[data-te-tutor="ask"]')?.textContent || '').includes('Ask')""",
                timeout=8000,
            )
            ask_txt = text_of(page, '[data-te-tutor="ask"]')
            set_txt = text_of(page, '[data-te-tutor="settings"]')
            rec("locale-en-toggle", "Ask" in ask_txt and "Settings" in set_txt, f"ask={ask_txt!r} settings={set_txt!r}")
            shot(page, "10-locale-en.png")
            js_click(page, '[data-te-locale="toggle"]')
        except Exception:
            rec("locale-en-toggle", False, traceback.format_exc())
            try:
                shot(page, "10-locale-en.png")
            except Exception:
                pass

        # main button still 推进一步
        try:
            goto_home(page)
            texts = ev(page, """() => Array.from(document.querySelectorAll('[data-te-path="push-step"], [data-te-path="coach-next"]')).slice(0,3).map(el => el.innerText || '')""")
            rec("main-button-still-push", any("推进一步" in t for t in (texts or [])), str(texts))
        except Exception:
            rec("main-button-still-push", False, traceback.format_exc())

        try:
            context.close()
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass

    REPORT.write_text(json.dumps({"results": results, "passed": sum(1 for r in results if r["ok"]), "failed": sum(1 for r in results if not r["ok"])}, ensure_ascii=False, indent=2), encoding="utf-8")
    passed = sum(1 for r in results if r["ok"])
    failed = sum(1 for r in results if not r["ok"])
    print(f"TOTAL passed={passed} failed={failed}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
