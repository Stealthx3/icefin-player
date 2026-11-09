#!/usr/bin/env python3
"""hdr_probe.py — HdrCapabilityProbe in the running app (PLAN 6.1). Lab guests only.

  1. Under headless KWin (Wayland, wp_color_manager_v1), the probe reads the output's image description: transfer
     function, primaries and luminances, with no error. The lab's virtual output is SDR (KWin reports it can't do HDR),
     so the expected answer is "no"; the HDR answer is checked on the HTPC (Plasma).
  2. Under X11 the state is "unknown", with the reason (Vulkan colour spaces arrive with the Vulkan renderer).
  3. The router uses it: an HDR10 source is tone-mapped on the SDR output.
Usage: python3 hdr_probe.py --app ~/build/src/icefin-player
"""
import argparse, json, os, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_play import start_x  # noqa: E402
from cdp import Page  # noqa: E402


def run(app, port, env, extra=()):
    cfg = tempfile.mkdtemp(prefix="icefin-hdr-")
    log = open(os.path.join(cfg, "app.log"), "w")
    p = subprocess.Popen([os.path.expanduser(app), f"--config-dir={cfg}", "--windowed", "--desktop", "--disable-gpu",
                          f"--remote-debugging-port={port}", "--log-level=info", *extra], env=env, stdout=log, stderr=subprocess.STDOUT,
                         start_new_session=True)
    try:
        page = Page(port, timeout=60)
        page.wait_for("!!window.api && !!window.api.router", timeout=60)
        page.wait_for("new Promise(r => window.api.router.display(d => r(d.source !== '')))", timeout=20)
        d = page.eval("new Promise(r => window.api.router.display(r))")
        route = page.eval("new Promise(r => window.api.router.decide('HDR10', r))")
        return d, route
    finally:
        os.killpg(p.pid, signal.SIGTERM)
        p.wait(15)
        log.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    a = ap.parse_args()
    fails = []

    def check(label, ok, detail=""):
        print(f"hdr_probe: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    rt = os.environ.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    kwin = subprocess.Popen(["dbus-run-session", "--", "kwin_wayland", "--virtual", "--no-lockscreen", "--socket", "wl-icefin-hdr",
                             "--width", "1920", "--height", "1080"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        time.sleep(4)
        env = dict(os.environ, WAYLAND_DISPLAY="wl-icefin-hdr", QT_QPA_PLATFORM="wayland", LC_ALL="C.UTF-8")
        env.pop("DISPLAY", None)
        d, route = run(a.app, 9243, env)
        check("Wayland: description read from the compositor", d["source"] == "wayland" and d["error"] == "" and d["transfer"] != "", json.dumps(d))
        check("Wayland: SDR virtual output reported as not HDR", d["hdr"] == "no")
        check("router: HDR10 on an SDR display is tone-mapped", route["output"] in ("tone-mapped SDR", "capability prompt"), route["reason"])
    except Exception as e:  # noqa: BLE001
        check("wayland run", False, f"{type(e).__name__}: {e}")
    finally:
        os.killpg(kwin.pid, signal.SIGTERM)
    xv = start_x()
    try:
        env = dict(os.environ, DISPLAY=":99", QT_QPA_PLATFORM="xcb", LC_ALL="C.UTF-8")
        d, _ = run(a.app, 9244, env)
        check("X11: unknown, with the reason", d["source"] == "x11" and d["hdr"] == "unknown" and "Vulkan" in d["error"], json.dumps(d))
    except Exception as e:  # noqa: BLE001
        check("x11 run", False, f"{type(e).__name__}: {e}")
    finally:
        if xv:
            xv.terminate()
    print("hdr_probe:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
