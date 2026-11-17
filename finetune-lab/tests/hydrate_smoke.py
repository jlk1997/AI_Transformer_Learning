# -*- coding: utf-8 -*-
"""Hydrate regression smoke: first screen mounts without a Vite compile overlay.

Does not start a 4070 train. Does not clear ONNX cache. Does not require a tutor key.
Run:
  C:\\Users\\10552\\AppData\\Local\\Programs\\Python\\Python312\\python.exe finetune-lab\\tests\\hydrate_smoke.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

URL = "http://127.0.0.1:5173/"
TIMEOUT_S = 25.0
OUT_DIR = Path(r"C:\Users\10552\agent-tools\ft-ux-p1")


def _click(page, selector: str) -> None:
    # Never hang on locator.click; dispatch in a later turn and wait finitely.
    page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            setTimeout(() => el.click(), 0);
            return true;
        }""",
        selector,
    )


def wait_hydrate(page, timeout_s: float = TIMEOUT_S) -> dict:
    t0 = time.perf_counter()
    last = {}
    while time.perf_counter() - t0 < timeout_s:
        last = page.evaluate(
            """() => {
                const overlay = document.querySelector('vite-error-overlay');
                const courses = Array.from(document.querySelectorAll('[data-te-course]')).map((el) => ({
                    id: el.getAttribute('data-te-course'),
                    visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
                }));
                const app = document.querySelector('#app');
                return {
                    hydrated: document.documentElement.getAttribute('data-te-hydrated'),
                    hasApp: !!app,
                    appVisible: !!(app && (app.offsetWidth || app.offsetHeight || app.getClientRects().length)),
                    courses,
                    courseVisible: courses.some((c) => c.visible),
                    overlay: !!overlay,
                    overlayText: overlay ? (overlay.shadowRoot ? overlay.shadowRoot.textContent : overlay.textContent) : '',
                    title: document.title,
                    viteErrorText: (document.body && document.body.innerText || '').includes('plugin:vite-plugin-svelte')
                };
            }"""
        )
        if last.get("overlay") or last.get("viteErrorText"):
            break
        if last.get("hydrated") == "1" and last.get("hasApp") and last.get("courseVisible"):
            break
        time.sleep(0.2)
    last["elapsed_s"] = round(time.perf_counter() - t0, 3)
    last["ok"] = (
        last.get("hydrated") == "1"
        and bool(last.get("hasApp"))
        and bool(last.get("courseVisible"))
        and not last.get("overlay")
        and not last.get("viteErrorText")
    )
    return last


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed for this Python")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shots = OUT_DIR / "shots"
    shots.mkdir(exist_ok=True)

    result = {"url": URL, "started": time.strftime("%Y-%m-%d %H:%M:%S")}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        failed = []
        page.on("response", lambda r: failed.append({"url": r.url, "status": r.status}) if r.status >= 500 else None)
        page.goto(URL, wait_until="domcontentloaded", timeout=20000)
        info = wait_hydrate(page)
        result["hydrate"] = info
        result["pageerrors"] = errors
        result["failed500"] = failed[:20]
        # optional: course buttons exist for all four courses
        ids = [c.get("id") for c in info.get("courses") or []]
        result["courseIds"] = ids
        result["hasFourCourses"] = set(ids) >= {"text", "image", "music", "finetune"}
        page.screenshot(path=str(shots / "smoke-hydrate-1366.png"), full_page=False)
        # brief visit to image course to ensure the fixed bind compiles and paints
        if info.get("ok"):
            _click(page, '[data-te-course="image"]')
            t1 = time.perf_counter()
            image_ok = False
            image_info = {}
            while time.perf_counter() - t1 < 8:
                image_info = page.evaluate(
                    """() => {
                        const overlay = document.querySelector('vite-error-overlay');
                        const on = document.querySelector('[data-te-course="image"].on, [data-te-course="image"][class*="on"]');
                        const studio = document.querySelector('.image-studio, [data-te-image="canvas"]');
                        return {
                            overlay: !!overlay,
                            overlayText: overlay ? (overlay.shadowRoot ? overlay.shadowRoot.textContent : overlay.textContent) : '',
                            imageOn: !!on,
                            hasStudio: !!studio,
                            hydrated: document.documentElement.getAttribute('data-te-hydrated')
                        };
                    }"""
                )
                if image_info.get("overlay"):
                    break
                if image_info.get("hasStudio") and not image_info.get("overlay"):
                    image_ok = True
                    break
                time.sleep(0.2)
            image_info["elapsed_s"] = round(time.perf_counter() - t1, 3)
            image_info["ok"] = image_ok and not image_info.get("overlay")
            result["imageCourse"] = image_info
            page.screenshot(path=str(shots / "smoke-image-1366.png"), full_page=False)
        browser.close()

    result["ok"] = bool(result.get("hydrate", {}).get("ok")) and bool(result.get("hasFourCourses")) and bool(
        (result.get("imageCourse") or {}).get("ok", False) if "imageCourse" in result else True
    )
    out = OUT_DIR / "smoke.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("SMOKE", "PASS" if result["ok"] else "FAIL")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
