#!/usr/bin/env python3
"""plaza_player.py — Plaza's own player controls (PLAN 9.44, D30, on the engine's ui.player of 9.45). Lab guests only.

While a clip plays with Plaza active (the repository's themes, ICEFIN_THEME_PATH):
  - Plaza's controls mount over the video, jellyfin-web's own hidden under them; the name pill names what plays and
    when it ends; the time line moves;
  - OK on play/pause pauses (the controls stay while paused), and plays again; playing, the controls fade after a few
    seconds; hidden, ◀ goes back 10 s (▶ skips 30 s) and brings them back;
  - Audio opens a Plaza card over the video, Back closes it and focus returns; More lists playback info and
    jellyfin-web's own controls;
  - a skip prompt (jellyfin-web's MediaSegment button) shows as Plaza's pill and takes focus while the controls are
    hidden; OK presses it;
  - Back hides the controls while playing; Back again leaves the video.
Usage: python3 theme_player.py --app ~/build/src/icefin-player --server jf12 --out ~/rplaza-player
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
    ap.add_argument("--port", type=int, default=9271)
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
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-plaza-player-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"plaza_player: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        page.wait_for("window.icefinTheme.ui.player.status().themed", timeout=30)
        clip = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, searchTerm: 'H264 AAC', Limit: 1}).then(r => (r.Items[0] || {}).Id || '')")
        sid = js("window.ApiClient.serverId()")
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        shownq = "document.querySelector('.pz-pl').classList.contains('pz-pl-shown')"
        pos = lambda: js("(() => { const t = document.querySelector('.pz-pl-time'); return t ? t.textContent : ''; })()")
        js(f"window.icefinTheme.ctx.play({{ids: ['{clip}'], serverId: '{sid}'}}); true")
        page.wait_for("location.hash.startsWith('#/video') && !!document.querySelector('#icefin-theme-root[data-icefin-player] .pz-pl')", timeout=60)
        time.sleep(3)
        check("Plaza's controls over the video", js("!!document.querySelector('.pz-pl .pz-pl-cap') && !!document.querySelector('.pz-pl .pz-pl-pp')") is True)
        check("jellyfin-web's own controls hidden under them",
              js("(() => { const p = [...document.querySelectorAll('#videoOsdPage')].pop(); return !p || getComputedStyle(p).visibility === 'hidden'; })()") is True)
        nm = js("document.querySelector('.pz-pl-name').textContent")
        check("the name pill: what plays and when it ends", 'Ends at' in nm, nm)
        t0 = pos(); time.sleep(2.2); t1 = pos()
        check("the time line moves", t0 != t1, f"{t0} -> {t1}")
        check("play/pause has focus when the controls come up", js("document.querySelector('.pz-pl-pp').classList.contains('icefin-focused')") is True)
        act("enter"); time.sleep(2.5)
        check("OK pauses", js("document.querySelector('.pz-pl').classList.contains('pz-pl-paused')") is True)
        time.sleep(5)
        check("paused, the controls stay", js(shownq) is True)
        act("enter"); time.sleep(5.5)
        check("playing, the controls fade", js(shownq) is False)
        # hidden, ◀ goes back 10 s (the lab clip is too short to skip 30 s ahead) and brings the controls back
        tosec = lambda t: sum(int(x) * 60 ** k for k, x in enumerate(reversed(t.split(':')))) if t else 0
        t0 = pos(); act("left"); time.sleep(1.5); t1 = pos()
        check("hidden, ◀ goes back 10 s and brings them back", js(shownq) is True and tosec(t0) - tosec(t1) >= 6, f"{t0} -> {t1}")
        # Audio and More
        js("document.querySelector('.pz-pl-tools .pz-pl-pill:not([hidden])').click(); true"); time.sleep(0.8)
        check("a picker opens as a Plaza card over the video", js("!!document.querySelector('.pz-pl-host .pz-sheet-card .pz-sheet-row')") is True)
        shot("picker.png")
        act("back"); time.sleep(0.6)
        check("Back closes the card; focus goes back", js("!document.querySelector('.pz-pl-host') && document.querySelector('.pz-pl').contains(document.querySelector('.icefin-focused'))") is True)
        js("document.querySelector('.pz-pl-more').click(); true"); time.sleep(0.8)
        rows = js("[...document.querySelectorAll('.pz-pl-host .pz-sheet-row-label')].map(x => x.textContent)")
        check("More: playback info and jellyfin-web's own controls", 'Playback info' in rows and 'Jellyfin’s own controls' in rows, rows)
        shot("more.png")
        act("back"); time.sleep(0.6)
        # Back
        act("up"); time.sleep(0.6)
        check("Back hides the controls while playing", js(shownq) is True and (act("back"), time.sleep(0.6), js(shownq))[2] is False)
        # a skip prompt
        js("(() => { const c = document.createElement('div'); c.className = 'skip-button-container'; c.innerHTML = '<button class=\"skip-button\">Skip Intro</button>';"
           " document.body.append(c); c.querySelector('button').addEventListener('click', () => { window.labSkipped = true; }); return true; })()")
        time.sleep(5.5)
        sk = js("(() => { const b = document.querySelector('.pz-pl-skipnow'); return b ? [b.textContent, b.classList.contains('icefin-focused')] : null; })()")
        check("a skip prompt as Plaza's pill, focused while the controls are hidden", bool(sk) and sk[1] and 'Skip Intro' in sk[0], sk)
        act("enter"); time.sleep(0.8)
        check("OK presses it", js("window.labSkipped === true") is True)
        shot("skip.png")
        js("document.querySelector('.skip-button-container').remove(); true")
        act("back"); time.sleep(3)
        check("Back again leaves the video", not js("location.hash").startswith('#/video'), js("location.hash"))
        js("window.icefinPlaybackManager.stop(); true")
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
    print("plaza_player:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
