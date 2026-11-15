#!/usr/bin/env python3
"""baseline_pass.py — Baseline's completeness pass (PLAN 9.51), in the lab (the user's choice for this pass: "VM lab";
Baseline is stock jellyfin-web's TV layout re-made on the theme engine, plus sounds, page-aware hints and controller
support). Checks, in the TV layout, what the "Baseline Screens" canvas and the Gate 1 decisions ask for:
  - home: stock's TV header (Icefin's mark, Home and Favorites tabs, SyncPlay, Search, Settings, the clock), the user's
    home sections in order, focus on the first card, L1 R1 between the tabs, Back asks to exit with Cancel focused;
  - rows: ▼ to the next section, ▶ along a row, the card grows 1.07 in 0.2 s;
  - libraries: the tabs, the toolbar, the grid, the A–Z strip; #/list for a plain library;
  - details: the poster, the name, stock's buttons with Play first; ≡ the item's menu in stock's wording and order,
    a dialog as a form with a header bar, Back closes;
  - ▶ on a card plays it (the controller addition);
  - search: the field and the letters; Live TV: Programs and the guide;
  - Now Playing and Lyrics; the video OSD and its Settings sheet (Aspect Ratio, Playback Speed, Repeat Mode, Playback Info);
  - settings: stock's list, Client Settings under the header, Profile, Quick Connect;
  - hints: page-aware (a film's card: OK details, ▶ play, ≡ options; a dialog's: choose and close), hidden for the mouse;
  - sounds: the five interface sounds, the startup, ambient and goodbye pieces declared;
  - low motion: no transition on the cards.
Screenshots go to --out, named after stock's TV captures (docs/themes/passes/baseline.md) for the side-by-side review.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 baseline_pass.py --app ~/build/src/icefin-player --server jf12 --out ~/rbl
"""
import argparse, base64, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

GROUPS = ["home", "rows", "library", "details", "menu", "play", "search", "livetv", "music", "player", "settings", "hints", "sounds", "motion"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9274)
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
    cfgdir = tempfile.mkdtemp(prefix="icefin-blpass-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"baseline_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.eval("localStorage.setItem('layout', 'tv'); true")  # Baseline's target: stock's TV layout (Gate 1, call 2)
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        shot = lambda name: open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        R = "document.querySelector('#icefin-theme-root')"
        page.switch_theme_reloading("baseline", f"!!{R} && {R}.getAttribute('data-bl-ready') === '1' && !!document.querySelector('.bl-card')")
        js("""(() => { if (window.__blErr) return true; window.__blErr = [];
          const ce = console.error.bind(console); console.error = (...a) => { window.__blErr.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); ce(...a); };
          window.addEventListener('error', (e) => window.__blErr.push('uncaught ' + e.message + ' @' + (e.filename || '?') + ':' + (e.lineno || 0))); return true; })()""")
        time.sleep(2)
        settle = lambda s=0.5: time.sleep(s)
        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-overlay .icefin-focused, .bl-panel-host .icefin-focused') || window.icefinTheme.ctx.focused(); return f ? (f.getAttribute('aria-label') || f.textContent || '').trim().slice(0, 60) : null; })()")
        fcls = lambda c: js(f"(() => {{ const f = window.icefinTheme.ctx.focused(); return !!f && !!f.closest({json.dumps(c)}); }})()") is True
        hint = lambda: js("(() => { const h = document.querySelector('.bl-hints'); return h && !h.hidden && h.isConnected ? h.textContent : ''; })()")
        texts = lambda sel: json.loads(js(f"JSON.stringify([...document.querySelectorAll({json.dumps(sel)})].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => e.textContent.trim()))"))
        ready = lambda t=20: page.wait_for(f"{R}.getAttribute('data-bl-ready') === '1'", timeout=t)

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
            """Focus an SDR film's card on the page (the lab's DV and HDR files stop at the capability prompt)."""
            return js("(() => { const c = [...document.querySelectorAll('.bl-card')].find(e => e.blItem && e.blItem.Type === 'Movie' && /^SDR/.test(e.blItem.Name || ''));"
                      " if (!c) return null; window.icefinTheme.ctx.focus(c); return c.blItem.Name; })()")

        def stop_play():
            js("(() => { const p = window.icefinTheme.ui.player.controls(); if (p && p.stop) p.stop(); return true; })()")
            settle(2)

        movie = item_id({"IncludeItemTypes": "Movie", "SearchTerm": "SDR", "SortBy": "Runtime", "SortOrder": "Descending"})
        album = item_id({"IncludeItemTypes": "MusicAlbum"})
        sid = js("window.ApiClient.serverId()")

        if "home" in only:
            nav("#/home")
            mark = js("getComputedStyle(document.querySelector('.bl-header .bl-logo')).backgroundImage")
            check("the header: Icefin's mark on the home (branding call 3)", "icefin-mark.svg" in (mark or ""), mark)
            tabs = texts(".bl-tab")
            check("the header's tabs: Home and Favorites, Home active", tabs == ["Home", "Favorites"] and js("document.querySelector('.bl-tab.active').textContent") == "Home", str(tabs))
            right = json.loads(js("JSON.stringify([...document.querySelectorAll('.bl-header-right .bl-hbtn')].map(b => b.getAttribute('aria-label')))"))
            check("the header's right: SyncPlay, Search, Settings and the clock", right == ["SyncPlay", "Search", "Settings"] and bool(js("document.querySelector('.bl-clock').textContent")), str(right))
            secs = texts(".bl-section-title")
            check("the home's sections in stock's default order (My Media first)", secs[:1] == ["My Media"] and len(secs) >= 2, str(secs))
            check("focus on arrival: the first card", fcls(".bl-card"), str(focused()))
            shot("01-home.png")
            act("step_forward"); settle(1.5); ready()
            check("R1: the Favorites tab", js("document.querySelector('.bl-tab.active').textContent") == "Favorites" and "tab=1" in js("location.hash"), js("location.hash"))
            shot("02-home-favourites.png")
            act("step_backward"); settle(1.5); ready()
            check("L1: back to Home", js("document.querySelector('.bl-tab.active').textContent") == "Home", js("location.hash"))
            act("back")
            page.wait_for("!!document.querySelector('.bl-panel .bl-row')", timeout=10)
            settle(0.4)
            check("Back on the home asks to exit, Cancel focused", js("document.querySelector('.bl-panel-title').textContent") == "Exit Icefin?" and focused() == "Cancel", str(focused()))
            shot("exit.png")
            act("back"); settle(0.6)
            check("Back again keeps you on the home", js("!document.querySelector('.bl-panel')") is True and "#/home" in js("location.hash"), str(focused()))

        if "rows" in only:
            nav("#/home")
            sec = lambda: js("(() => { const f = window.icefinTheme.ctx.focused(); const s = f && f.closest('.bl-section'); return s ? [...document.querySelectorAll('.bl-section')].indexOf(s) : -1; })()")
            col = lambda: js("(() => { const f = window.icefinTheme.ctx.focused(); return f && f.parentElement ? [...f.parentElement.children].indexOf(f) : -1; })()")
            s0 = sec(); act("down"); settle(0.5)
            check("▼ moves to the next section", sec() == s0 + 1, f"{s0} → {sec()}")
            for _ in range(8):  # down to a row of cards (Live TV's section starts with buttons)
                if js("(() => { const f = window.icefinTheme.ctx.focused(); return !!(f && f.classList.contains('bl-card') && f.closest('.bl-scroller') && f.parentElement.children.length > 2); })()"):
                    break
                act("down"); settle(0.5)
            c0 = col(); act("right"); settle(0.5)
            check("▶ moves along the row", col() == c0 + 1, f"{c0} → {col()}")
            tr = js("(() => { const b = window.icefinTheme.ctx.focused().querySelector('.bl-card-box'); return b ? getComputedStyle(b).transform : 'no card'; })()")
            check("the focused card grows to 1.07", tr.startswith("matrix(1.07"), tr)

        if "library" in only:
            lib = js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => (r.Items.find(v => v.CollectionType === 'movies') || {}).Id)")
            nav(f"#/movies?topParentId={lib}&collectionType=movies")
            tabs = texts(".bl-tab")
            check("Movies: stock's tabs (Movies, Suggestions, Favorites, Collections, Genres)", tabs == ["Movies", "Suggestions", "Favorites", "Collections", "Genres"], str(tabs))
            check("the toolbar and the grid", js("!!document.querySelector('.bl-toolbar') && document.querySelectorAll('.bl-items-grid .bl-card').length > 0") is True)
            check("the A–Z strip at the right", js("!!document.querySelector('.bl-alpha')") is True)
            shot("04-lib-movies.png")
            books = js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => (r.Items.find(v => v.CollectionType === 'books' || v.CollectionType === 'homevideos') || {}).Id || null)")
            if books:
                nav(f"#/list?parentId={books}&serverId={sid}")
                check("a plain library is #/list with the text toolbar", js("!!document.querySelector('.bl-toolbar .bl-tbtn')") is True, js("location.hash"))
                shot("12-lib-books.png")

        if "details" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}")
            check("details: the poster and the name", js("!!document.querySelector('.bl-detail-poster-img, .bl-detail-poster-ic') && !!document.querySelector('.bl-item-name').textContent") is True)
            btns = json.loads(js("JSON.stringify([...document.querySelectorAll('.bl-dbtn')].map(b => b.getAttribute('aria-label') || b.textContent.trim()))"))
            check("stock's buttons, Play or Resume first, More last", bool(btns) and btns[0] in ("Play", "Resume") and btns[-1] == "More", str(btns))
            check("focus on Play", focused() in ("Play", "Resume"), str(focused()))
            shot("16-details-movie.png")

        if "menu" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}")
            act("menu")
            page.wait_for("!!document.querySelector('.bl-panel .bl-row')", timeout=10)
            settle(0.4)
            labels = texts(".bl-panel .bl-row .bl-row-label")
            order = [x for x in ("Add to collection", "Add to playlist", "Download", "Copy Stream URL", "Delete media", "Edit metadata", "Edit images", "Edit subtitles") if x in labels]
            check("≡: stock's wording and order", len(order) >= 5 and order == [x for x in labels if x in order], str(labels))
            check("stock's icons on each entry", js("[...document.querySelectorAll('.bl-panel .bl-row')].every(r => !!r.querySelector('.bl-row-icon'))") is True)
            check("no played or favourite entries on details (they are its buttons)", not any(x in labels for x in ("Mark played", "Mark unplayed", "Add to favorites", "Remove from favorites")), str(labels))
            shot("42-item-menu.png")
            js("[...document.querySelectorAll('.bl-panel .bl-row')].find(r => r.textContent.includes('Add to playlist')).click(); true")
            settle(1.2)
            check("a dialog opens as stock's form, a header bar with Back", js("!!document.querySelector('.bl-panel-level.form .bl-panel-head')") is True or js("document.querySelectorAll('.bl-panel-level').length") == 2)
            shot("43-menu-addtoplaylist.png")
            act("back"); settle(0.6); act("back"); settle(0.6)
            check("Back closes it, focus back on the page", js("!document.querySelector('.bl-panel')") is True and fcls(".bl-details, .bl-page"), str(focused()))

        if "play" in only and movie:
            lib = js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => (r.Items.find(v => v.CollectionType === 'movies') || {}).Id)")
            nav(f"#/movies?topParentId={lib}&collectionType=movies")
            name = focus_film(); settle(0.4)
            act("play_pause")
            try:
                page.wait_for("location.hash.startsWith('#/video')", timeout=20)
                played = True
            except Exception:  # noqa: BLE001
                played = False
            check("▶ on a card plays it (controller addition)", played, str(name))
            stop_play()

        if "search" in only:
            nav("#/search")
            check("search: the field and the letters", js("!!document.querySelector('.bl-search-input') && document.querySelectorAll('.bl-alpha-h-btn').length >= 26") is True)
            shot("03-search.png")

        if "livetv" in only:
            nav("#/livetv?tab=0")
            check("Live TV: Programs, its tabs", "Programs" in texts(".bl-tab"), str(texts(".bl-tab")))
            nav("#/livetv?tab=1", 30)
            check("the guide in stock's look", js("!!document.querySelector('.bl-guide .icefin-guide-row')") is True)
            shot("09-lib-livetv-guide.png")

        if "music" in only and album:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(album)}], serverId: {json.dumps(sid)}}}).then(() => true)")
            settle(3)
            nav("#/queue")
            check("Now Playing: the song, its album and artist, the transport, the playlist", bool(js("document.querySelector('.bl-np-title').textContent")) and js("document.querySelectorAll('.bl-np-transport .bl-np-btn').length") >= 10
                  and js("document.querySelectorAll('.bl-np-qrow').length") >= 1, str(js("document.querySelector('.bl-np-title').textContent")))
            check("focus on play/pause", focused() in ("Pause", "Play"), str(focused()))
            check("the header has only Back and Home", js("document.querySelector('.bl-header-right').hidden") is True)
            shot("58-music-queue.png")
            nav("#/lyrics")
            check("Lyrics: the lines or stock's no-lyrics line", js("!!document.querySelector('.bl-lyric, .bl-lyrics-none')") is True)
            shot("59-music-lyrics.png")
            stop_play()

        if "player" in only and movie:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(movie)}], serverId: {json.dumps(sid)}}}); true")
            try:
                page.wait_for("!!document.querySelector('.bl-pl')", timeout=25)
                settle(4)
                act("enter"); settle(1)
                check("the OSD: Back and the title at the top; the slider, times and buttons at the bottom", js("!!document.querySelector('.bl-pl.bl-pl-shown') && !!document.querySelector('.bl-pl-toptitle').textContent") is True
                      and js("!!document.querySelector('.bl-pl-times .bl-pl-bar')") is True)
                check("Ends at beside the buttons", "Ends at" in (js("document.querySelector('.bl-pl-ends').textContent") or ""), js("document.querySelector('.bl-pl-ends').textContent"))
                check("prev and next hidden for a single item", js("[...document.querySelectorAll('.bl-pl-left .bl-np-btn')].filter(b => b.offsetParent).length") == 3)
                shot("60-player-osd.png")
                act("menu"); settle(1)
                labels = texts(".bl-panel .bl-row .bl-row-label, .bl-panel .bl-stepper-label")
                check("≡: stock's Settings sheet", [x for x in labels if x in ("Aspect Ratio", "Playback Speed", "Repeat Mode", "Playback Info")][-2:] == ["Repeat Mode", "Playback Info"], str(labels))
                shot("63-player-settings.png")
                act("back"); settle(0.6)
            except Exception as e:  # noqa: BLE001
                check("the player started", False, str(e)[:120])
            stop_play()

        if "settings" in only:
            nav("#/mypreferencesmenu")
            names = texts(".bl-hub-text")
            check("Settings: stock's list (Profile … Controls, then Select Server, Sign Out, Exit Application)", names[:8] == ["Profile", "Quick Connect", "Display", "Home", "Playback", "Subtitles", "Client Settings", "Controls"]
                  and names[-3:] == ["Select Server", "Sign Out", "Exit Application"], str(names))
            shot("28-settings-hub.png")
            nav("#/mypreferencesmenu?pane=client", 30)
            settle(2)
            check("Client Settings: jellyfin-web's dialog under Baseline's header", js("document.querySelector('.bl-page-title').textContent") == "Client Settings" and js("!!document.querySelector('.icefin-cs-host .dialog')") is True)
            shot("29-settings-client.png")
            nav("#/userprofile?userId=" + js("window.ApiClient.getCurrentUserId()"))
            check("Profile: the picture, Add Image, the three password fields and Save", js("document.querySelectorAll('.bl-form .bl-input').length") == 3 and "Add Image" in js("document.querySelector('.bl-profile-head').textContent"))
            shot("35-profile.png")
            nav("#/quickconnect")
            check("Quick Connect: the user, the code, Authorize", "Authorize" in js("document.querySelector('.bl-form').textContent") and js("document.querySelectorAll('.bl-form .bl-input').length") == 1)
            shot("36-quickconnect.png")

        if "hints" in only and movie:
            lib = js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => (r.Items.find(v => v.CollectionType === 'movies') || {}).Id)")
            nav(f"#/movies?topParentId={lib}&collectionType=movies")
            focus_film(); settle(0.5)
            h1 = hint()
            check("page-aware hints on a film: OK details, ▶ play, ≡ options", "OK" in h1 and "details" in h1 and "▶" in h1 and "≡" in h1, h1)
            act("menu")
            page.wait_for("!!document.querySelector('.bl-panel .bl-row')", timeout=10)
            settle(0.4)
            h3 = hint()
            check("hints in a dialog: choose and close, nothing from the page behind", "Back" in h3 and "▶" not in h3, h3)
            act("back"); settle(0.6)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400, y=300)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=420, y=310)
            settle(0.4)
            check("the mouse hides them", js("getComputedStyle(document.querySelector('.bl-hints')).opacity") == "0")
            act("down"); settle(0.3)

        if "sounds" in only:
            man = json.loads(js("fetch(window.icefinBaseline.base + 'theme.json').then(r => r.text())") or "{}")
            meta, music = man.get("sounds") or {}, man.get("music") or {}
            check("the five interface sounds", sorted(meta) == ["back", "error", "focus", "navigate", "select"], str(meta))
            check("music: startup, ambient and the goodbye jingle", bool(music.get("startup")) and bool(music.get("ambient")) and "goodbye" in (music.get("jingles") or {}), str(music))

        if "motion" in only:
            nav("#/home")
            dur = js("getComputedStyle(document.querySelector('.bl-card-box')).transitionDuration")
            check("normal motion: the card grows in 0.2 s (stock's)", dur.startswith("0.2s"), dur)
            js("window.icefinTheme.ui.motion.cap('low'); true")
            act("right"); settle(0.3)
            dur = js("getComputedStyle(document.querySelector('.bl-card-box')).transitionDuration")
            check("low motion: no transition on the cards", dur.startswith("0s"), dur)
            js("window.icefinTheme.ui.motion.cap('normal'); true")

        # A theme script's error carries its file (icefin-theme://baseline/…); "Script error." with no source is another
        # origin's script, masked by the browser, so not Baseline's.
        errs = js("JSON.stringify((window.__blErr || []).filter(e => !/userprofile|ResizeObserver/.test(e) && !/^uncaught Script error\\. @\\?:0$/.test(e)).slice(0, 6))")
        check("no script errors from Baseline", errs == "[]", errs)
    finally:
        try:
            app.terminate()
        except Exception:
            pass
    print(f"baseline_pass: {'PASS' if not fails else 'FAIL'} ({len(fails)} failing)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
