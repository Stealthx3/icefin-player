#!/usr/bin/env python3
"""theme_plaza.py — the Plaza benchmark theme in the running app (PLAN 9.7; target the Wii Menu). Lab guests only.

  - Plaza is a built-in theme, offered in Client Settings → Theme;
  - a paged 4×3 grid of rounded channel tiles (each library, Continue watching, Next up, Search, Classic home, then
    empty slots), page arrows at the sides, and a bottom bar with the clock, the date and two round buttons;
  - library and media channels cycle previews of their content (live tiles);
  - pointer-first: html[data-icefin-pointer], and hovering a tile focuses it;
  - five-way: arrows move across the grid, down from the bottom row reaches the bar, right past the last column turns
    the page (a 30-channel grid has three pages);
  - Enter zooms the tile up to fill the screen and opens its channel screen (Menu and Start); Back zooms out with focus
    back on the tile; Start on a library opens jellyfin-web's library page styled by Plaza's tokens.
Layout positions and timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_plaza.py --app ~/build/src/icefin-player --server jf12 --out ~/r97/jf12
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9250)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-plaza-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_plaza: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        root = lambda name: js(f"document.getElementById('icefin-theme-root').getAttribute({json.dumps(name)})")
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('pz-tile')) return 'tile/' + [...f.parentElement.children].indexOf(f); "
                         "return f.className.split(' ').find(c => c.startsWith('pz-')) + '/' + f.textContent; })()")

        p = themes().get("plaza", {})
        check("Plaza offered as a built-in theme, usable", p.get("ok") is True and p.get("source") == "bundled", json.dumps(p)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root[data-pz]'); return !!r && r.hasAttribute('data-pz-ready'); })()", timeout=30)
        time.sleep(2)
        labels = json.loads(js("JSON.stringify([...document.querySelectorAll('.pz-tile')].map(t => t.plazaChannel ? t.plazaChannel.label : ''))"))
        named = [l for l in labels if l]
        check("a 4x3 page of channels: libraries, Continue watching, Next up, Search, Classic home, then empty slots",
              len(labels) == 12 and named[-4:] == ["Continue watching", "Next up", "Search", "Classic home"] and labels[-1] == "" or len(named) >= 12,
              json.dumps(labels))
        geo = json.loads(js("JSON.stringify((() => { const g = document.querySelector('.icefin-grid-page'); const cs = getComputedStyle(g); "
                            "return {cols: cs.gridTemplateColumns.split(' ').length, bar: document.querySelector('.pz-bar').getBoundingClientRect().height / innerHeight, "
                            "clock: document.querySelector('.pz-clock').textContent, date: document.querySelector('.pz-date').textContent, "
                            "rounds: document.querySelectorAll('.pz-round').length}; })())"))
        check("bottom bar with the clock, the date and two round buttons", geo["cols"] == 4 and abs(geo["bar"] - 304 / 1080) < 0.01 and geo["clock"] and geo["date"] and geo["rounds"] == 2, json.dumps(geo))
        check("pointer-first is on", js("document.documentElement.hasAttribute('data-icefin-pointer')") is True)
        check("focus starts on the first channel", foc() == "tile/0", foc())
        time.sleep(1)
        live = js("[...document.querySelectorAll('.pz-tile .icefin-live-tile')].length")
        check("library and media channels are live tiles", live == len(named) - 2, f"{live} live of {len(named)}")
        shot("home.png")

        act("right")
        check("right moves across the grid", foc() == "tile/1", foc())
        act("down")
        check("down moves a row", foc() == "tile/5", foc())
        act("down")
        act("down")
        check("down from the bottom row reaches the bar", foc().startswith("pz-round/"), foc())
        act("up")
        check("up from the bar returns to the grid", foc().startswith("tile/"), foc())

        # Hover focuses under pointer-first.
        r = json.loads(js("JSON.stringify((() => { const c = document.querySelectorAll('.pz-tile')[2].getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2]; })())"))
        page.send("Input.dispatchMouseEvent", type="mouseMoved", x=r[0], y=r[1])  # a real pointer move (a still cursor doesn't take focus)
        time.sleep(0.3)
        check("hovering a tile focuses it", foc() == "tile/2", foc())

        # Zoom into the first library channel and back out.
        js("window.icefinTheme._engine.focus(document.querySelectorAll('.pz-tile')[0]); true")
        act("enter")
        page.wait_for("document.getElementById('icefin-theme-root').hasAttribute('data-pz-channel')", timeout=10)
        z = js("(() => { const r = document.querySelector('.pz-zoom').getBoundingClientRect(); return r.width / innerWidth; })()")
        btns = json.loads(js("JSON.stringify([...document.querySelectorAll('.pz-pill')].map(b => b.textContent))"))
        check("Enter zooms the tile to fill the screen and opens its channel screen", z > 0.97 and btns == ["Menu", "Start"] and foc() == "pz-pill/Start", f"{z:.2f} {btns} {foc()}")
        shot("channel.png")
        act("left")
        check("left/right move between Menu and Start", foc() == "pz-pill/Menu", foc())
        act("down")
        check("the channel screen is modal", foc() == "pz-pill/Menu", foc())
        act("back")
        time.sleep(0.8)
        check("Back zooms out with focus back on the tile", root("data-pz-channel") is None and not js("!!document.querySelector('.pz-zoom')") and foc() == "tile/0", foc())

        # Several pages: 30 channels, right past the last column turns the page.
        js("document.getElementById('icefin-theme-root').plazaFill(Array.from({length: 30}, (_, i) => ({id: 'x' + i, label: 'Channel ' + i, hash: '#/search'}))); true")
        time.sleep(0.3)
        check("30 channels make three pages", root("data-pz-page") == "1/3" and js("document.querySelector('.pz-next').classList.contains('pz-hidden')") is False, str(root("data-pz-page")))
        for _ in range(3):
            act("right")
        act("right")
        check("right past the last column turns the page", root("data-pz-page") == "2/3" and foc() == "tile/0", f"{root('data-pz-page')} {foc()}")
        act("left")
        check("left past the first column turns back", root("data-pz-page") == "1/3", f"{root('data-pz-page')} {foc()}")
        shot("pages.png")

        # Start on a library channel.
        js("location.reload(); true")
        time.sleep(6)
        page.reconnect()
        try:
            page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root[data-pz]'); return !!r && r.hasAttribute('data-pz-ready'); })()", timeout=60)
        except Exception:
            raise RuntimeError("no Plaza home after the reload: " + js("JSON.stringify({hash: location.hash, active: window.icefinTheme && window.icefinTheme.active(), root: (document.getElementById('icefin-theme-root') || {}).outerHTML ? document.getElementById('icefin-theme-root').outerHTML.slice(0, 300) : null, user: window.ApiClient && window.ApiClient.getCurrentUserId()})"))
        time.sleep(1.5)
        act("enter")
        page.wait_for("document.getElementById('icefin-theme-root').hasAttribute('data-pz-channel')", timeout=10)
        before = (foc(), root("data-pz-channel"), js("[...document.querySelectorAll('.pz-tile[data-pz-channel]')].map(t => t.getAttribute('data-pz-channel'))"), js("window.ApiClient && window.ApiClient.getCurrentUserId()"))
        act("enter")
        try:
            page.wait_for("location.hash.startsWith('#/movies') || location.hash.startsWith('#/tv') || location.hash.startsWith('#/music') || location.hash.startsWith('#/list')", timeout=15)
        except Exception:
            raise RuntimeError(f"Start didn't open the library: before {before}, now {foc()} hash {js('location.hash')}")
        time.sleep(3)
        check("Start on a library opens its page, styled by Plaza's tokens",
              js("window.icefinTheme.active().route") is None
              and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-focus').trim().toLowerCase()") == "#34bdf2")
        check("leaving the screen turns pointer-first off", js("document.documentElement.hasAttribute('data-icefin-pointer')") is False)
        shot("library.png")

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
    print("theme_plaza:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
