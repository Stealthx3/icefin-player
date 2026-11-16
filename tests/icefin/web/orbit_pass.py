#!/usr/bin/env python3
"""orbit_pass.py — Orbit's completeness pass (PLAN 9.56), in the lab (the user's choice for this pass). Checks what the
"Orbit Screens" canvas and the Gate 1 decisions ask for:
  - home: the channels (titles stacked above the current one), the account top right, focus on the front tile,
    ▲ ▼ change channel, ◀ ▶ step the ring, Back asks to exit with Cancel focused;
  - the guide: blades over the screen (Media first), ◀ ▶ between blades, Back closes it;
  - libraries: the sections as tabs (All movies chosen), the poster grid, the side panel; ▶ on a poster plays it;
  - details: the deck (the item's panel in front, its other panels receding right), focus on Play or Resume,
    ▶ to the next panel;
  - the item menu: Orbit's titled panel, Add to playlist… opens its next level, Back closes, focus back;
  - search: the field and results; Live TV: its tabs and the guide grid;
  - music: Now playing, the queue and the lyrics as panels, focus on play/pause;
  - the player: the time line at the top, the capsule with the focused button's name under it, Ends at; ≡ More;
  - settings: Orbit's hub (a list, the description beside it), Client Settings (the engine's), Profile, Quick Connect;
  - hints: page-aware with the pad's keys; hidden for the mouse;
  - sounds: the five interface sounds; music: startup, ambient, the guide and goodbye jingles;
  - low motion: the focus glow stops breathing.
Screenshots go to --out for the Gate 2 review beside the mock-ups.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 orbit_pass.py --app ~/build/src/icefin-player --server jf12 --out ~/rorb
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
    ap.add_argument("--port", type=int, default=9275)
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
        print(f"orbit_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.switch_theme_reloading("orbit", f"!!{R} && +{R}.getAttribute('data-ob-ready') > 0")
        js("""(() => { if (window.__orErr) return true; window.__orErr = [];
          const ce = console.error.bind(console); console.error = (...a) => { window.__orErr.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); ce(...a); };
          window.addEventListener('error', (e) => window.__orErr.push('uncaught ' + e.message + ' @' + (e.filename || '?') + ':' + (e.lineno || 0))); return true; })()""")
        js("document.documentElement.setAttribute('data-or-input', 'pad'); true")
        time.sleep(2)
        settle = lambda s=0.5: time.sleep(s)
        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-overlay .icefin-focused, .or-panel-host .or-panel-level:last-child .icefin-focused') || window.icefinTheme.ctx.focused(); return f ? (f.getAttribute('aria-label') || f.textContent || '').trim().slice(0, 60) : null; })()")
        fcls = lambda c: js(f"(() => {{ const f = window.icefinTheme.ctx.focused(); return !!f && !!f.closest({json.dumps(c)}); }})()") is True
        hint = lambda: js("(() => { const h = document.querySelector('.or-hints'); return h && !h.hidden && h.isConnected ? [...h.querySelectorAll('.or-hint')].map(s => ((s.querySelector('[data-key]') || {}).dataset || {}).key + ':' + s.textContent.trim()).join(' | ') : ''; })()")
        texts = lambda sel: json.loads(js(f"JSON.stringify([...document.querySelectorAll({json.dumps(sel)})].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => e.textContent.trim()))"))
        ready = lambda t=20: page.wait_for(f"!!{R} && ({R}.getAttribute('data-or-ready') || {R}.getAttribute('data-ob-ready')) && !{R}.hasAttribute('data-or-loading')", timeout=t)

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
            js("(() => { const t = [...document.querySelectorAll('.or-tabs .or-tab')].find(b => b.textContent === 'All movies'); if (t && !t.classList.contains('on')) t.click(); return true; })()")
            settle(1.5)
            return js("(() => { const c = [...document.querySelectorAll('.or-t, .or-li')].find(e => e.orEntry && e.orEntry.item && e.orEntry.item.Type === 'Movie' && /^SDR/.test(e.orEntry.item.Name || ''));"
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
            page.wait_for(f"+{R}.getAttribute('data-ob-ready') > 1", timeout=20)
            settle(1)
            titles = texts(".ob-channel-title")
            check("the channels (Continue watching, Next up, each library, … System)", len(titles) >= 3 and "system" in [t.lower() for t in titles], str(titles))
            check("the account top right: you and the server", bool(js("document.querySelector('.ob-acct-name').textContent")) and bool(js("document.querySelector('.ob-acct .or-server').textContent")))
            check("focus on arrival: the front tile", fcls(".ob-channel.current .ob-tile"), str(focused()))
            shot("01-home.png")
            i0 = js(f"{R}.getAttribute('data-ob-index')")
            act("down"); settle(0.8)
            check("▼ changes channel", js(f"{R}.getAttribute('data-ob-index')") != i0, f"{i0} → {js(R + '.getAttribute(' + chr(39) + 'data-ob-index' + chr(39) + ')')}")
            for _ in range(8):  # to a channel with more than one tile
                if js("document.querySelectorAll('.ob-channel.current .ob-tile').length") > 1:
                    break
                act("down"); settle(0.6)
            c0 = js("document.querySelector('.ob-count').textContent")
            act("right"); settle(0.8)
            check("▶ steps the ring", js("document.querySelector('.ob-count').textContent") != c0, f"{c0} → {js('document.querySelector(' + chr(39) + '.ob-count' + chr(39) + ').textContent')}")
            shot("01b-home-channel.png")
            act("back")
            page.wait_for("!!document.querySelector('.or-panel .or-row')", timeout=10)
            settle(0.4)
            check("Back on the home asks to exit, Cancel focused", "Exit Icefin?" in js("document.querySelector('.or-panel-title').textContent") and focused() == "Cancel", str(focused()))
            shot("exit.png")
            act("back"); settle(0.6)
            check("Back again keeps you on the home", js("!document.querySelector('.or-panel')") is True and "#/home" in js("location.hash"))

        if "guide" in only:
            nav("#/home")
            js("window.icefinTheme.ui.overlay.open(); true")
            try:
                page.wait_for("!!document.querySelector('.ob-guide .or-li')", timeout=10)
            except Exception:  # noqa: BLE001
                pass
            settle(0.6)
            check("the guide: blades, Media first, its list focused", js("(document.querySelector('.ob-guide') || {getAttribute: () => ''}).getAttribute('data-ob-blade')") == "Media" and focused() == "Home", str(focused()))
            check("the other blades stacked on the right", texts(".ob-blades .ob-blade") == ["Library", "You", "Settings"], str(texts(".ob-blades .ob-blade")))
            shot("guide.png")
            act("right"); settle(0.6)
            check("▶ the Library blade", js("document.querySelector('.ob-guide').getAttribute('data-ob-blade')") == "Library")
            act("back"); settle(0.6)
            check("Back closes the guide", js("!document.querySelector('.ob-guide')") is True)

        if "library" in only:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            tabs = texts(".or-tabs .or-tab")
            check("Movies: the sections as tabs, All movies chosen", "All movies" in tabs and "Genres" in tabs and js("document.querySelector('.or-tabs .or-tab.on').textContent") == "All movies", str(tabs))
            check("the poster grid and the side panel", js("document.querySelectorAll('.or-main .or-t').length > 0 && !!document.querySelector('.or-side .or-side-name').textContent") is True)
            check("focus on a poster", fcls(".or-t"), str(focused()))
            shot("04-lib-movies.png")
            act("up"); settle(0.4)
            check("▲ from the first row onto the tabs", fcls(".or-tab"), str(focused()))
            act("right"); settle(1.2)
            check("◀ ▶ on the tabs change section", js("document.querySelector('.or-tabs .or-tab.on').textContent") != "All movies", js("document.querySelector('.or-tabs .or-tab.on').textContent"))
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
            check("details: the deck, the item's panel in front with its picture and name", js(f"{R}.getAttribute('data-or-mode')") == "deck" and bool(js("document.querySelector('.or-dp.front .or-dp-name').textContent")))
            check("focus on Play or Resume", (focused() or "").split(",")[0] in ("Play", "Resume"), str(focused()))
            n = js("document.querySelectorAll('.or-dp').length")
            check("its other panels receding right", n >= 2, str(n))
            shot("16-details-movie.png")
            act("right"); settle(0.8)
            check("▶ brings the next panel to the front", js(f"{R}.getAttribute('data-or-panel')") == "1", js(f"{R}.getAttribute('data-or-panel')"))
            if series:
                nav(f"#/details?id={series}&serverId={sid}")
                check("a series: an Episodes panel with its seasons as tabs", "Episodes" in texts(".or-dp-title") and js("document.querySelectorAll('.or-dp-tabs .or-tab').length") >= 1, str(texts(".or-dp-title")))
                shot("17-details-series.png")

        if "menu" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}")
            act("menu")
            page.wait_for("!!document.querySelector('.or-panel .or-row')", timeout=10)
            settle(0.4)
            labels = texts(".or-panel .or-row .or-row-label")
            check("≡: the item menu in Orbit's titled panel, every action", any("playlist" in x.lower() for x in labels) and any("Delete" in x for x in labels) and bool(js("document.querySelector('.or-panel-title').textContent")), str(labels))
            shot("42-item-menu.png")
            js("[...document.querySelectorAll('.or-panel .or-row')].find(r => /playlist/i.test(r.textContent)).click(); true")
            settle(1.2)
            check("Add to playlist… opens its next level", js("document.querySelectorAll('.or-panel-level').length") >= 2 or "playlist" in (js("document.querySelector('.or-panel-level:last-child .or-panel-title').textContent") or "").lower())
            shot("43-menu-addtoplaylist.png")
            act("back"); settle(0.6); act("back"); settle(0.6)
            check("Back closes it, focus back on the page", js("!document.querySelector('.or-panel')") is True and fcls(".or-screen"), str(focused()))

        if "search" in only:
            nav("#/search")
            js("(() => { const i = document.querySelector('.or-search-input'); i.value = 'SDR'; i.dispatchEvent(new Event('input')); return true; })()")
            settle(2.5)
            check("search: the field and the results", js("!!document.querySelector('.or-search-input') && document.querySelectorAll('.or-main .or-li, .or-main .or-t').length > 1") is True)
            shot("03-search.png")
            if js("window.icefinTheme.ui.keyboard && window.icefinTheme.ui.keyboard.isOpen && window.icefinTheme.ui.keyboard.isOpen()"):
                js("window.icefinTheme.ui.keyboard.close(); true")

        if "livetv" in only:
            nav("#/livetv", 30)
            check("Live TV: its tabs (Channels, Guide, Recordings, Schedule, Series)", texts(".or-menu .or-menu-item") == ["Channels", "Guide", "Recordings", "Schedule", "Series"], str(texts(".or-menu .or-menu-item")))
            check("the guide grid in a panel, the programme beside it", js("!!document.querySelector('.or-guide .icefin-guide-row') && !!document.querySelector('[data-or-screen=guide] .or-top')") is True)
            shot("09-lib-livetv-guide.png")
            nav("#/livetv?or=channels", 30)
            check("Channels: a list under the same tabs", js("document.querySelector('.or-tabs .or-tab.on').textContent") == "Channels")

        if "music" in only and album:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(album)}], serverId: {json.dumps(sid)}}}).then(() => true)")
            settle(3)
            nav("#/queue")
            settle(1)
            check("Now playing, the queue and the lyrics as three panels", js("!!document.querySelector('.or-np-song.or-p') && !!document.querySelector('.or-np-qp') && !!document.querySelector('.or-np-lp')") is True)
            check("the song, the transport, the queue", bool(js("document.querySelector('.or-np-title').textContent")) and js("document.querySelectorAll('.or-np-transport .or-np-btn').length") >= 6
                  and js("document.querySelectorAll('.or-np-qrow').length") >= 1)
            check("focus on play/pause", (focused() or "") in ("Play or pause", "Pause", "Play"), str(focused()))
            shot("58-music-queue.png")
            nav("#/home")
            check("the music capsule on the home", js("!document.querySelector('.ob-cap').hidden") is True)
            shot("57-music-capsule.png")
            stop_play()

        if "player" in only and movie:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(movie)}], serverId: {json.dumps(sid)}}}); true")
            try:
                page.wait_for("!!document.querySelector('.or-pl')", timeout=25)
                settle(4)
                act("enter"); settle(1)
                check("the player: the title and the time line at the top", js("!!document.querySelector('.or-pl.or-pl-shown') && !!document.querySelector('.or-pl-title').textContent && !!document.querySelector('.or-pl-top .or-pl-bar')") is True)
                check("the capsule: previous … More, play/pause focused, its name under it",
                      js("document.querySelectorAll('.or-pl-transport .or-pl-btn').length") >= 9 and js("document.querySelector('.or-pl-name').textContent") in ("Pause", "Play"), js("document.querySelector('.or-pl-name').textContent"))
                check("Ends at, top right", "Ends at" in (js("document.querySelector('.or-pl-ends').textContent") or ""), js("document.querySelector('.or-pl-ends').textContent"))
                act("right"); settle(0.4)
                check("the name follows focus along the capsule", js("document.querySelector('.or-pl-name').textContent") not in ("Pause", "Play", ""), js("document.querySelector('.or-pl-name').textContent"))
                shot("60-player-osd.png")
                act("menu"); settle(1)
                labels = texts(".or-panel .or-row .or-row-label, .or-panel .or-row")
                check("≡: More (audio, subtitles, speed, playback info…)", any("Subtitles" in x for x in labels) and any("Playback info" in x for x in labels), str(labels)[:200])
                shot("63-player-settings.png")
                act("back"); settle(0.6)
            except Exception as e:  # noqa: BLE001
                check("the player started", False, str(e)[:120])
            stop_play()

        if "settings" in only:
            nav("#/mypreferencesmenu")
            names = [x.split("\n")[0] for x in texts(".or-main .or-li .or-li-name")]
            check("Settings: Orbit's hub, a list with sections", "Profile" in names and "Display" in names and len(texts(".or-main .or-sec")) >= 2, str(names))
            check("what the focused entry does, beside it", bool(js("(document.querySelector('.or-side .or-side-facts') || {}).textContent")))
            shot("28-settings-hub.png")
            nav("#/mypreferencesmenu?pane=client", 30)
            settle(2)
            check("Client Settings: the engine's page", js("!!document.querySelector('.icefin-settings, .icefin-cs-host')") is True)
            shot("29-settings-client.png")
            nav("#/userprofile?userId=" + js("window.ApiClient.getCurrentUserId()"))
            check("Profile: Orbit's screen", js(f"!!{R}.querySelector('.or-li, .or-row')") is True)
            shot("35-profile.png")
            nav("#/quickconnect")
            check("Quick Connect: six boxes", js("document.querySelectorAll('.or-qc-slot').length") == 6)
            shot("36-quickconnect.png")

        if "hints" in only and movie:
            nav(f"#/movies?topParentId={movies_lib}&collectionType=movies")
            focus_film(); settle(0.6)
            js("document.documentElement.setAttribute('data-or-input', 'pad'); true")
            h1 = hint()
            check("page-aware hints on a film: OK details, ▶ play, ≡ options (the pad's own OK key drawn)", "OK:" in h1 and "details" in h1 and "▶" in h1 and "≡" in h1, h1)
            act("menu")
            page.wait_for("!!document.querySelector('.or-panel .or-row')", timeout=10)
            settle(0.4)
            h3 = hint()
            check("hints in a panel: choose and close, nothing from the page behind", "Back" in h3 and "▶" not in h3, h3)
            act("back"); settle(0.6)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400, y=300)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=420, y=310)
            settle(0.4)
            check("the mouse hides them", js("getComputedStyle(document.querySelector('.or-hints')).opacity") == "0")
            act("down"); settle(0.3)

        if "sounds" in only:
            man = json.loads(js("fetch(window.icefinOrbit.base + 'theme.json').then(r => r.text())") or "{}")
            meta, music = man.get("sounds") or {}, man.get("music") or {}
            check("the five interface sounds", sorted(meta) == ["back", "error", "focus", "navigate", "select"], str(meta))
            check("music: startup, ambient, the guide and goodbye jingles", bool(music.get("startup")) and bool(music.get("ambient")) and sorted((music.get("jingles") or {}).keys()) == ["goodbye", "guide"], str(music))

        if "motion" in only:
            nav("#/mypreferencesmenu")
            settle(0.6)
            an = js("(() => { const f = document.querySelector('.or-li.icefin-focused'); return f ? getComputedStyle(f).animationName : 'no row'; })()")
            check("normal motion: the focused row's glow breathes (2.6 s)", an == "or-breathe", an)
            js("window.icefinTheme.ui.motion.cap('low'); true")
            act("down"); settle(0.3)
            an = js("(() => { const f = document.querySelector('.or-li.icefin-focused'); return f ? getComputedStyle(f).animationName : 'no row'; })()")
            check("low motion: no animation", an == "none", an)
            js("window.icefinTheme.ui.motion.cap('normal'); true")

        errs = js("JSON.stringify((window.__orErr || []).filter(e => !/userprofile|ResizeObserver/.test(e) && !/^uncaught Script error\\. @\\?:0$/.test(e)).slice(0, 6))")
        check("no script errors from Orbit", errs == "[]", errs)
    finally:
        try:
            app.terminate()
        except Exception:
            pass
    print(f"orbit_pass: {'PASS' if not fails else 'FAIL'} ({len(fails)} failing)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
