#!/usr/bin/env python3
"""theme_sync.py — per-user theme choice, the Client Settings picker and UI sounds (PLAN 8.5). Lab guests only.

Two app instances with separate profiles act as two devices of the same user:
  1. device A picks a theme: it is saved to the server's DisplayPreferences (client icefin-player, icefin.theme);
  2. device B, fresh, signs in and gets that theme from the server;
  3. B picks a preset: A, restarted, takes the newer server choice;
  4. the Client Settings picker lists the themes and switching there applies the theme;
  5. UI sounds play on themed-screen navigation and are suppressed when "Theme Sounds" is off;
  6. clean-up: the choice is turned off on the server.
Usage: python3 theme_sync.py --app ~/build/src/icefin-player --server jf12 --out ~/r85s/jf12
"""
import argparse, json, os, signal, sys, tempfile, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9228)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    q = urllib.parse.urlencode({"userId": uid, "client": "icefin-player"})
    server_choice = lambda: json.loads((srv.call("GET", f"/DisplayPreferences/usersettings?{q}").get("CustomPrefs") or {}).get("icefin.theme") or "null")
    os.environ["ICEFIN_THEME_PATH"] = THEMES
    xv = start_x()
    devices = {"A": tempfile.mkdtemp(prefix="icefin-syncA-"), "B": tempfile.mkdtemp(prefix="icefin-syncB-")}
    results, fails, apps = [], [], []

    def check(label, ok, detail=""):
        results.append({"check": label, "ok": bool(ok), "detail": detail})
        print(f"theme_sync: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def start(dev, fresh_login=True):
        log = open(os.path.join(a.out, f"app-{dev}-{len(apps)}.log"), "w")
        app = launch(a.app, a.port, devices[dev], log, "xcb")
        apps.append(app)
        page = Page(a.port, timeout=90)
        if fresh_login:
            page.wait_for("document.getElementById('address') !== null", timeout=60)
            page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(5)
            page.reconnect()
            page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
            if not page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)"):
                raise RuntimeError("login failed")
            page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(8)
            page.reconnect()
        page.wait_for("!!window.api && !!window.api.theme && !!window.icefinThemeSync && window.icefinThemeSync.user() !== null", timeout=90)
        page.eval("window.icefinThemeSync.idle().then(() => true)")
        return app, page

    def stop(app):
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass

    def call(page, f, *args):
        return page.eval("new Promise(r => window.api.theme.%s(%sr))" % (f, "".join(json.dumps(x) + ", " for x in args)))

    def settle(page):
        time.sleep(1.5)
        page.eval("window.icefinThemeSync.idle().then(() => true)")

    try:
        # Start from a known server state: theme off, newer than anything a device has.
        p = srv.call("GET", f"/DisplayPreferences/usersettings?{q}")
        p.setdefault("CustomPrefs", {})["icefin.theme"] = json.dumps({"schema": 1, "theme": "", "preset": "", "timestamp": 1})
        srv.call("POST", f"/DisplayPreferences/usersettings?{q}", p)

        appA, pa = start("A")
        check("A: sync knows the user", pa.eval("window.icefinThemeSync.user()") == uid)
        check("A: set lab-contrast", call(pa, "setActiveTheme", "lab-contrast", "") is True)
        settle(pa)
        sc = server_choice()
        check("A's choice saved to the server", sc and sc.get("theme") == "lab-contrast" and sc.get("timestamp", 0) > 1, json.dumps(sc))
        stop(appA)

        appB, pb = start("B")
        settle(pb)
        check("B (fresh device) gets the server choice", pb.eval("window.api && (window.icefinTheme.active() || {}).id") == "lab-contrast"
              or call(pb, "activeTheme") == "lab-contrast", f"active={call(pb, 'activeTheme')}")
        check("B: pick preset green", call(pb, "setActiveTheme", "lab-contrast", "green") is True)
        settle(pb)
        check("server has B's newer choice", (server_choice() or {}).get("preset") == "green")
        stop(appB)

        appA, pa = start("A", fresh_login=False)
        settle(pa)
        check("A (restarted) takes the newer server choice", call(pa, "activePreset") == "green", f"preset={call(pa, 'activePreset')}")

        desc = pa.eval("new Promise(r => window.api.settings.settingDescriptions(r))")
        theme_sec = next((s for s in desc if s.get("key") == "theme"), None)
        values = [v for v in (theme_sec or {}).get("settings", []) if v.get("key") == "active"]
        choices = [pv.get("value") for pv in (values[0].get("options") or [])] if values else []
        check("Client Settings: Theme picker lists the themes", {"", "baseline", "lab-contrast", "lab-screens"} <= set(choices), f"choices={choices}")
        pa.eval("new Promise(r => window.api.settings.setValue('theme', 'active', 'lab-screens', () => r(true)))")
        time.sleep(1.5)
        check("Client Settings: picking applies the theme", call(pa, "activeTheme") == "lab-screens")
        settle(pa)
        check("picker choice reaches the server too", (server_choice() or {}).get("theme") == "lab-screens")

        pa.wait_for("window.icefinTheme.active() && window.icefinTheme.active().route === '#/home'", timeout=20)
        before = call(pa, "soundState")
        pa.eval("window.icefinTheme.handleAction('right'); window.icefinTheme.handleAction('left'); true")
        time.sleep(0.5)
        after = call(pa, "soundState")
        check("UI sounds play on themed-screen navigation", after.get("played", 0) >= before.get("played", 0) + 2, json.dumps(after))
        pa.eval("new Promise(r => window.api.settings.setValue('theme', 'sounds', false, () => r(true)))")
        time.sleep(0.5)
        pa.eval("window.icefinTheme.handleAction('right'); true")
        time.sleep(0.5)
        off = call(pa, "soundState")
        check("Theme Sounds off: suppressed", off.get("played") == after.get("played") and off.get("reason") == "theme sounds off", json.dumps(off))
        pa.eval("new Promise(r => window.api.settings.setValue('theme', 'sounds', true, () => r(true)))")

        call(pa, "setActiveTheme", "", "")
        settle(pa)
        check("clean-up: off on the server", (server_choice() or {}).get("theme") == "")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        for app in apps:
            stop(app)
        if xv:
            xv.terminate()
    json.dump({"server": a.server, "results": results, "ok": not fails}, open(os.path.join(a.out, "theme_sync.json"), "w"), indent=1)
    print("theme_sync:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
