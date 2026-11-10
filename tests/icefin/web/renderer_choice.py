#!/usr/bin/env python3
"""renderer_choice.py — the renderer setting and the shared Vulkan device in the running app (PLAN 5.1).

Checks:
  1. Client Settings offers Renderer: Auto (default), Vulkan (experimental), OpenGL;
  2. Auto starts on OpenGL until the Vulkan video item exists (5.3), and says so in the log;
  3. with Vulkan chosen, after a restart: on a real GPU the UI runs on Vulkan on Icefin's shared device (its device
     extensions logged, swapchain among them); without a usable Vulkan GPU (the lab VM's software rasterizer) the
     app falls back to OpenGL with a warning. Either way the web client loads;
  4. OpenGL chosen: OpenGL, no probe.
Usage: python3 renderer_choice.py --app ~/build/src/icefin-player [--qpa xcb|session] [--expect vulkan|fallback]
  --app may be flatpak:<app-id>; --qpa session runs in the desktop session (host or HTPC tier).
"""
import argparse, json, os, re, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_play import launch, start_x  # noqa: E402
from cdp import Page  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--port", type=int, default=9237)
    ap.add_argument("--qpa", default="xcb")
    ap.add_argument("--expect", default="", help="vulkan or fallback; default: either")
    a = ap.parse_args()
    xv = start_x() if a.qpa != "session" else None
    cfgdir = tempfile.mkdtemp(prefix="icefin-renderer-")
    fails = []
    logs = []

    def check(label, ok, detail=""):
        print(f"renderer_choice: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def run(tag):
        path = os.path.join(cfgdir, f"app-{tag}.log")
        log = open(path, "w")
        app = launch(a.app, a.port, cfgdir, log, a.qpa)
        logs.append((app, log, path))
        page = Page(a.port, timeout=90)
        page.wait_for("!!window.api && !!window.api.settings", timeout=90)
        return page, path

    def stop():
        app, log, _ = logs[-1]
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        log.close()
        time.sleep(1.5)

    text = lambda p: open(p, errors="replace").read()
    try:
        page, path = run("auto")
        desc = page.eval("new Promise(r => window.api.settings.settingDescriptions(r))")
        main_s = next(s for s in desc if s.get("key") == "main")
        r = next((v for v in main_s["settings"] if v.get("key") == "icefin_renderer"), None)
        opts = [o.get("value") for o in (r or {}).get("options") or []]
        check("Renderer setting: Auto, Vulkan, OpenGL", opts == ["auto", "vulkan", "opengl"], f"options={opts}")
        check("default is Auto", page.eval("new Promise(r => window.api.settings.value('main', 'icefin_renderer', r))") == "auto")
        check("Auto starts on OpenGL until the parity checks (5.8)", "Icefin renderer: OpenGL (setting auto, Auto keeps OpenGL until the parity checks, 5.8)" in text(path))
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'vulkan', () => r(true)))")
        time.sleep(1)
        stop()

        page, path = run("vulkan")
        t = text(path)
        on_vk = "Icefin renderer: shared Vulkan device on" in t
        fell_back = "Icefin renderer: Vulkan chosen but not usable" in t
        m = re.search(r"Icefin renderer: shared Vulkan device on (.*)", t)
        detail = m.group(1)[:220] if m else (re.search(r"Icefin renderer: Vulkan chosen.*", t) or [""])[0][:160]
        check("Vulkan chosen: the shared device, or OpenGL with a warning", on_vk or fell_back, detail)
        if on_vk:
            check("shared device has the swapchain extension", "VK_KHR_swapchain" in t)
            page.wait_for("true", timeout=5)
            time.sleep(2)
            check("Qt Quick renders on the shared device", "Icefin renderer: Qt Quick renders on the shared Vulkan device" in text(path))
        if a.expect:
            check(f"expected {a.expect}", (a.expect == "vulkan" and on_vk) or (a.expect == "fallback" and fell_back))
        page.wait_for("!!window.ApiClient || !!document.getElementById('address')", timeout=60)
        check("the web client loads", True)
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'opengl', () => r(true)))")
        time.sleep(1)
        stop()

        page, path = run("opengl")
        t = text(path)
        check("OpenGL chosen: OpenGL, no probe", "Icefin renderer: OpenGL (setting opengl)" in t and "shared Vulkan device" not in t)
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'auto', () => r(true)))")
        time.sleep(1)
        stop()
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
        if logs:
            stop()
    finally:
        if xv:
            xv.terminate()
    print("renderer_choice:", "OK" if not fails else f"FAILED {fails}", "- logs:", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
