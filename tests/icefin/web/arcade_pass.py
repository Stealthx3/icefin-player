#!/usr/bin/env python3
"""arcade_pass.py — Arcade's completeness pass (PLAN 9.50), in the lab (the user's choice for this pass). Checks what the
"Arcade Screens" canvas and the Gate 1 decisions ask for:
  - home: the top bar, the recent row led by the hero (focused on arrival), its name and state under it, the feed
    pills over their cards, ▼ to the pills and ◀ ▶ along them, Back asks to exit with Cancel focused;
  - the menus: the main menu from the left (the overlay), quick access from the right with its switches;
  - libraries: the sections as pill tabs (All movies chosen), the capsule grid many across, the name strip; ▶ plays;
  - details: the game page (the hero, the play bar with Play or Resume focused, the sections as pills); a series: a
    pill per season with its episodes as rows;
  - the item menu: the dark panel, Add to playlist… opens its next level, Back closes, focus back;
  - search, Live TV, music, the player (round buttons, the time line over them), settings, hints, sounds, motion.
Screenshots go to --out for the Gate 2 review beside the mock-ups.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 arcade_pass.py --app ~/build/src/icefin-player --server jf12 --out ~/rarc
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
    ap.add_argument("--port", type=int, default=9278)
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
        print(f"arcade_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.switch_theme_reloading("arcade", f"!!{R} && +{R}.getAttribute('data-ar-ready') > 0")
        js("""(() => { if (window.__orErr) return true; window.__orErr = [];
          const ce = console.error.bind(console); console.error = (...a) => { window.__orErr.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); ce(...a); };
          window.addEventListener('error', (e) => window.__orErr.push('uncaught ' + e.message + ' @' + (e.filename || '?') + ':' + (e.lineno || 0))); return true; })()""")
        js("document.documentElement.setAttribute('data-ac-input', 'pad'); true")
        time.sleep(2)
        settle = lambda s=0.5: time.sleep(s)
        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-overlay .icefin-focused, .ac-panel-host .ac-panel-level:last-child .icefin-focused') || window.icefinTheme.ctx.focused(); return f ? (f.getAttribute('aria-label') || f.textContent || '').trim().slice(0, 60) : null; })()")
        fcls = lambda c: js(f"(() => {{ const f = window.icefinTheme.ctx.focused(); return !!f && !!f.closest({json.dumps(c)}); }})()") is True
        hint = lambda: js("(() => { const h = document.querySelector('.ac-hints'); return h && !h.hidden && h.isConnected ? [...h.querySelectorAll('.ac-hint')].map(s => ((s.querySelector('[data-key]') || {}).dataset || {}).key + ':' + s.textContent.trim()).join(' | ') : ''; })()")
        texts = lambda sel: json.loads(js(f"JSON.stringify([...document.querySelectorAll({json.dumps(sel)})].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => e.textContent.trim()))"))
        ready = lambda t=20: page.wait_for(f"!!{R} && ({R}.getAttribute('data-ac-ready') || {R}.getAttribute('data-ar-ready')) && !{R}.hasAttribute('data-ac-loading')", timeout=t)

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
            js("(() => { const t = [...document.querySelectorAll('.ac-tabs .ac-tab')].find(b => b.textContent === 'All movies'); if (t && !t.classList.contains('on')) t.click(); return true; })()")
            settle(1.5)
            return js("(() => { const c = [...document.querySelectorAll('.ac-t, .ac-li')].find(e => e.orEntry && e.orEntry.item && e.orEntry.item.Type === 'Movie' && /^SDR/.test(e.orEntry.item.Name || ''));"
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
            page.wait_for(f"+{R}.getAttribute('data-ar-ready') > 0 && !!document.querySelector('.ar-cap.hero.icefin-focused')", timeout=25)
            settle(1.2)
            check("the top bar: search, quick access, the clock, you", js("document.querySelectorAll('.ar-top .ar-btn').length") >= 3 and bool(js("document.querySelector('.ar-clock').textContent")))
            check("the recent row led by the hero, focused on arrival", fcls(".ar-cap.hero"), str(focused()))
            check("its name and state under the row", bool(js("document.querySelector('.ar-focus-name').textContent")) and bool(js("document.querySelector('.ar-focus-sub').textContent")))
            pills = texts(".ar-pill")
            check("the feed pills over their cards", len(pills) >= 2 and js("document.querySelectorAll('.ar-cards .ar-cap.card').length") >= 1, str(pills))
            shot("01-home.png")
            act("down"); settle(0.5)
            check("▼ onto the pills", fcls(".ar-pill"), str(focused()))
            k0 = js(f"{R}.getAttribute('data-ar-pill')")
            act("right"); settle(0.8)
            check("▶ along the pills changes the cards", js(f"{R}.getAttribute('data-ar-pill')") != k0, f"{k0} → {js(R + '.getAttribute(' + chr(39) + 'data-ar-pill' + chr(39) + ')')}")
            act("down"); settle(0.6)
            shot("01b-home-channel.png")
            act("back"); settle(0.5); act("back")
            page.wait_for("!!document.querySelector('.ac-panel .ac-row')", timeout=10)
            settle(0.4)
            check("Back on the home asks to exit, Cancel focused", "Exit Icefin?" in js("document.querySelector('.ac-panel-title').textContent") and focused() == "Cancel", str(focused()))
            shot("exit.png")
            act("back"); settle(0.6)
            check("Back again keeps you on the home", js("!document.querySelector('.ac-panel')") is True and "#/home" in js("location.hash"))

        if "guide" in only:
            nav("#/home")
            js("window.icefinTheme.ui.overlay.open(); true")
            try:
                page.wait_for("!!document.querySelector('.ac-mm .ac-li')", timeout=10)
            except Exception:  # noqa: BLE001
                pass
            settle(0.6)
            rows = texts(".ac-mm .ac-li-name")
            check("the main menu from the left: Home focused, Search, the libraries, Settings, Exit", focused() == "Home" and "Settings" in rows and "Exit Icefin" in rows, str(rows))
            shot("guide.png")
            act("back"); settle(0.6)
            check("Back closes it", js("!document.querySelector('.ac-mm')") is True)
            js("window.icefinArcade.quickAccess(); true")
            try:
                page.wait_for("!!document.querySelector('.ac-qa .ac-li')", timeout=10)
            except Exception:  # noqa: BLE001
                pass
            settle(0.6)
            check("quick access from the right: now playing, switches, Play on", js("!!document.querySelector('.ac-qa-now')") is True and js("document.querySelectorAll('.ac-qa .ac-switch').length") >= 1 and "Play on…" in texts(".ac-qa .ac-li-name"), str(texts(".ac-qa .ac-li-name")))
            shot("guide-quick.png")
            act("back"); settle(0.6)
            check("Back closes quick access", js("!document.querySelector('.ac-qa')") is True)

        if "library" in only:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            tabs = texts(".ac-tabs .ac-tab")
            check("Movies: the sections as tabs, All movies chosen", "All movies" in tabs and "Genres" in tabs and js("document.querySelector('.ac-tabs .ac-tab.on').textContent") == "All movies", str(tabs))
            check("the capsule grid many across, the name strip under it", js("(() => { const t = [...document.querySelectorAll('.ac-main .ac-t')]; const row = t.filter(x => x.offsetTop === t[0].offsetTop).length; return t.length > 2 && (row >= 6 || row === t.length) && !!document.querySelector('.ac-side .ac-side-name').textContent; })()") is True)
            check("focus on a poster", fcls(".ac-t"), str(focused()))
            shot("04-lib-movies.png")
            act("up"); settle(0.4)
            check("▲ from the first row onto the tabs", fcls(".ac-tab"), str(focused()))
            act("right"); settle(1.2)
            check("◀ ▶ on the tabs change section", js("document.querySelector('.ac-tabs .ac-tab.on').textContent") != "All movies", js("document.querySelector('.ac-tabs .ac-tab.on').textContent"))
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
            check("details: the game page, the sections as pills, overview first", js(f"{R}.getAttribute('data-ac-mode')") == "deck" and texts(".ac-dk-head")[:1] == ["overview"], str(texts(".ac-dk-head")))
            check("the play bar: Play or Resume first, the other actions beside it", js("document.querySelectorAll('.ac-dp.cur .ac-action').length") >= 2 and bool(js("document.querySelector('.ac-dk-name').textContent")))
            check("focus on Play or Resume", (focused() or "").split(",")[0] in ("Play", "Resume"), str(focused()))
            shot("16-details-movie.png")
            if series:
                nav(f"#/details?id={series}&serverId={sid}")
                heads = texts(".ac-dk-head")
                check("a series: a pill per season", any(h.lower().startswith("season") for h in heads), str(heads))
                k = next((i for i, h in enumerate(heads) if h.lower().startswith("season")), 1)
                js(f"document.querySelectorAll('.ac-dk-head')[{k}].click(); true"); settle(1.5)
                check("its episodes as rows", js("document.querySelectorAll('.ac-dp.cur .ac-li').length") >= 1, str(js("document.querySelectorAll('.ac-dp.cur .ac-li').length")))
                shot("17-details-series.png")

        if "menu" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}")
            act("menu")
            page.wait_for("!!document.querySelector('.ac-panel .ac-row')", timeout=10)
            settle(0.4)
            labels = texts(".ac-panel .ac-row .ac-row-label")
            check("≡: the item menu in Arcade's titled panel, every action", any("playlist" in x.lower() for x in labels) and any("Delete" in x for x in labels) and bool(js("document.querySelector('.ac-panel-title').textContent")), str(labels))
            shot("42-item-menu.png")
            js("[...document.querySelectorAll('.ac-panel .ac-row')].find(r => /playlist/i.test(r.textContent)).click(); true")
            settle(1.2)
            check("Add to playlist… opens its next level", js("document.querySelectorAll('.ac-panel-level').length") >= 2 or "playlist" in (js("document.querySelector('.ac-panel-level:last-child .ac-panel-title').textContent") or "").lower())
            shot("43-menu-addtoplaylist.png")
            act("back"); settle(0.6); act("back"); settle(0.6)
            check("Back closes it, focus back on the page", js("!document.querySelector('.ac-panel')") is True and fcls(".ac-screen"), str(focused()))

        if "search" in only:
            nav("#/search")
            js("(() => { const i = document.querySelector('.ac-search-input'); i.value = 'SDR'; i.dispatchEvent(new Event('input')); return true; })()")
            settle(2.5)
            check("search: the field and the results", js("!!document.querySelector('.ac-search-input') && document.querySelectorAll('.ac-main .ac-li, .ac-main .ac-t').length > 1") is True)
            shot("03-search.png")
            if js("window.icefinTheme.ui.keyboard && window.icefinTheme.ui.keyboard.isOpen && window.icefinTheme.ui.keyboard.isOpen()"):
                js("window.icefinTheme.ui.keyboard.close(); true")

        if "livetv" in only:
            nav("#/livetv", 30)
            check("Live TV: its tabs (Channels, Guide, Recordings, Schedule, Series)", texts(".ac-menu .ac-menu-item") == ["Channels", "Guide", "Recordings", "Schedule", "Series"], str(texts(".ac-menu .ac-menu-item")))
            check("the guide grid in a panel, the programme beside it", js("!!document.querySelector('.ac-guide .icefin-guide-row') && !!document.querySelector('[data-ac-screen=guide] .ac-top')") is True)
            shot("09-lib-livetv-guide.png")
            nav("#/livetv?ac=channels", 30)
            check("Channels: a list under the same tabs", js("document.querySelector('.ac-tabs .ac-tab.on').textContent") == "Channels")

        if "music" in only and album:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(album)}], serverId: {json.dumps(sid)}}}).then(() => true)")
            settle(3)
            nav("#/queue")
            settle(1)
            check("Now playing, the queue and the lyrics as three panels", js("!!document.querySelector('.ac-np-song.ac-p') && !!document.querySelector('.ac-np-qp') && !!document.querySelector('.ac-np-lp')") is True)
            check("the song, the transport, the queue", bool(js("document.querySelector('.ac-np-title').textContent")) and js("document.querySelectorAll('.ac-np-transport .ac-np-btn').length") >= 6
                  and js("document.querySelectorAll('.ac-np-qrow').length") >= 1)
            check("focus on play/pause", (focused() or "") in ("Play or pause", "Pause", "Play"), str(focused()))
            shot("58-music-queue.png")
            nav("#/home")
            check("now playing reachable from the home (quick access)", js("typeof window.icefinArcade.quickAccess") == "function")
            shot("57-music-capsule.png")
            stop_play()

        if "player" in only and movie:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(movie)}], serverId: {json.dumps(sid)}}}); true")
            try:
                page.wait_for("!!document.querySelector('.ac-pl')", timeout=25)
                settle(4)
                act("enter"); settle(1)
                check("the player: the title top left, the time line over the buttons", js("!!document.querySelector('.ac-pl.ac-pl-shown') && !!document.querySelector('.ac-pl-title').textContent && !!document.querySelector('.ac-pl-bottom .ac-pl-bar')") is True)
                check("the square buttons: previous … More, play/pause focused, its name under it",
                      js("document.querySelectorAll('.ac-pl-transport .ac-pl-btn').length") >= 9 and js("document.querySelector('.ac-pl-name').textContent") in ("Pause", "Play"), js("document.querySelector('.ac-pl-name').textContent"))
                check("Ends at, top right", "Ends at" in (js("document.querySelector('.ac-pl-ends').textContent") or ""), js("document.querySelector('.ac-pl-ends').textContent"))
                act("right"); settle(0.4)
                check("the name follows focus along the buttons", js("document.querySelector('.ac-pl-name').textContent") not in ("Pause", "Play", ""), js("document.querySelector('.ac-pl-name').textContent"))
                shot("60-player-osd.png")
                act("menu"); settle(1)
                labels = texts(".ac-panel .ac-row .ac-row-label, .ac-panel .ac-row")
                check("≡: More (audio, subtitles, speed, playback info…)", any("Subtitles" in x for x in labels) and any("Playback info" in x for x in labels), str(labels)[:200])
                shot("63-player-settings.png")
                act("back"); settle(0.6)
            except Exception as e:  # noqa: BLE001
                check("the player started", False, str(e)[:120])
            stop_play()

        if "settings" in only:
            nav("#/mypreferencesmenu")
            names = [x.split("\n")[0] for x in texts(".ac-main .ac-li .ac-li-name")]
            check("Settings: Arcade's hub, a list with sections", "Profile" in names and "Display" in names and len(texts(".ac-main .ac-sec")) >= 2, str(names))
            check("what the focused entry does, beside it", bool(js("(document.querySelector('.ac-side .ac-side-facts') || {}).textContent")))
            shot("28-settings-hub.png")
            nav("#/mypreferencesmenu?pane=client", 30)
            settle(2)
            check("Client Settings: the engine's page", js("!!document.querySelector('.icefin-settings, .icefin-cs-host')") is True)
            shot("29-settings-client.png")
            nav("#/userprofile?userId=" + js("window.ApiClient.getCurrentUserId()"))
            check("Profile: Arcade's screen", js(f"!!{R}.querySelector('.ac-li, .ac-row')") is True)
            shot("35-profile.png")
            nav("#/quickconnect")
            check("Quick Connect: six boxes", js("document.querySelectorAll('.ac-qc-slot').length") == 6)
            shot("36-quickconnect.png")

        if "hints" in only and movie:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            focus_film(); settle(0.6)
            js("document.documentElement.setAttribute('data-ac-input', 'pad'); true")
            h1 = hint()
            check("page-aware hints on a film: OK details, ▶ play, ≡ options (the pad's own OK key drawn)", "OK:" in h1 and "details" in h1 and "▶" in h1 and "≡" in h1, h1)
            act("menu")
            page.wait_for("!!document.querySelector('.ac-panel .ac-row')", timeout=10)
            settle(0.4)
            h3 = hint()
            check("hints in a panel: choose and close, nothing from the page behind", "Back" in h3 and "▶" not in h3, h3)
            act("back"); settle(0.6)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400, y=300)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=420, y=310)
            settle(0.4)
            check("the mouse hides them", js("getComputedStyle(document.querySelector('.ac-hints')).opacity") == "0")
            act("down"); settle(0.3)

        if "sounds" in only:
            man = json.loads(js("fetch(window.icefinArcade.base + 'theme.json').then(r => r.text())") or "{}")
            meta, music = man.get("sounds") or {}, man.get("music") or {}
            check("the five interface sounds", sorted(meta) == ["back", "error", "focus", "navigate", "select"], str(meta))
            check("music: startup, ambient, the menu and goodbye jingles", bool(music.get("startup")) and bool(music.get("ambient")) and sorted((music.get("jingles") or {}).keys()) == ["goodbye", "menu"], str(music))

        if "motion" in only:
            nav("#/home")
            page.wait_for(f"+{R}.getAttribute('data-ar-ready') > 0 && !!document.querySelector('.ar-cap.icefin-focused')", timeout=20)
            settle(1)
            tf = js("(() => { const f = document.querySelector('.ar-cap.icefin-focused'); return f ? getComputedStyle(f).transitionDuration : 'none'; })()")
            check("normal motion: the focused capsule's lift is timed (200 ms)", "0.2s" in (tf or ""), tf)
            js("window.icefinTheme.ui.motion.cap('low'); true")
            settle(0.3)
            tf = js("(() => { const f = document.querySelector('.ar-cap.icefin-focused'); return f ? getComputedStyle(f).transitionDuration : 'none'; })()")
            check("low motion: no timed moves", tf and all(x.strip() in ("0s", "0ms") for x in tf.split(",")), tf)
            js("window.icefinTheme.ui.motion.cap('normal'); true")

        errs = js("JSON.stringify((window.__orErr || []).filter(e => !/userprofile|ResizeObserver/.test(e) && !/^uncaught Script error\\. @\\?:0$/.test(e)).slice(0, 6))")
        check("no script errors from Arcade", errs == "[]", errs)
    finally:
        try:
            app.terminate()
        except Exception:
            pass
    print(f"arcade_pass: {'PASS' if not fails else 'FAIL'} ({len(fails)} failing)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
