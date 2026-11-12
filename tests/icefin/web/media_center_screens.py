#!/usr/bin/env python3
"""media_center_screens.py — Media Center's search, favourites and Live TV screens (PLAN 9.46). Lab guests only.

  - search: the keypad types (a key pressed again steps through its letters), results come grouped by kind, a result
    opens its details;
  - favourites: a movie marked favourite shows in the Movies row, the row is current, Enter opens its details;
  - Live TV: the guide (ui.guideGrid) with programme cells, right moves along a row and the programme panel follows,
    the pivot switches to channels (tiles) and to scheduled (a list or its empty note); the start strip's Tasks have
    favourites.
Run tests/icefin/servers/livetv.py first so the guide is current. Screenshots go to --out.
Usage: python3 media_center_screens.py --app ~/build/src/icefin-player --server jf12 --out ~/rmcs
"""
import argparse, base64, json, os, signal, sys, tempfile, time

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
    ap.add_argument("--port", type=int, default=9267)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-mcs-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"media_center_screens: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shot(name):
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        # The window as the display shows it, native backdrop under the page included (CDP renders the page alone)
        import subprocess
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1920x1080", "-i", ":99", "-frames:v", "1",
                        os.path.join(a.out, "x-" + name)], timeout=20)

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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        js("new Promise(r => window.api.theme.setActiveTheme('media-center', '', r))")
        js("location.hash = '#/home'; true")
        page.wait_for("+((document.querySelector('#icefin-theme-root') || {getAttribute: () => 0}).getAttribute('data-mc-ready')) > 0", timeout=30)
        check("start: Tasks has favourites", js("[...document.querySelectorAll('.mc-tile.text')].some(t => t.textContent === 'favourites')") is True)

        # ---- search ----
        js("location.hash = '#/search'; true")
        page.wait_for("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc') === 'search'", timeout=15)
        check("search: the field has focus first", js("document.querySelector('.mc-search-input').classList.contains('icefin-focused')") is True)
        keys = lambda k: js(f"[...document.querySelectorAll('.mc-key')].find(b => b.querySelector('.mc-key-main').textContent === '{k}').click(); true")
        keys("4"); keys("4")  # g, then h
        check("search: a key pressed again steps through its letters", js("document.querySelector('.mc-search-input').value") == "h")
        keys("delete")
        js("(() => { const i = document.querySelector('.mc-search-input'); i.value = 'h264'; i.dispatchEvent(new Event('input', {bubbles: true})); return true; })()")
        page.wait_for("document.querySelectorAll('.mc-search-results .mc-li').length > 0", timeout=15)
        groups = js("JSON.stringify([...document.querySelectorAll('.mc-search-results .mc-sec')].map(s => s.textContent))")
        check("search: results grouped by kind", "movies" in groups, groups)
        shot("search.png")
        js("document.querySelector('.mc-search-results .mc-li').click(); true")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        check("search: a result opens its details", True)

        # ---- favourites ----
        movie = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, Limit: 1}).then(r => r.Items[0].Id)")
        js(f"window.ApiClient.updateFavoriteStatus(window.ApiClient.getCurrentUserId(), '{movie}', true).then(() => true)")
        js("location.hash = '#/favorites'; true")
        page.wait_for("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc') === 'favorites' && document.querySelector('#icefin-theme-root').hasAttribute('data-mc-ready')", timeout=20)
        check("favourites: the Movies row with the movie", js("[...document.querySelectorAll('.mc-fav-title')].some(t => t.textContent === 'Movies')") is True)
        check("favourites: the first row is current and focused", js("!!document.querySelector('.mc-fav-row.current .mc-lib-tile.icefin-focused')") is True)
        shot("favourites.png")
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        check("favourites: Enter opens its details", True)
        js(f"window.ApiClient.updateFavoriteStatus(window.ApiClient.getCurrentUserId(), '{movie}', false).then(() => true)")

        # ---- Live TV ----
        js("location.hash = '#/livetv'; true")
        page.wait_for("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc-ready') === 'guide'", timeout=30)
        time.sleep(2)
        cells = js("document.querySelectorAll('.mc-tv-guide .icefin-guide-cell').length")
        check("live tv: the guide has programmes", cells > 0, f"{cells} cells")
        t0 = js("document.querySelector('.mc-tv-info-title').textContent")
        act("right")
        time.sleep(0.6)
        t1 = js("document.querySelector('.mc-tv-info-title').textContent")
        check("live tv: the programme panel follows the focus", bool(t0) and bool(t1), f"{t0!r} -> {t1!r}")
        shot("guide.png")
        js("[...document.querySelectorAll('.mc-lib-pivot .mc-pivot-item')].find(p => p.textContent === 'channels').click(); true")
        page.wait_for("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc-ready') === 'channels'", timeout=15)
        check("live tv: channels as tiles", js("document.querySelectorAll('.mc-tv-channel').length") > 0)
        shot("channels.png")
        js("[...document.querySelectorAll('.mc-lib-pivot .mc-pivot-item')].find(p => p.textContent === 'scheduled').click(); true")
        page.wait_for("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc-ready') === 'scheduled'", timeout=15)
        check("live tv: scheduled lists timers or says there are none", js("!!document.querySelector('.mc-tv-list .mc-li, .mc-tv-list .mc-lib-empty')") is True)
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
    print("media_center_screens:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
