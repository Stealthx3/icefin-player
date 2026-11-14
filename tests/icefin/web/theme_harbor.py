#!/usr/bin/env python3
"""theme_harbor.py — the Harbor benchmark theme in the running app (PLAN 9.4; target Kodi Estuary). Lab guests only.

  - Harbor is a built-in theme, offered in Client Settings → Theme;
    turning it off while Harbor is active switches the engine off;
  - Harbor's home: the persistent left menu (Home, each library, Search, Settings, Classic home) in the side-rail chrome
    slot, 462/1920 of the width like the target; the focused section's categories row and shelves over a fanart layer;
  - five-way navigation: up/down on the menu change section, right enters the categories row, down the shelves, left
    from a row's first item and Back return to the menu, up/down change row and each row keeps its column;
  - each category tile opens the matching jellyfin-web tab of the library;
  - Enter on a poster opens the info dialog (Play/Resume, More info); Back closes it and focus returns to the poster;
    More info opens Harbor's themed details screen (9.18); Classic home shows the stock home;
  - transitions drop to zero under the low-motion cap.
Layout positions and motion timings against the reference: clone_layout.py --theme harbor. Screenshots go to --out.
Usage: python3 theme_harbor.py --app ~/build/src/icefin-player --server jf12 --out ~/r94/jf12
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
    ap.add_argument("--port", type=int, default=9248)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-harbor-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_harbor: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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

        h = themes().get("harbor", {})
        check("Harbor offered as a built-in theme, usable", h.get("ok") is True and h.get("source") == "bundled", json.dumps(h)[:160])
        # The lab user's theme choice syncs to the server (8.5): an earlier run's theme may play sounds before Harbor's
        # is applied, so Harbor's sounds are counted from here.
        played0 = (js("new Promise(r => window.api.theme.soundState(r))") or {}).get("played", 0)
        js("new Promise(r => window.api.theme.setActiveTheme('harbor', '', r))")
        page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root[data-hb]'); return !!r && +r.getAttribute('data-hb-rail') > 0; })()", timeout=30)
        page.wait_for("!!document.querySelector('.icefin-content[data-hb-ready]')", timeout=30)
        time.sleep(1.5)
        rail = json.loads(js("JSON.stringify([...document.querySelectorAll('.hb-rail-item')].map(e => e.textContent))"))
        check("menu: Home, the libraries, Search, Settings, Classic home", rail[0] == "Home" and rail[-3:] == ["Search", "Settings", "Classic home"] and len(rail) >= 5, json.dumps(rail))
        frac = js("document.querySelector('.icefin-siderail').getBoundingClientRect().width / window.innerWidth")
        check("menu is 462/1920 of the width (side-rail chrome slot)", abs(frac - 462 / 1920) < 0.005, f"{frac:.3f}")
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('hb-rail-item')) return 'rail/' + f.textContent; "
                         "if (f.classList.contains('hb-button')) return 'button/' + f.textContent; "
                         "const s = f.closest('.hb-shelf'); const row = [...f.parentElement.children]; "
                         "return 'shelf/' + [...document.querySelectorAll('.hb-shelf')].indexOf(s) + '/' + row.indexOf(f); })()")
        section = lambda: js("document.querySelector('.icefin-content').getAttribute('data-hb-section')")
        nshelves = lambda: int(js("document.querySelector('.icefin-content').getAttribute('data-hb-ready')") or 0)
        check("Home focused first and its shelves shown", foc() == "rail/Home" and section() == "Home" and nshelves() >= 1, f"{foc()} {section()} {nshelves()}")
        shot("home.png")

        # Down the menu to the library with the most shelves (at least two if the server has them), among those whose
        # items open themed details: books and photos keep jellyfin-web's own page (9.18), and with an empty Continue
        # Watching and Next Up (reset-watch.py) Books tied with Shows and won.
        stock_kinds = ("books", "homevideos", "photos", "playlists", "livetv")
        stock_libs = set(js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.filter(v => %s.includes(v.CollectionType)).map(v => v.Name))" % json.dumps(list(stock_kinds))))
        best, best_n = 0, nshelves()
        for i in range(1, len(rail) - 3):
            act("down")
            page.wait_for(f"document.querySelector('.icefin-content').getAttribute('data-hb-section') === {json.dumps(rail[i])} && document.querySelector('.icefin-content').getAttribute('data-hb-ready') !== null", timeout=15)
            time.sleep(0.8)
            if i == 1:
                check("down on the menu changes section", foc() == f"rail/{rail[1]}" and section() == rail[1], f"{foc()} {section()}")
            if nshelves() > best_n and rail[i] not in stock_libs:
                best, best_n = i, nshelves()
        for _ in range(len(rail)):
            act("up")
        for _ in range(best):
            act("down")
        page.wait_for(f"document.querySelector('.icefin-content').getAttribute('data-hb-section') === {json.dumps(rail[best])}", timeout=15)
        time.sleep(1.2)
        act("right")
        time.sleep(0.5)
        check("right enters the categories row", foc() == "shelf/0/0" and js("document.querySelector('.icefin-focused').classList.contains('hb-tile')") is True, foc())
        act("down")
        time.sleep(0.6)
        check("down moves to the first shelf", foc() == "shelf/1/0", foc())
        fan = js("document.getElementById('icefin-theme-root').getAttribute('data-hb-fanart')")
        has = js("(() => { const it = document.querySelector('.hb-poster.icefin-focused').harborItem; return !!((it.BackdropImageTags || []).length || (it.ParentBackdropImageTags || []).length); })()")
        check("fanart layer follows the focused item", fan == ("item" if has else "none"), f"{fan} (item has a backdrop: {has})")
        row0 = js("document.querySelectorAll('.hb-shelf')[1].querySelectorAll('.hb-poster').length")
        if row0 >= 2:
            act("right")
            check("right moves along the shelf", foc() == "shelf/1/1", foc())
        if best_n >= 3:
            act("down")
            check("down moves to the next shelf", foc().startswith("shelf/2/"), foc())
            act("up")
            check("up returns to the column the shelf kept", foc() == ("shelf/1/1" if row0 >= 2 else "shelf/1/0"), foc())
        time.sleep(0.6)
        shot("shelves.png")
        act("left")
        if row0 >= 2:
            act("left")
        check("left from the first poster returns to the menu, same section", foc() == f"rail/{rail[best]}", foc())
        act("right")
        act("back")
        check("Back from the shelves returns to the menu", foc() == f"rail/{rail[best]}", foc())

        act("right")  # back into the row it left, like the target's group list
        if foc().startswith("shelf/0/"):
            act("down")  # a poster, not a category tile
        opened_from = foc()
        act("enter")
        page.wait_for("document.getElementById('icefin-theme-root').getAttribute('data-hb-dialog') === 'info'", timeout=10)
        buttons = json.loads(js("JSON.stringify([...document.querySelectorAll('.hb-info .hb-button')].map(e => e.textContent))"))
        check("Enter opens the info dialog: play and More info", buttons[-1] == "More info" and any(b.startswith(("Play", "Resume")) for b in buttons), json.dumps(buttons))
        check("the dialog holds the item's title and overview", bool(js("document.querySelector('.hb-info-title').textContent")))
        act("right")
        check("left/right move between the dialog's buttons", foc() == f"button/{buttons[1]}", foc())
        act("down")
        check("the dialog is modal", foc() == f"button/{buttons[1]}", foc())
        time.sleep(0.4)
        shot("info.png")
        act("back")
        check("Back closes the dialog and returns to the poster", js("document.getElementById('icefin-theme-root').hasAttribute('data-hb-dialog')") is False and foc() == opened_from, f"{foc()} (opened from {opened_from})")
        act("enter")
        page.wait_for("!!document.querySelector('.hb-info')", timeout=10)
        for _ in range(len(buttons)):
            act("right")
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        check("More info opens Harbor's themed details screen (9.18)",
              js("(document.querySelector('#icefin-theme-root') || {getAttribute: () => null}).getAttribute('data-icefin-details') !== null") is True
              and js("document.querySelector('.icefin-details').dataset.layout") == "poster")
        shot("details.png")

        # Each library's category tiles open the matching jellyfin-web view (Harbor's TABS against jellyfin-web 10.11, whose
        # library pages mark the current view .Mui-selected; older pages .emby-tab-button-active).
        names = {"Titles": "Movies", "Favourites": "Favorites", "Networks": "TV Networks"}
        def open_section(i, label):
            js("location.hash = '#/home'; true")
            page.wait_for("!!document.querySelector('.icefin-content[data-hb-ready]') && !!document.querySelector('.hb-rail-item')", timeout=20)
            time.sleep(1)
            for _ in range(len(rail)):
                act("up")
            for _ in range(i):
                act("down")
            page.wait_for(f"document.querySelector('.icefin-content').getAttribute('data-hb-section') === {json.dumps(label)} && !!document.querySelector('.hb-tile')", timeout=15)
            return json.loads(js("JSON.stringify([...document.querySelectorAll('.hb-tile')].map(t => t.getAttribute('aria-label')))"))

        for i, label in enumerate(rail[1:-3], 1):
            tiles = open_section(i, label)
            if tiles == ["All items"]:
                continue
            bad = []
            for k, name in enumerate(tiles):
                if k:
                    open_section(i, label)
                js(f"document.querySelectorAll('.hb-tile')[{k}].click(); true")
                try:
                    page.wait_for("[...document.querySelectorAll('.Mui-selected, .emby-tab-button-active')].some(e => e.offsetParent) && !document.querySelector('#icefin-theme-root[data-hb]:not([hidden])')", timeout=15)
                    time.sleep(1.5)
                    # The last selected entry: jellyfin-web 12.4 also marks the library's own entry ("Shows") in its menu
                    got = js("([...document.querySelectorAll('.Mui-selected, .emby-tab-button-active')].filter(e => e.offsetParent).pop() || {}).textContent || ''").strip()
                except Exception:  # noqa: BLE001
                    got = "(no tabs)"
                if got.lower() != names.get(name, name).lower():
                    bad.append(f"{name}->{got}")
            check(f"{label}: category tiles open the matching tabs", not bad, ", ".join(bad) or json.dumps(tiles))

        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('.icefin-content[data-hb-ready]')", timeout=20)
        time.sleep(1)
        for _ in range(len(rail)):
            act("down")
        check("menu stops at its last entry", foc() == "rail/Classic home", foc())
        act("enter")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)

        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('.icefin-content[data-hb-ready]')", timeout=20)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        check("transitions drop under the low-motion cap", js("getComputedStyle(document.querySelector('.hb-shelf-box')).transitionDuration") == "0s")
        js("window.icefinTheme.ui.motion.cap('normal'); true")

        sounds = js("new Promise(r => window.api.theme.soundState(r))")
        check("Harbor plays its interface sounds (theme-sounds.py; user feedback 2026-11-11)", sounds.get("played", 0) > played0, json.dumps(sounds)[:120])
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
    print("theme_harbor:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
