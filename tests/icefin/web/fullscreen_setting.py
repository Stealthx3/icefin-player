#!/usr/bin/env python3
"""fullscreen_setting.py — jmpInfo's main.fullscreen follows the window into and out of full screen. Lab only.

Upstream's WindowManager::onVisibilityChanged compared with m_previousVisibility, which never holds FullScreen, so the
in-memory main.fullscreen setting went true on entering full screen and stayed true after leaving it (and
fullScreenSwitched never fired on exit). It feeds mpvVideoPlayer.isFullscreen(), the players' fullscreenchange events
(inputPlugin.js) and MPRIS Fullscreen. Signed in, for two rounds of window.api.window.setFullScreen(true/false):
  - the window goes full screen and back (api.window.isFullScreen);
  - jmpInfo.settings.main.fullscreen goes true, then back to false;
  - the page hears both changes through jmpInfo.settingsUpdate (the path inputPlugin.js and nativeshell.js use).
Usage: python3 fullscreen_setting.py --app ~/build/src/icefin-player --server jf12
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

# Records every main.fullscreen value the page is told about.
LISTEN = r"""(() => { if (window.__fsSeen) return true; window.__fsSeen = [];
  window.jmpInfo.settingsUpdate.push((section, data) => { if (section === 'main' && 'fullscreen' in data) window.__fsSeen.push(data.fullscreen); });
  return true; })()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9281)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-fs-")
    app = launch(a.app, a.port, cfgdir, open(os.path.join(cfgdir, "app.log"), "w"), "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"fullscreen_setting: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.jmpInfo && !!window.jmpInfo.settings.main && Array.isArray(window.jmpInfo.settingsUpdate)", timeout=90)
        js = page.eval
        js(LISTEN)

        def state():
            return {"window": bool(js("new Promise(r => window.api.window.isFullScreen(r))")),
                    "setting": js("window.jmpInfo.settings.main.fullscreen")}

        def settle(want):
            s = {}
            for _ in range(20):
                time.sleep(0.5)
                s = state()
                if s["window"] == want and s["setting"] == want:
                    break
            return s

        s0 = state()
        check("start: windowed, main.fullscreen false", s0 == {"window": False, "setting": False}, json.dumps(s0))
        for rnd in (1, 2):
            js("window.api.window.setFullScreen(true); true")
            on = settle(True)
            check(f"round {rnd}: setFullScreen(true) -> window and main.fullscreen true", on == {"window": True, "setting": True}, json.dumps(on))
            js("window.api.window.setFullScreen(false); true")
            off = settle(False)
            check(f"round {rnd}: setFullScreen(false) -> window and main.fullscreen false", off == {"window": False, "setting": False}, json.dumps(off))
        seen = js("window.__fsSeen.slice()")
        check("page heard every change through jmpInfo.settingsUpdate", seen == [True, False, True, False], json.dumps(seen))
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            try:
                os.killpg(app.pid, signal.SIGKILL)
            except Exception:  # noqa: BLE001
                pass
        if xv:
            xv.terminate()
    print("fullscreen_setting:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
