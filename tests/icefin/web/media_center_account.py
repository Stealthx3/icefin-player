#!/usr/bin/env python3
"""media_center_account.py — Media Center's queue, server and sign-in screens on the theme API (PLAN 9.46, 9.44). Lab only.

With Media Center active:
  - the queue (#/queue?view=queue): an album playing lists its tracks with the current one marked; OK on another
    track opens the band, and Play from here moves the current one there;
  - choose a server (#/selectserver): the lab server is listed;
  - signing out: Media Center's own screens before sign-in (choose a server, then who's watching); a wrong password
    is refused with the reason shown; the right one signs in and the start screen comes back.
Screenshots go to --out (page captures, and x-*.png of the display).
Usage: python3 media_center_account.py --app ~/build/src/icefin-player --server jf12 --out ~/rmca
"""
import argparse, base64, json, os, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9269)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-mca-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"media_center_account: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shot(name):
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1920x1080", "-i", ":99", "-frames:v", "1",
                        os.path.join(a.out, "x-" + name)], timeout=20)

    mc = lambda: js("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc') || ''")
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ctx.queueItems && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        js("new Promise(r => window.api.theme.setActiveTheme('media-center', '', r))")
        time.sleep(2)

        # ---- the queue ----
        alb = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'MusicAlbum', Recursive: true, Limit: 1, SortBy: 'SortName'}).then(r => (r.Items[0] || {}).Id || '')")
        js(f"window.icefinTheme.ctx.play({{ids: ['{alb}'], serverId: window.ApiClient.serverId()}}); true")
        time.sleep(6)
        js("location.hash = '#/queue?view=queue'; true")
        page.wait_for("document.querySelector('#icefin-theme-root').getAttribute('data-mc') === 'queue' && document.querySelectorAll('.mc-q-row').length > 0", timeout=20)
        n = js("document.querySelectorAll('.mc-q-row').length")
        check("queue: the album's tracks, the current one marked", n >= 2 and js("[...document.querySelectorAll('.mc-q-row')].indexOf(document.querySelector('.mc-q-row.now'))") == 0, f"{n} rows")
        shot("queue.png")
        if n >= 2:
            js("document.querySelectorAll('.mc-q-row')[1].click(); true")
            page.wait_for("!!document.querySelector('.mc-band-dialog')", timeout=5)
            js("[...document.querySelectorAll('.mc-band-dialog .mc-btn')].find(b => b.textContent === 'Play from here').click(); true")
            page.wait_for("[...document.querySelectorAll('.mc-q-row')].indexOf(document.querySelector('.mc-q-row.now')) === 1", timeout=15)
            check("queue: Play from here moves the current track", True)
        js("window.icefinPlaybackManager.stop(); true")
        time.sleep(2)

        # ---- choose a server, signed in ----
        js("location.hash = '#/selectserver'; true")
        page.wait_for("document.querySelector('#icefin-theme-root').getAttribute('data-mc') === 'servers' && document.querySelectorAll('.mc-acc-server').length > 0", timeout=20)
        check("servers: the lab server is listed", js("document.querySelectorAll('.mc-acc-server').length") >= 1)
        shot("servers.png")

        # ---- signing out and back in ----
        page.eval("setTimeout(() => window.icefinTheme.ctx.signOut(), 100); true", await_promise=False)
        time.sleep(6)
        page.reconnect()
        js = page.eval
        page.wait_for("!!window.icefinTheme && (location.hash.includes('login') || location.hash.includes('selectserver'))", timeout=60)
        time.sleep(2)
        if "selectserver" in js("location.hash"):
            check("signed out: Media Center's own server list", mc() == "servers", mc())
            js("document.querySelector('.mc-acc-server').click(); true")
            page.wait_for("location.hash.includes('login')", timeout=20)
            time.sleep(2)
        page.wait_for("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc') === 'login'", timeout=20)
        check("signed out: Media Center's own sign-in", mc() == "login")
        shot("login.png")
        user = json.dumps(cred["user"])
        tile = js(f"(() => {{ const t = [...document.querySelectorAll('.mc-acc-user')].find(x => x.textContent.trim().toLowerCase() === {user}.toLowerCase()); if (t) {{ t.click(); return true; }} return false; }})()")
        if not tile:
            js(f"(() => {{ [...document.querySelectorAll('.mc-acc-user')].pop().click(); const i = document.getElementById('mc-acc-name'); i.value = {user}; return true; }})()")
        js("document.getElementById('mc-acc-pw').value = 'not-the-password'; [...document.querySelectorAll('.mc-acc-col .mc-btn')].find(b => b.textContent === 'Sign in').click(); true")
        page.wait_for("!!document.querySelector('.mc-acc-right .mc-note.bad')", timeout=15)
        check("sign-in: a wrong password is refused with the reason shown", len(js("document.querySelector('.mc-acc-right .mc-note.bad').textContent") or "") > 0,
              js("document.querySelector('.mc-acc-right .mc-note.bad').textContent"))
        shot("login-refused.png")
        js(f"document.getElementById('mc-acc-pw').value = {json.dumps(cred['password'])}; [...document.querySelectorAll('.mc-acc-col .mc-btn')].find(b => b.textContent === 'Sign in').click(); true")
        time.sleep(6)
        page.reconnect()
        js = page.eval
        page.wait_for("!!window.ApiClient && !!window.ApiClient.getCurrentUserId() && location.hash.startsWith('#/home')", timeout=40)
        page.wait_for("+((document.querySelector('#icefin-theme-root') || {getAttribute: () => 0}).getAttribute('data-mc-ready')) > 0", timeout=30)
        check("sign-in: the right password signs in to the start screen", True)
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
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
    print("media_center_account:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
