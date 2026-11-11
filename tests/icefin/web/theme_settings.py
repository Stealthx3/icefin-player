#!/usr/bin/env python3
"""theme_settings.py — the themed settings area in every theme, and Classic View (PLAN 9.24). Lab guests only.

For every bundled theme with a settings area (all but Baseline), signed in as an administrator:
  - the theme's Settings (#/mypreferencesmenu) opens the themed settings area with Client settings, Classic View and
    Server Settings, and a way to the user's own profile and preferences;
Once:
  - Client settings opens the Client Settings dialog;
  - Classic View turns the theme off for the session at once (the stock look), and leaves the saved choice alone;
    Client Settings -> Theme says so and its "Back to <theme>" brings the theme back;
  - Server Settings opens the server's dashboard (jellyfin-web's own page);
  - "Your profile and preferences" opens jellyfin-web's own page.
Usage: python3 theme_settings.py --app ~/build-mpv/src/icefin-player --server jf12
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = ["media-center", "harbor", "spark", "plum", "plaza", "orbit", "mosaic", "lumen", "marquee", "almanac", "arcade", "tide"]
ROOT = "document.querySelector('#icefin-theme-root')"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9279)
    ap.add_argument("--themes", default=",".join(THEMES))
    ap.add_argument("--out", help="also save a screenshot of each theme's settings area")
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-set-")
    app = launch(a.app, a.port, cfgdir, open(os.path.join(cfgdir, "app.log"), "w"), "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_settings: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.NativeShell && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        admin = js("window.ApiClient.getCurrentUser().then(u => !!(u.Policy && u.Policy.IsAdministrator))")

        def switch(tid):
            for _ in range(3):
                try:
                    js(f"new Promise(r => window.api.theme.select({json.dumps(tid)}, '', '', r))")
                    break
                except Exception:  # noqa: BLE001
                    page.reconnect()
            end = time.time() + 60
            while time.time() < end:
                try:
                    if js(f"!!window.icefinTheme && !!window.icefinTheme.active() && window.icefinTheme.active().id === {json.dumps(tid)} && !!window.icefinTheme.ui.settings && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()"):
                        time.sleep(1)
                        return True
                except Exception:  # noqa: BLE001
                    try:
                        page.reconnect(timeout=10)
                    except Exception:  # noqa: BLE001
                        pass
                time.sleep(1)
            return False

        def open_hub():
            js("location.hash = '#/home'; true")
            time.sleep(1)
            js("location.hash = '#/mypreferencesmenu'; true")
            page.wait_for(f"!!({ROOT} || {{getAttribute: () => null}}).getAttribute('data-icefin-settings-ready')", timeout=20)
            time.sleep(0.5)

        first = True
        for tid in a.themes.split(","):
            if not switch(tid):
                check(f"{tid}: theme switched", False)
                continue
            try:
                open_hub()
            except Exception as e:  # noqa: BLE001
                check(f"{tid}: Settings opens the themed settings area", False, str(e))
                continue
            entries = js("[...document.querySelectorAll('.icefin-settings .icefin-s-entry')].map(e => e.dataset.entry)")
            want = ["client", "classic"] + (["server"] if admin else [])
            check(f"{tid}: Settings has Client settings, Classic View{', Server Settings' if admin else ''}", entries == want, json.dumps(entries))
            check(f"{tid}: and the profile and preferences link", js("!!document.querySelector('.icefin-settings .icefin-d-btn[data-action=profile]')") is True)
            if a.out:
                import base64  # noqa: E402
                os.makedirs(a.out, exist_ok=True)
                open(os.path.join(a.out, f"{tid}-settings.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
                # What reaches the screen (themes over the native backdrop are transparent pages: DevTools drops alpha).
                import subprocess  # noqa: E402
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1920x1080", "-i", os.environ.get("DISPLAY", ":99"),
                                "-frames:v", "1", "-vf", "crop=1280:720:0:0", os.path.join(a.out, f"{tid}-screen.png")], timeout=20)
            check(f"{tid}: focus starts on the first entry", js("document.querySelector('#icefin-theme-root .icefin-focused').dataset.entry") == "client")
            if not first:
                continue
            first = False
            # Client settings: the dialog.
            js("document.querySelector('.icefin-s-entry[data-entry=client]').click(); true")
            page.wait_for("[...document.querySelectorAll('.formDialogHeaderTitle')].some(t => t.textContent === 'Client Settings')", timeout=15)
            check("Client settings opens the Client Settings dialog", True)
            js("document.querySelectorAll('.dialogContainer').forEach(d => d.remove()); true")
            # Classic View: the stock look now, the saved choice untouched, the way back in Client Settings.
            saved = js("new Promise(r => window.api.theme.selection(r))")
            js("document.querySelector('.icefin-s-entry[data-entry=classic]').click(); true")
            page.wait_for("!window.icefinTheme.active() && !document.documentElement.hasAttribute('data-icefin-theme')", timeout=20)
            time.sleep(1)
            check("Classic View turns the theme off at once", js("new Promise(r => window.api.theme.classic(r))") is True and js("location.hash").startswith("#/home"))
            check("Classic View keeps the saved choice", js("new Promise(r => window.api.theme.selection(r))")["theme"] == saved["theme"] == tid)
            js("window.NativeShell.openClientSettings(); true")
            page.wait_for("!!document.querySelector('#icefin-theme-manager .icefin-tm-unclassic')", timeout=20)
            label = js("document.querySelector('#icefin-theme-manager .icefin-tm-unclassic').textContent")
            check("Client Settings offers the way back", label.startswith("Back to "), label)
            js("document.querySelector('#icefin-theme-manager .icefin-tm-unclassic').click(); true")
            page.wait_for(f"!!window.icefinTheme.active() && window.icefinTheme.active().id === {json.dumps(tid)}", timeout=30)
            check("Back to the theme ends Classic View", js("new Promise(r => window.api.theme.classic(r))") is False)
            js("document.querySelectorAll('.dialogContainer').forEach(d => d.remove()); true")
            if not switch(tid):
                check(f"{tid}: back after Classic View", False)
                continue
            # Server Settings and the profile link: jellyfin-web's own pages.
            if admin:
                open_hub()
                js("document.querySelector('.icefin-s-entry[data-entry=server]').click(); true")
                page.wait_for("location.hash.startsWith('#/dashboard')", timeout=15)
                time.sleep(2)
                check("Server Settings opens the dashboard as jellyfin-web's page", js("window.icefinTheme.active().route") is None)
            open_hub()
            js("document.querySelector('.icefin-settings .icefin-d-btn[data-action=profile]').click(); true")
            page.wait_for("location.hash.includes('icefin=stock')", timeout=15)
            time.sleep(1)
            check("the profile link opens jellyfin-web's own preferences", js("window.icefinTheme.active().route") is None)
        js("new Promise(r => window.api.theme.select('', '', '', r))")
        time.sleep(1.5)
        js("window.icefinThemeSync.idle().then(() => true)")
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
    print("theme_settings:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
