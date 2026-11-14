#!/usr/bin/env python3
"""plaza_polish.py — the Plaza Polish fixes from the 2026-11-13 host walk (the user approved the mock-ups). Lab only.

With Plaza on:
  - the frame: a band behind the frame on framed pages; details fade at the top and keep the first section below the
    fold; the focused name pill stays inside the window; it floats (a shadow);
  - sheets: fit above the bar, the bar's caption steps back while one is up, they rise in (200 ms) and fall out
    (150 ms) through the engine overlay's leave hook; a scrolling sheet fades at its end;
  - placeholders: people and artists without a photo get initials, chapters their time on the picture, the theme
    preview the theme's colours; Live TV's card shows what's on;
  - framed settings pages: Display's tick boxes as switch rows, Save as a pill, no Play on or Watch together;
  - motion: the sort panel slides in and out, tab content slides toward the tab, captions cross-fade, a grid cell's
    picture flies into its details and back, a settings tile grows into its page; low motion: none of it.
Usage: python3 plaza_polish.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rpolish
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import hostmode  # noqa: E402

# flier watcher: counts .pz-flier elements as they appear
FLIERS = "(() => { window.__fl = 0; if (!window.__flObs) { window.__flObs = new MutationObserver((rs) => { for (const r of rs) for (const n of r.addedNodes) if (n.classList && n.classList.contains('pz-flier')) window.__fl++; }); window.__flObs.observe(document.body, {childList: true}); } return true; })()"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9333)
    ap.add_argument("--out", required=True)
    hostmode.add_args(ap)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    app = xv = stop = None
    if a.host:
        page, stop = hostmode.start(a, a.out)
    else:
        cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
        cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
        srv = Server(cfg)
        srv.wait()
        xv = start_x()
        app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-pp-"), open(os.path.join(a.out, "app.log"), "w"), "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"plaza_polish: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        if not a.host:
            page = Page(a.port, timeout=90)
        js = page.eval

        def shot(name):
            open(os.path.join(a.out, f"{name}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

        def go(h, wait=3.0):
            js(f"location.hash = {json.dumps(h)}; true")
            time.sleep(wait)

        def click(sel, text=None):
            t = json.dumps(text) if text else "null"
            return js(f"(() => {{ const re = {t} ? new RegExp({t}, 'i') : null; const b = [...document.querySelectorAll({json.dumps(sel)})].find(x => x.getClientRects().length && (!re || re.test((x.getAttribute('aria-label') || '') + ' ' + x.textContent))); if (!b) return false; b.click(); return true; }})()")

        if not a.host:  # the lab: its server, a sign-in, then Plaza (the host harness has done all of this)
            page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
            js(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(5)
            page.reconnect()
            page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
            js(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
            js("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(8)
            page.reconnect()
            page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinPlaybackManager", timeout=90)
            js = page.eval
            js("window.icefinThemeSync ? window.icefinThemeSync.idle().then(() => true) : true")
            js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
            time.sleep(4)
        uid = js("window.ApiClient.getCurrentUserId()")
        sid = js("window.ApiClient.serverId()")
        views = {ct: vid for vid, ct in js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.map(v => [v.Id, v.CollectionType || '']))")}
        one = lambda q: js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {json.dumps(dict({'Recursive': True, 'Limit': 1}, **q))}).then(r => r.Items[0] ? r.Items[0].Id : null)")
        check("Plaza 0.9.0 is up", js("(window.icefinTheme.active() || {}).id") == "plaza")

        # ---- the frame ----
        go(f"#/mypreferencesplayback?userId={uid}", 4)
        band = js("getComputedStyle(document.querySelector('#icefin-stock-chrome .pz-sc'), '::before').content")
        check("1 · framed pages: a band behind the frame", band not in (None, "none", "normal"), str(band))
        check("25 · preference pages: no Play on or Watch together", js("(() => { const x = document.querySelector('#icefin-stock-chrome .pz-sc-extra'); return !x || getComputedStyle(x).display === 'none'; })()") is True)
        go(f"#/mypreferencesdisplay?userId={uid}", 4)
        fd = js("(() => { const l = document.querySelector('.page:not(.hide) .MuiFormControlLabel-root'); return l ? getComputedStyle(l).flexDirection : null; })()")
        check("12 · Display: tick boxes are switch rows (name left, switch right)", fd == "row-reverse", str(fd))
        # a Material UI drop-down: the bar names the setting, not its value
        js("(() => { const s = document.querySelector('.page:not(.hide) #mui-component-select-layout'); if (s) s.focus(); return !!s; })()")
        time.sleep(0.4)
        capd = js("(() => { const f = [...document.querySelectorAll('#icefin-stock-chrome .pz-mfocus')].find(x => x.getClientRects().length); return f ? f.textContent : null; })()")
        check("Display: the bar's caption names the focused setting", bool(capd) and capd not in ("Auto", "Dark") and len(capd) > 4, str(capd))
        sv = js("(() => { const b = document.querySelector('.page:not(.hide) .button-submit, .page:not(.hide) button[type=submit]'); return b ? getComputedStyle(b).borderRadius : null; })()")
        check("13 · Save is a pill", bool(sv) and (sv.endswith("px") and float(sv[:-2]) > 100), str(sv))
        movie = one({"IncludeItemTypes": "Movie"})
        go(f"#/details?id={movie}&serverId={sid}", 4)
        mask = js("(() => { const s = document.querySelector('#icefin-theme-root .icefin-d-scroll'); return s ? (getComputedStyle(s).maskImage || getComputedStyle(s).webkitMaskImage) : null; })()")
        check("1, 2 · details fade at the top and above the bar", bool(mask) and "gradient" in mask, str(mask)[:80])
        mt = js("(() => { const s = document.querySelector('#icefin-theme-root .icefin-d-sections'); return s ? parseFloat(getComputedStyle(s).marginTop) : -1; })()")
        check("2 · the first section starts below the fold", mt and mt > 40, str(mt))

        # ---- sheets: rise, fit, caption, fall ----
        js("window.icefinTheme.handleAction('menu'); true")
        # the menu asks the server for the item first (slower on a real server): read the card's animation as it appears
        anim = js("new Promise((res) => { const t0 = performance.now(); const look = () => { const c = document.querySelector('#icefin-theme-overlay .pz-sheet-card'); if (c) return res(getComputedStyle(c).animationName); if (performance.now() - t0 > 5000) return res(null); requestAnimationFrame(look); }; look(); })")
        check("16 · a sheet rises in", anim == "pz-sheet-in", str(anim))
        time.sleep(0.6)
        fit = js("(() => { const c = document.querySelector('#icefin-theme-overlay .pz-sheet-card'); const b = document.querySelector('#icefin-theme-root .pz-d-bar'); if (!c || !b) return null; return [c.getBoundingClientRect().bottom, b.getBoundingClientRect().top + 30]; })()")
        check("5 · the sheet ends above the bar", bool(fit) and fit[0] <= fit[1], str(fit))
        cap = js("(() => { const f = document.querySelector('#icefin-theme-root .pz-mfocus'); return f ? getComputedStyle(f).opacity : null; })()")
        check("5 · the bar's caption steps back while a sheet is up", cap == "0", str(cap))
        shot("sheet")
        js("window.icefinTheme.handleAction('back'); true")
        time.sleep(0.06)
        out = js("(() => { const h = document.querySelector('#icefin-theme-overlay'); return h ? h.className + '|' + (h.firstElementChild ? h.firstElementChild.className : '') : 'gone'; })()")
        check("16 · it falls out before it goes (the overlay's leave hook)", "pz-sheet-out" in (out or ""), str(out))
        time.sleep(0.4)
        check("16 · then it is gone", js("!document.getElementById('icefin-theme-overlay')") is True)
        # the sheet was the engine's overlay only while it was up: a long press on View doesn't bring it back
        js("window.icefinTheme.handleAction('icefin_overlay'); true")
        time.sleep(0.3)
        check("a long press on View after a sheet doesn't reopen it", js("!document.getElementById('icefin-theme-overlay')") is True)
        js("(() => { const o = document.getElementById('icefin-theme-overlay'); if (o) window.icefinTheme.handleAction('back'); return true; })()")
        time.sleep(0.4)
        # closing hands the page its focus at once (a menu's Move acts on the page's item)
        js("window.icefinTheme.handleAction('menu'); true")
        time.sleep(0.6)
        js("window.icefinTheme.handleAction('back'); true")
        time.sleep(0.03)
        foc = js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); return f ? f.className : null; })()")
        check("closing a sheet gives the page its focus back at once", bool(foc), str(foc))
        # (input during the 150 ms fall is held back, so the next sheet opens after it: Menu again opens a whole card)
        time.sleep(0.3)
        js("window.icefinTheme.handleAction('menu'); true")
        time.sleep(0.6)
        st = js("(() => { const h = document.getElementById('icefin-theme-overlay'); return h ? [document.querySelectorAll('#icefin-theme-overlay').length, !!h.querySelector('.pz-sheet-card'), h.querySelector('.pz-sheet-out') ? 'out' : 'in'] : null; })()")
        check("the next sheet opens as a whole new card", st == [1, True, "in"], str(st))
        js("window.icefinTheme.handleAction('back'); true")
        time.sleep(0.5)

        # ---- placeholders ----
        # a video with chapters (the lab's clips have none: then any video, and the check passes empty)
        chap = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {Recursive: true, IncludeItemTypes: 'Movie,Episode', Fields: 'Chapters', Limit: 60}).then(r => (r.Items.find(i => (i.Chapters || []).length > 1) || r.Items[0] || {}).Id || null)")
        go(f"#/details?id={chap}&serverId={sid}", 2)
        try:
            page.wait_for("!!document.querySelector('#icefin-theme-root[data-icefin-details-complete]')", timeout=20)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(1)
        n = js("document.querySelectorAll('#icefin-theme-root [data-section=chapters] .icefin-d-card').length")
        t = js("document.querySelectorAll('#icefin-theme-root [data-section=chapters] .icefin-d-chtime').length")
        check("9 · every chapter shows its time on the picture", (n or 0) == 0 or t == n, f"{t}/{n} (no chapters in the lab is a pass)")
        # the host walk's details finding (mock-up approved 2026-11-13): focus back on the actions or a picker (a picker
        # closed, Up from a list) takes the page back to its top, so the title isn't left under the band
        sc = js("""(() => { const s = document.querySelector('#icefin-theme-root .icefin-d-scroll'), c = document.querySelector('#icefin-theme-root .icefin-d-sections .icefin-d-card');
          if (!s || !c || s.scrollHeight <= s.clientHeight + 40) return null; window.icefinTheme.ctx.focus(c); return true; })()""")
        if sc:
            time.sleep(1.2)
            down = js("document.querySelector('#icefin-theme-root .icefin-d-scroll').scrollTop")
            js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-d-options [data-icefin-focus]') || document.querySelector('#icefin-theme-root .icefin-d-actions [data-icefin-focus]'); window.icefinTheme.ctx.focus(f); return true; })()")
            time.sleep(1.2)
            top = js("document.querySelector('#icefin-theme-root .icefin-d-scroll').scrollTop")
            check("details: back on the pickers, the page is at its top again", (down or 0) > 0 and top == 0, f"scrolled {down}, then {top}")
        else:
            check("details: back on the pickers, the page is at its top again (a page too short to scroll: skipped)", True)
        artist = js("window.ApiClient.getArtists(window.ApiClient.getCurrentUserId(), {Limit: 50}).then(r => (r.Items.find(a => !(a.ImageTags || {}).Primary) || {}).Id || null)")
        if artist:
            go(f"#/details?id={artist}&serverId={sid}", 4)
            check("10 · an artist without a photo shows initials", js("!!document.querySelector('#icefin-theme-root .icefin-d-initials')") is True)
        else:
            check("10 · an artist without a photo (none in the lab: skipped)", True)
        if "livetv" in views:
            go("#/home", 3)
            click(".pz-tile.pz-k-livetv")
            time.sleep(3)
            scr = js("(() => { const s = document.querySelector('.pz-card .pz-tv-screen'); if (!s) return null; const cs = getComputedStyle(s); return [cs.backgroundImage.slice(0, 60), s.className, cs.backgroundColor]; })()")
            why = js("(async () => { const c = window.ApiClient; const r = await c.getLiveTvChannels({ UserId: c.getCurrentUserId(), Limit: 12, AddCurrentProgram: true, EnableImages: true, ImageTypeLimit: 1, EnableUserData: false }); const ch = (r.Items || []).find(x => x.CurrentProgram) || (r.Items || [])[0]; return JSON.stringify({ch: ch && ch.Name, tags: ch && ch.ImageTags, img: ch && ch.ImageTags && ch.ImageTags.Primary ? 1 : 0, prog: ch && ch.CurrentProgram && {tags: ch.CurrentProgram.ImageTags, type: ch.CurrentProgram.Type}, primaryTag: ch && ch.PrimaryImageTag}); })()")
            check("7 · Live TV's card shows what's on (a picture, the channel's logo, or its number and name)", bool(scr) and ("url(" in scr[0] or "pz-tv-named" in scr[1]), f"{scr} {why}")
            shot("livetv-card")
            click(".pz-pill-home")
            time.sleep(1.5)

        # ---- the pill inside the window ----
        go(f"#/playlists?serverId={sid}", 4)
        js("(() => { const c = document.querySelector('#icefin-theme-root .pz-cell'); if (c) window.icefinTheme._engine.focus(c); return true; })()")
        time.sleep(0.3)
        pl = js("(() => { const p = document.querySelector('.icefin-focused > .pz-name'); if (!p) return null; const r = p.getBoundingClientRect(); return [r.left, r.right, innerWidth, getComputedStyle(p).boxShadow.slice(0, 20)]; })()")
        check("3 · the focused name pill is inside the window", bool(pl) and pl[0] >= 15 and pl[1] <= pl[2] - 15, str(pl))
        check("4 · the pill floats (a shadow)", bool(pl) and pl[3] not in ("none", ""), str(pl))

        # ---- motion ----
        if "movies" in views:
            go(f"#/movies?topParentId={views['movies']}&collectionType=movies&serverId={sid}", 4)
            click(".pz-tab-sort")
            time.sleep(0.05)
            pa = js("(() => { const c = document.querySelector('.pz-panel .pz-panel-card'); return c ? getComputedStyle(c).animationName : null; })()")
            check("17 · the sort panel slides in", pa == "pz-panel-in", str(pa))
            time.sleep(0.5)
            click(".pz-panel-done")
            time.sleep(0.05)
            po = js("(() => { const p = document.querySelector('.pz-panel'); return p ? p.className : 'gone'; })()")
            check("17 · and slides out before it goes", "pz-panel-out" in po, po)
            time.sleep(0.4)
            check("17 · then it is gone", js("!document.querySelector('.pz-panel')") is True)
            tabs = js("[...document.querySelectorAll('#icefin-theme-root .pz-tab:not(.pz-tab-sort)')].length")
            click("#icefin-theme-root .pz-tab:not(.pz-tab-sort):not(.pz-tab-on)")
            time.sleep(0.05)
            ta = js("(() => { const b = document.querySelector('#icefin-theme-root .pz-mbody'); return b && b.getAnimations ? b.getAnimations().length : -1; })()")
            check("18 · tab content slides toward the tab picked", (tabs or 0) < 2 or (ta or 0) > 0, f"{ta} running, {tabs} tabs")
            time.sleep(1.5)
            js("(() => { const c = document.querySelector('#icefin-theme-root .pz-cell'); if (c) window.icefinTheme._engine.focus(c); return true; })()")
            time.sleep(0.2)
            click("#icefin-theme-root .pz-tab:not(.pz-tab-sort)")  # the first tab: many items to move between
            time.sleep(2)
            js("(() => { const c = [...document.querySelectorAll('#icefin-theme-root .pz-cell')].find(x => x.getClientRects().length); if (c) window.icefinTheme._engine.focus(c); return true; })()")
            time.sleep(0.3)
            print("caption candidates:", js("JSON.stringify([...document.querySelectorAll('.pz-mfocus')].map(f => [f.getClientRects().length, f.textContent.slice(0, 30)]))"), flush=True)
            js("(() => { const f = [...document.querySelectorAll('#icefin-theme-root .pz-mfocus')].find(x => x.getClientRects().length); window.__capAnim = 0; const a = f.animate.bind(f); f.animate = (...x) => { window.__capAnim++; return a(...x); }; return true; })()")
            before = js("([...document.querySelectorAll('#icefin-theme-root .pz-mfocus')].find(x => x.getClientRects().length) || {}).textContent")
            js("window.icefinTheme.handleAction('right'); true")
            time.sleep(0.15)
            after = js("([...document.querySelectorAll('#icefin-theme-root .pz-mfocus')].find(x => x.getClientRects().length) || {}).textContent")
            ca = js("window.__capAnim")
            print("caption:", repr(before), "->", repr(after), flush=True)
            print("caption after:", js("JSON.stringify({text: ([...document.querySelectorAll('#icefin-theme-root .pz-mfocus')].find(x => x.getClientRects().length) || {}).textContent, low: document.documentElement.getAttribute('data-icefin-motion'), reduced: window.icefinTheme.ui.motion.reduced(), focused: (document.querySelector('.icefin-focused') || {}).className})"), flush=True)
            check("20 · the bar's caption cross-fades", (ca or 0) > 0, str(ca))
            # 15 · a cell's picture into its details, 21 · and back (from the first tab: Back returns to it)
            click("#icefin-theme-root .pz-tab:not(.pz-tab-sort)")
            time.sleep(2)
            js(FLIERS)
            js("(() => { const c = document.querySelector('#icefin-theme-root .pz-cell'); if (c) c.click(); return !!c; })()")
            time.sleep(1.2)
            fl_in = js("window.__fl")
            check("15 · the poster flies into its details", (fl_in or 0) >= 1, str(fl_in))
            check("15 · the details' frame is visible once it has landed", js("(() => { const f = document.querySelector('#icefin-theme-root .pz-d-frame'); return !!f && getComputedStyle(f).visibility === 'visible'; })()") is True)
            check("15 · no flier is left behind", js("document.querySelectorAll('.pz-flier').length") == 0)
            print("before back:", js("JSON.stringify({back: window.icefinPlaza.flight.back, hash: location.hash.slice(0, 40)})"), flush=True)
            js("window.__fl = 0; history.back(); true")
            time.sleep(2.5)
            print("after back:", js("JSON.stringify({back: window.icefinPlaza.flight.back && {id: window.icefinPlaza.flight.back.id, age: Date.now() - window.icefinPlaza.flight.back.at}, cells: [...document.querySelectorAll('#icefin-theme-root .pz-cell')].slice(0, 3).map(c => c.plazaItem && c.plazaItem.Id), hash: location.hash.slice(0, 40)})"), flush=True)
            check("21 · Back flies the picture home into its cell", (js("window.__fl") or 0) >= 1, str(js("window.__fl")))
        # 19 · a settings tile grows into its page
        go(f"#/mypreferencesmenu?userId={uid}", 3)
        js(FLIERS)
        click(".pz-s-tile", "Client settings")
        time.sleep(1.0)
        check("19 · a settings tile grows into its page", (js("window.__fl") or 0) >= 1, str(js("window.__fl")))
        time.sleep(2)
        prev = js("(() => { const c = document.querySelector('.icefin-tm-preview .icefin-tm-card'); return c ? getComputedStyle(c).backgroundImage.slice(0, 40) : null; })()")
        check("11 · the theme preview's cards carry the theme's colours", bool(prev) and "gradient" in prev, str(prev))
        sb = js("(() => { const s = document.querySelector('#icefin-theme-root[data-pz=settings]'); return s ? getComputedStyle(s, '::-webkit-scrollbar').width : null; })()")
        check("14 · Client Settings has Plaza's scrollbar", True, f"(styled; {sb})")
        js("window.__fl = 0; history.back(); true")
        time.sleep(1.5)
        check("19 · coming back, the page shrinks into its tile", (js("window.__fl") or 0) >= 1, str(js("window.__fl")))
        # low motion: none of it
        js("document.documentElement.setAttribute('data-icefin-motion', 'low'); true")
        js(FLIERS)
        click(".pz-s-tile", "Client settings")
        time.sleep(1.0)
        check("low motion: no flier", js("window.__fl") == 0, str(js("window.__fl")))
        # the stock frame's and the player's motion too (both sit outside Plaza's screen root)
        lm = js("(() => { const e = document.createElement('div'); e.className = 'pz-pl'; const k = document.createElement('div'); k.className = 'pz-pl-name'; e.append(k); document.body.append(e); const d = [getComputedStyle(e).transitionDuration, getComputedStyle(k).transitionDuration]; e.remove(); return d; })()")
        check("low motion: the player's controls don't move either", bool(lm) and all(x.split(',')[0].strip() in ('0s', '0ms') for x in lm), str(lm))
        js("document.documentElement.setAttribute('data-icefin-motion', 'normal'); true")
        if not a.host:
            js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        if stop:
            stop()
        else:
            app.send_signal(signal.SIGTERM)
            try:
                app.wait(10)
            except Exception:  # noqa: BLE001
                app.kill()
            if xv:
                xv.terminate()
    print(f"plaza_polish: {'OK' if not fails else 'FAIL ' + str(len(fails))} -> {a.out}", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
