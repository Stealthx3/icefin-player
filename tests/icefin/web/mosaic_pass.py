#!/usr/bin/env python3
"""mosaic_pass.py — Mosaic's completeness pass (PLAN 9.55), in the lab (the user's choice for this pass). Checks what the
"Mosaic Screens" canvas and the Gate 1 decisions ask for:
  - home: the pivot (search, home, each library, … settings), home current with its tiles in three sizes, the account
    top right and the clock, focus on the first tile, ◀ ▶ past the edge change pivot, Back to home then asks to exit;
  - the guide: a white panel with its own pivot (home, media, you, settings), ◀ ▶ between tabs, Back closes it;
  - libraries: the hub (its sections as a pivot, All movies chosen), posters two rows deep, the facts under them;
    ▶ on a poster plays it;
  - details: the pivot of the item's sections (overview first), the actions as white tiles, focus on Play or
    Resume, ▶ to the next section; a series: a section per season with its episodes as a strip of cards;
  - the item menu: the white panel, Add to playlist… opens its next level, Back closes, focus back;
  - search: the field and results; Live TV: its tabs and the guide grid;
  - music: Now playing, the queue and the lyrics, focus on play/pause; the now-playing strip on the home;
  - the player: the title top left, the time line over a row of square buttons, the focused one's name under it;
  - settings: Mosaic's hub (a list, the description beside it), Client Settings (the engine's), Profile, Quick Connect;
  - hints: page-aware with the pad's keys; hidden for the mouse;
  - sounds: the five interface sounds; music: startup, ambient, the guide and goodbye jingles;
  - low motion: no lifts or slides.
Screenshots go to --out for the Gate 2 review beside the mock-ups.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 mosaic_pass.py --app ~/build/src/icefin-player --server jf12 --out ~/rmos
"""
import argparse, base64, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

GROUPS = ["home", "guide", "library", "details", "menu", "play", "search", "livetv", "music", "player", "settings", "hints", "sounds", "motion"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9276)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="", help="comma-separated groups: " + ",".join(GROUPS))
    a = ap.parse_args()
    only = set(filter(None, a.only.split(","))) or set(GROUPS)
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-orpass-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"mosaic_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        shot = lambda name: open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        R = "document.querySelector('#icefin-theme-root')"
        page.switch_theme_reloading("mosaic", f"!!{R} && +{R}.getAttribute('data-pv-ready') > 0")
        js("""(() => { if (window.__orErr) return true; window.__orErr = [];
          const ce = console.error.bind(console); console.error = (...a) => { window.__orErr.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); ce(...a); };
          window.addEventListener('error', (e) => window.__orErr.push('uncaught ' + e.message + ' @' + (e.filename || '?') + ':' + (e.lineno || 0))); return true; })()""")
        js("document.documentElement.setAttribute('data-ms-input', 'pad'); true")
        time.sleep(2)
        settle = lambda s=0.5: time.sleep(s)
        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-overlay .icefin-focused, .ms-panel-host .ms-panel-level:last-child .icefin-focused') || window.icefinTheme.ctx.focused(); return f ? (f.getAttribute('aria-label') || f.textContent || '').trim().slice(0, 60) : null; })()")
        fcls = lambda c: js(f"(() => {{ const f = window.icefinTheme.ctx.focused(); return !!f && !!f.closest({json.dumps(c)}); }})()") is True
        hint = lambda: js("(() => { const h = document.querySelector('.ms-hints'); return h && !h.hidden && h.isConnected ? [...h.querySelectorAll('.ms-hint')].map(s => ((s.querySelector('[data-key]') || {}).dataset || {}).key + ':' + s.textContent.trim()).join(' | ') : ''; })()")
        texts = lambda sel: json.loads(js(f"JSON.stringify([...document.querySelectorAll({json.dumps(sel)})].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => e.textContent.trim()))"))
        ready = lambda t=20: page.wait_for(f"!!{R} && ({R}.getAttribute('data-ms-ready') || {R}.getAttribute('data-pv-ready')) && !{R}.hasAttribute('data-ms-loading')", timeout=t)

        def nav(h, t=20):
            js(f"window.icefinTheme.ctx.navigate({json.dumps(h)}); true")
            settle(1.0)
            try:
                ready(t)
            except Exception:  # noqa: BLE001
                pass
            settle(0.8)

        def item_id(q):
            return js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), Object.assign({{Recursive: true, Limit: 1}}, {json.dumps(q)})).then(r => r.Items[0] ? r.Items[0].Id : null)")

        def focus_film():
            """Focus an SDR film's poster (the lab's DV and HDR files stop at the capability prompt)."""
            js("(() => { const t = [...document.querySelectorAll('.ms-tabs .ms-tab')].find(b => b.textContent === 'All movies'); if (t && !t.classList.contains('on')) t.click(); return true; })()")
            settle(1.5)
            return js("(() => { const c = [...document.querySelectorAll('.ms-t, .ms-li')].find(e => e.orEntry && e.orEntry.item && e.orEntry.item.Type === 'Movie' && /^SDR/.test(e.orEntry.item.Name || ''));"
                      " if (!c) return null; c.dispatchEvent(new MouseEvent('mouseenter')); window.icefinTheme.ctx.focus(c); return c.orEntry.item.Name; })()")

        def stop_play():
            js("(() => { const p = window.icefinTheme.ui.player.controls(); if (p && p.stop) p.stop(); return true; })()")
            settle(2)

        movie = item_id({"IncludeItemTypes": "Movie", "SearchTerm": "SDR", "SortBy": "Runtime", "SortOrder": "Descending"})
        series = item_id({"IncludeItemTypes": "Series"})
        album = item_id({"IncludeItemTypes": "MusicAlbum"})
        sid = js("window.ApiClient.serverId()")
        movies_lib = js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => (r.Items.find(v => v.CollectionType === 'movies') || {}).Id)")

        if "home" in only:
            nav("#/home")
            page.wait_for(f"+{R}.getAttribute('data-pv-ready') > 1 && +{R}.getAttribute('data-pv-tiles') > 1", timeout=25)
            settle(1.2)
            heads = texts(".icefin-pivot-header")
            check("the pivot: search, home, the libraries, … settings", len(heads) >= 4 and heads[0] == "search" and heads[-1] == "settings", str(heads))
            check("home current, its tiles in three sizes", js("document.querySelector('.icefin-pivot-header.active').textContent") == "home"
                  and js("document.querySelectorAll('.pv-grid .pv-tile').length") >= 3, str(js("document.querySelector('.icefin-pivot-header.active').textContent")))
            check("the account top right and the clock", bool(js("document.querySelector('.ms-acct-name').textContent")) and bool(js("document.querySelector('.pv-clock').textContent")))
            check("focus on arrival: a tile", fcls(".pv-tile"), str(focused()))
            shot("01-home.png")
            for _ in range(8):  # ▶ past the home's last column moves to the next pivot
                act("right"); settle(0.5)
                if js("document.querySelector('.icefin-pivot-header.active').textContent") != "home":
                    break
            check("▶ past the edge: the next pivot, headers sliding", js("document.querySelector('.icefin-pivot-header.active').textContent") != "home", js("document.querySelector('.icefin-pivot-header.active').textContent"))
            settle(1.5)
            shot("01b-home-channel.png")
            act("back"); settle(0.8)
            check("Back on another pivot returns to home", js("document.querySelector('.icefin-pivot-header.active').textContent") == "home")
            act("back")
            page.wait_for("!!document.querySelector('.ms-panel .ms-row')", timeout=10)
            settle(0.4)
            check("Back on home asks to exit, Cancel focused", "Exit IceFin Player?" in js("document.querySelector('.ms-panel-title').textContent") and focused() == "Cancel", str(focused()))
            shot("exit.png")
            act("back"); settle(0.6)
            check("Back again keeps you on the home", js("!document.querySelector('.ms-panel')") is True and "#/home" in js("location.hash"))

        if "guide" in only:
            nav("#/home")
            js("window.icefinTheme.ui.overlay.open(); true")
            try:
                page.wait_for("!!document.querySelector('.ms-gd .ms-li')", timeout=10)
            except Exception:  # noqa: BLE001
                pass
            settle(0.6)
            check("the guide: a white panel, its home tab first, its list focused", js("(document.querySelector('.ms-gd') || {getAttribute: () => ''}).getAttribute('data-ms-tab')") == "home" and focused() == "Home", str(focused()))
            check("its tabs: home, media, you, settings", texts(".ms-gd-tabs .ms-gd-tab") == ["home", "media", "you", "settings"], str(texts(".ms-gd-tabs .ms-gd-tab")))
            shot("guide.png")
            act("right"); settle(0.6)
            check("▶ the media tab", js("document.querySelector('.ms-gd').getAttribute('data-ms-tab')") == "media")
            act("back"); settle(0.6)
            check("Back closes the guide", js("!document.querySelector('.ms-gd')") is True)

        if "library" in only:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            tabs = texts(".ms-tabs .ms-tab")
            check("Movies: the sections as tabs, All movies chosen", "All movies" in tabs and "Genres" in tabs and js("document.querySelector('.ms-tabs .ms-tab.on').textContent") == "All movies", str(tabs))
            check("the hub: posters two rows deep, the focused one's facts under them", js("(() => { const t = [...document.querySelectorAll('.ms-main .ms-t')]; return t.length > 2 && new Set(t.map(x => x.offsetTop)).size === 2 && !!document.querySelector('.ms-side .ms-side-name').textContent; })()") is True)
            check("focus on a poster", fcls(".ms-t"), str(focused()))
            shot("04-lib-movies.png")
            act("up"); settle(0.4)
            check("▲ from the first row onto the tabs", fcls(".ms-tab"), str(focused()))
            act("right"); settle(1.2)
            check("◀ ▶ on the tabs change section", js("document.querySelector('.ms-tabs .ms-tab.on').textContent") != "All movies", js("document.querySelector('.ms-tabs .ms-tab.on').textContent"))
            nav(f"#/music?topParentId=" + (js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => (r.Items.find(v => v.CollectionType === 'music') || {}).Id || '')") or ""))
            shot("07-lib-music.png")

        if "play" in only and movie:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            name = focus_film(); settle(0.4)
            act("play_pause")
            try:
                page.wait_for("location.hash.startsWith('#/video')", timeout=20)
                played = True
            except Exception:  # noqa: BLE001
                played = False
            check("▶ on a poster plays it", played, str(name))
            stop_play()

        if "details" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}")
            check("details: the pivot of its sections, overview first", js(f"{R}.getAttribute('data-ms-mode')") == "deck" and texts(".ms-dk-head")[:1] == ["overview"], str(texts(".ms-dk-head")))
            check("the overview's actions as white tiles, the poster, the facts", js("document.querySelectorAll('.ms-dp.cur .ms-action').length") >= 2 and bool(js("document.querySelector('.ms-dp.front .ms-dp-name').textContent")))
            check("focus on Play or Resume", (focused() or "").split(",")[0] in ("Play", "Resume"), str(focused()))
            shot("16-details-movie.png")
            for _ in range(3):
                act("right"); settle(0.6)
                if js(f"{R}.getAttribute('data-ms-panel')") == "1":
                    break
            shown = js("[...document.querySelectorAll('.ms-dk-head')].filter(h => !h.hidden).length")
            if shown > 1:
                check("▶ past the actions: the next section", js(f"{R}.getAttribute('data-ms-panel')") != "0" and js("document.querySelector('.ms-dk-head.on').textContent") != "overview", js(f"{R}.getAttribute('data-ms-panel')"))
            else:  # its other sections are empty and left the pivot: ▶ stays on the overview
                check("▶ past the actions: empty sections are not in the pivot", js(f"{R}.getAttribute('data-ms-panel')") == "0", str(shown))
            if series:
                nav(f"#/details?id={series}&serverId={sid}")
                heads = texts(".ms-dk-head")
                check("a series: a section per season", any(h.startswith("season") for h in heads), str(heads))
                k = next((i for i, h in enumerate(heads) if h.startswith("season")), 1)
                for _ in range(k):
                    js("(() => { const h = document.querySelectorAll('.ms-dk-head'); return true; })()")
                js(f"document.querySelectorAll('.ms-dk-head')[{k}].click(); true"); settle(1.5)
                check("its episodes as a strip of white cards", js("document.querySelectorAll('.ms-dp.cur .ms-card').length") >= 1, str(js("document.querySelectorAll('.ms-dp.cur .ms-card').length")))
                shot("17-details-series.png")

        if "menu" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}")
            act("menu")
            page.wait_for("!!document.querySelector('.ms-panel .ms-row')", timeout=10)
            settle(0.4)
            labels = texts(".ms-panel .ms-row .ms-row-label")
            check("≡: the item menu in Mosaic's titled panel, every action", any("playlist" in x.lower() for x in labels) and any("Delete" in x for x in labels) and bool(js("document.querySelector('.ms-panel-title').textContent")), str(labels))
            shot("42-item-menu.png")
            js("[...document.querySelectorAll('.ms-panel .ms-row')].find(r => /playlist/i.test(r.textContent)).click(); true")
            settle(1.2)
            check("Add to playlist… opens its next level", js("document.querySelectorAll('.ms-panel-level').length") >= 2 or "playlist" in (js("document.querySelector('.ms-panel-level:last-child .ms-panel-title').textContent") or "").lower())
            shot("43-menu-addtoplaylist.png")
            act("back"); settle(0.6); act("back"); settle(0.6)
            check("Back closes it, focus back on the page", js("!document.querySelector('.ms-panel')") is True and fcls(".ms-screen"), str(focused()))

        if "search" in only:
            nav("#/search")
            js("(() => { const i = document.querySelector('.ms-search-input'); i.value = 'SDR'; i.dispatchEvent(new Event('input')); return true; })()")
            settle(2.5)
            check("search: the field and the results", js("!!document.querySelector('.ms-search-input') && document.querySelectorAll('.ms-main .ms-li, .ms-main .ms-t').length > 1") is True)
            shot("03-search.png")
            if js("window.icefinTheme.ui.keyboard && window.icefinTheme.ui.keyboard.isOpen && window.icefinTheme.ui.keyboard.isOpen()"):
                js("window.icefinTheme.ui.keyboard.close(); true")

        if "livetv" in only:
            nav("#/livetv", 30)
            check("Live TV: its tabs (Channels, Guide, Recordings, Schedule, Series)", texts(".ms-menu .ms-menu-item") == ["Channels", "Guide", "Recordings", "Schedule", "Series"], str(texts(".ms-menu .ms-menu-item")))
            check("the guide grid in a panel, the programme beside it", js("!!document.querySelector('.ms-guide .icefin-guide-row') && !!document.querySelector('[data-ms-screen=guide] .ms-top')") is True)
            shot("09-lib-livetv-guide.png")
            nav("#/livetv?ms=channels", 30)
            check("Channels: a list under the same tabs", js("document.querySelector('.ms-tabs .ms-tab.on').textContent") == "Channels")

        if "music" in only and album:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(album)}], serverId: {json.dumps(sid)}}}).then(() => true)")
            settle(3)
            nav("#/queue")
            settle(1)
            check("Now playing, the queue and the lyrics as three panels", js("!!document.querySelector('.ms-np-song.ms-p') && !!document.querySelector('.ms-np-qp') && !!document.querySelector('.ms-np-lp')") is True)
            check("the song, the transport, the queue", bool(js("document.querySelector('.ms-np-title').textContent")) and js("document.querySelectorAll('.ms-np-transport .ms-np-btn').length") >= 6
                  and js("document.querySelectorAll('.ms-np-qrow').length") >= 1)
            check("focus on play/pause", (focused() or "") in ("Play or pause", "Pause", "Play"), str(focused()))
            shot("58-music-queue.png")
            nav("#/home")
            check("the now-playing strip on the home", js("!document.querySelector('.ms-cap').hidden") is True)
            shot("57-music-capsule.png")
            stop_play()

        if "player" in only and movie:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(movie)}], serverId: {json.dumps(sid)}}}); true")
            try:
                page.wait_for("!!document.querySelector('.ms-pl')", timeout=25)
                settle(4)
                act("enter"); settle(1)
                check("the player: the title top left, the time line over the buttons", js("!!document.querySelector('.ms-pl.ms-pl-shown') && !!document.querySelector('.ms-pl-title').textContent && !!document.querySelector('.ms-pl-bottom .ms-pl-bar')") is True)
                check("the square buttons: previous … More, play/pause focused, its name under it",
                      js("document.querySelectorAll('.ms-pl-transport .ms-pl-btn').length") >= 9 and js("document.querySelector('.ms-pl-name').textContent") in ("Pause", "Play"), js("document.querySelector('.ms-pl-name').textContent"))
                check("Ends at, top right", "Ends at" in (js("document.querySelector('.ms-pl-ends').textContent") or ""), js("document.querySelector('.ms-pl-ends').textContent"))
                act("right"); settle(0.4)
                check("the name follows focus along the buttons", js("document.querySelector('.ms-pl-name').textContent") not in ("Pause", "Play", ""), js("document.querySelector('.ms-pl-name').textContent"))
                shot("60-player-osd.png")
                act("menu"); settle(1)
                labels = texts(".ms-panel .ms-row .ms-row-label, .ms-panel .ms-row")
                check("≡: More (audio, subtitles, speed, playback info…)", any("Subtitles" in x for x in labels) and any("Playback info" in x for x in labels), str(labels)[:200])
                shot("63-player-settings.png")
                act("back"); settle(0.6)
            except Exception as e:  # noqa: BLE001
                check("the player started", False, str(e)[:120])
            stop_play()

        if "settings" in only:
            nav("#/mypreferencesmenu")
            names = [x.split("\n")[0] for x in texts(".ms-main .ms-li .ms-li-name")]
            check("Settings: Mosaic's hub, a list with sections", "Profile" in names and "Display" in names and len(texts(".ms-main .ms-sec")) >= 2, str(names))
            check("what the focused entry does, beside it", bool(js("(document.querySelector('.ms-side .ms-side-facts') || {}).textContent")))
            shot("28-settings-hub.png")
            nav("#/mypreferencesmenu?pane=client", 30)
            settle(2)
            check("Client Settings: the engine's page", js("!!document.querySelector('.icefin-settings, .icefin-cs-host')") is True)
            shot("29-settings-client.png")
            nav("#/userprofile?userId=" + js("window.ApiClient.getCurrentUserId()"))
            check("Profile: Mosaic's screen", js(f"!!{R}.querySelector('.ms-li, .ms-row')") is True)
            shot("35-profile.png")
            nav("#/quickconnect")
            check("Quick Connect: six boxes", js("document.querySelectorAll('.ms-qc-slot').length") == 6)
            shot("36-quickconnect.png")

        if "hints" in only and movie:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            focus_film(); settle(0.6)
            js("document.documentElement.setAttribute('data-ms-input', 'pad'); true")
            h1 = hint()
            check("page-aware hints on a film: OK details, ▶ play, ≡ options (the pad's own OK key drawn)", "OK:" in h1 and "details" in h1 and "▶" in h1 and "≡" in h1, h1)
            act("menu")
            page.wait_for("!!document.querySelector('.ms-panel .ms-row')", timeout=10)
            settle(0.4)
            h3 = hint()
            check("hints in a panel: choose and close, nothing from the page behind", "Back" in h3 and "▶" not in h3, h3)
            act("back"); settle(0.6)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400, y=300)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=420, y=310)
            settle(0.4)
            check("the mouse hides them", js("getComputedStyle(document.querySelector('.ms-hints')).opacity") == "0")
            act("down"); settle(0.3)

        if "sounds" in only:
            man = json.loads(js("fetch(window.icefinMosaic.base + 'theme.json').then(r => r.text())") or "{}")
            meta, music = man.get("sounds") or {}, man.get("music") or {}
            check("the five interface sounds", sorted(meta) == ["back", "error", "focus", "navigate", "select"], str(meta))
            check("music: startup, ambient, the guide and goodbye jingles", bool(music.get("startup")) and bool(music.get("ambient")) and sorted((music.get("jingles") or {}).keys()) == ["goodbye", "guide"], str(music))

        if "motion" in only:
            nav("#/home")
            page.wait_for(f"+{R}.getAttribute('data-pv-tiles') > 1", timeout=20)
            settle(1)
            tf = js("(() => { const f = document.querySelector('.pv-tile.icefin-focused'); return f ? getComputedStyle(f).transform : 'no tile'; })()")
            check("normal motion: the focused tile lifts (107 %)", tf.startswith("matrix(1.07"), tf)
            js("window.icefinTheme.ui.motion.cap('low'); true")
            act("down"); settle(0.3)
            tf = js("(() => { const f = document.querySelector('.pv-tile.icefin-focused'); return f ? getComputedStyle(f).transform : 'no tile'; })()")
            check("low motion: no lift", tf == "none", tf)
            js("window.icefinTheme.ui.motion.cap('normal'); true")

        errs = js("JSON.stringify((window.__orErr || []).filter(e => !/userprofile|ResizeObserver/.test(e) && !/^uncaught Script error\\. @\\?:0$/.test(e)).slice(0, 6))")
        check("no script errors from Mosaic", errs == "[]", errs)
    finally:
        try:
            app.terminate()
        except Exception:
            pass
    print(f"mosaic_pass: {'PASS' if not fails else 'FAIL'} ({len(fails)} failing)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
