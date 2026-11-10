#!/usr/bin/env python3
"""theme_runtime.py — the theme web runtime and the icefin-theme: scheme in the running app (PLAN 8.3). Lab guests only.

Starts the app with ICEFIN_THEME_PATH=tests/icefin/themes plus a user-installed theme made here (a font, an image
and a stylesheet that must NOT load), signs in, opens home, then checks:
  - lab-screens (development source): styles.css arrives over icefin-theme:, its script registers a themed home
    screen, the overlay mounts with the first tile focused;
  - input: arrow keys and Enter move focus and click, through the real input pipeline (TV mode: X key events ->
    InputComponent -> inputPlugin.js hook) or page keys (desktop mode); Back is offered to the screen first;
  - other routes stay jellyfin-web's; coming back remounts the screen;
  - the user theme: font, image and (sanitized, theme_trust.py) stylesheet served, no scripts; a path outside the package is refused;
  - engine off: overlay and assets gone with no reload.
Usage: python3 theme_runtime.py --app ~/build/src/icefin-player --server jf1011 --mode tv --out ~/r83/jf1011-tv
"""
import argparse, base64, json, os, shutil, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def user_theme(cfgdir):
    d = os.path.join(cfgdir, "themes", "lab-user")
    os.makedirs(os.path.join(d, "fonts"))
    shutil.copy(os.path.join(THEMES, "lab-contrast", "tokens.json"), d)
    shutil.copy(FONT, os.path.join(d, "fonts", "LabSans.ttf"))
    open(os.path.join(d, "img.png"), "wb").write(PNG)
    open(os.path.join(d, "styles.css"), "w").write("html { --lab-user-css: loaded; }\n")
    json.dump({"schema": 1, "id": "lab-user", "name": "Lab User (test fixture)", "version": "1",
               "styles": "styles.css", "fonts": [{"family": "Lab Sans", "file": "fonts/LabSans.ttf", "weight": 400}]},
              open(os.path.join(d, "theme.json"), "w"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf1011")
    ap.add_argument("--mode", choices=["tv", "desktop"], default="tv")
    ap.add_argument("--port", type=int, default=9225)
    ap.add_argument("--out", required=True)
    ap.add_argument("--log-level", default="info")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-runtime-")
    user_theme(cfgdir)
    env = dict(os.environ, DISPLAY=":99", QT_QPA_PLATFORM="xcb", LC_ALL="C.UTF-8", ICEFIN_THEME_PATH=THEMES)
    log = open(os.path.join(a.out, "app.log"), "w")
    app = subprocess.Popen([os.path.expanduser(a.app), f"--config-dir={cfgdir}", "--windowed", f"--{a.mode}", "--disable-gpu",
                            f"--remote-debugging-port={a.port}", f"--log-level={a.log_level}"], env=env, stdout=log, stderr=subprocess.STDOUT,
                           start_new_session=True)
    results, fails = [], []

    def check(label, ok, detail=""):
        results.append({"check": label, "ok": bool(ok), "detail": detail})
        print(f"theme_runtime[{a.mode}]: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def key(name):
        if a.mode == "tv":  # a real X key event: EventFilter -> InputKeyboard -> InputComponent -> inputPlugin.js
            subprocess.run(["xdotool", "search", "--sync", "--onlyvisible", "--pid", str(app.pid), "windowactivate", "--sync"],
                           env=env, capture_output=True, timeout=10)
            subprocess.run(["xdotool", "key", name], env=env, check=True, timeout=10)
        else:  # desktop mode: the page receives the key
            code = {"Right": ("ArrowRight", 39), "Left": ("ArrowLeft", 37), "Return": ("Enter", 13), "Escape": ("Escape", 27)}[name]
            for t in ("keyDown", "keyUp"):
                page.send("Input.dispatchKeyEvent", type=t, key=code[0], code=code[0], windowsVirtualKeyCode=code[1])
        time.sleep(0.6)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        if not page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)"):
            raise RuntimeError("login failed")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.api.theme && !!window.icefinTheme && !!document.querySelector('.skinHeader')", timeout=90)
        time.sleep(2)
        call = lambda f, *args: page.eval("new Promise(r => window.api.theme.%s(%sr))" % (f, "".join(json.dumps(x) + ", " for x in args)))
        js = page.eval

        check("set lab-screens", call("setActiveTheme", "lab-screens", "") is True)
        page.wait_for("window.icefinTheme.active() && window.icefinTheme.active().route === '#/home'", timeout=20)
        check("styles.css over icefin-theme:", js("getComputedStyle(document.documentElement).getPropertyValue('--lab-screens-loaded').trim()") == "yes")
        check("script registered the home screen", js("JSON.stringify(window.icefinTheme.screens())") == '["#/home"]')
        tiles = js("document.querySelectorAll('#icefin-theme-root .lab-tile').length")
        check("overlay mounted with 3 tiles", tiles == 3, f"tiles={tiles}")
        foc = lambda: js("(document.querySelector('#icefin-theme-root .icefin-focused') || {}).textContent || ''")
        check("first tile focused", foc() == "one")
        page.send("Page.bringToFront")
        js("window.labPageKeys = 0; document.addEventListener('keydown', () => window.labPageKeys++, true); true")
        key("Right")
        check("Right moves focus", foc() == "two", f"focused={foc()}")
        key("Return")
        clicks = js("JSON.stringify(window.labScreens.clicks)")
        check("Enter clicks the focused tile", clicks == '["two"]', f"clicks={clicks}")
        key("Left")
        check("Left moves back", foc() == "one", f"focused={foc()}")
        before = js("location.hash")
        key("Escape")
        check("Back offered to the screen first (consumed)", js("window.labScreens.backs") == 1 and js("location.hash") == before)
        if a.mode == "tv":
            pk = js("window.labPageKeys")
            check("TV mode: keys came through the input pipeline, not the page", pk == 0, f"page keydowns={pk}")
        shot = page.send("Page.captureScreenshot", format="png")["data"]
        open(os.path.join(a.out, "themed-home.png"), "wb").write(base64.b64decode(shot))

        js("location.hash = '#/mypreferencesmenu.html'; true")
        time.sleep(3)
        check("other route: jellyfin-web's own page", js("document.getElementById('icefin-theme-root').hidden") is True and js("window.icefinTheme.active().route") is None)
        check("other route: actions fall through", js("window.icefinTheme.handleAction('right')") is False)
        js("location.hash = '#/home'; true")
        page.wait_for("window.icefinTheme.active().route === '#/home'", timeout=20)
        check("back on home: screen remounted", js("document.querySelectorAll('#icefin-theme-root .lab-tile').length") == 3)

        check("dev script served", js("fetch('icefin-theme://lab-screens/screens.js').then(r => r.ok, () => false)") is True)
        check("set lab-user", call("setActiveTheme", "lab-user", "") is True)
        time.sleep(1.5)
        pkg = call("activePackage")
        check("user theme: stylesheet offered (sanitized, 8.5), no scripts", pkg.get("styles", "").endswith("/styles.css") and pkg.get("scripts") == [], json.dumps(pkg)[:160])
        check("user theme: font offered", len(pkg.get("fonts", [])) == 1)
        check("user theme: font loads", js("document.fonts.load('16px \"Lab Sans\"').then(f => f.length > 0, () => false)") is True)
        check("user theme: image served", js("fetch('icefin-theme://lab-user/img.png').then(r => r.ok, () => false)") is True)
        check("user theme: sanitized stylesheet served and applied", js("getComputedStyle(document.documentElement).getPropertyValue('--lab-user-css').trim()") == "loaded")
        check("path outside the package refused", js("fetch('icefin-theme://lab-user/%2e%2e/lab-screens/screens.js').then(r => r.ok, () => false)") is False)
        check("unknown theme refused", js("fetch('icefin-theme://nope/x.png').then(r => r.ok, () => false)") is False)
        check("old screen gone after switch", js("document.getElementById('icefin-theme-root').hidden") is True)

        check("engine off", call("setActiveTheme", "", "") is True)
        time.sleep(1.5)
        check("off: no theme assets, no overlay", js("document.querySelectorAll('[data-icefin-theme-asset]').length") == 0
              and js("window.icefinTheme.active()") is None and js("document.getElementById('icefin-theme-root').hidden") is True)
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        if xv:
            xv.terminate()
        log.close()
    json.dump({"server": a.server, "mode": a.mode, "results": results, "ok": not fails}, open(os.path.join(a.out, "theme_runtime.json"), "w"), indent=1)
    print(f"theme_runtime[{a.mode}]:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
