#!/usr/bin/env python3
"""dbus_drop.py — Icefin keeps running when the sandbox's D-Bus proxy goes away. Lab only, against a Flatpak.

Qt WebEngine's Chromium aborted the whole app ("D-Bus connection was disconnected. Aborting.", SIGTRAP and a core
dump) when one of its D-Bus connections dropped; in the Flatpak that is the sandbox's connection to the Flatpak portal,
which goes through xdg-dbus-proxy. A logout signals the app's whole scope at once, so the proxy often went first.
src/icefin/system/DBusGuard.cpp passes that signal over. This starts the Flatpak on a private session bus, kills its
xdg-dbus-proxy, and checks:
  - the app is still running 8 s later and its page still answers DevTools;
  - the page can still reload (Chromium's processes still work);
  - the log has the guard's line and no FATAL from dbus/bus.cc;
  - the app then quits on SIGTERM without a core dump (exit by SIGTERM or 0, not SIGTRAP).
On a build without the guard the first check fails (the app aborts).
Usage: python3 dbus_drop.py --app flatpak:io.github.stealthx3.IcefinPlayer//dbus --out ~/rdd
"""
import argparse, os, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_play import launch, start_x  # noqa: E402
from cdp import Page  # noqa: E402


def proxies():
    out = subprocess.run(["pgrep", "-x", "xdg-dbus-proxy"], capture_output=True, text=True).stdout.split()
    return {int(p) for p in out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True, help="flatpak:<app id>[//branch] (the guard matters only in the sandbox)")
    ap.add_argument("--port", type=int, default=9271)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    fails = []

    def check(label, ok, detail=""):
        print(f"dbus_drop: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    xv = start_x()
    before = proxies()
    logp = os.path.join(a.out, "app.log")
    log = open(logp, "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-dd-"), log, "xcb")
    try:
        page = Page(a.port, timeout=120)
        page.wait_for("document.readyState === 'complete' && !!document.body", timeout=90)
        time.sleep(4)  # Chromium's sandbox has spawned its zygote through the portal by now
        ours = proxies() - before
        check("the sandbox has an xdg-dbus-proxy to cut", bool(ours), str(sorted(ours)))
        for p in ours:
            try:
                os.kill(p, signal.SIGKILL)
            except ProcessLookupError:
                pass
        time.sleep(8)
        check("the app is still running after its D-Bus proxy went away", app.poll() is None, f"exit {app.poll()}")
        try:
            page.reconnect(timeout=10)
            check("its page still answers", page.eval("1 + 1") == 2)
            page.eval("window.__beforeReload = 1; location.reload(); true", await_promise=False)
            time.sleep(3)
            page.reconnect(timeout=20)
            page.wait_for("document.readyState === 'complete' && typeof window.__beforeReload === 'undefined'", timeout=30)
            check("the page reloads (Chromium's processes still work)", True)
        except Exception as e:  # noqa: BLE001
            check("its page still answers and reloads", False, f"{type(e).__name__}: {e}")
        text = open(logp, errors="replace").read()
        check("no FATAL from Chromium's dbus/bus.cc", "D-Bus connection was disconnected. Aborting" not in text)
        check("the guard logged the lost connection", "Qt WebEngine D-Bus connection was lost" in text)
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        rc = None
        if app.poll() is None:
            # quit like a logout does: SIGTERM to everything in the app's session
            try:
                os.killpg(app.pid, signal.SIGTERM)
                rc = app.wait(20)
            except Exception:  # noqa: BLE001
                pass
        else:
            rc = app.poll()
        log.close()
        if xv:
            xv.terminate()
    text = open(logp, errors="replace").read()
    check("it quits on SIGTERM without aborting", "Aborting" not in text and rc != -signal.SIGTRAP, f"exit {rc}")
    print("dbus_drop:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
