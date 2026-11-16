#!/usr/bin/env python3
"""almanac_pass.py — Almanac's completeness pass (PLAN 9.49), in the lab (the user's choice for this pass, 2026-11-14:
"Almanac, in the lab"). Checks what the "Almanac Screens" canvas asks for:
  - home: the info pane over rows like channels (Continue watching, Next up, On now, New in…, Favourites, Libraries),
    the tab strip (Home current, Search and Settings last), the server's status in the pane's small line, focus on
    arrival, the reference's geometry (the channel column, the rows, the corner), the exit question with Cancel focused;
  - rows: ▲ ▼ row to row, ◀ ▶ along a row, ▲ from the first row to the tab strip and back;
  - a library's sections are rows; a row opens as a level (the path in the pane), Back returns to the same cell;
  - details are rows: Watch first with Play or Resume lit, Sound and subtitles, Mine; the poster and the item's facts;
  - ≡ opens the list box; a dialog is its next level; Back steps out, then closes it with the cell lit again;
  - search: the query line and a row per kind; the guide on Live TV with the tab strip and a programme's card;
  - Now playing; the player's info banner and its options; the framed preference pages; Settings › Home's lift;
  - hints in the bottom bar, page-aware, hidden for the mouse; low motion: no transition on the rows.
Screenshots go to --out.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 almanac_pass.py --app ~/build/src/icefin-player --server jf12 --out ~/ralm
"""
import argparse, base64, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

GROUPS = ["home", "rows", "library", "details", "panel", "search", "livetv", "music", "player", "settings", "account", "hints", "motion"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9273)
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
    cfgdir = tempfile.mkdtemp(prefix="icefin-almpass-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"almanac_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.switch_theme_reloading("almanac", "!!document.querySelector('#icefin-theme-root[data-al-ready]') && !!document.querySelector('.al-c.lit')")
        js("""(() => { if (window.__alErr) return true; window.__alErr = [];
          const ce = console.error.bind(console); console.error = (...a) => { window.__alErr.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); ce(...a); };
          window.addEventListener('error', (e) => window.__alErr.push('uncaught ' + e.message)); return true; })()""")
        time.sleep(2.5)
        R = "document.querySelector('#icefin-theme-root')"
        A = "window.icefinAlmanac"
        settle = lambda s=0.5: time.sleep(s)
        rows = lambda: json.loads(js(f"JSON.stringify(({A}.currentColumn && {A}.currentColumn.S.alive ? ({A}.currentColumn.level().rows || []) : []).map(r => r.label))"))
        lit = lambda: js("(() => { const c = document.querySelector('.al-c.lit'); return c ? c.querySelector('.al-c-name').textContent : null; })()")
        litrow = lambda: js("(() => { const r = document.querySelector('.al-gr.lit .al-ch-label'); return r ? r.textContent : null; })()")
        idx = lambda: js(f"{R}.dataset.alIndex")
        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-overlay .icefin-focused') || window.icefinTheme.ctx.focused(); return f ? (f.getAttribute('aria-label') || f.textContent || '').trim().slice(0, 60) : null; })()")
        hint = lambda: js("(() => { const h = document.querySelector('.al-hints'); return h && !h.hidden ? h.textContent : ''; })()")
        box = lambda sel: json.loads(js(f"JSON.stringify((() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return {{x: r.left / innerWidth, y: r.top / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight, r: r.right / innerWidth}}; }})())") or "null")
        ready = lambda t=20: page.wait_for(f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit, .al-empty-way')", timeout=t)

        def nav(h, wait=None, t=20):
            js(f"window.icefinTheme.ctx.navigate({json.dumps(h)}); true")
            settle(1.2)
            if wait:
                page.wait_for(wait, timeout=t)
            settle(0.6)

        def to_row(label, limit=14):
            if litrow() != label:  # from the top: a screen kept in memory comes back where it was left
                for _ in range(limit):
                    if js("window.icefinTheme.ctx.focused() && window.icefinTheme.ctx.focused().classList.contains('al-tab')"):
                        break
                    act("up"); settle(0.12)
                act("down"); settle(0.3)
            for _ in range(limit):
                if litrow() == label:
                    return True
                act("down"); settle(0.25)
            return litrow() == label

        def item_id(q):
            return js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), Object.assign({{Recursive: true, Limit: 1}}, {json.dumps(q)})).then(r => r.Items[0] ? r.Items[0].Id : null)")

        movie = item_id({"IncludeItemTypes": "Movie", "SearchTerm": "SDR", "SortBy": "Runtime", "SortOrder": "Descending"})
        album = item_id({"IncludeItemTypes": "MusicAlbum"})
        series = item_id({"IncludeItemTypes": "Series"})
        sid = js("window.ApiClient.serverId()")

        if "home" in only:
            labels = rows()
            check("home: rows like channels (Continue watching, Next up, New in…, Favourites, Libraries)", "Continue watching" in labels and "Next up" in labels and "Favourites" in labels and "Libraries" in labels
                  and any(x.startswith("New in ") for x in labels), str(labels))
            tabs = json.loads(js("JSON.stringify([...document.querySelectorAll('.al-tab')].map(t => t.textContent + (t.classList.contains('current') ? '*' : '')))"))
            check("the tab strip: Home current, the libraries, Search and Settings last", len(tabs) >= 4 and tabs[0] == "Home*" and tabs[-2:] == ["Search", "Settings"], str(tabs))
            check("the server's status in the pane's small line", js("!!document.querySelector('.al-server') && /●|○/.test(document.querySelector('.al-server').textContent)") is True, str(js("(document.querySelector('.al-server') || {}).textContent")))
            check("focus on arrival: a cell is lit and has the engine's focus", js("!!window.icefinTheme.ctx.focused() && window.icefinTheme.ctx.focused().classList.contains('al-c')") is True, str(focused()))
            # the reference's geometry (almanac.json, 1920 × 1080): channel column 470 wide, rows 58.6 apart from y 464,
            # the tab strip over them, the title from x 302, the corner 510 wide ending x 1872
            ch, r0 = box(".al-gr .al-ch"), box(".al-gr")
            check("the channel column 470 of 1920 wide", ch and abs(ch["w"] - 470 / 1920) < 0.008, json.dumps(ch))
            check("the first row at y 464 of 1080", r0 and abs(r0["y"] - 464 / 1080) < 0.012, json.dumps(r0))
            t, p = box(".al-pane .al-title"), box(".al-pv")
            check("the title from x 302; the corner 510 wide ending x 1872", t and p and abs(t["x"] - 302 / 1920) < 0.01 and abs(p["w"] - 510 / 1920) < 0.01 and abs(p["r"] - 1872 / 1920) < 0.01, f"{t} {p}")
            title = js("document.querySelector('.al-pane .al-title').textContent")
            check("the info pane names the lit cell", bool(title) and title == (lit() or title), f"{title!r} / {lit()!r}")
            shot("home.png")
            act("back")
            page.wait_for("!!document.querySelector('.al-panel .al-row')", timeout=10)
            settle(0.4)
            check("Back on the home asks to exit, Cancel focused", js("document.querySelector('.al-panel-title').textContent") == "Exit IceFin Player?" and focused() == "Cancel", str(focused()))
            shot("exit.png")
            act("back"); settle(0.6)
            check("Back again keeps you on the home, the same cell lit", js("!document.querySelector('.al-panel')") is True and js("window.icefinTheme.ctx.focused().classList.contains('lit')") is True, str(focused()))

        if "rows" in only:
            nav("#/home", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            settle(1)
            i0 = idx()
            act("down"); settle(0.3)
            i1 = idx()
            check("▼ moves to the next row", i0 != i1 and i1.split(":")[0] == str(int(i0.split(":")[0]) + 1), f"{i0} → {i1}")
            to_row("On now · Live TV") or to_row("New in Movies")
            before = idx()
            act("right"); settle(0.3)
            check("▶ moves along the row", idx().split(":")[1] == str(int(before.split(":")[1]) + 1), f"{before} → {idx()}")
            act("left"); settle(0.2)
            for _ in range(12):
                act("up"); settle(0.15)
            check("▲ from the first row goes to the tab strip", js("window.icefinTheme.ctx.focused().classList.contains('al-tab')") is True, str(focused()))
            act("right"); settle(0.2)
            check("◀ ▶ move along the tabs", focused() not in (None, "Home"), str(focused()))
            act("down"); settle(0.3)
            check("▼ returns to the rows", js("window.icefinTheme.ctx.focused().classList.contains('al-c')") is True, str(focused()))

        if "library" in only:
            nav("#/movies", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            labels = rows()
            check("a library's sections are rows (Continue, Recently added, Favourites, All movies, Collections, Genres)", all(x in labels for x in ("Recently added", "Favourites", "All movies")), str(labels))
            check("the library's tab is current", js("(document.querySelector('.al-tab.current') || {}).textContent") == "Movies", str(js("(document.querySelector('.al-tab.current') || {}).textContent")))
            shot("library.png")
            to_row("All movies")
            at = idx()
            js("[...document.querySelectorAll('.al-gr')].find(r => r.querySelector('.al-ch-label').textContent === 'All movies').querySelector('.al-ch').click(); true")
            page.wait_for(f"{R}.dataset.alReady === '2' && !{R}.hasAttribute('data-al-loading')", timeout=20)
            settle(0.8)
            check("a row opens as a level, its path in the pane", "Movies › All movies" in js("document.querySelector('.al-clock-extra').textContent"), js("document.querySelector('.al-clock-extra').textContent"))
            check("the list's header offers sort and filter", js("!!document.querySelector('.al-hdr-sort')") is True)
            shot("listing.png")
            act("menu")
            page.wait_for("!!document.querySelector('.al-panel .al-row')", timeout=10)
            settle(0.5)
            check("≡ on a list's item: its options with Sort and filter…", "Sort and filter…" in js("document.querySelector('.al-panel').textContent"), "")
            act("back"); settle(0.6)
            act("back")
            page.wait_for(f"{R}.dataset.alReady === '1'", timeout=10)
            settle(0.6)
            check("Back returns to the library with the same cell lit", idx() == at, f"{at} → {idx()}")

        if "details" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            labels = rows()
            check("details are rows: Watch first, Sound and subtitles, Mine", labels[:1] == ["Watch"] and "Sound and subtitles" in labels and "Mine" in labels, str(labels))
            check("Play or Resume is lit", lit() in ("Play", "Resume"), str(lit()))
            check("the poster at the left and the item in the info pane", js("!document.querySelector('.al-poster').hidden") is True and bool(js("document.querySelector('.al-pane .al-when').textContent")), js("document.querySelector('.al-pane .al-when').textContent"))
            shot("details-movie.png")
            if series:
                nav(f"#/details?id={series}&serverId={sid}", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
                labels = rows()
                check("a series: Watch with Next up, its seasons as rows of episodes", labels[:1] == ["Watch"] and any(x.startswith("Season") for x in labels), str(labels))
                shot("details-series.png")
            if album:
                nav(f"#/details?id={album}&serverId={sid}", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
                labels = rows()
                check("an album: Play (Play all, Shuffle, Instant mix), then a row per song", labels[:1] == ["Play"] and any("·" in x for x in labels[1:]), str(labels))
                shot("details-album.png")

        if "panel" in only and movie:
            nav(f"#/details?id={movie}&serverId={sid}", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            act("menu")
            page.wait_for("!!document.querySelector('.al-panel .al-row.icefin-focused')", timeout=10)
            settle(0.5)
            shot("options.png")
            check("≡ opens the item's options in the list box", js("document.querySelectorAll('.al-panel .al-row').length") >= 4, str(js("document.querySelectorAll('.al-panel .al-row').length")))
            check("the lit cell stays lime behind the dim", js("!!document.querySelector('.al-c.lit')") is True)
            first = focused()
            act("enter")
            page.wait_for("document.querySelectorAll('.al-panel-level').length === 2", timeout=10)
            settle(0.5)
            check("a dialog is the list box's next level", js("document.querySelectorAll('.al-panel-level').length") == 2, str(js("document.querySelector('.al-panel-level:last-child .al-panel-title').textContent")))
            shot("dialog.png")
            act("back"); settle(0.5)
            check("Back steps out of the dialog to the row chosen", js("document.querySelectorAll('.al-panel-level').length") == 1 and focused() == first, str(focused()))
            act("back"); settle(0.6)
            check("Back closes the list box, the cell lit again", js("!document.querySelector('.al-panel')") is True and js("window.icefinTheme.ctx.focused().classList.contains('lit')") is True, str(focused()))

        if "search" in only:
            nav("#/search", "!!document.querySelector('.al-search-input')")
            js("(() => { const i = document.querySelector('.al-search-input'); i.value = 'test'; i.dispatchEvent(new Event('input')); return true; })()")
            settle(3)
            labels = rows()
            check("search: the query line, and the results as rows by kind", "Best matches" in labels and len(labels) >= 2, str(labels))
            shot("search.png")
            js("window.icefinTheme.ui.keyboard && window.icefinTheme.ui.keyboard.close && window.icefinTheme.ui.keyboard.close(); true")

        if "livetv" in only:
            nav("#/livetv", "[...document.querySelectorAll('.al-guide .icefin-guide-cell')].some(c => !c.classList.contains('icefin-guide-gap'))", 30)
            settle(1)
            check("the guide on Live TV with the tab strip, Guide current", js("(document.querySelector('.al-menu-item.current') || {}).textContent") == "Guide", str(js("(document.querySelector('.al-menu-item.current') || {}).textContent")))
            check("the guide's hints in the bottom bar", "OK" in hint() and "≡" in hint(), hint())
            shot("guide.png")
            act("menu")
            try:
                page.wait_for("!!document.querySelector('.al-panel .al-row')", timeout=10)
                settle(0.5)
                txt = js("document.querySelector('.al-panel').textContent")
                check("≡ on a programme opens its card (Record, the steppers)", "Record" in txt and "Start early" in txt, txt[:120])
                shot("programme.png")
                act("back"); settle(0.6)
            except TimeoutError:
                check("≡ on a programme opens its card", False, "no list box")
            nav("#/livetv?al=rows", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            labels = rows()
            check("Live TV's rows: Channels, Recordings, Schedule, Series timers", all(x in labels for x in ("Channels", "Recordings", "Schedule")), str(labels))

        if "music" in only and album:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(album)}], serverId: {json.dumps(sid)}}}); true")
            settle(5)
            nav("#/queue", "!!document.querySelector('.al-np-title') && !!document.querySelector('.al-np-title').textContent")
            settle(1)
            check("Now playing: the song in the pane, the transport, the queue as rows", bool(js("document.querySelector('.al-np-title').textContent")) and js("document.querySelectorAll('.al-np-qrow').length") >= 1, str(js("document.querySelector('.al-np-title').textContent")))
            shot("nowplaying.png")
            nav("#/home", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            check("while music plays, Now playing is the home's first row", rows()[:1] == ["♪ Now playing"], str(rows()[:2]))
            check("the song at the hint bar's right", js("!!document.querySelector('.al-song') && !document.querySelector('.al-song').hidden") is True)
            shot("home-music.png")
            js("window.icefinTheme.ctx.nowPlaying && window.icefinPlaybackManager && window.icefinPlaybackManager.stop && window.icefinPlaybackManager.stop(); true")
            js("(() => { const p = window.icefinTheme.ui.player && window.icefinTheme.ui.player.controls ? window.icefinTheme.ui.player.controls() : null; if (p && p.stop) p.stop(); return true; })()")
            settle(2)

        if "player" in only and movie:
            js(f"window.icefinTheme.ctx.play({{ids: [{json.dumps(movie)}], serverId: {json.dumps(sid)}}}); true")
            try:
                page.wait_for("!!document.querySelector('.al-pl')", timeout=25)
                settle(4)
                act("up"); settle(0.6)
                check("the player's info banner: title, when-line, the bar, the transport", js("!!document.querySelector('.al-pl.al-pl-shown')") is True and bool(js("document.querySelector('.al-pl-title').textContent"))
                      and js("document.querySelectorAll('.al-pl-btn').length") >= 4, str(js("document.querySelector('.al-pl-title').textContent")))
                b = box(".al-pl-bar")
                check("the banner docked at the bottom", b and b["y"] > 0.7, json.dumps(b))
                shot("player.png")
                act("menu")
                page.wait_for("!!document.querySelector('.al-panel .al-row')", timeout=10)
                settle(0.5)
                check("≡ in the player: its options in the list box (Audio, Subtitles, Speed)", "Audio" in js("document.querySelector('.al-panel').textContent"), "")
                shot("player-options.png")
                act("back"); settle(0.5)
            except TimeoutError:
                check("the player started", False, "no .al-pl in 25 s")
            js("(() => { const p = window.icefinTheme.ui.player && window.icefinTheme.ui.player.controls ? window.icefinTheme.ui.player.controls() : null; if (p && p.stop) p.stop(); return true; })()")
            settle(3)

        if "settings" in only:
            nav("#/home?al=settings", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            labels = rows()
            check("Settings: rows You, Preferences, Play, This player, Server, Leave", all(x in labels for x in ("You", "Preferences", "Play", "This player", "Server", "Leave")), str(labels))
            check("Settings is a tab, current", js("(document.querySelector('.al-tab.current') || {}).textContent") == "Settings")
            shot("settings.png")
            nav("#/mypreferencesplayback")
            settle(1.5)
            check("a preference page in Almanac's frame: its name and the sibling pages", js("document.documentElement.getAttribute('data-icefin-stock')") == "mypreferencesplayback"
                  and js("document.querySelector('.al-sc-name').textContent") == "Playback" and js("document.querySelectorAll('.al-sc-tab').length") == 5, str(js("document.activeElement && document.activeElement.tagName")))
            shot("prefs.png")
            nav("#/mypreferenceshome", "!!document.querySelector('.al-hp-row')")
            labels = js("[...document.querySelectorAll('.al-hp-row[data-kind=row] .al-ch-label')].map(r => r.textContent).join('|')")
            check("Settings › Home: the home's rows with Shown and Move", "Continue watching" in labels and "Favourites" in labels, labels)
            act("menu"); act("down"); settle(0.3)
            check("≡ lifts a row and ▼ carries it", js("!!document.querySelector('.al-hp-row.al-lifted')") is True and js("document.querySelector('.al-hp-row[data-kind=row] .al-ch-label').textContent") != "Continue watching")
            act("back"); settle(0.3)
            check("Back puts it back", js("!document.querySelector('.al-hp-row.al-lifted')") is True and js("document.querySelector('.al-hp-row[data-kind=row] .al-ch-label').textContent") == "Continue watching")
            shot("homeprefs.png")

        if "account" in only:
            nav("#/userprofile", f"!!document.querySelector('.al-c.lit')")
            names = js("[...document.querySelectorAll('.al-c .al-c-name')].map(c => c.textContent).join('|')")
            check("Profile: your account's functions as a row", "Password" in names and "Sign out" in names, names)
            nav("#/quickconnect", "!!document.querySelector('.al-qc-slots')")
            act("up"); act("up"); act("right"); act("up")
            check("Quick Connect: ▲ ▼ fill a slot, ◀ ▶ move", js("[...document.querySelectorAll('.al-qc-slot')].map(s => s.textContent).join('')") == "10", js("[...document.querySelectorAll('.al-qc-slot')].map(s => s.textContent).join('')"))
            shot("quickconnect.png")
            act("back"); settle(1)

        if "hints" in only:
            nav("#/movies", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            settle(0.8)
            vis = js("(() => { const h = document.querySelector('.al-hints'); const cs = getComputedStyle(h); return cs.visibility + ' ' + cs.opacity; })()")
            check("the hint bar is shown in the bottom bar", vis == "visible 1" and js("Math.round(document.querySelector('.al-hints').getBoundingClientRect().top / innerHeight * 100)") == 90, vis)
            got = to_row("Recently added")
            settle(0.6)
            print(f"almanac_pass: note on {litrow()!r} at {idx()} (to_row {got}), lit {lit()!r}", flush=True)
            h1 = hint()
            check("page-aware hints on a film: OK details, ▶ play, ≡ options", "OK details" in h1 and "▶" in h1 and "≡" in h1, h1)
            for _ in range(45):
                if js("!!document.querySelector('.al-c.lit.more')"):
                    break
                act("right"); settle(0.12)
            if js("!!document.querySelector('.al-c.lit.more')"):
                h2 = hint()
                check("page-aware hints on a row's All cell: OK open the list, no ▶", "OK open the list" in h2 and "▶ play" not in h2, h2)
            act("left"); settle(0.3)
            act("menu")
            page.wait_for("!!document.querySelector('.al-panel .al-row')", timeout=10)
            settle(0.4)
            h3 = hint()
            check("page-aware hints in the list box: choose and close, nothing from the screen behind", "Back" in h3 and "▶" not in h3, h3)
            act("back"); settle(0.6)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400, y=300)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=420, y=310)
            settle(0.4)
            check("the mouse hides them; its Back and Home appear", js("getComputedStyle(document.querySelector('.al-hints')).opacity") == "0" and js("getComputedStyle(document.querySelector('.al-pnav')).opacity") != "0")
            act("down"); settle(0.3)

        if "motion" in only:
            nav("#/home", f"!{R}.hasAttribute('data-al-loading') && !!document.querySelector('.al-c.lit')")
            dur = js("getComputedStyle(document.querySelector('.al-c.lit')).transitionDuration")
            check("normal motion: the lime fill moves in 90 ms (the cells glide 180 ms)", "0.09s" in dur and "0.18s" in dur, dur)
            js("window.icefinTheme.ui.motion.cap('low'); true")
            act("down"); settle(0.3)
            check("low motion: no transition on the rows", js("getComputedStyle(document.querySelector('.al-c.lit')).transitionDuration").startswith("0s"), js("getComputedStyle(document.querySelector('.al-c.lit')).transitionDuration"))
            js("window.icefinTheme.ui.motion.cap('normal'); true")

        errs = js("JSON.stringify((window.__alErr || []).filter(e => !/userprofile|ResizeObserver/.test(e)).slice(0, 6))")
        check("no script errors from Almanac", errs == "[]", errs)
    finally:
        try:
            app.terminate()
        except Exception:
            pass
    print(f"almanac_pass: {'PASS' if not fails else 'FAIL'} ({len(fails)} failing)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
