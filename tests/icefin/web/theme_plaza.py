#!/usr/bin/env python3
"""theme_plaza.py — the Plaza benchmark theme in the running app (PLAN 9.7, 9.32; target the Wii Menu). Lab guests only.

  - Plaza is a built-in theme, offered in Client Settings → Theme;
  - the home: pages of channels in three rows at their own size (382 x 212 at 1080 lines), four columns at 16:9 and more
    on a wider window; libraries (an illustration under the name), Continue Watching (a disc), Next Up, each favourite as
    a channel, then empty slots; the next page peeks at the side; a bottom bar with the clock in its notch, the date and
    two round buttons, the right one Search;
  - pointer-first; five-way across the page, down to the bar, right past the last column turns the page (450 ms);
  - Enter zooms the channel into its card (Home and Open; Play for a favourite); left/right past the buttons step to the
    neighbouring channel; Back zooms out with focus back on the tile;
  - Open leads to the channel's full menu (#/movies, #/tv, #/music, #/livetv, #/home?pz=resume|nextup|series): tabs,
    a paged grid, Back returns to the home with the card open again;
  - Search opens from the round button: an on-screen keyboard types, Backspace deletes, results show;
  - controller hints show for a pad and hide for the mouse.
Screenshots go to --out.
Usage: python3 theme_plaza.py --app ~/build/src/icefin-player --server jf12 --out ~/r97/jf12
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

READY = "(() => { const r = document.querySelector('#icefin-theme-root[data-pz=\"home\"]'); return !!r && r.hasAttribute('data-pz-ready') && !!r.querySelector('.pz-tile.icefin-focused'); })()"


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
    fav_id = None

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
        root = lambda name: js(f"document.getElementById('icefin-theme-root').getAttribute({json.dumps(name)})")
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('pz-tile')) return 'tile/' + [...document.querySelectorAll('.pz-tile')].indexOf(f); "
                         "return (f.className.split(' ').find(c => c.startsWith('pz-')) || f.tagName) + '/' + (f.getAttribute('aria-label') || f.textContent).trim(); })()")
        go = lambda h: js(f"location.hash = {json.dumps(h)}; true")
        uid = js("window.ApiClient.getCurrentUserId()")

        p = themes().get("plaza", {})
        check("Plaza offered as a built-in theme, usable", p.get("ok") is True and p.get("source") == "bundled", json.dumps(p)[:160])
        # A favourite, so the home has a favourite channel (taken off again at the end).
        fav_id = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, Limit: 1}).then(r => (r.Items[0] || {}).Id || null)")
        if fav_id:
            js(f"window.ApiClient.updateFavoriteStatus({json.dumps(uid)}, {json.dumps(fav_id)}, true).then(() => true)")
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        page.wait_for(READY, timeout=40)
        time.sleep(2)

        # ---- the home ----
        chans = json.loads(js("JSON.stringify([...document.querySelectorAll('.pz-tile')].map(t => t.plazaChannel ? [t.plazaChannel.kind, t.plazaChannel.label] : null))"))
        kinds = [c[0] for c in chans if c]
        check("channels: libraries, Continue Watching, Next Up, the favourite, then empty slots",
              "movies" in kinds and "tvshows" in kinds and "resume" in kinds and "nextup" in kinds and (not fav_id or "favourite" in kinds)
              and chans[-1] is None and kinds.index("resume") < kinds.index("nextup"), json.dumps(chans)[:300])
        geo = json.loads(js("JSON.stringify((() => { const t = document.querySelector('.pz-tile').getBoundingClientRect(), u = innerHeight / 1080; "
                            "const b = document.querySelector('.pz-bar').getBoundingClientRect(); const rs = [...document.querySelectorAll('.pz-round')]; "
                            "return {w: t.width / u, h: t.height / u, top: t.top / u, cols: +getComputedStyle(document.getElementById('icefin-theme-root')).getPropertyValue('--pz-cols'), "
                            "bar: b.top / u, clock: document.querySelector('.pz-clock').textContent, date: document.querySelector('.pz-date').textContent, "
                            "rounds: rs.map(r => r.getAttribute('aria-label')), round: rs[0].getBoundingClientRect().width / u, aspect: innerWidth / innerHeight}; })())"))
        check("channels keep their size (382 x 212 at 1080 lines) from y 93, four columns at 16:9",
              abs(geo["w"] - 382) < 3 and abs(geo["h"] - 212) < 3 and abs(geo["top"] - 93) < 3 and (geo["cols"] == 4 or geo["aspect"] > 1.9), json.dumps(geo))
        check("bottom bar from y 795 with the clock, the date and round Settings and Search buttons",
              abs(geo["bar"] - 795) < 3 and geo["clock"] and geo["date"] and geo["rounds"] == ["Settings", "Search"] and abs(geo["round"] - 170) < 3, json.dumps(geo))
        check("library channels show an illustration under their name", js("!!document.querySelector('.pz-tile.pz-k-movies .pz-ill svg')") is True)
        check("Continue Watching is a disc", js("!!document.querySelector('.pz-tile.pz-k-resume .pz-disc')") is True)
        check("pointer-first is on", js("document.documentElement.hasAttribute('data-icefin-pointer')") is True)
        check("focus starts on the first channel", foc() == "tile/0", foc())
        shot("home.png")

        act("right")
        check("right moves across the page", foc() == "tile/1", foc())
        check("a pad shows the controller hints", js("document.documentElement.getAttribute('data-pz-input')") == "pad")
        act("down")
        check("down moves a row", foc() == "tile/5", foc())
        act("down")
        act("down")
        check("down from the bottom row reaches the bar", foc().startswith("pz-round/"), foc())
        act("up")
        check("up from the bar returns to the channels", foc().startswith("tile/"), foc())
        r = json.loads(js("JSON.stringify((() => { const c = document.querySelectorAll('.pz-tile')[2].getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2]; })())"))
        page.send("Input.dispatchMouseEvent", type="mouseMoved", x=r[0] - 5, y=r[1])
        page.send("Input.dispatchMouseEvent", type="mouseMoved", x=r[0], y=r[1])
        time.sleep(0.3)
        check("hovering a channel focuses it", foc() == "tile/2", foc())
        check("the mouse hides the controller hints", js("document.documentElement.getAttribute('data-pz-input')") == "pointer")

        # ---- the card ----
        movies_i = kinds.index("movies")
        js(f"window.icefinTheme.ctx.focus(document.querySelectorAll('.pz-tile')[{movies_i}]); true")
        act("enter")
        page.wait_for("document.getElementById('icefin-theme-root').hasAttribute('data-pz-channel')", timeout=10)
        time.sleep(1.2)
        card = json.loads(js("JSON.stringify((() => { const c = document.querySelector('.pz-card').getBoundingClientRect(), u = innerHeight / 1080; "
                             "return {left: c.left / u, top: c.top / u, w: c.width / innerWidth, pills: [...document.querySelectorAll('.pz-card .pz-pill')].map(b => b.textContent), "
                             "tab: document.querySelector('.pz-card-tab').textContent, fan: document.querySelectorAll('.pz-fan-card').length}; })())"))
        check("Enter zooms the channel into its card: name tab, a fan of posters, Home and Open",
              abs(card["left"] - 21) < 3 and abs(card["top"] - 18) < 3 and card["w"] > 0.95 and card["pills"] == ["Home", "Open"] and card["fan"] == 5 and foc() == "pz-pill/Open",
              json.dumps(card) + " " + foc())
        shot("card.png")
        act("left")
        check("left moves to Home", foc() == "pz-pill/Home", foc())
        first = root("data-pz-channel")
        act("left")
        time.sleep(0.6)
        check("left past Home steps to the neighbouring channel's card", root("data-pz-channel") not in (None, first), f"{first} -> {root('data-pz-channel')}")
        check("the neighbour's card has focus on its action again", foc() == "pz-pill/Open", foc())
        act("right")
        time.sleep(0.6)
        check("and right past Open steps back", root("data-pz-channel") == first, str(root("data-pz-channel")))
        act("down")
        check("the card is modal", foc() == "pz-pill/Open", foc())
        act("back")
        time.sleep(0.8)
        check("Back zooms out with focus back on the channel", root("data-pz-channel") is None and not js("!!document.querySelector('.pz-card')") and foc() == f"tile/{movies_i}", foc())

        if fav_id:
            fi = kinds.index("favourite")
            js(f"window.icefinTheme.ctx.focus(document.querySelectorAll('.pz-tile')[{fi}]); true")
            act("enter")
            time.sleep(1.4)
            pills = json.loads(js("JSON.stringify([...document.querySelectorAll('.pz-card .pz-pill')].map(b => b.textContent))"))
            check("a favourite's card has a preview and Play", pills == ["Home", "Play"] and js("!!document.querySelector('.pz-fav-frame')") is True, json.dumps(pills))
            shot("favourite.png")
            act("back")
            time.sleep(0.8)

        # ---- Open: the Movies menu, and Back to the card ----
        js(f"window.icefinTheme.ctx.focus(document.querySelectorAll('.pz-tile')[{movies_i}]); true")
        act("enter")
        time.sleep(1.2)
        act("enter")  # Open
        page.wait_for("location.hash.startsWith('#/movies') && !!document.querySelector('#icefin-theme-root[data-pz-view=\"movies\"] .pz-grid[data-pz-grid-ready]')", timeout=20)
        time.sleep(1)
        m = json.loads(js("JSON.stringify({tabs: [...document.querySelectorAll('.pz-tab')].map(t => t.textContent), cells: document.querySelectorAll('.pz-cell').length, "
                          "name: document.querySelector('.pz-mname').textContent, rounds: [...document.querySelectorAll('.pz-mround')].map(r => r.textContent)})"))
        check("Open leads to the Movies menu: tabs, a grid of posters, round Back and Home",
              m["name"] == "Movies" and m["tabs"][:4] == ["Movies", "Collections", "Genres", "Favourites"] and m["cells"] > 0 and m["rounds"] == ["Back", "Home"], json.dumps(m))
        check("focus starts in the grid", foc().startswith("pz-cell/"), foc())
        shot("movies.png")
        act("up")
        check("up from the grid reaches the tabs", foc().startswith("pz-tab/"), foc())
        js("[...document.querySelectorAll('.pz-tab')].find(t => t.textContent === 'Genres').click(); true")
        time.sleep(1.5)
        check("the Genres tab switches the grid", js("document.querySelector('.pz-tab.pz-tab-on').textContent") == "Genres" and js("!!document.querySelector('.pz-grid-wide[data-pz-grid-ready]')") is True)
        act("back")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz=\"home\"][data-pz-ready][data-pz-channel]')", timeout=20)
        time.sleep(0.5)
        check("Back from the menu returns to the home with the channel's card open", root("data-pz-channel") == first and foc() == "pz-pill/Open", f"{root('data-pz-channel')} {foc()}")
        act("back")
        time.sleep(0.8)

        # ---- the other menus ----
        go("#/tv")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz-view=\"tv\"] .pz-grid[data-pz-grid-ready]')", timeout=20)
        check("Shows menu", js("document.querySelector('.pz-mname').textContent") == "Shows")
        sid = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Series', Recursive: true, Limit: 1}).then(r => (r.Items[0] || {}).Id || null)")
        if sid:
            go(f"#/home?pz=series&id={sid}")
            page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz-view=\"series\"][data-pz-episodes]')", timeout=20)
            time.sleep(0.5)
            check("a series: its seasons as tabs and the season's episodes", int(root("data-pz-seasons") or 0) >= 1 and int(root("data-pz-episodes") or 0) >= 1 and foc().startswith("pz-ep/"),
                  f"{root('data-pz-seasons')} {root('data-pz-episodes')} {foc()}")
            shot("series.png")
        go("#/music")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz-view=\"music\"] .pz-grid[data-pz-grid-ready]')", timeout=20)
        check("Music menu with Albums, Artists, Songs, Playlists, Genres",
              json.loads(js("JSON.stringify([...document.querySelectorAll('.pz-tab')].map(t => t.textContent))"))[:5] == ["Albums", "Artists", "Songs", "Playlists", "Genres"])
        shot("music.png")
        go("#/livetv")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz-view=\"livetv\"] .pz-grid[data-pz-grid-ready]')", timeout=20)
        js("document.querySelector('[data-pz-tab=\"guide\"]').click(); true")
        page.wait_for("document.getElementById('icefin-theme-root').hasAttribute('data-pz-guide')", timeout=20)
        time.sleep(1.5)
        g = int(root("data-pz-guide") or 0)
        check("Live TV: channels, and a guide", (g == 0 and js("!!document.querySelector('.pz-guide .pz-empty')") is True) or js("document.querySelectorAll('.pz-guide .icefin-guide-row').length") > 0, f"{g} channels")
        shot("guide.png")
        go("#/home?pz=resume")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz-view=\"resume\"]') && document.getElementById('icefin-theme-root').hasAttribute('data-pz-ready')", timeout=20)
        check("Continue Watching: the disc rack", js("document.querySelector('.pz-mname').textContent") == "Continue Watching")
        shot("resume.png")
        go("#/home?pz=nextup")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz-view=\"nextup\"] .pz-grid[data-pz-grid-ready]')", timeout=20)
        check("Next Up menu", js("document.querySelector('.pz-mname').textContent") == "Next Up")

        # ---- search from the round button ----
        go("#/home")
        page.wait_for(READY, timeout=20)
        js("document.querySelector('.pz-round.pz-right').click(); true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz-view=\"search\"] .pz-key')", timeout=20)
        check("the round Search button opens search with focus on the keyboard", foc() == "pz-key/a", foc())
        word = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, Limit: 1}).then(r => ((r.Items[0] || {}).Name || 'a').slice(0, 3).toLowerCase())")
        letters = "".join(c for c in word if c.isalnum())
        for ch in letters:
            js(f"document.querySelector('[data-pz-key=\"{ch}\"]').click(); true")
        time.sleep(1.5)
        typed = js("document.querySelector('.pz-search-input').value")
        check("the on-screen keyboard types", typed == letters, typed)
        page.wait_for("!!document.querySelector('.pz-search-results .pz-grid[data-pz-grid-ready]')", timeout=15)
        check("results show for what was typed", js("document.querySelectorAll('.pz-search-results .pz-cell').length") > 0)
        shot("search.png")
        page.send("Input.dispatchKeyEvent", type="keyDown", key="Backspace", code="Backspace", windowsVirtualKeyCode=8)
        page.send("Input.dispatchKeyEvent", type="keyUp", key="Backspace", code="Backspace", windowsVirtualKeyCode=8)
        time.sleep(0.3)
        now = js("document.querySelector('.pz-search-input').value")
        check("Backspace deletes a letter on the search screen", now == typed[:-1], now)

        # ---- pages ----
        go("#/home")
        page.wait_for(READY, timeout=20)
        js("document.getElementById('icefin-theme-root').plazaFill(Array.from({length: 30}, (_, i) => ({id: 'x' + i, kind: 'folder', label: 'Channel ' + i, hash: '#/search'}))); true")
        time.sleep(0.3)
        js("window.icefinTheme.ctx.focus(document.querySelectorAll('.pz-tile')[0]); true")
        cols = int(js("+getComputedStyle(document.getElementById('icefin-theme-root')).getPropertyValue('--pz-cols')"))
        pages = -(-30 // (cols * 3))
        check("30 channels fill pages; the next page peeks at the side", root("data-pz-page") == f"1/{pages}"
              and js(f"document.querySelectorAll('.pz-tile')[{cols * 3}].getBoundingClientRect().left < innerWidth") is True, str(root("data-pz-page")))
        for _ in range(cols - 1):
            act("right")
        act("right")
        time.sleep(0.6)
        check("right past the last column turns the page", root("data-pz-page") == f"2/{pages}" and foc() == f"tile/{cols * 3}", f"{root('data-pz-page')} {foc()}")
        check("the page turns in 450 ms", js("getComputedStyle(document.querySelector('.pz-track')).transitionDuration") == "0.45s")
        act("left")
        time.sleep(0.6)
        check("left past the first column turns back", root("data-pz-page") == f"1/{pages}", f"{root('data-pz-page')} {foc()}")
        shot("pages.png")
        # A wider window: same channel size, more columns.
        page.send("Emulation.setDeviceMetricsOverride", width=2520, height=1080, deviceScaleFactor=1, mobile=False)
        time.sleep(1)
        wide = json.loads(js("JSON.stringify({cols: +getComputedStyle(document.getElementById('icefin-theme-root')).getPropertyValue('--pz-cols'), w: document.querySelector('.pz-tile').getBoundingClientRect().width / (innerHeight / 1080)})"))
        check("a 21:9 window shows more columns of the same size", wide["cols"] >= 5 and abs(wide["w"] - 382) < 3, json.dumps(wide))
        shot("wide.png")
        page.send("Emulation.clearDeviceMetricsOverride")
        time.sleep(0.5)

        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(1.5)
        check("turning the theme off restores the stock UI", js("new Promise(r => window.api.theme.activeTheme(r))") == "" and js("document.documentElement.hasAttribute('data-icefin-theme')") is False)
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            if fav_id:
                page.eval(f"window.ApiClient.updateFavoriteStatus(window.ApiClient.getCurrentUserId(), {json.dumps(fav_id)}, false).then(() => true)")
        except Exception:  # noqa: BLE001
            pass
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
