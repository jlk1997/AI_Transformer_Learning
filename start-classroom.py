# -*- coding: utf-8 -*-
"""蚁算Transformer 启动帮手 — portable local classroom starter.

Beginners can double-click 启动帮手.bat (or start-classroom.cmd) in the
project folder. This script finds Python and Node on PATH or in common
install locations, starts or detects the local teaching service and the
classroom UI, and prints beginner-friendly status.

Never posts /train/start. Never uses --reload.
Printed messages never include machine-specific absolute paths.
"""
from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LAB = ROOT / "finetune-lab"
HOST = "127.0.0.1"
FRONT_PORT = 5173
TEACH_PORT = 8787
FRONT_URL = f"http://{HOST}:{FRONT_PORT}"
TEACH_HEALTH = f"http://{HOST}:{TEACH_PORT}/health"
VITE_JS = ROOT / "node_modules" / "vite" / "bin" / "vite.js"

CREATE_NEW_CONSOLE = 0x00000010
CREATE_NEW_PROCESS_GROUP = 0x00000200
DETACHED_PROCESS = 0x00000008
CREATE_BREAKAWAY_FROM_JOB = 0x01000000


def configure_stdio() -> None:
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.environ.setdefault("NO_PROXY", "*")
    os.environ.setdefault("no_proxy", "*")
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
            ctypes.windll.kernel32.SetConsoleCP(65001)
        except Exception:
            pass
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def say(zh: str, en: str = "") -> None:
    print(zh)
    if en:
        print(en)


def port_in_use(port: int) -> bool:
    try:
        with socket.create_connection((HOST, port), timeout=0.6):
            return True
    except OSError:
        return False


def http_ok(url: str, timeout: float = 4.0) -> bool:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(url, timeout=timeout) as resp:
            return 200 <= int(resp.status) < 400
    except Exception:
        return False


def run_capture(args: list[str], timeout: float = 8.0) -> str:
    try:
        r = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        if r.returncode == 0:
            return (r.stdout or "").strip()
    except Exception:
        return ""
    return ""


def python_version(exe_args: list[str]) -> tuple[int, int] | None:
    out = run_capture(exe_args + ["-c", "import sys; print(sys.version_info[0], sys.version_info[1])"])
    if not out:
        return None
    try:
        parts = out.split()
        return int(parts[0]), int(parts[1])
    except Exception:
        return None


def python_executable(exe_args: list[str]) -> str:
    out = run_capture(exe_args + ["-c", "import sys; print(sys.executable)"])
    return out


def iter_python_candidates() -> list[list[str]]:
    seen: set[str] = set()
    found: list[list[str]] = []

    def add(args: list[str]) -> None:
        key = " ".join(args).lower()
        if key in seen:
            return
        if len(args) == 1 and not Path(args[0]).exists() and shutil.which(args[0]) is None:
            return
        seen.add(key)
        found.append(args)

    for launcher in ("py", "py.exe"):
        if shutil.which(launcher):
            for tag in ("-3.13", "-3.12", "-3.11", "-3"):
                add([launcher, tag])

    for name in ("python", "python3", "python3.13", "python3.12", "python3.11"):
        path = shutil.which(name)
        if path:
            add([path])

    roots: list[Path] = []
    for key in ("LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"):
        val = os.environ.get(key)
        if val:
            roots.append(Path(val) / "Programs" / "Python")
            roots.append(Path(val) / "Python")
    home = Path.home()
    roots.extend(
        [
            home / "AppData" / "Local" / "Programs" / "Python",
            home / "anaconda3",
            home / "miniconda3",
            home / "miniforge3",
            ROOT / ".venv",
            LAB / ".venv",
            ROOT.parent / "Python",
        ]
    )
    for root in roots:
        if not root.exists():
            continue
        for exe in (
            list(root.glob("Python3*/python.exe"))
            + list(root.glob("python.exe"))
            + list(root.glob("Scripts/python.exe"))
            + list(root.glob("bin/python"))
            + list(root.glob("bin/python3"))
        ):
            if exe.is_file():
                add([str(exe)])

    # Silent last-resort guesses, after PATH and common locations. Never printed.
    for exe in (
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Python" / "Python311" / "python.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Python" / "Python312" / "python.exe",
        Path(r"D:\Python311\python.exe"),
        Path(r"D:\Python312\python.exe"),
        Path("/usr/bin/python3"),
        Path("/usr/local/bin/python3"),
    ):
        if exe.is_file():
            add([str(exe)])
    return found


def python_has_module(exe_args: list[str], name: str) -> bool:
    out = run_capture(exe_args + ["-c", f"import {name}; print('ok')"], timeout=20.0)
    return out.strip().splitlines()[-1].strip() == "ok" if out.strip() else False


def find_python() -> tuple[list[str] | None, tuple[int, int] | None]:
    """Prefer 3.11+ interpreters that can already run the teaching service."""
    best_old: tuple[list[str], tuple[int, int]] | None = None
    scored: list[tuple[int, list[str], tuple[int, int]]] = []
    for args in iter_python_candidates():
        ver = python_version(args)
        if not ver:
            continue
        exe = python_executable(args)
        cmd = [exe] if exe else args
        if ver < (3, 11):
            if best_old is None or ver > best_old[1]:
                best_old = (cmd, ver)
            continue
        score = 0
        if python_has_module(cmd, "uvicorn"):
            score += 100
        if ver[0] == 3 and ver[1] == 11:
            score += 10
        score += min(ver[1], 20)
        scored.append((score, cmd, ver))
    if scored:
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[0][1], scored[0][2]
    if best_old:
        return best_old
    return None, None


def iter_node_candidates() -> list[str]:
    seen: set[str] = set()
    found: list[str] = []

    def add(path: str) -> None:
        if not path:
            return
        resolved = str(Path(path))
        key = resolved.lower()
        if key in seen:
            return
        p = Path(path)
        if not p.is_file() and shutil.which(path) is None:
            return
        seen.add(key)
        found.append(resolved if p.is_file() else (shutil.which(path) or path))

    for name in ("node", "node.exe"):
        path = shutil.which(name)
        if path:
            add(path)

    roots = []
    for key in ("ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "LOCALAPPDATA"):
        val = os.environ.get(key)
        if val:
            roots.append(Path(val) / "nodejs")
            roots.append(Path(val) / "Programs" / "nodejs")
    roots.extend(
        [
            Path.home() / "nodejs",
            Path.home() / "AppData" / "Local" / "Programs" / "nodejs",
            ROOT / "node",
            ROOT / "nodejs",
            ROOT.parent / "nodejs",
            ROOT.parent / "node",
        ]
    )
    nvm = os.environ.get("NVM_HOME") or os.environ.get("NVM_SYMLINK")
    if nvm:
        roots.append(Path(nvm))
    for root in roots:
        exe = root / "node.exe" if sys.platform == "win32" else root / "bin" / "node"
        if exe.is_file():
            add(str(exe))
        elif root.is_file() and root.name.lower().startswith("node"):
            add(str(root))

    # Silent last-resort guesses, after PATH and common locations. Never printed.
    for exe in (Path(r"D:\nodejs\node.exe"), Path("/usr/bin/node"), Path("/usr/local/bin/node")):
        if exe.is_file():
            add(str(exe))
    return found


def find_node() -> str | None:
    for path in iter_node_candidates():
        out = run_capture([path, "-v"])
        if out.startswith("v"):
            return path
    return None


def spawn(cmd: list[str], cwd: Path, title: str) -> subprocess.Popen:
    """Start a service without letting it inherit the helper's stdio pipes.

    If a parent captures the helper's output, an inherited pipe would keep that
    parent waiting until the service itself exits.
    """
    kwargs: dict = {
        "cwd": str(cwd),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = (
            CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS | CREATE_BREAKAWAY_FROM_JOB
        )
        kwargs["env"] = os.environ.copy()
        return subprocess.Popen(cmd, **kwargs)
    kwargs["start_new_session"] = True
    return subprocess.Popen(cmd, **kwargs)


def wait_until(pred, timeout_s: float, interval: float = 0.4) -> bool:
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < timeout_s:
        if pred():
            return True
        time.sleep(interval)
    return bool(pred())


def ensure_teaching_service(py_cmd: list[str] | None) -> str:
    if port_in_use(TEACH_PORT) or http_ok(TEACH_HEALTH):
        return "already"
    if not py_cmd:
        return "missing-python"
    if not LAB.is_dir() or not (LAB / "server.py").is_file():
        return "missing-lab"
    cmd = py_cmd + ["-m", "uvicorn", "server:app", "--host", HOST, "--port", str(TEACH_PORT)]
    try:
        spawn(cmd, LAB, "蚁算Transformer 本机教学服务")
    except Exception:
        return "start-failed"
    if wait_until(lambda: port_in_use(TEACH_PORT) or http_ok(TEACH_HEALTH), 90.0):
        return "started"
    return "start-failed"


def ensure_frontend(node: str | None) -> str:
    if port_in_use(FRONT_PORT) or http_ok(FRONT_URL):
        return "already"
    if not node:
        return "missing-node"
    if not VITE_JS.is_file():
        return "missing-deps"
    cmd = [node, str(VITE_JS), "dev", "--host", HOST, "--port", str(FRONT_PORT)]
    try:
        spawn(cmd, ROOT, "蚁算Transformer 课堂画面")
    except Exception:
        return "start-failed"
    if wait_until(lambda: port_in_use(FRONT_PORT) or http_ok(FRONT_URL), 60.0):
        return "started"
    return "start-failed"


def status_line(kind: str, result: str, zh_name: str, en_name: str) -> tuple[str, str]:
    mapping = {
        "already": (f"{zh_name}：已经在运行。", f"{en_name}: already running."),
        "started": (f"{zh_name}：已启动。", f"{en_name}: started."),
        "missing-python": (
            "还没有找到 Python（需要 3.11 或更高版本）。本机教学服务需要它才能启动。请先安装 Python 3.11 或更高版本，安装时勾选添加到 PATH，然后再双击「启动帮手」。",
            "Python 3.11 or newer was not found. Install it, add it to PATH, then double-click the start helper again.",
        ),
        "missing-node": (
            "还没有找到 Node.js。课堂画面需要它才能在浏览器里打开。请先安装 Node.js（20 或更高版本），然后再双击「启动帮手」。",
            "Node.js was not found. Install Node.js 20 or newer, then double-click the start helper again.",
        ),
        "missing-deps": (
            "课堂画面的依赖还没装好。请先安装 Node.js，再请会安装的人在项目文件夹里运行一次 npm install。启动帮手不会替你做复杂安装。",
            "Classroom files are not installed yet. After Node.js is installed, someone who can help should run npm install once in the project folder.",
        ),
        "missing-lab": (
            "没有找到本机教学服务所在的文件夹。请确认你是在完整的项目文件夹里双击「启动帮手」。",
            "The local teaching-service folder was not found. Double-click the start helper inside the complete project folder.",
        ),
        "start-failed": (
            f"{zh_name}没能启动。如果刚才已经打开过，请先关掉旧窗口后再试一次。若仍不行，请确认相关软件已经安装好。",
            f"{en_name} could not start. If an old window is already open, close it and try again.",
        ),
        "too-old": (
            "找到了 Python，但版本低于 3.11。请安装 Python 3.11 或更高版本，然后再双击「启动帮手」。",
            "Python was found, but it is older than 3.11. Install Python 3.11 or newer, then try the start helper again.",
        ),
    }
    return mapping.get(result, (f"{zh_name}：{result}", f"{en_name}: {result}"))


def main(argv: list[str] | None = None) -> int:
    configure_stdio()
    parser = argparse.ArgumentParser(description="Start or detect the local 蚁算Transformer classroom.")
    parser.add_argument("--no-pause", action="store_true", help="Do not wait for Enter at the end.")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window.")
    args = parser.parse_args(argv)

    print("蚁算Transformer 启动帮手")
    print("========================")
    print()
    say("正在检查本机课堂…", "Checking the local classroom…")
    print()

    teach_up = port_in_use(TEACH_PORT) or http_ok(TEACH_HEALTH)
    front_up = port_in_use(FRONT_PORT) or http_ok(FRONT_URL)
    py_cmd, py_ver = (None, None)
    node = None
    if teach_up:
        teach = "already"
    else:
        py_cmd, py_ver = find_python()
        too_old = bool(py_cmd and py_ver and py_ver < (3, 11))
        teach = "too-old" if too_old else ensure_teaching_service(py_cmd)
    if front_up:
        front = "already"
    else:
        node = find_node()
        front = ensure_frontend(node)

    zh_t, en_t = status_line("teach", teach, "本机教学服务", "Local teaching service")
    zh_f, en_f = status_line("front", front, "课堂画面", "Classroom")
    say(zh_t, en_t)
    say(zh_f, en_f)
    print()

    front_ok = front in {"already", "started"} or port_in_use(FRONT_PORT) or http_ok(FRONT_URL)
    teach_ok = teach in {"already", "started"} or port_in_use(TEACH_PORT) or http_ok(TEACH_HEALTH)

    if front_ok:
        say(
            f"请在浏览器中打开：{FRONT_URL}",
            f"Open this address in your browser: {FRONT_URL}",
        )
        if not args.no_browser:
            try:
                webbrowser.open(FRONT_URL)
            except Exception:
                pass
        say(
            "可以关掉这个窗口，课堂会继续运行。再双击「启动帮手」也是安全的，已经打开的服务不会再开一份。",
            "You can close this window; the classroom will keep running. It is safe to run the helper again — already running services are left alone.",
        )
    else:
        say(
            "课堂画面还没有打开。按上面的说明补齐之后，再双击一次「启动帮手」。",
            "The classroom is not open yet. Follow the notes above, then double-click the start helper again.",
        )

    print()
    if not args.no_pause:
        try:
            input("按回车键关闭这个窗口。" if sys.stdin and sys.stdin.isatty() else "")
        except Exception:
            pass

    if front_ok and teach_ok:
        return 0
    if front_ok or teach_ok:
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
