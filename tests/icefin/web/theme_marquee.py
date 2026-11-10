#!/usr/bin/env python3
"""theme_marquee.py — the Marquee benchmark theme in the running app (PLAN 9.13; target the Netflix TV app). Lab guests only.

  - Marquee is a built-in theme, offered in Client Settings → Theme;
  - home: a collapsed icon rail (Search, Home, each library, Settings, Classic home) that widens with labels while it
    has focus, without moving the content; a billboard with Play and More info; rows of 16:9 cards;
  - the billboard: after a dwell a muted trailer plays in the page's own <video> (never mpv) and the title shrinks;
    leaving the billboard stops it; none under the low-motion cap;
  - rows jump by a page: moving past the last whole card shifts the row by a page;
  - the focused card grows into an inline preview (details, muted trailer) over its neighbours, without reflowing the
    row; moving on collapses it;
  - Back from a row returns to the billboard, from the billboard to the rail; right from the rail goes back;
  - Enter opens jellyfin-web's details page (Marquee's tokens); Classic home shows the stock home; turning the theme
    off restores the stock UI.
Layout positions and motion timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_marquee.py --app ~/build/src/icefin-player --server jf12 --out ~/r913/jf12
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
                         "if (f.classList.contains('mq-nav')) return 'rail/' + f.querySelector('.icefin-rail-label').textContent; "
                         "if (f.classList.contains('mq-btn')) return 'bill/' + [...document.querySelectorAll('.mq-btn')].indexOf(f); "
                         "const s = f.closest('.mq-row'); return 'row/' + [...document.querySelectorAll('.mq-row')].indexOf(s) + '/' + f.marqueeIndex; })()")
        rail = json.loads(js("JSON.stringify([...document.querySelectorAll('.mq-nav .icefin-rail-label')].map(e => e.textContent))"))
        check("rail: Search, Home, the libraries, Settings, Classic home", rail[:2] == ["Search", "Home"] and rail[-2:] == ["Settings", "Classic home"] and len(rail) >= 5, json.dumps(rail))
        check("focus starts on Play; the rail is collapsed", foc() == "bill/0" and js("document.querySelector('.icefin-siderail').dataset.icefinRail") == "collapsed", foc())
        g = json.loads(js("JSON.stringify({rail: document.querySelector('.icefin-siderail').getBoundingClientRect().width / innerWidth, bill: document.querySelector('.mq-billboard').getBoundingClientRect().height / innerHeight, content: document.querySelector('.icefin-content').getBoundingClientRect().left})"))
        check("proportions: rail about 6% wide, billboard about two thirds of the height", 0.05 <= g["rail"] <= 0.07 and 0.62 <= g["bill"] <= 0.70, json.dumps(g))
        shot("home.png")
        # trailer after the dwell
        try:
            page.wait_for(f"{R}.dataset.mqTrailer === 'playing'", timeout=15)
            page.wait_for("document.querySelector('.mq-billboard video.icefin-preview').currentTime > 0.3", timeout=30)
            playing = True
        except Exception:  # noqa: BLE001
            playing = False
        check("after a dwell a muted trailer plays in the page's own video", playing and js("document.querySelector('.mq-billboard video.icefin-preview').muted") is True,
              js("JSON.stringify((v => v ? {t: v.currentTime, e: (v.error || {}).message || ''} : null)(document.querySelector('.mq-billboard video.icefin-preview')))"))
        time.sleep(1)
        check("the title shrinks while the trailer plays", "matrix(0.62" in js("getComputedStyle(document.querySelector('.mq-title')).transform"), js("getComputedStyle(document.querySelector('.mq-title')).transform"))
        check("the trailer isn't mpv (no player session)", js("!!(window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying())") is False)
        shot("trailer.png")
        # rail
        act("left")
        time.sleep(0.5)
        g2 = json.loads(js("JSON.stringify({rail: document.querySelector('.icefin-siderail').getBoundingClientRect().width / innerWidth, content: document.querySelector('.icefin-content').getBoundingClientRect().left})"))
        check("left from Play opens the rail on Home, labels shown; the trailer stops", foc() == "rail/Home" and g2["rail"] > 0.2
              and js("getComputedStyle(document.querySelector('.mq-nav .icefin-rail-label')).opacity") == "1" and js("!!document.querySelector('.mq-billboard video.icefin-preview')") is False, f"{foc()} {json.dumps(g2)}")
        check("the content doesn't move when the rail expands", abs(g2["content"] - g["content"]) < 0.5)
        shot("rail.png")
        act("down")
        check("up/down move along the rail", foc() == f"rail/{rail[2]}", foc())
        act("right")
        time.sleep(0.4)
        check("right from the rail returns to where focus was; the rail collapses", foc() == "bill/0" and js("document.querySelector('.icefin-siderail').dataset.icefinRail") == "collapsed", foc())
        # rows
        act("down")
        time.sleep(0.6)
        check("down from the billboard enters the first row", foc() == "row/0/0", foc())
        lefts = js("JSON.stringify([...document.querySelectorAll('.mq-row')[0].querySelectorAll('.mq-card')].map(c => c.offsetLeft))")
        time.sleep(1.2)
        exp = js("(document.querySelector('.icefin-card-expanded .mq-x-title') || {}).textContent || ''")
        card0 = js("document.querySelector('.mq-card.icefin-focused').marqueeItem.Name")
        check("after a dwell the focused card grows into a preview with its details", exp != "" and card0 in exp, f"{exp!r} for {card0!r}")
        pr = json.loads(js("JSON.stringify((() => { const p = document.querySelector('.icefin-card-expanded').getBoundingClientRect(), c = document.querySelector('.mq-card.icefin-focused').getBoundingClientRect(); return [p.width / c.width, p.height / c.height]; })())"))
        check("the preview is larger than the card, the row doesn't reflow", pr[0] > 1.3 and pr[1] > 1.3
              and js("JSON.stringify([...document.querySelectorAll('.mq-row')[0].querySelectorAll('.mq-card')].map(c => c.offsetLeft))") == lefts, json.dumps(pr))
        shot("expanded.png")
        # page jump: a 40-item row (the lab libraries are small)
        js("document.querySelectorAll('.mq-row')[0].marqueeRow.setItems(Array.from({length: 40}, (_, i) => ({Id: 'x' + i, Name: 'Item ' + i, ImageTags: {}}))); true")
        js("window.icefinTheme._engine.focus(document.querySelectorAll('.mq-row')[0].querySelector('.mq-card')); true")
        per = js("document.querySelectorAll('.mq-row')[0].marqueeRow.perPage()")
        for _ in range(per - 1):
            act("right")
        p_before = js("document.querySelectorAll('.mq-row')[0].dataset.mqPage")
        act("right")
        time.sleep(0.8)
        p_after = js("document.querySelectorAll('.mq-row')[0].dataset.mqPage")
        vis = js("(() => { const r = document.querySelector('.mq-card.icefin-focused').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()")
        first = js("(() => { const r = document.querySelector('.mq-card.icefin-focused').getBoundingClientRect(); return r.left / innerWidth; })()")
        check("past the last whole card the row jumps a page; the focused card is first on the new page", p_before == "0" and p_after == "1" and foc() == f"row/0/{per}" and vis is True and first < 0.15,
              f"{p_before}->{p_after} {foc()} per={per} left={first:.3f}")
        act("left")
        time.sleep(0.6)
        check("left past the page's first card jumps back", js("document.querySelectorAll('.mq-row')[0].dataset.mqPage") == "0" and foc() == f"row/0/{per - 1}", foc())
        check("moving on collapses the preview", js("!document.querySelector('.icefin-card-expanded')") or js("document.querySelector('.icefin-card-expanded .mq-x-title').textContent").find(js("document.querySelector('.mq-card.icefin-focused').marqueeItem.Name")) >= 0)
        act("back")
        time.sleep(0.5)
        check("Back from a row returns to the billboard", foc() == "bill/0", foc())
        act("back")
        check("Back from the billboard opens the rail", foc() == "rail/Home", foc())
        act("right")
        act("down")
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        check("Enter on a card opens the details page, styled by Marquee's tokens",
              js("window.icefinTheme.active().route") is None and js("document.documentElement.classList.contains('icefin-themed')") is True
              and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-accent').trim().toLowerCase()") == "#e50914")
        shot("details.png")
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-mq-ready]')", timeout=30)
        time.sleep(1)
        act("left")
        for _ in range(len(rail)):
            act("down")
        check("the rail stops at its last entry", foc() == "rail/Classic home", foc())
        act("enter")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-mq-ready]')", timeout=30)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        act("down")
        act("up")
        time.sleep(4)
        check("no trailer under the low-motion cap", js("!!document.querySelector('.mq-billboard video.icefin-preview')") is False)
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
