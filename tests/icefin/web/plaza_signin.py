#!/usr/bin/env python3
"""plaza_signin.py — Plaza's own Play on card, server choice and sign-in (PLAN 9.44), on the engine's 9.44 calls.
Lab guests only (it signs out). With Plaza active (the repository's themes):
  - Settings › Home: Plaza's channels with switches; one switched off is gone from the home (then back on);
  - Play on (the header button on a jellyfin-web page): Plaza's card, this device "Playing here", New group;
  - after signing out: #/selectserver shows the lab server as a channel and Add a server; #/login shows the lab
    user's face; a wrong password is refused with a reason; the right one signs in and goes home.
Usage: python3 theme_player.py --app ~/build/src/icefin-player --server jf12 --out ~/rplaza-signin
"""
import argparse, base64, json, os, signal, sys, tempfile, time
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "..", "..", "themes"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9274)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    os.environ["ICEFIN_THEME_PATH"] = THEMES
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-plaza-signin-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"plaza_signin: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shot(name):
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinTheme.ui.player && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))"); time.sleep(3)
        uid = js("window.ApiClient.getCurrentUserId()")
        # Settings › Home: Plaza's channels with switches; one off leaves its slot empty on the home
        js(f"location.hash = '#/mypreferenceshome?userId={uid}'; true"); time.sleep(4)
        rows = js("[...document.querySelectorAll('.pz-ph-row:not(.pz-ph-classic) .pz-setrow-label')].map(x => x.textContent)")
        check("Settings › Home: Plaza's channels, and Classic home sections", len(rows) >= 2 and js("!!document.querySelector('.pz-ph-classic')") is True, rows)
        shot("prefs-home.png")
        first = rows[0] if rows else ''
        js("document.querySelector('.pz-ph-row').click(); true"); time.sleep(0.5)
        js("location.hash = '#/home'; true"); time.sleep(4)
        tiles = js("[...document.querySelectorAll('.pz-tile[data-pz-channel]')].map(t => t.getAttribute('data-pz-channel'))")
        names = js("[...document.querySelectorAll('.pz-tile[data-pz-channel] .pz-name, .pz-tile[data-pz-channel]')].map(t => t.textContent.trim().slice(0, 40))")
        check("a channel switched off is gone from the home", not any(first and n.startswith(first) for n in names), [first, names[:6]])
        js(f"location.hash = '#/mypreferenceshome?userId={uid}'; true"); time.sleep(3)
        js("document.querySelector('.pz-ph-row').click(); true"); time.sleep(0.5)
        js(f"location.hash = '#/userprofile?userId={uid}'; true"); time.sleep(3)
        js("[...document.querySelectorAll('.pz-sc-extra-btn')].find(b => b.textContent.startsWith('Play on')).click(); true"); time.sleep(3)
        rows = js("[...document.querySelectorAll('#icefin-theme-overlay .pz-po-row')].map(r => r.textContent)")
        check("Play on: Plaza's card, this device playing here, New group", any('Playing here' in r for r in rows) and any('New group' in r for r in rows), rows)
        shot("playon.png")
        js("window.icefinTheme.handleAction('back')"); time.sleep(1)
        page.eval("setTimeout(() => window.icefinTheme.ctx.signOut(), 100); true", await_promise=False); time.sleep(6); page.reconnect(); js = page.eval
        page.wait_for("!!window.icefinTheme && !!window.icefinTheme.ctx.servers", timeout=60)
        js("location.hash = '#/selectserver'; true"); time.sleep(4)
        tiles = js("[...document.querySelectorAll('.pz-sv-server .pz-sv-name')].map(x => x.textContent)")
        check("Choose a server: the lab server as a channel, and Add a server", len(tiles) >= 1 and js("!!document.querySelector('.pz-sv-add')") is True, tiles)
        shot("servers.png")
        js("document.querySelector('.pz-sv-server').click(); true"); time.sleep(5)
        check("a server opens Plaza's sign-in", js("location.hash").startswith('#/login') and js("!!document.querySelector('.pz-si-faces')") is True, js("location.hash"))
        faces = js("[...document.querySelectorAll('.pz-si-name')].map(x => x.textContent)")
        check("Sign in: the lab user's face and Someone else", 'Someone else' in faces, faces)
        shot("signin.png")
        mine = [i for i, f in enumerate(faces) if f.lower() == cred['user'].lower()]
        if mine: js(f"document.querySelectorAll('.pz-si-face')[{mine[0]}].click(); true")
        else:
            js("document.querySelectorAll('.pz-si-face')[document.querySelectorAll('.pz-si-face').length - 1].click(); true"); time.sleep(0.5)
            js(f"(() => {{ const i = document.querySelector('.pz-si-form input[type=text]'); i.value = {json.dumps(cred['user'])}; return true; }})()")
        time.sleep(0.5)
        js("(() => { const i = document.querySelector('.pz-si-form input[type=password]'); i.value = 'not-the-password'; document.querySelector('.pz-si-go').click(); return true; })()"); time.sleep(3)
        e = js("document.querySelector('.pz-si-error').textContent")
        check("a wrong password is refused with a reason", bool(e) and 'Signing' not in e and js("location.hash").startswith('#/login'), e)
        js(f"(() => {{ const i = document.querySelector('.pz-si-form input[type=password]'); i.value = {json.dumps(cred['password'])}; document.querySelector('.pz-si-go').click(); return true; }})()")
        time.sleep(7); page.reconnect(); js = page.eval
        page.wait_for("!!window.ApiClient && !!window.ApiClient.getCurrentUserId()", timeout=60)
        check("the right password signs in and goes home", js("location.hash").startswith('#/home'), js("location.hash"))
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
    print("plaza_signin:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
