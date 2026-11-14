#!/usr/bin/env python3
"""plaza_everywhere.py — Plaza on every jellyfin-web screen but the server dashboard (PLAN 9.42). Lab only.

With Plaza on:
  - jellyfin-web's own pages (sign-in, servers, profile, the five preference pages, Quick Connect, now playing) keep
    their page and get Plaza's frame (name pill, tabs, curved bar with Back and Home) and look (cards, pill fields and
    buttons, switches); the server dashboard gets neither;
  - lists, playlists, photos, books and other libraries are Plaza screens, with the sort and filter panel;
  - a playlist's items move on its details screen (Menu, down, OK), saved to the server;
  - dialogs (item menu, add to playlist, delete) are framed cards with a name tab; the photo viewer frames the photo;
  - the music capsule shows on the home while music plays; text fields get the on-screen keyboard.
Screenshots of each go to --out, for comparison with the mock-ups on the Plaza design canvas.
Usage: python3 plaza_everywhere.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rpe
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import hostmode  # noqa: E402

FRAME = r"""(() => { const h = document.documentElement, own = document.querySelector('#icefin-theme-root[data-pz-view]');
  // Plaza's own screen wins over a stock frame left hidden from an earlier page
  const c = (own && own.querySelector('.pz-menu')) || document.querySelector('#icefin-stock-chrome .pz-sc');
  const vis = (e) => !!(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const hdr = [...document.querySelectorAll('.skinHeader, header.MuiAppBar-root')].some(vis);
  const tabs = c ? [...c.querySelectorAll('.pz-sc-tabs .pz-tab, .pz-tabs .pz-tab')].map(t => (t.classList.contains('pz-tab-on') ? '*' : '') + t.textContent) : [];
  return JSON.stringify({stock: h.getAttribute('data-icefin-stock'), dash: h.hasAttribute('data-icefin-dashboard'), frame: vis(c), name: c ? c.querySelector('.pz-mname-text').textContent : '',
    home: !!(c && vis(c.querySelector('.pz-mround-home'))), tabs, header: hdr, view: own ? own.getAttribute('data-pz-view') : null}); })()"""
STYLE = r"""((sel) => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
  return JSON.stringify({radius: parseFloat(cs.borderTopLeftRadius), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), bg: cs.backgroundColor, bgi: cs.backgroundImage.slice(0, 30), font: cs.fontFamily.slice(0, 20)}); })"""
PAD = r"""(a => { if (window.icefinTheme && window.icefinTheme.handleAction(a)) return 'theme'; window.icefinInputManager.handleCommand({enter: 'select'}[a] || a, {}); return 'jellyfin-web'; })"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9265)
    ap.add_argument("--out", required=True)
    hostmode.add_args(ap)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    app = xv = log = stop = None
    if a.host:
        # the host: the user's server stays as it is: no sign-in or sign-out, nothing made, moved, deleted or played
        page, stop = hostmode.start(a, a.out)
    else:
        cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
        cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
        srv = Server(cfg)
        srv.wait()
        xv = start_x()
        log = open(os.path.join(a.out, "app.log"), "w")
        app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-pe-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"plaza_everywhere: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        if not a.host:
            page = Page(a.port, timeout=90)
        js = page.eval

        def shot(name):
            open(os.path.join(a.out, f"{name}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

        frame = lambda: json.loads(js(FRAME))
        style = lambda sel: (lambda r: json.loads(r) if r else None)(js(f"{STYLE}({json.dumps(sel)})"))
        pad = lambda x: js(f"{PAD}({json.dumps(x)})")
        W = lambda: js("innerWidth")
        H = lambda: js("innerHeight")

        def go(h, wait=3.0):
            js(f"location.hash = {json.dumps(h)}; true")
            time.sleep(wait)

        def click(sel):
            return js(f"(() => {{ const b = [...document.querySelectorAll({json.dumps(sel)})].find(x => x.getClientRects().length); if (!b) return false; b.click(); return true; }})()")

        def close_dialogs():
            for _ in range(3):
                if not js("[...document.querySelectorAll('.dialogContainer .dialog')].some(d => d.getClientRects().length)"):
                    return
                js("history.back(); true")
                time.sleep(0.8)

        if not a.host:  # the lab: its server, the sign-in page, a sign-in, then Plaza (the host harness has done this)
            page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
            js(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(5)
            page.reconnect()
            page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
            js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
            time.sleep(3)
            # ---- before signing in ----
            f = frame()
            check("sign-in page: Plaza's own screen, 'Sign in', no Home, no header", f["view"] == "signin" and f["frame"] and f["name"] == "Sign in" and not f["home"] and not f["header"], json.dumps(f))
            st = style("#icefin-theme-root .pz-si-go")
            check("sign-in page: Sign In is a pill", bool(st) and st["radius"] >= st["h"] / 2 - 1, json.dumps(st))
            shot("01-sign-in")
            js(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
            js("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(8)
            page.reconnect()
            page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinPlaybackManager && !!window.icefinInputManager", timeout=90)
            js = page.eval
            time.sleep(2)
            # the signed-in user has a theme choice of their own (8.5): Plaza for them too
            js("window.icefinThemeSync ? window.icefinThemeSync.idle().then(() => true) : true")
            js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
            time.sleep(3)
        uid = js("window.ApiClient.getCurrentUserId()")
        sid = js("window.ApiClient.serverId()")
        one = lambda q: js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {json.dumps(dict({'Recursive': True, 'Limit': 1}, **q))}).then(r => r.Items[0] ? r.Items[0].Id : null)")
        views = {ct: vid for vid, ct in js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.map(v => [v.Id, v.CollectionType || '']))")}
        ids = {k: one({"IncludeItemTypes": k}) for k in ["Movie", "MusicAlbum", "Playlist", "Photo", "Book"]}
        genre = js("window.ApiClient.getGenres(window.ApiClient.getCurrentUserId(), {Limit: 1}).then(r => r.Items[0] ? {id: r.Items[0].Id, name: r.Items[0].Name} : null)")

        go("#/selectserver")
        f = frame()
        check("servers page: Plaza's own 'Choose a server'", f["view"] == "signin" and f["frame"] and f["name"] == "Choose a server", json.dumps(f))
        shot("02-servers")
        # ---- user settings ----
        go(f"#/userprofile?userId={uid}")
        f = frame()
        check("profile: Plaza's own 'Profile' with Home", f["view"] == "profile" and f["frame"] and f["name"] == "Profile" and f["home"] and not f["header"], json.dumps(f))
        st = style("#icefin-theme-root .pz-pf-save")
        check("profile: its buttons are pills", bool(st) and st["radius"] >= st["h"] / 2 - 1, json.dumps(st))
        js("window.icefinTheme.ctx.focus(document.querySelector('#icefin-theme-root .pz-pf-form .pz-input')); true")
        pad("enter")
        time.sleep(0.6)
        check("profile: a text field opens the on-screen keyboard", js("!!document.getElementById('icefin-osk') && document.getElementById('icefin-osk').getClientRects().length > 0"))
        shot("03-profile")
        pad("back")
        time.sleep(0.4)
        go(f"#/mypreferencesplayback?userId={uid}")
        f = frame()
        check("preferences: five tabs, Playback on", f["tabs"] == ["Display", "Home", "*Playback", "Subtitles", "Controls"], json.dumps(f))
        st = style("#languagePreferencesPage label:has(> input[type=checkbox]) .checkboxOutline")
        check("preferences: tick boxes are switches", bool(st) and st["w"] > st["h"] * 1.6 and st["radius"] >= st["h"] / 2 - 1, json.dumps(st))
        st = style("#languagePreferencesPage select")
        check("preferences: drop-downs are pills", bool(st) and st["radius"] >= st["h"] / 2 - 1, json.dumps(st))
        shot("04-prefs-playback")
        js("[...document.querySelectorAll('#icefin-stock-chrome .pz-tab')].find(t => t.textContent === 'Subtitles').click(); true")
        time.sleep(3)
        f = frame()
        check("preferences: the Subtitles tab goes there", f["stock"] == "mypreferencessubtitles" and "*Subtitles" in f["tabs"], json.dumps(f))
        shot("05-prefs-subtitles")
        go(f"#/mypreferenceshome?userId={uid}")
        shot("06-prefs-home")
        go("#/quickconnect")
        f = frame()
        check("Quick Connect: Plaza's own screen", f["view"] == "quickconnect" and f["name"] == "Quick Connect", json.dumps(f))
        shot("07-quickconnect")
        # ---- the dashboard stays stock ----
        go("#/dashboard", 5)
        f = frame()
        st = style(".MuiButton-root:not(.MuiIconButton-root), .raised")
        check("dashboard: no frame, no Plaza look", f["dash"] and not f["stock"] and not f["frame"], json.dumps(f))
        check("dashboard: its buttons keep jellyfin-web's shape and font", bool(st) and st["radius"] < 30 and "M PLUS" not in st["font"], json.dumps(st))
        shot("08-dashboard")
        # ---- Plaza screens: a list with the sort and filter panel ----
        if genre:
            go(f"#/list?genreId={genre['id']}&serverId={sid}", 4)
            ok = js("!!document.querySelector('#icefin-theme-root[data-pz-view=\"list\"] .pz-grid[data-pz-grid-ready]')")
            name = js("(document.querySelector('#icefin-theme-root .pz-mname-text') || {}).textContent || ''")
            check("list: a Plaza screen named after the genre", ok and name == genre["name"], name)
            shot("09-list")
            js("document.querySelector('#icefin-theme-root .pz-tab-sort').click(); true")
            time.sleep(0.8)
            check("list: the sort and filter panel opens", js("document.getElementById('icefin-theme-root').getAttribute('data-pz-panel') === 'sort'"))
            shot("10-sort-filter")
            js("[...document.querySelectorAll('.pz-panel .pz-setrow')].find(r => /Favourites/.test(r.textContent)).click(); true")
            time.sleep(1.5)
            fav = js("(document.querySelector('.pz-grid') || {getAttribute: () => ''}).getAttribute('data-pz-grid-ready')")
            pad("back")
            time.sleep(0.6)
            sort_label = js("document.querySelector('#icefin-theme-root .pz-tab-sort').textContent")
            check("list: a filter applies and shows on the sort tab; Back closes the panel", fav == "0" and "1 filter" in sort_label and not js("document.getElementById('icefin-theme-root').hasAttribute('data-pz-panel')"), f"{fav} {sort_label}")
        # ---- playlists ----
        go(f"#/playlists?serverId={sid}", 4)
        # New playlist ends the list: with more playlists than one page holds (the host's server), turn to the last page
        for _ in range(60):
            if not js("(() => { const n = document.querySelector('#icefin-theme-root .pz-next'); if (!n || n.classList.contains('pz-hidden')) return false; n.click(); return true; })()"):
                break
            time.sleep(0.8)
        cells = js("[...document.querySelectorAll('#icefin-theme-root .pz-cell')].map(c => c.classList.contains('pz-cell-new') ? '+' : c.plazaItem.Name)")
        check("playlists: a Plaza screen, its playlists then New playlist", bool(cells) and cells[-1] == "+" and len(cells) >= 2, json.dumps(cells))
        shot("11-playlists")
        if a.host:
            # the host: New playlist opens its panel, and Back closes it without making one
            js("document.querySelector('#icefin-theme-root .pz-cell-new').click(); true")
            time.sleep(0.6)
            check("playlists: New playlist opens its name panel (host: closed unmade)", js("!!document.querySelector('.pz-panel .pz-input')") is True)
            pad("back")
            time.sleep(0.6)
        else:
            js("document.querySelector('#icefin-theme-root .pz-cell-new').click(); true")
            time.sleep(0.6)
            js("(() => { const i = document.querySelector('.pz-panel .pz-input'); i.value = 'Plaza test list'; return true; })()")
            shot("12-new-playlist")
            js("[...document.querySelectorAll('.pz-panel .pz-tab')].find(b => b.textContent === 'Create').click(); true")
            time.sleep(2.5)
            made = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Playlist', Recursive: true, SearchTerm: 'Plaza test list'}).then(r => r.Items.map(i => i.Id))")
            check("playlists: New playlist makes one", len(made) == 1, json.dumps(made))
            for pid in made:
                js(f"window.ApiClient.deleteItem('{pid}').then(() => true)")
        # ---- a playlist's items move ----
        if ids["Playlist"] and not a.host:  # moving saves to the server: the lab only
            go(f"#/details?id={ids['Playlist']}&serverId={sid}", 2)
            page.wait_for("!!document.querySelector('#icefin-theme-root[data-icefin-details-complete]')", timeout=20)
            order = lambda: js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {{ParentId: '{ids['Playlist']}'}}).then(r => r.Items.map(i => i.Name))")
            before = order()
            page.wait_for("!!document.querySelector('.icefin-d-row[data-icefin-reorder] .icefin-d-track')", timeout=20)
            js("window.icefinTheme.ctx.focus(document.querySelector('.icefin-d-row[data-icefin-reorder] .icefin-d-track')); true")
            pad("menu")
            time.sleep(0.5)
            js("(() => { const b = [...document.querySelectorAll('#icefin-theme-overlay [data-icefin-focus]')].find(x => x.textContent.trim() === 'Move in this playlist'); if (b) b.click(); return !!b; })()")
            time.sleep(0.3)
            lifted = js("!!document.querySelector('.icefin-d-track.icefin-d-moving')")
            shot("13-playlist-move")
            pad("down")
            pad("enter")
            time.sleep(1.5)
            after = order()
            check("playlist: Menu, then Move in this playlist, lifts an item; Down and OK move it, the server keeps it", lifted and len(before) >= 2 and after[:2] == [before[1], before[0]], f"{before} -> {after}")
            page.wait_for("!!document.querySelector('.icefin-d-row[data-icefin-reorder] .icefin-d-track')", timeout=20)
            js("window.icefinTheme.ctx.focus(document.querySelector('.icefin-d-row[data-icefin-reorder] .icefin-d-track')); true")
            pad("menu")
            time.sleep(0.5)
            js("(() => { const b = [...document.querySelectorAll('#icefin-theme-overlay [data-icefin-focus]')].find(x => x.textContent.trim() === 'Move in this playlist'); if (b) b.click(); return !!b; })()")
            pad("down")
            pad("enter")
            time.sleep(1.5)
            check("playlist: moved back", order() == before, json.dumps(order()))
        # ---- photos and the viewer ----
        if views.get("homevideos"):
            go(f"#/homevideos?topParentId={views['homevideos']}&collectionType=homevideos&serverId={sid}", 4)
            days = js("document.querySelectorAll('#icefin-theme-root .pz-day').length")
            check("photos: a Plaza screen with the day on each day's first photo", days >= 1, str(days))
            shot("14-photos")
            js("[...document.querySelectorAll('#icefin-theme-root .pz-cell')].find(c => c.plazaItem && c.plazaItem.MediaType === 'Photo').click(); true")
            time.sleep(3)
            st = style(".slideshowDialog .swiper-slide-active .swiper-slide-img")
            check("photo viewer: jellyfin-web's viewer with the photo framed", bool(st) and st["radius"] >= 10, json.dumps(st))
            js("document.querySelector('.slideshowDialog') && document.querySelector('.slideshowDialog').dispatchEvent(new MouseEvent('mousemove', {bubbles: true})); true")
            time.sleep(0.5)
            shot("15-photo-viewer")
            close_dialogs()
            js("window.icefinPlaybackManager.stop(); true")
            time.sleep(1)
        # ---- books ----
        if views.get("books"):
            go(f"#/books?topParentId={views['books']}&collectionType=books&serverId={sid}", 4)
            n = js("document.querySelectorAll('#icefin-theme-root .pz-cell').length")
            check("books: a Plaza screen with the books", n >= 1, str(n))
            shot("16-books")
            if not a.host:  # the reader reports a reading position to the server: the lab only
                js("document.querySelector('#icefin-theme-root .pz-cell').click(); true")
                time.sleep(6)
                shot("17-book-reader")
                check("books: A opens the reader", js("!!document.querySelector('#bookPlayer, #pdfPlayer, #comicsPlayer, .bookPlayerContainer')"))
                js("window.icefinPlaybackManager.stop(); true")
                js("history.back(); true")
                time.sleep(2)
        # ---- dialogs from the item menu ----
        go(f"#/details?id={ids['Movie']}&serverId={sid}&icefin=stock", 4)
        click(".btnMoreCommands")
        time.sleep(1.2)
        st = style(".dialogContainer .actionSheet")
        it = style(".dialogContainer .actionSheet .actionSheetMenuItem")
        check("item menu: a rounded card of pill rows", bool(st and it) and st["radius"] >= 20 and it["radius"] >= 8, f"{st} {it}")
        pad("down")
        time.sleep(0.3)
        shot("18-item-menu")
        if click(".actionSheet [data-id=addtoplaylist]"):
            time.sleep(2)
            d = style(".dialogContainer .dialog.formDialog")
            t = style(".dialogContainer .dialog .formDialogHeaderTitle")
            check("add to playlist: a card inset from the screen, its title a tab at the top right", bool(d and t) and d["w"] < W() - 20 and d["radius"] >= 20 and t["x"] + t["w"] >= d["x"] + d["w"] - 4 and abs(t["y"] - d["y"]) <= 4, f"{d} {t}")
            shot("19-add-to-playlist")
            close_dialogs()
        if not a.host:  # never open a delete confirmation on the user's server
            click(".btnMoreCommands")
            time.sleep(1.2)
        if not a.host and click(".actionSheet [data-id=delete]"):
            time.sleep(1.5)
            d = style(".dialogContainer .dialog.centeredDialog")
            check("delete: a small card in the middle", bool(d) and d["w"] < W() * 0.9 and d["h"] < H() * 0.9, json.dumps(d))
            shot("20-delete")
            click(".dialogContainer [data-id=cancel], .dialogContainer .button-cancel")
            time.sleep(0.8)
            close_dialogs()
        click(".btnMoreCommands")
        time.sleep(1.2)
        if click(".actionSheet [data-id=editsubtitles]"):
            time.sleep(2)
            shot("21-subtitles")
            close_dialogs()
        click(".btnMoreCommands")
        time.sleep(1.2)
        if click(".actionSheet [data-id=edit]"):
            time.sleep(3)
            shot("22-edit-details")
            close_dialogs()
        # ---- music: the capsule on the home, now playing, the bar on jellyfin-web's pages ----
        if ids["MusicAlbum"] and not a.host:  # playing reports to the server: the lab only
            js(f"window.icefinPlaybackManager.play({{ids: ['{ids['MusicAlbum']}'], serverId: '{sid}'}}); true")
            time.sleep(4)
            go("#/home", 3)
            check("home: the music capsule while music plays", js("!!document.querySelector('#icefin-theme-root .pz-mini.pz-on')"))
            shot("23-home-music")
            go("#/queue", 3)
            f = frame()
            check("now playing: Plaza's own 'Music', Now playing on, with Lyrics", f["view"] == "music-now" and f["name"] == "Music" and "*Now playing" in f["tabs"] and "Lyrics" in f["tabs"], json.dumps(f))
            shot("24-now-playing")
            go(f"#/mypreferencesplayback?userId={uid}", 3)  # still jellyfin-web's own page, in Plaza's frame
            st = style(".nowPlayingBar")
            check("music bar on jellyfin-web's pages: a capsule", bool(st) and st["radius"] >= st["h"] / 2 - 1 and st["w"] < W() - 20, json.dumps(st))
            shot("25-music-bar")
            go("#/lyrics", 3)
            shot("26-lyrics")
            js("window.icefinPlaybackManager.stop(); true")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(2)
        f = frame()
        check("theme off: no frame, no marks", not f["frame"] and not f["stock"] and not f["dash"], json.dumps(f))
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        if stop:
            stop()  # the host: the user's theme choice goes back
        else:
            try:
                os.killpg(app.pid, signal.SIGTERM)
                app.wait(15)
            except Exception:  # noqa: BLE001
                pass
            if xv:
                xv.terminate()
            log.close()
    print("plaza_everywhere:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
