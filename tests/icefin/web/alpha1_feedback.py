#!/usr/bin/env python3
"""alpha1_feedback.py — the first alpha's feedback in the running app (themed Client Settings, the overlay lane in
the player controls, the Live TV connecting dialog, Plaza's Collections channel). Lab guests only.

  - Client Settings is a themed page while a theme is up: the hub's entry and NativeShell.openClientSettings() both
    lead to #/mypreferencesmenu?pane=client; the real dialog sits in the theme root beside a list of its sections; the
    remote moves through the controls; OK opens a drop-down, the arrows and OK pick in it, Back closes it, Back again
    returns;
  - player controls: a plugin's overlay button moves into a lane above the controls while they are up; Up from the
    controls' top row focuses it and Down returns;
  - Live TV: starting a channel shows the connecting dialog, which closes when the picture plays or turns into an
    error notice (Close, Try again);
  - Plaza: a Collections library's channel shows random collections.
Also measures what covers Plaza's clocks (home with each bottom-row channel focused, at 16:9 and 2.3:1). Screenshots
go to --out.
Usage: python3 alpha1_feedback.py --app ~/build/src/icefin-player --server jf12 --out ~/rfb
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

OVERLAP = r"""(sel => {
  const c = document.querySelector(sel); if (!c) return null;
  const rg = document.createRange(); rg.selectNodeContents(c); const r = rg.getBoundingClientRect(), hits = [];
  const name = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  for (let x = r.left + 3; x < r.right - 2; x += Math.max(4, r.width / 14)) for (let y = r.top + 3; y < r.bottom - 2; y += Math.max(4, r.height / 5)) {
    const t = document.elementFromPoint(x, y); if (t && t !== c && !c.contains(t) && !t.contains(c)) hits.push(name(t)); }
  return [...new Set(hits)];
})"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9260)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-fb-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"alpha1_feedback: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinPlaybackManager", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        foc = lambda: js("(() => { const f = document.querySelector('.icefin-focused'); if (!f) return ''; return f.tagName.toLowerCase() + '/' + (f.getAttribute('aria-label') || f.dataset.section || f.textContent || '').trim().slice(0, 40); })()")
        root = lambda n: js(f"document.getElementById('icefin-theme-root').getAttribute({json.dumps(n)})")
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz=\"home\"][data-pz-ready]')", timeout=40)
        time.sleep(2)

        # ---- Plaza's clocks: what covers them ----
        for (w, h) in ((1920, 1080), (2552, 1102)):
            page.send("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
            time.sleep(1.2)
            cols = int(js("+getComputedStyle(document.getElementById('icefin-theme-root')).getPropertyValue('--pz-cols')"))
            covered = {}
            for col in range(cols):
                js(f"window.icefinTheme.ctx.focus(document.querySelectorAll('.pz-tile')[{cols * 2 + col}]); true")
                time.sleep(0.15)
                hits = js(OVERLAP + "('.pz-clock')")
                if hits:
                    covered[col + 1] = hits
            print(f"alpha1_feedback: info clock at {w}x{h} ({cols} columns): covered with column(s) {sorted(covered)} focused by {sorted({h for v in covered.values() for h in v})}", flush=True)
            js(f"window.icefinTheme.ctx.focus(document.querySelectorAll('.pz-tile')[{cols * 2 + cols // 2}]); true")
            time.sleep(0.4)
            shot(f"clock-home-{w}x{h}.png")
        mv = js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.find(v => v.CollectionType === 'movies').Id)")
        sid = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Series', Recursive: true, Limit: 1}).then(r => (r.Items[0] || {}).Id || '')")
        for (w, h) in ((1920, 1080), (2552, 1102)):
            page.send("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
            for name, hsh, ready in (("movies", f"#/movies?topParentId={mv}&collectionType=movies", ".pz-grid[data-pz-grid-ready]"),
                                     ("series", f"#/home?pz=series&id={sid}", "#icefin-theme-root[data-pz-episodes]"),
                                     ("livetv", "#/livetv", ".pz-grid[data-pz-grid-ready]"), ("search", "#/search", ".pz-key")):
                js(f"location.hash = {json.dumps(hsh)}; true")
                page.wait_for(f"!!document.querySelector({json.dumps(ready)})", timeout=30)
                time.sleep(1.2)
                info = js("""JSON.stringify((() => { const c = document.querySelector('.pz-mclock'); const rg = document.createRange(); rg.selectNodeContents(c); const r = rg.getBoundingClientRect();
                    const t = [...document.querySelectorAll('.pz-tab')].map(x => x.getBoundingClientRect()).reduce((m, x) => Math.max(m, x.right), 0);
                    return {clock: [Math.round(r.left), Math.round(r.right)], tabsEnd: Math.round(t), vw: innerWidth}; })())""")
                if name == "series":  # a long-running series: many season tabs
                    js("""(() => { const t = document.querySelector('.pz-tabs'); const d = t.querySelector('.pz-tab-sort');
                        for (let i = 2; i <= 15; i++) { const b = document.createElement('div'); b.className = 'pz-tab'; b.setAttribute('data-icefin-focus', ''); b.textContent = 'Season ' + i; t.insertBefore(b, d); } return true; })()""")
                    time.sleep(0.3)
                covered = js(OVERLAP + "('.pz-mclock')")
                inpill = js("!!document.querySelector('.pz-mname .pz-mclock')")
                check(f"the menu clock sits in the name pill, uncovered ({name}, {w}x{h})", inpill is True and not covered, f"{info} covered by {covered}")
                shot(f"clock-{name}-{w}x{h}.png")
        page.send("Emulation.clearDeviceMetricsOverride")
        time.sleep(0.8)

        # ---- themed Client Settings ----
        js("location.hash = '#/mypreferencesmenu'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-icefin-settings-ready]')", timeout=30)
        js("document.querySelector('[data-entry=\"client\"]').click(); true")
        page.wait_for("location.hash.includes('pane=client') && !!document.querySelector('#icefin-theme-root[data-icefin-client-settings]')", timeout=30)
        time.sleep(2.5)  # Icefin's own sections arrive after the dialog opens
        cs = json.loads(js("JSON.stringify({rail: [...document.querySelectorAll('.icefin-cs-rail .icefin-d-btn')].map(b => b.textContent), "
                           "inRoot: !!document.querySelector('#icefin-theme-root .icefin-cs-host > .dialog'), stray: !!document.querySelector('body > .dialogContainer'), "
                           "controls: document.querySelectorAll('#icefin-theme-root .icefin-cs-host [data-icefin-focus]').length})"))
        check("Client settings is a themed page: the dialog in the theme root, its sections listed, its controls focusable",
              cs["inRoot"] and not cs["stray"] and len(cs["rail"]) >= 5 and cs["controls"] >= 10, json.dumps(cs)[:300])
        check("focus starts on the section list", foc().startswith("div/") and foc().split("/", 1)[1] in cs["rail"], foc())
        shot("client-settings.png")
        act("right")
        check("right moves into the settings", js("document.querySelector('.icefin-cs-host .icefin-focused') !== null") is True, foc())
        # A drop-down from the remote: focus a select, OK opens it, Down and OK pick, the value changes.
        sel_info = json.loads(js("""JSON.stringify((() => { const s = [...document.querySelectorAll('.icefin-cs-host select')].find(s => s.getClientRects().length && s.options.length > 1 && !s.disabled && !s.closest('#icefin-theme-manager'));
            window.__pickSel = s; window.icefinTheme.ctx.focus(s); return {label: (s.closest('label') || s.parentElement).textContent.trim().slice(0, 40), before: s.value, n: s.options.length}; })())"""))
        time.sleep(0.15)
        act("enter")
        time.sleep(0.3)
        opened = js("!!document.querySelector('#icefin-theme-root .icefin-dd-list')")
        diag = "(() => { const l = document.querySelector('.icefin-dd-list'); const a = document.activeElement; return JSON.stringify({list: !!l, inList: !!(l && l.contains(a)), active: a ? a.className + '/' + (a.textContent || '').slice(0, 20) : null, focused: (document.querySelector('.icefin-focused') || {}).className}); })()"
        act("down")
        act("enter")
        time.sleep(0.4)
        after = js("window.__pickSel.value")
        check("OK opens a drop-down, Down and OK pick from it", opened is True and after != sel_info["before"] and not js("!!document.querySelector('.icefin-dd-list')"),
              f"{sel_info} -> {after}, opened={opened}")
        js(f"window.__pickSel.value = {json.dumps(sel_info['before'])}; window.__pickSel.dispatchEvent(new Event('change', {{bubbles: true}})); true")
        time.sleep(0.6)  # nativeshell redraws the section after a change: focus a select in the fresh copy
        js("(() => { const s = [...document.querySelectorAll('.icefin-cs-host select')].find(s => s.getClientRects().length && s.options.length > 1 && !s.disabled && !s.closest('#icefin-theme-manager')); window.icefinTheme.ctx.focus(s); return true; })()")
        time.sleep(0.2)
        act("enter")
        time.sleep(0.3)
        print("alpha1_feedback: info reopened:", js("!!document.querySelector('.icefin-dd-list')"), flush=True)
        act("back")
        time.sleep(0.3)
        check("Back closes an open drop-down first", not js("!!document.querySelector('.icefin-dd-list')") and "pane=client" in js("location.hash"), js("location.hash"))
        act("back")
        page.wait_for("!location.hash.includes('pane=client')", timeout=10)
        time.sleep(0.8)
        check("Back again leaves Client settings, and the dialog goes with it", not js("!!document.querySelector('.formDialogHeaderTitle')"), js("location.hash"))
        js("window.NativeShell.openClientSettings(); true")
        time.sleep(1.5)
        check("opening Client Settings any other way leads to the themed page", "pane=client" in js("location.hash") and not js("!!document.querySelector('body > .dialogContainer')"), js("location.hash"))
        js("location.hash = '#/home'; true")
        time.sleep(1.5)

        # ---- the overlay lane in the player controls ----
        clip = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, Limit: 1}).then(r => r.Items[0].Id)")
        js(f"window.icefinPlaybackManager.play({{ids: ['{clip}'], serverId: window.ApiClient.serverId()}}); true")
        page.wait_for("location.hash.startsWith('#/video') && !!window.icefinPlaybackManager.getCurrentPlayer()", timeout=45)
        page.wait_for("window.icefinPlaybackManager.currentTime() > 1200", timeout=30)
        js("window.icefinPlaybackManager.pause(); true")
        js("""(() => { const b = document.createElement('button'); b.className = 'skip-button'; b.textContent = 'Skip Intro'; b.tabIndex = 0;
            b.style.cssText = 'position:fixed;right:18%;bottom:8%;padding:0.8em 1.4em;z-index:10'; document.body.append(b); return true; })()""")
        for _ in range(3):
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400 + _ * 60, y=300)
            time.sleep(0.2)
        page.wait_for("document.documentElement.hasAttribute('data-icefin-osd-up')", timeout=10)
        time.sleep(0.6)
        lane = json.loads(js("JSON.stringify((() => { const b = document.querySelector('.skip-button').getBoundingClientRect(), o = document.querySelector('#videoOsdPage .videoOsdBottom').getBoundingClientRect(); return {skipBottom: Math.round(b.bottom), osdTop: Math.round(o.top)}; })())"))
        check("a plugin overlay sits above the controls while they are up", lane["skipBottom"] <= lane["osdTop"], json.dumps(lane))
        page.send("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 1})
        shot("overlay-lane.png")
        page.send("Emulation.setDefaultBackgroundColorOverride")
        # From the buttons, Up goes to the seek bar (jellyfin-web's own move); Up again, from the controls' top row, reaches the overlay.
        js("(() => { const b = document.querySelector('#videoOsdPage .videoOsdBottom .osdPositionSlider'); b.focus(); return true; })()")
        act("up")
        check("Up from the controls' top row reaches the overlay", js("document.activeElement && document.activeElement.classList.contains('skip-button')") is True,
              js("document.activeElement && document.activeElement.className"))
        act("down")
        check("Down returns to the controls", js("!!document.activeElement.closest('.videoOsdBottom')") is True)
        js("document.querySelector('.skip-button').remove(); window.icefinPlaybackManager.stop(); true")
        time.sleep(2)

        # ---- Live TV: the connecting dialog ----
        chan = js("window.ApiClient.getLiveTvChannels({UserId: window.ApiClient.getCurrentUserId(), Limit: 1}).then(r => (r.Items[0] || {}).Id || null)")
        if chan:
            js("location.hash = '#/home'; true")
            time.sleep(1)
            js(f"window.icefinTheme.ctx.play({{ids: ['{chan}'], serverId: window.ApiClient.serverId()}}); true")
            page.wait_for("!!document.getElementById('icefin-live')", timeout=10)
            st = js("document.getElementById('icefin-live').getAttribute('data-state')")
            check("starting a channel shows the connecting dialog", st == "connecting" and js("document.querySelectorAll('#icefin-live .icefin-live-steps li').length") == 3, st)
            shot("live-connecting.png")
            end = None
            for _ in range(90):
                time.sleep(0.5)
                if not js("!!document.getElementById('icefin-live')"):
                    end = "closed"
                    break
                if js("document.getElementById('icefin-live').getAttribute('data-state')") == "failed":
                    end = "failed"
                    break
            playing = js("(() => { const pm = window.icefinPlaybackManager; const p = pm.getCurrentPlayer(); return !!p && pm.currentTime(p) > 0; })()")
            check("the dialog closes when the picture plays, or turns into an error notice", (end == "closed" and playing) or end == "failed", f"{end}, playing={playing}")
            if end == "failed":
                shot("live-failed.png")
                print("alpha1_feedback: info live reason:", js("document.querySelector('#icefin-live .icefin-live-reason').textContent"), flush=True)
                act("back")
            js("window.icefinPlaybackManager.stop(); true")
            time.sleep(2)
        # The error notice itself, on demand: buttons and Back.
        js("window.icefinTheme.ui.liveConnect.show({Name: 'Test Channel', ChannelNumber: '9'}, {}); window.icefinTheme.ui.liveConnect.fail('The tuner is busy.'); true")
        time.sleep(0.4)
        btns = json.loads(js("JSON.stringify([...document.querySelectorAll('#icefin-live .icefin-live-btn')].map(b => b.textContent))"))
        check("the error notice offers Close and Try again, and says why", btns == ["Close", "Try again"] and "tuner is busy" in js("document.querySelector('#icefin-live').textContent"), json.dumps(btns))
        shot("live-error.png")
        act("left")
        act("back")
        check("Back closes the error notice", not js("!!document.getElementById('icefin-live')"))

        # ---- Plaza: Collections ----
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz=\"home\"][data-pz-ready]')", timeout=30)
        time.sleep(2)
        has = js("!!document.querySelector('.pz-tile.pz-k-boxsets')")
        if has:
            js("document.querySelector('.pz-tile.pz-k-boxsets').click(); true")
            time.sleep(1.6)
            fan = js("[...document.querySelectorAll('.pz-fan-card')].filter(c => getComputedStyle(c).backgroundImage.includes('url(')).length")
            check("the Collections channel shows collections", fan >= 1, f"{fan} with art")
            shot("collections.png")
        else:
            print("alpha1_feedback: info no Collections library on this server", flush=True)
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
    print("alpha1_feedback:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
