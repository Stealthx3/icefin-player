#!/usr/bin/env python3
"""theme_plum.py — the Plum benchmark theme in the running app (PLAN 9.6; target Roku TV). Lab guests only.

  - Plum is a built-in theme, offered in Client Settings → Theme;
  - two panes under a slim header: the menu column (Home, each library, Search, Settings, Classic home) in the
    side-rail chrome slot, about 27% of the width, and the header in the top-bar slot with the clock;
  - Home's grid is three wide tiles across, the libraries first; a library's grid is four posters across;
  - five-way navigation: up/down on the menu change section, right enters the grid, arrows move cell by cell and stop
    at the grid's right edge, left from the first column and Back return to the menu;
  - Enter on a library tile opens that library in the grid and moves the menu with it; Enter on an item opens
    jellyfin-web's details page styled by Plum's tokens;
  - motion (user feedback 2026-11-11): rows and one focus frame glide (no theme motion cap; the target's frame jumps)
    and lifts the cap when the screen goes; a long grid steps a row at a time with the focused row on screen, and
    art is requested only near the visible rows (lowest-spec HTPC budget).
Layout positions and timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_plum.py --app ~/build/src/icefin-player --server jf12 --out ~/r96/jf12
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
    ap.add_argument("--port", type=int, default=9249)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-plum-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_plum: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        attr = lambda name: js(f"document.querySelector('.icefin-content').getAttribute({json.dumps(name)})")
        motion = lambda: js("document.documentElement.getAttribute('data-icefin-motion')")

        p = themes().get("plum", {})
        check("Plum offered as a built-in theme, usable", p.get("ok") is True and p.get("source") == "bundled", json.dumps(p)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('plum', '', r))")
        page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root[data-pl]'); return !!r && +r.getAttribute('data-pl-menu') > 0; })()", timeout=30)
        page.wait_for("!!document.querySelector('.icefin-content[data-pl-ready]')", timeout=30)
        time.sleep(1.5)

        menu = json.loads(js("JSON.stringify([...document.querySelectorAll('.pl-menu-item')].map(e => e.textContent))"))
        check("menu: Home, the libraries, Search, Settings, Classic home", menu[0] == "Home" and menu[-3:] == ["Search", "Settings", "Classic home"] and len(menu) >= 5, json.dumps(menu))
        nlib = len(menu) - 4
        geo = json.loads(js("JSON.stringify({rail: document.querySelector('.icefin-siderail').getBoundingClientRect().width / innerWidth, "
                            "bar: document.querySelector('.icefin-topbar').getBoundingClientRect().height / innerHeight, "
                            "clock: document.querySelector('.pl-clock').textContent})"))
        check("header band 185/1080 with the clock; the focused menu widens to 470/1920 (210 collapsed)",
              abs(geo["rail"] - 470 / 1920) < 0.01 and abs(geo["bar"] - 185 / 1080) < 0.01 and bool(geo["clock"]), json.dumps(geo))
        dur = js("parseFloat(getComputedStyle(document.querySelector('.pl-grid')).transitionDuration)")
        # User feedback 2026-11-11: motion instead of the target's still frame. Rows glide, the focus frame glides.
        frame = js("parseFloat(getComputedStyle(document.querySelector('.pl-frame')).transitionDuration)")
        check("rows and the focus frame glide (no motion cap)", motion() == "normal" and 0.2 <= dur <= 0.4 and 0.15 <= frame <= 0.25, f"{motion()} grid {dur}s frame {frame}s")

        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('pl-menu-item')) return 'menu/' + f.textContent; "
                         "return 'cell/' + [...document.querySelectorAll('.pl-tile')].indexOf(f); })()")
        cols = lambda: int(attr("data-pl-cols") or 0)
        ncells = lambda: int(attr("data-pl-ready") or 0)
        check("Home focused first; its grid is three 4:3 tiles across, the libraries first",
              foc() == "menu/Home" and attr("data-pl-section") == "Home" and cols() == 3
              and js("[...document.querySelectorAll('.pl-tile')].slice(0, %d).every(t => t.classList.contains('library'))" % nlib) is True
              and js("document.querySelector('.pl-grid').classList.contains('pl-wide')") is True, f"{foc()} cols={cols()} cells={ncells()}")
        shot("home.png")

        act("right")
        check("right enters the grid at its first tile", foc() == "cell/0", foc())
        time.sleep(0.4)
        check("in the grid the menu folds to its marks (210/1920) and the count reads 1 of n",
              abs(js("document.querySelector('.icefin-siderail').getBoundingClientRect().width / innerWidth") - 210 / 1920) < 0.01
              and js("document.querySelector('.pl-count').textContent").startswith("1 of "), js("document.querySelector('.pl-count').textContent"))
        n = ncells()
        if n >= 2:
            act("right")
            check("right moves along the row", foc() == "cell/1", foc())
            act("right")
            act("right")
            check("right stops at the grid's right edge", foc() == f"cell/{min(2, n - 1)}", foc())
        if n >= 4:
            act("down")
            check("down moves one row (three cells)", foc() == f"cell/{min(5, n - 1)}", foc())
            act("up")
        act("left")
        act("left")
        act("left")
        check("left from the first column returns to the menu", foc() == "menu/Home", foc())
        act("right")
        act("back")
        check("Back from the grid returns to the menu", foc() == "menu/Home", foc())

        # Enter on the first library tile: the grid shows that library and the menu follows.
        act("right")
        act("enter")
        page.wait_for(f"document.querySelector('.icefin-content').getAttribute('data-pl-section') === {json.dumps(menu[1])} && document.querySelector('.icefin-content').getAttribute('data-pl-ready') !== null", timeout=20)
        time.sleep(1)
        check("Enter on a library tile opens it: four posters across, menu moved with it",
              cols() == 4 and foc() in ("cell/0", f"menu/{menu[1]}") and js("document.querySelector('.pl-menu-item.current').textContent") == menu[1],
              f"cols={cols()} {foc()}")
        shot("library.png")

        # A long grid: 300 tiles, stepping by rows, art loaded only near the visible rows.
        js("document.querySelector('.icefin-content').plumFill({cols: 4, wide: false, tiles: Array.from({length: 300}, (_, i) => "
           f"({{kind: 'item', label: 'Item ' + i, sub: '', art: {json.dumps(PIXEL)}, item: {{Id: 'x' + i, Name: 'Item ' + i}}}}))}}); true")
        act("left")
        act("right")
        loaded0 = int(attr("data-pl-loaded") or 0)
        for _ in range(15):
            act("down")
        time.sleep(0.3)
        vis = js("(() => { const f = document.querySelector('.pl-tile.icefin-focused').getBoundingClientRect(); "
                 "const v = document.querySelector('.pl-grid-view').getBoundingClientRect(); return f.top >= v.top - 1 && f.bottom <= v.bottom + 1; })()")
        top = int(attr("data-pl-top") or 0)
        loaded = int(attr("data-pl-loaded") or 0)
        check("a 300-tile grid steps a row at a time and keeps the focused row on screen", foc() == "cell/60" and top > 0 and vis is True, f"{foc()} top={top} visible={vis}")
        check("art only near the visible rows", 0 < loaded0 <= 40 and loaded <= 120, f"first={loaded0} after={loaded} of 300")
        act("down")
        for _ in range(80):
            act("down")
        check("down stops at the last row", foc() == "cell/299" or foc() == "cell/296", foc())
        act("back")
        check("Back returns to the library's menu entry", foc() == f"menu/{menu[1]}", foc())

        # An item tile opens the details page; leaving the screen lifts the motion cap.
        for _ in range(len(menu)):
            act("up")
        page.wait_for("document.querySelector('.icefin-content').getAttribute('data-pl-section') === 'Home' && document.querySelector('.icefin-content').getAttribute('data-pl-ready') !== null", timeout=20)
        time.sleep(0.8)
        if ncells() > nlib:
            act("right")
            for _ in range(nlib):  # walk the grid to the first item tile, reading order
                c = int(foc().split("/")[1])
                if c % 3 < 2:
                    act("right")
                else:
                    act("down")
                    act("left")
                    act("left")
            check("five-way walk reaches the first item tile", foc() == f"cell/{nlib}", foc())
            act("enter")
            page.wait_for("location.hash.startsWith('#/details')", timeout=15)
            time.sleep(3)
            check("Enter on an item opens the details page, styled by Plum's tokens",
                  js("window.icefinTheme.active().route") is None and js("document.documentElement.classList.contains('icefin-themed')") is True
                  and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-background').trim().toLowerCase()") == "#2b0f45")
            check("leaving the screen lifts the theme's motion cap", motion() != "low", str(motion()))
            shot("details.png")
            js("location.hash = '#/home'; true")
            page.wait_for("!!document.querySelector('.icefin-content[data-pl-ready]')", timeout=20)
            time.sleep(1)
        else:
            check("Enter on an item opens the details page (server has nothing in progress)", True, "skipped: no item tiles on Home")

        for _ in range(len(menu)):
            act("down")
        check("menu stops at its last entry", foc() == "menu/Classic home", foc())
        act("enter")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)

        sounds = js("new Promise(r => window.api.theme.soundState(r))")
        check("Plum plays its interface sounds (theme-sounds.py; user feedback 2026-11-11)", sounds.get("played", 0) > 0, json.dumps(sounds)[:120])
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
    print("theme_plum:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
