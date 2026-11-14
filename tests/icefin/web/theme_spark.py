#!/usr/bin/env python3
"""theme_spark.py — the Spark benchmark theme in the running app (PLAN 9.5; target Fire TV). Lab guests only.

  - Spark is a built-in theme, offered in Client Settings → Theme;
  - home: the top-bar chrome slot (Home, Search, each library, Settings, Classic home), a hero carousel of featured
    items, and rows of 16:9 tiles (Continue watching, Next up, Recently added per library);
  - the hero: left/right step through its items (wrapping); after a short dwell a muted preview plays in the page's
    own <video> (a server transcode, never mpv); leaving the hero stops it; no preview under the low-motion cap;
  - five-way navigation: down from the bar to the hero to the rows, up back; each row keeps its position; Back from a
    row returns to the hero and from the hero to the bar; Enter opens its details (9.18: the themed screen, or jellyfin-web's page for a book; Spark's tokens);
  - long rows recycle: a 300-item row keeps nine tiles in the DOM while focus moves along it;
  - Classic home shows the stock home; turning the theme off restores the stock UI.
Layout positions and motion timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_spark.py --app ~/build/src/icefin-player --server jf12 --out ~/r95/jf12
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
from details_check import DETAILS_OK  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9249)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-spark-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_spark: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        themes = lambda: {t["id"]: t for t in js("new Promise(r => window.api.theme.themes(r))")}
        setv = lambda key, val: js("new Promise(r => window.api.settings.setValue('theme', %s, %s, () => r(true)))" % (json.dumps(key), json.dumps(val)))

        sp = themes().get("spark", {})
        check("Spark offered as a built-in theme, usable", sp.get("ok") is True and sp.get("source") == "bundled", json.dumps(sp)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('spark', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-sp-ready]')", timeout=40)
        time.sleep(1.5)
        top = json.loads(js("JSON.stringify([...document.querySelectorAll('.sp-nav-item')].map(e => e.textContent))"))
        check("top bar: Home, Search, the libraries, Settings, Classic home", top[:2] == ["Home", "Search"] and top[-2:] == ["Settings", "Classic home"] and len(top) >= 5, json.dumps(top))
        geo = js("JSON.stringify({bar: document.querySelector('.icefin-topbar').getBoundingClientRect().height / innerHeight, hero: document.querySelector('.sp-hero').getBoundingClientRect().height / innerHeight})")
        g = json.loads(geo)
        check("proportions: bar 115/1080 over a hero 590/1080 tall", abs(g["bar"] - 115 / 1080) < 0.01 and abs(g["hero"] - 590 / 1080) < 0.01, geo)
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('sp-nav-item')) return 'top/' + f.textContent; "
                         "if (f.classList.contains('sp-hero')) return 'hero/' + f.getAttribute('data-sp-hero'); "
                         "const s = f.closest('.sp-row-section'); return 'row/' + [...document.querySelectorAll('.sp-row-section')].indexOf(s) + '/' + f.sparkIndex; })()")
        n_hero = js("document.querySelectorAll('.sp-dot').length")
        check("focus starts on the hero", foc() == "hero/0" and n_hero >= 2, f"{foc()} ({n_hero} items)")
        shot("home.png")
        act("right")
        check("right steps the hero", foc() == "hero/1", foc())
        act("left")
        act("left")
        check("left from the first item wraps to the last", foc() == f"hero/{n_hero - 1}", foc())
        act("right")
        kinds = []
        for _ in range(n_hero):  # dwell on a movie (series preview their first episode; checked below if no movie)
            kinds.append(js("document.querySelector('.sp-hero').getAttribute('data-sp-kind')"))
            if kinds[-1] == "Movie":
                break
            act("right")
        page.wait_for("document.querySelector('.sp-hero').getAttribute('data-sp-preview') === 'playing'", timeout=15)
        try:
            page.wait_for("document.querySelector('video.icefin-preview').currentTime > 0.3", timeout=30)
            playing = True
        except Exception:  # noqa: BLE001
            playing = False
        check("after a dwell a muted preview plays in the page's own video", playing and js("(() => { const v = document.querySelector('.sp-hero video.icefin-preview'); return !!v && v.muted; })()") is True,
              js("JSON.stringify((v => v ? {t: v.currentTime, e: (v.error || {}).message || ''} : null)(document.querySelector('video.icefin-preview')))"))
        check("hero holds movies and series", set(kinds) <= {"Movie", "Series"}, json.dumps(kinds))
        check("the preview isn't mpv (no player session)", js("!!(window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying())") is False)
        shot("preview.png")
        act("down")
        check("down from the hero enters the first row; the preview stops", foc() == "row/0/0" and js("!!document.querySelector('video.icefin-preview')") is False, foc())
        nrows = js("document.querySelectorAll('.sp-row-section').length")
        len0 = js("+document.querySelector('.sp-row-section').getAttribute('data-sp-length')")
        if len0 >= 2:
            act("right")
            check("right moves along the row", foc() == "row/0/1", foc())
        if nrows >= 2:
            act("down")
            check("down moves to the next row", foc().startswith("row/1/"), foc())
            act("up")
            check("up returns to the row's kept position", foc() == ("row/0/1" if len0 >= 2 else "row/0/0"), foc())
        time.sleep(1.2)
        check("the first row keeps the full hero above it", js("document.querySelector('.sp-hero').getBoundingClientRect().height / innerHeight") > 0.5)
        if nrows >= 2:
            act("down")  # a deeper row: the hero shrinks and the row slides up
        time.sleep(1.2)  # let the 220 ms slides settle (software rendering in the lab is slow)
        tv = js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); const t = f.closest('.sp-row-section').querySelector('.sp-row-title').getBoundingClientRect(); const h = document.querySelector('.sp-hero').getBoundingClientRect(); const sec = f.closest('.sp-row-section'); return JSON.stringify({title: t.top, hero: h.bottom, heroH: h.height / innerHeight, row: [...document.querySelectorAll('.sp-row-section')].indexOf(sec), off: sec.offsetTop, tf: document.querySelector('.sp-rows').style.transform, view: document.querySelector('.sp-rows-view').getBoundingClientRect().top}); })()")
        tvj = json.loads(tv)
        check("with a row focused the hero shrinks and the row's title is on screen", tvj["title"] >= tvj["hero"] and tvj["heroH"] < 0.25, tv)
        shot("rows.png")
        act("back")
        check("Back from a row returns to the hero", foc().startswith("hero/"), foc())
        act("back")
        check("Back from the hero returns to the top bar", foc() == "top/Home", foc())
        act("right")
        check("left/right move along the top bar", foc() == "top/Search", foc())
        act("down")
        act("down")
        # long row: 300 items, nine tiles in the DOM
        js("document.querySelector('.sp-row-section').sparkRow.setItems(Array.from({length: 300}, (_, i) => ({Id: 'x' + i, Name: 'Item ' + i, ImageTags: {}}))); true")
        js("window.icefinTheme._engine.focus(document.querySelector('.sp-row-section').sparkRow.node(0)); true")
        for _ in range(60):
            act("right")
        dom = js("document.querySelector('.sp-row-section .sp-row').children.length")
        lab = js("document.querySelector('#icefin-theme-root .icefin-focused .sp-tile-label').textContent")
        check("a 300-item row keeps nine tiles in the DOM", dom == 9 and foc() == "row/0/60" and lab == "Item 60", f"dom={dom} {foc()} {lab}")
        time.sleep(1.0)  # the row's slide settles
        vis = js("(() => { const t = document.querySelector('#icefin-theme-root .icefin-focused').getBoundingClientRect(); return t.left >= 0 && t.right <= innerWidth; })()")
        check("the focused tile stays on screen", vis is True, js("JSON.stringify((r => ({l: r.left, r: r.right, w: innerWidth}))(document.querySelector('#icefin-theme-root .icefin-focused').getBoundingClientRect()))"))
        js("location.hash = '#/search'; true")
        time.sleep(2)
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-sp-ready]')", timeout=30)
        time.sleep(1)
        act("down")
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        check("Enter on a tile opens its details (themed screen or, for a book, the stock page), styled by Spark's tokens",
              (det := js(DETAILS_OK))["ok"]
              and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-focus').trim().toLowerCase()") == "#ffffff", json.dumps(det))
        shot("details.png")
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-sp-ready]')", timeout=30)
        time.sleep(1)
        act("up")
        for _ in range(len(top)):
            act("right")
        check("the top bar stops at its last entry", foc() == "top/Classic home", foc())
        act("enter")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-sp-ready]')", timeout=30)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        act("down")
        act("up")
        time.sleep(3)
        check("no preview and no transitions under the low-motion cap", js("!!document.querySelector('video.icefin-preview')") is False
              and js("getComputedStyle(document.querySelector('.sp-row')).transitionDuration") == "0s")
        js("window.icefinTheme.ui.motion.cap('normal'); true")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(1.5)
        check("turning the theme off restores the stock UI", js("new Promise(r => window.api.theme.activeTheme(r))") == "" and js("document.documentElement.hasAttribute('data-icefin-theme')") is False)
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
    print("theme_spark:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
