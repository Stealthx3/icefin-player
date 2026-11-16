#!/usr/bin/env python3
"""harbor_pass.py — Harbor's completeness pass (PLAN 9.52), in the lab (the user's choice for this pass). Checks what the
"Harbor Screens" canvas and the Gate 1 decisions ask for:
  - home: the persistent menu (Home focused first), the categories and shelves; → into the content, Back to the menu,
    Back on the menu asks to exit with the safe choice focused;
  - the menu over any screen (the overlay) and quick access;
  - libraries: the media window (posters many across), the path; ▶ plays;
  - details: the info page (the poster, the facts, Play or Resume first); a series: a section per season, episodes as
    rows;
  - the context menu, search, Live TV, music, the player, settings, hints, sounds, motion.
Screenshots go to --out for the Gate 2 review beside the mock-ups.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 harbor_pass.py --app ~/build/src/icefin-player --server jf12 --out ~/rhar
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
    ap.add_argument("--port", type=int, default=9280)
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
        print(f"harbor_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.switch_theme_reloading("harbor", "(() => { const c = document.querySelector('.icefin-content[data-hb-ready]'); return !!c && +document.querySelector('#icefin-theme-root[data-hb]').getAttribute('data-hb-rail') > 0; })()")
        js("""(() => { if (window.__orErr) return true; window.__orErr = [];
          const ce = console.error.bind(console); console.error = (...a) => { window.__orErr.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); ce(...a); };
          window.addEventListener('error', (e) => window.__orErr.push('uncaught ' + e.message + ' @' + (e.filename || '?') + ':' + (e.lineno || 0))); return true; })()""")
        js("document.documentElement.setAttribute('data-hr-input', 'pad'); true")
        time.sleep(2)
        settle = lambda s=0.5: time.sleep(s)
        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-overlay .icefin-focused, .hr-panel-host .hr-panel-level:last-child .icefin-focused') || window.icefinTheme.ctx.focused(); return f ? (f.getAttribute('aria-label') || f.textContent || '').trim().slice(0, 60) : null; })()")
        fcls = lambda c: js(f"(() => {{ const f = window.icefinTheme.ctx.focused(); return !!f && !!f.closest({json.dumps(c)}); }})()") is True
        hint = lambda: js("(() => { const h = document.querySelector('.hr-hints'); return h && !h.hidden && h.isConnected ? [...h.querySelectorAll('.hr-hint')].map(s => ((s.querySelector('[data-key]') || {}).dataset || {}).key + ':' + s.textContent.trim()).join(' | ') : ''; })()")
        texts = lambda sel: json.loads(js(f"JSON.stringify([...document.querySelectorAll({json.dumps(sel)})].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => e.textContent.trim()))"))
        ready = lambda t=20: page.wait_for(f"!!{R} && ({R}.getAttribute('data-hr-ready') || {R}.getAttribute('data-hb-rail')) && !{R}.hasAttribute('data-hr-loading')", timeout=t)

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
            js("(() => { const t = [...document.querySelectorAll('.hr-tabs .hr-tab')].find(b => b.textContent === 'All movies'); if (t && !t.classList.contains('on')) t.click(); return true; })()")
            settle(1.5)
            return js("(() => { const c = [...document.querySelectorAll('.hr-t, .hr-li')].find(e => e.orEntry && e.orEntry.item && e.orEntry.item.Type === 'Movie' && /^SDR/.test(e.orEntry.item.Name || ''));"
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
            page.wait_for("(() => { const c = document.querySelector('.icefin-content[data-hb-ready]'); return !!c && +document.querySelector('#icefin-theme-root[data-hb]').getAttribute('data-hb-rail') > 0; })()", timeout=30)
            settle(1.5)
            fh = lambda: js("(() => { const f = window.icefinTheme.ctx.focused(); return f ? (f.classList.contains('hb-rail-item') ? 'rail/' + f.textContent : (f.harborItem ? 'poster' : (f.classList.contains('hb-tile') ? 'tile' : f.className))) : ''; })()")
            check("the menu, Home focused first, its shelves shown", fh() == "rail/Home" and js("document.querySelectorAll('.hb-shelf').length") >= 1, fh())
            shot("01-home.png")
            act("right"); settle(0.6)
            check("→ into the content", fh() in ("tile", "poster"), fh())
            act("down"); settle(0.6)
            shot("01b-home-channel.png")
            act("back"); settle(0.5)
            check("Back returns to the menu", fh().startswith("rail/"), fh())
            act("back")
            page.wait_for("!!document.querySelector('.hr-panel .hr-row')", timeout=10)
            settle(0.4)
            check("Back on the menu asks to exit, the safe choice focused", "Exit IceFin Player?" in js("document.querySelector('.hr-panel-title').textContent") and focused() == "Cancel", str(focused()))
            shot("exit.png")
            act("back"); settle(0.6)
            check("Back again keeps you on the home", js("!document.querySelector('.hr-panel')") is True and "#/home" in js("location.hash"))

        if "guide" in only:
            nav("#/home")
            settle(1.5)
            js("window.icefinTheme.ui.overlay.open(); true")
            try:
                page.wait_for("!!document.querySelector('.hr-mm .hr-li')", timeout=10)
            except Exception:  # noqa: BLE001
                pass
            settle(0.6)
            rows = texts(".hr-mm .hr-li-name")
            check("the menu over the screen: Home focused, the libraries, Settings, Exit", focused() == "Home" and "Settings" in rows and "Exit IceFin Player" in rows, str(rows))
            shot("guide.png")
            act("back"); settle(0.6)
            check("Back closes it", js("!document.querySelector('.hr-mm')") is True)
            js("window.icefinHarbor.quickAccess(); true")
            try:
                page.wait_for("!!document.querySelector('.hr-qa .hr-li')", timeout=10)
            except Exception:  # noqa: BLE001
                pass
            settle(0.6)
            check("quick access from the right: now playing, switches, Play on", js("!!document.querySelector('.hr-qa-now')") is True and js("document.querySelectorAll('.hr-qa .hr-switch').length") >= 1 and "Play on…" in texts(".hr-qa .hr-li-name"), str(texts(".hr-qa .hr-li-name")))
            shot("guide-quick.png")
            act("back"); settle(0.6)
            check("Back closes quick access", js("!document.querySelector('.hr-qa')") is True)

        if "library" in only:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            tabs = texts(".hr-tabs .hr-tab")
            check("Movies: the sections as tabs, All movies chosen", "All movies" in tabs and "Genres" in tabs and js("document.querySelector('.hr-tabs .hr-tab.on').textContent") == "All movies", str(tabs))
            check("the media window: posters many across, the name under them", js("(() => { const t = [...document.querySelectorAll('.hr-main .hr-t')]; const row = t.filter(x => x.offsetTop === t[0].offsetTop).length; return t.length > 2 && (row >= 6 || row === t.length) && !!document.querySelector('.hr-side .hr-side-name').textContent; })()") is True)
            check("focus on a poster", fcls(".hr-t"), str(focused()))
            shot("04-lib-movies.png")
            act("up"); settle(0.4)
            check("▲ from the first row onto the tabs", fcls(".hr-tab"), str(focused()))
            act("right"); settle(1.2)
            check("◀ ▶ on the tabs change section", js("document.querySelector('.hr-tabs .hr-tab.on').textContent") != "All movies", js("document.querySelector('.hr-tabs .hr-tab.on').textContent"))
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
            check("details: the info page, its sections, overview first", js(f"{R}.getAttribute('data-hr-mode')") == "deck" and texts(".hr-dk-head")[:1] == ["overview"], str(texts(".hr-dk-head")))
            check("the buttons: Play or Resume first, the others beside it", js("document.querySelectorAll('.hr-dp.cur .hr-action').length") >= 2 and bool(js("document.querySelector('.hr-dk-name').textContent")))
            check("focus on Play or Resume", (focused() or "").split(",")[0] in ("Play", "Resume"), str(focused()))
            shot("16-details-movie.png")
            if series:
                nav(f"#/details?id={series}&serverId={sid}")
                heads = texts(".hr-dk-head")
                check("a series: a section per season", any(h.lower().startswith("season") for h in heads), str(heads))
                k = next((i for i, h in enumerate(heads) if h.lower().startswith("season")), 1)
                js(f"document.querySelectorAll('.hr-dk-head')[{k}].click(); true"); settle(1.5)
                check("its episodes as rows", js("document.querySelectorAll('.hr-dp.cur .hr-li').length") >= 1, str(js("document.querySelectorAll('.hr-dp.cur .hr-li').length")))
                shot("17-details-series.png")

        if "menu" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}")
            act("menu")
            page.wait_for("!!document.querySelector('.hr-panel .hr-row')", timeout=10)
            settle(0.4)
            labels = texts(".hr-panel .hr-row .hr-row-label")
            check("≡: the item menu in Harbor's titled panel, every action", any("playlist" in x.lower() for x in labels) and any("Delete" in x for x in labels) and bool(js("document.querySelector('.hr-panel-title').textContent")), str(labels))
            shot("42-item-menu.png")
            js("[...document.querySelectorAll('.hr-panel .hr-row')].find(r => /playlist/i.test(r.textContent)).click(); true")
            settle(1.2)
            check("Add to playlist… opens its next level", js("document.querySelectorAll('.hr-panel-level').length") >= 2 or "playlist" in (js("document.querySelector('.hr-panel-level:last-child .hr-panel-title').textContent") or "").lower())
            shot("43-menu-addtoplaylist.png")
            act("back"); settle(0.6); act("back"); settle(0.6)
            check("Back closes it, focus back on the page", js("!document.querySelector('.hr-panel')") is True and fcls(".hr-screen"), str(focused()))

        if "search" in only:
            nav("#/search")
            js("(() => { const i = document.querySelector('.hr-search-input'); i.value = 'SDR'; i.dispatchEvent(new Event('input')); return true; })()")
            settle(2.5)
            check("search: the field and the results", js("!!document.querySelector('.hr-search-input') && document.querySelectorAll('.hr-main .hr-li, .hr-main .hr-t').length > 1") is True)
            shot("03-search.png")
            if js("window.icefinTheme.ui.keyboard && window.icefinTheme.ui.keyboard.isOpen && window.icefinTheme.ui.keyboard.isOpen()"):
                js("window.icefinTheme.ui.keyboard.close(); true")

        if "livetv" in only:
            nav("#/livetv", 30)
            check("Live TV: its tabs (Channels, Guide, Recordings, Schedule, Series)", texts(".hr-menu .hr-menu-item") == ["Channels", "Guide", "Recordings", "Schedule", "Series"], str(texts(".hr-menu .hr-menu-item")))
            check("the guide grid in a panel, the programme beside it", js("!!document.querySelector('.hr-guide .icefin-guide-row') && !!document.querySelector('[data-hr-screen=guide] .hr-top')") is True)
            shot("09-lib-livetv-guide.png")
            nav("#/livetv?hr=channels", 30)
            check("Channels: a list under the same tabs", js("document.querySelector('.hr-tabs .hr-tab.on').textContent") == "Channels")

        if "music" in only and album:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(album)}], serverId: {json.dumps(sid)}}}).then(() => true)")
            settle(3)
            nav("#/queue")
            settle(1)
            check("Now playing, the queue and the lyrics as three panels", js("!!document.querySelector('.hr-np-song.hr-p') && !!document.querySelector('.hr-np-qp') && !!document.querySelector('.hr-np-lp')") is True)
            check("the song, the transport, the queue", bool(js("document.querySelector('.hr-np-title').textContent")) and js("document.querySelectorAll('.hr-np-transport .hr-np-btn').length") >= 6
                  and js("document.querySelectorAll('.hr-np-qrow').length") >= 1)
            check("focus on play/pause", (focused() or "") in ("Play or pause", "Pause", "Play"), str(focused()))
            shot("58-music-queue.png")
            nav("#/home")
            check("now playing reachable from the home (quick access)", js("typeof window.icefinHarbor.quickAccess") == "function")
            shot("57-music-capsule.png")
            stop_play()

        if "player" in only and movie:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(movie)}], serverId: {json.dumps(sid)}}}); true")
            try:
                page.wait_for("!!document.querySelector('.hr-pl')", timeout=25)
                settle(4)
                act("enter"); settle(1)
                check("the player: the title top left, the time line over the buttons", js("!!document.querySelector('.hr-pl.hr-pl-shown') && !!document.querySelector('.hr-pl-title').textContent && !!document.querySelector('.hr-pl-bottom .hr-pl-bar')") is True)
                check("the square buttons: previous … More, play/pause focused, its name under it",
                      js("document.querySelectorAll('.hr-pl-transport .hr-pl-btn').length") >= 9 and js("document.querySelector('.hr-pl-name').textContent") in ("Pause", "Play"), js("document.querySelector('.hr-pl-name').textContent"))
                check("Ends at, top right", "Ends at" in (js("document.querySelector('.hr-pl-ends').textContent") or ""), js("document.querySelector('.hr-pl-ends').textContent"))
                act("right"); settle(0.4)
                check("the name follows focus along the buttons", js("document.querySelector('.hr-pl-name').textContent") not in ("Pause", "Play", ""), js("document.querySelector('.hr-pl-name').textContent"))
                shot("60-player-osd.png")
                act("menu"); settle(1)
                labels = texts(".hr-panel .hr-row .hr-row-label, .hr-panel .hr-row")
                check("≡: More (audio, subtitles, speed, playback info…)", any("Subtitles" in x for x in labels) and any("Playback info" in x for x in labels), str(labels)[:200])
                shot("63-player-settings.png")
                act("back"); settle(0.6)
            except Exception as e:  # noqa: BLE001
                check("the player started", False, str(e)[:120])
            stop_play()

        if "settings" in only:
            nav("#/mypreferencesmenu")
            names = [x.split("\n")[0] for x in texts(".hr-main .hr-li .hr-li-name")]
            check("Settings: Harbor's hub, a list with sections", "Profile" in names and "Display" in names and len(texts(".hr-main .hr-sec")) >= 2, str(names))
            check("what the focused entry does, beside it", bool(js("(document.querySelector('.hr-side .hr-side-facts') || {}).textContent")))
            shot("28-settings-hub.png")
            nav("#/mypreferencesmenu?pane=client", 30)
            settle(2)
            check("Client Settings: the engine's page", js("!!document.querySelector('.icefin-settings, .icefin-cs-host')") is True)
            shot("29-settings-client.png")
            nav("#/userprofile?userId=" + js("window.ApiClient.getCurrentUserId()"))
            check("Profile: Harbor's screen", js(f"!!{R}.querySelector('.hr-li, .hr-row')") is True)
            shot("35-profile.png")
            nav("#/quickconnect")
            check("Quick Connect: six boxes", js("document.querySelectorAll('.hr-qc-slot').length") == 6)
            shot("36-quickconnect.png")

        if "hints" in only and movie:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            focus_film(); settle(0.6)
            js("document.documentElement.setAttribute('data-hr-input', 'pad'); true")
            h1 = hint()
            check("page-aware hints on a film: OK details, ▶ play, ≡ options (the pad's own OK key drawn)", "OK:" in h1 and "details" in h1 and "▶" in h1 and "≡" in h1, h1)
            act("menu")
            page.wait_for("!!document.querySelector('.hr-panel .hr-row')", timeout=10)
            settle(0.4)
            h3 = hint()
            check("hints in a panel: choose and close, nothing from the page behind", "Back" in h3 and "▶" not in h3, h3)
            act("back"); settle(0.6)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400, y=300)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=420, y=310)
            settle(0.4)
            check("the mouse hides them", js("getComputedStyle(document.querySelector('.hr-hints')).opacity") == "0")
            act("down"); settle(0.3)

        if "sounds" in only:
            man = json.loads(js("fetch(window.icefinHarbor.base + 'theme.json').then(r => r.text())") or "{}")
            meta, music = man.get("sounds") or {}, man.get("music") or {}
            check("the five interface sounds", sorted(meta) == ["back", "error", "focus", "navigate", "select"], str(meta))
            check("music: startup, ambient, the menu and goodbye jingles", bool(music.get("startup")) and bool(music.get("ambient")) and sorted((music.get("jingles") or {}).keys()) == ["goodbye", "menu"], str(music))

        if "motion" in only:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            page.wait_for("!!document.querySelector('.hr-main .hr-t.icefin-focused')", timeout=20)
            settle(1)
            tf = js("(() => { const f = document.querySelector('.hr-t.icefin-focused'); return f ? getComputedStyle(f).transitionDuration : 'none'; })()")
            check("normal motion: the focused poster's zoom is timed (200 ms)", "0.2s" in (tf or ""), tf)
            js("window.icefinTheme.ui.motion.cap('low'); true")
            settle(0.3)
            tr = js("(() => { const f = document.querySelector('.hr-t.icefin-focused'); return f ? getComputedStyle(f).transform : 'none'; })()")
            check("low motion: no zoom", tr == "none", tr)
            js("window.icefinTheme.ui.motion.cap('normal'); true")

        errs = js("JSON.stringify((window.__orErr || []).filter(e => !/userprofile|ResizeObserver/.test(e) && !/^uncaught Script error\\. @\\?:0$/.test(e)).slice(0, 6))")
        check("no script errors from Harbor", errs == "[]", errs)
    finally:
        try:
            app.terminate()
        except Exception:
            pass
    print(f"harbor_pass: {'PASS' if not fails else 'FAIL'} ({len(fails)} failing)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
