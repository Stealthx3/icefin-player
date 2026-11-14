#!/usr/bin/env python3
"""theme_marquee.py — the Marquee benchmark theme in the running app (PLAN 9.13; target the Netflix TV app). Lab guests only.

  - Marquee is a built-in theme, offered in Client Settings → Theme;
  - home: a navigation bar along the top (Search, Home, each library, Settings, Classic home); rows of titles where the
    focused row stands tall at the top, its focused card widened to 16:9 with the title's details under it;
  - after a dwell a muted preview plays in the widened card, in the page's own <video> (never mpv); none under the
    low-motion cap;
  - right/left move along the row and the focused card keeps the first slot; down/up change row and the focused row
    rises to the top; up from the first row reaches the bar, down returns; Back from a row goes to the bar;
  - Enter opens its details (9.18: the themed screen, or jellyfin-web's page for a book; Marquee's tokens); Classic home shows the stock home; turning the theme
    off restores the stock UI.
Layout positions against the reference: clone_layout.py --theme marquee. Screenshots go to --out.
Usage: python3 theme_marquee.py --app ~/build/src/icefin-player --server jf12 --out ~/r913/jf12
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
    ap.add_argument("--port", type=int, default=9253)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-marquee-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_marquee: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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

        mq = themes().get("marquee", {})
        check("Marquee offered as a built-in theme, usable", mq.get("ok") is True and mq.get("source") == "bundled", json.dumps(mq)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('marquee', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-mq-ready]')", timeout=40)
        time.sleep(1.5)
        R = "document.querySelector('#icefin-theme-root')"
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('mq-nav')) return 'nav/' + f.marqueeName; "
                         "const s = f.closest('.mq-row'); return 'row/' + [...document.querySelectorAll('.mq-row')].indexOf(s) + '/' + f.marqueeIndex; })()")
        nav = json.loads(js("JSON.stringify([...document.querySelectorAll('.mq-nav')].map(e => e.marqueeName))"))
        check("top bar: Search, Home, the libraries, Settings, Classic home", nav[:2] == ["Search", "Home"] and nav[-2:] == ["Settings", "Classic home"] and len(nav) >= 5, json.dumps(nav))
        check("focus starts on the first row's first card", foc() == "row/0/0", foc())
        g = json.loads(js("JSON.stringify((() => { const o = document.querySelector('.mq-card.open').getBoundingClientRect(), n = document.querySelectorAll('.mq-row.current .mq-card')[1]; const r = n ? n.getBoundingClientRect() : {width: 0}; return {open: o.width / innerWidth, h: o.height / innerHeight, next: r.width / innerWidth, facts: document.querySelector('.mq-row.current .mq-facts').textContent}; })())"))
        check("the focused card is widened to 916/1920 beside 316/1920 cards, 512/1080 tall, details under it", abs(g["open"] - 916 / 1920) < 0.01 and abs(g["h"] - 512 / 1080) < 0.01
              and (g["next"] == 0 or abs(g["next"] - 316 / 1920) < 0.01) and g["facts"] != "", json.dumps(g))
        shot("home.png")
        try:
            page.wait_for(f"{R}.dataset.mqPreview === 'playing'", timeout=15)
            page.wait_for("document.querySelector('.mq-card.open video.icefin-preview').currentTime > 0.3", timeout=30)
            playing = True
        except Exception:  # noqa: BLE001
            playing = False
        check("after a dwell a muted preview plays in the widened card", playing and js("document.querySelector('.mq-card.open video.icefin-preview').muted") is True,
              js("JSON.stringify((v => v ? {t: v.currentTime, e: (v.error || {}).message || ''} : null)(document.querySelector('.mq-card.open video.icefin-preview')))"))
        check("the preview isn't mpv (no player session)", js("!!(window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying())") is False)
        shot("preview.png")
        left0 = js("document.querySelector('.mq-card.open').getBoundingClientRect().left")
        n0 = js("document.querySelectorAll('.mq-row')[0].querySelectorAll('.mq-card').length")
        if n0 >= 2:
            act("right")
            time.sleep(0.8)
            left1 = js("document.querySelector('.mq-card.open').getBoundingClientRect().left")
            check("right opens the next card in the first slot; the preview stops", foc() == "row/0/1" and abs(left1 - left0) < 2 and js("!!document.querySelector('video.icefin-preview')") is False, f"{foc()} {left0}->{left1}")
            act("left")
        nrows = js("document.querySelectorAll('.mq-row').length")
        if nrows >= 2:
            top0 = js("document.querySelector('.mq-row.current .mq-row-title').getBoundingClientRect().top")
            act("down")
            time.sleep(0.8)
            top1 = js("document.querySelector('.mq-row.current .mq-row-title').getBoundingClientRect().top")
            check("down: the next row rises to the top line and stands tall", foc().startswith("row/1/") and abs(top1 - top0) < 2, f"{foc()} {top0}->{top1}")
            act("up")
            time.sleep(0.6)
            check("up returns to the first row where it was", foc() == "row/0/0", foc())
        act("up")
        check("up from the first row reaches the bar on Home", foc() == "nav/Home", foc())
        act("right")
        check("the bar moves left and right", foc() == f"nav/{nav[2]}", foc())
        act("down")
        check("down from the bar returns to the rows", foc() == "row/0/0", foc())
        # a long row keeps the focused card in the first slot (the lab libraries are small)
        js("document.querySelectorAll('.mq-row')[0].marqueeRow.setItems(Array.from({length: 40}, (_, i) => ({Id: 'x' + i, Name: 'Item ' + i, ImageTags: {}}))); true")
        js("window.icefinTheme._engine.focus(document.querySelectorAll('.mq-row')[0].querySelector('.mq-card')); true")
        for _ in range(12):
            act("right")
        time.sleep(0.8)
        lx = js("document.querySelector('.mq-card.icefin-focused').getBoundingClientRect().left / innerWidth")
        check("along a long row the focused card keeps the first slot", foc() == "row/0/12" and abs(lx - 49 / 1920) < 0.01, f"{foc()} left={lx:.3f}")
        act("back")
        check("Back from a row goes to the bar", foc() == "nav/Home", foc())
        act("down")
        time.sleep(0.5)
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        check("Enter on a card opens its details (themed screen or, for a book, the stock page), styled by Marquee's tokens",
              (det := js(DETAILS_OK))["ok"]
              and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-accent').trim().toLowerCase()") == "#e50914", json.dumps(det))
        shot("details.png")
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-mq-ready]')", timeout=30)
        time.sleep(1)
        act("up")
        for _ in range(len(nav)):
            act("right")
        check("the bar stops at its last entry", foc() == "nav/Classic home", foc())
        act("enter")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-mq-ready]')", timeout=30)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        act("up")
        act("down")
        time.sleep(4)
        check("no preview under the low-motion cap", js("!!document.querySelector('.mq-card video.icefin-preview')") is False)
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
    print("theme_marquee:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
