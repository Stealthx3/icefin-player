#!/usr/bin/env python3
"""theme_osd.py — themed player controls in every theme (PLAN 9.19). Lab guests only.

jellyfin-web's own controls stay (SPEC "Native OSD"); each theme lays them out and styles them through ui.osd and its
osd.* tokens. For every bundled theme with a script (all but Baseline), while a clip plays:
  - html[data-icefin-osd] carries the theme's layout (bar, panel or minimal) and alignment;
  - every control is still there and on screen: pause, rewind, fast-forward, subtitles, settings, the seek bar;
  - the look follows the theme's tokens: the seek bar's progress colour, the buttons' shape, the focus fill;
  - a panel layout floats inside the window, narrower than it, on the theme's side;
  - the subtitles menu opens over the video in the theme's menu colour;
  - the keyboard still drives playback (K resumes the paused clip): the controller map is untouched.
With the theme off the attribute is gone (stock controls).
Usage: python3 theme_osd.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rosd
"""
import argparse, base64, json, os, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

EXPECT = {"media-center": ("panel", "right"), "harbor": ("bar", "center"), "spark": ("bar", "center"), "plum": ("minimal", "center"),
          "plaza": ("panel", "center"), "orbit": ("bar", "center"), "mosaic": ("bar", "center"), "lumen": ("panel", "center"),
          "marquee": ("bar", "center"), "almanac": ("bar", "center"), "arcade": ("bar", "center"), "tide": ("minimal", "center")}
CONTROLS = ["btnPause", "btnRewind", "btnFastForward", "btnSubtitles", "btnVideoOsdSettings", "osdPositionSlider"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9267)
    ap.add_argument("--out", required=True)
    ap.add_argument("--themes", default=",".join(EXPECT))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-osd-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_osd: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinPlaybackManager && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        api = "window.ApiClient"
        clip = js(f"new Promise(r => {api}.getItems({api}.getCurrentUserId(), {{IncludeItemTypes: 'Movie', Recursive: true, searchTerm: 'H264 AAC', Limit: 1}}).then(x => r((x.Items[0] || {{}}).Id || '')))")
        check("lab library has the clip", bool(clip))

        def switch(tid):
            for _ in range(3):
                try:
                    js(f"new Promise(r => window.api.theme.select({json.dumps(tid)}, '', '', r))")
                    break
                except Exception:  # noqa: BLE001
                    page.reconnect()
            end = time.time() + 60
            while time.time() < end:
                try:
                    want = "!window.icefinTheme.active()" if not tid else f"!!window.icefinTheme.active() && window.icefinTheme.active().id === {json.dumps(tid)} && !!window.icefinTheme.ui.osd"
                    if js(f"!!window.icefinTheme && {want} && !!window.icefinPlaybackManager && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()"):
                        time.sleep(1.5)
                        return True
                except Exception:  # noqa: BLE001
                    try:
                        page.reconnect(timeout=10)
                    except Exception:  # noqa: BLE001
                        pass
                time.sleep(1)
            return False

        def play():
            js(osd_helper)
            js(f"window.icefinPlaybackManager.play({{ids: ['{clip}'], serverId: {api}.serverId()}}); true")
            page.wait_for("location.hash.startsWith('#/video') && !!window.__osd().querySelector('.videoOsdBottom') && !!window.icefinPlaybackManager.getCurrentPlayer()", timeout=45)
            # Let jellyfin-web's controls finish starting (the position moving) before pausing: pausing within the
            # first second or so sometimes left them unable to come up.
            page.wait_for("(() => { const pm = window.icefinPlaybackManager; const t = pm.currentTime(); return t > 1500; })()", timeout=20)
            # Paused: the clip is short, and paused controls stay up.
            js("window.icefinPlaybackManager.pause(); true")
            page.wait_for("window.icefinPlaybackManager.paused()", timeout=10)

        # jellyfin-web keeps earlier player pages in the DOM (hidden): always the live one.
        osd_helper = "window.__osd = () => [...document.querySelectorAll('#videoOsdPage')].filter(p => p.getClientRects().length > 0).pop() || [...document.querySelectorAll('#videoOsdPage')].pop(); true"

        def show_osd():
            js(osd_helper)
            # jellyfin-web ignores a move that doesn't move: a new position every time.
            show_osd.n = getattr(show_osd, "n", 0) + 1
            x = 200 + (show_osd.n * 37) % 400
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=x // 2)  # a real move: jellyfin-web ignores synthetic events
            up = "!window.__osd().querySelector('.videoOsdBottom').classList.contains('videoOsdBottom-hidden') && !window.__osd().querySelector('.videoOsdBottom').classList.contains('hide') && window.__osd().querySelector('.btnPause').getClientRects().length > 0"
            try:
                try:
                    page.wait_for(up, timeout=4)
                except Exception:  # noqa: BLE001
                    # The Up arrow brings jellyfin-web's controls up as well.
                    page.send("Input.dispatchKeyEvent", type="keyDown", key="ArrowUp", code="ArrowUp", windowsVirtualKeyCode=38)
                    page.send("Input.dispatchKeyEvent", type="keyUp", key="ArrowUp", code="ArrowUp", windowsVirtualKeyCode=38)
                    page.wait_for(up, timeout=6)
            except Exception:
                print("theme_osd: debug", js("JSON.stringify({hash: location.hash, cls: (window.__osd().querySelector('.videoOsdBottom') || {}).className, paused: window.icefinPlaybackManager.paused(), player: !!window.icefinPlaybackManager.getCurrentPlayer(), active: (document.activeElement || {}).className})"), flush=True)
                raise
            time.sleep(0.6)

        def stop():
            js("document.querySelector('.actionSheet') && history.back(); window.icefinPlaybackManager.stop(); true")
            page.wait_for("!location.hash.startsWith('#/video')", timeout=20)
            time.sleep(2)

        # A probe styled with a token expression gives the computed value to compare with.
        probe = lambda prop, expr: js(f"(() => {{ const p = document.createElement('div'); p.style.{prop} = {json.dumps(expr)}; document.body.append(p); const v = getComputedStyle(p).{prop}; p.remove(); return v; }})()")

        for tid in a.themes.split(","):
            if not switch(tid):
                check(f"{tid}: theme switched", False)
                continue
            # A fresh page per theme, as a session would have.
            js("location.hash = '#/home'; location.reload(); true")
            time.sleep(6)
            page.reconnect()
            page.wait_for(f"!!window.icefinTheme && !!window.icefinTheme.active() && window.icefinTheme.active().id === {json.dumps(tid)} && !!window.icefinTheme.ui.osd && !!window.icefinPlaybackManager && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()", timeout=60)
            time.sleep(1.5)
            try:
                try:
                    play()
                    show_osd()
                except Exception:  # noqa: BLE001
                    # Seen in the lab when the test paused within the first second of playback (now it waits for the
                    # position to move first): jellyfin-web's controls then stayed down. One retry, reported, so a theme
                    # that never shows them still fails.
                    print(f"theme_osd: note {tid}: controls didn't come up on the first play; retrying once", flush=True)
                    stop()
                    play()
                    show_osd()
            except Exception as e:  # noqa: BLE001
                check(f"{tid}: plays with the controls up", False, str(e))
                try:
                    stop()
                except Exception:  # noqa: BLE001
                    pass
                continue
            lay = (js("document.documentElement.getAttribute('data-icefin-osd')"), js("document.documentElement.getAttribute('data-icefin-osd-align')"))
            check(f"{tid}: player controls in the theme's layout {lay}", lay == EXPECT[tid], f"want {EXPECT[tid]}")
            for attempt in range(2):
                vis = json.loads(js("JSON.stringify(%s.map(c => { const e = window.__osd().querySelector('.' + c); if (!e) return [c, 'missing']; const r = e.getBoundingClientRect(); return [c, e.offsetParent !== null && r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.top >= 0 ? 'ok' : 'off ' + JSON.stringify([r.left, r.top, r.right, r.bottom])]; }))" % json.dumps(CONTROLS)))
                if all(v == "ok" for _, v in vis) or attempt:
                    break
                print(f"theme_osd: note {tid}: controls hid before they were measured; showing them again", flush=True)
                show_osd()
            check(f"{tid}: every control still there and on screen", all(v == "ok" for _, v in vis), json.dumps([x for x in vis if x[1] != "ok"]))
            if not all(v == "ok" for _, v in vis):
                print("theme_osd: debug", js("JSON.stringify({pages: [...document.querySelectorAll('#videoOsdPage')].map(p => [p.className, p.getClientRects().length, p.querySelector('.videoOsdBottom').className]), bottom: (() => { const b = window.__osd().querySelector('.videoOsdBottom'); const cs = getComputedStyle(b); return [cs.display, cs.visibility, cs.opacity, cs.position, JSON.stringify(b.getBoundingClientRect())]; })(), btn: (() => { const b = window.__osd().querySelector('.btnPause'); let e = b, chain = []; while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') chain.push(e.tagName + '.' + e.className + ':' + cs.display + '/' + cs.visibility); e = e.parentElement; } return chain; })()})"), flush=True)
            show_osd()
            prog = js("getComputedStyle(window.__osd().querySelector('.osdPositionSlider ~ .mdl-slider-background-flex-container .mdl-slider-background-lower')).backgroundColor")
            want = probe("backgroundColor", "var(--icefin-osd-progress, var(--icefin-color-accent))")
            check(f"{tid}: the seek bar in the theme's progress colour", prog == want, f"{prog} vs {want}")
            rad = js("getComputedStyle(window.__osd().querySelector('.btnPause')).borderTopLeftRadius")
            wrad = probe("borderTopLeftRadius", "var(--icefin-osd-buttonRadius, 50%)")
            check(f"{tid}: buttons in the theme's shape", rad == wrad, f"{rad} vs {wrad}")
            show_osd()
            js("window.__osd().querySelector('.btnPause').focus(); true")
            time.sleep(0.3)
            fill = js("getComputedStyle(window.__osd().querySelector('.btnPause')).backgroundColor")
            wfill = probe("backgroundColor", "var(--icefin-osd-focusFill, var(--icefin-color-focus))")
            check(f"{tid}: the focused button in the theme's focus fill", fill == wfill, f"{fill} vs {wfill}")
            # Scrims fade out past the bars instead of ending at their edge (user report: a hard cut-off).
            show_osd()
            sc = json.loads(js("JSON.stringify((() => { const h = [...document.querySelectorAll('.skinHeader.osdHeader')].find(x => x.getClientRects().length) || document.querySelector('.skinHeader.osdHeader'); const hb = h.getBoundingClientRect(), hs = getComputedStyle(h, '::before'); const b = window.__osd().querySelector('.videoOsdBottom'), bb = b.getBoundingClientRect(), bs = getComputedStyle(b, '::before'); return {header: [getComputedStyle(h).backgroundImage, hs.backgroundImage.endsWith('transparent 100%)') || /rgba\\([^)]*, 0\\) 100%\\)$/.test(hs.backgroundImage), parseFloat(hs.bottom)], bar: [getComputedStyle(b).backgroundImage, bs.backgroundImage.endsWith('transparent 100%)') || /rgba\\([^)]*, 0\\) 100%\\)$/.test(bs.backgroundImage), parseFloat(bs.top)]}; })())"))
            check(f"{tid}: the title bar's scrim fades out below the bar", sc["header"][0] == "none" and sc["header"][1] and sc["header"][2] < 0, json.dumps(sc["header"][1:]))
            if EXPECT[tid][0] != "panel":
                check(f"{tid}: the controls' scrim fades out above the bar", sc["bar"][0] == "none" and sc["bar"][1] and sc["bar"][2] < 0, json.dumps(sc["bar"][1:]))
            if EXPECT[tid][0] == "panel":
                show_osd()
                r = json.loads(js("JSON.stringify(window.__osd().querySelector('.videoOsdBottom').getBoundingClientRect())"))
                W = js("innerWidth")
                side = {"right": r["right"] < W - 5 and r["left"] > W * 0.2, "left": r["left"] > 5 and r["right"] < W * 0.8, "center": abs((r["left"] + r["right"]) / 2 - W / 2) < 8}[EXPECT[tid][1]]
                check(f"{tid}: the panel floats inside the window on its side", r["width"] < W - 10 and r["left"] >= 0 and r["right"] <= W and side, json.dumps({k: round(v) for k, v in r.items() if k in ('left', 'right', 'width')}))
            show_osd()
            # The page is transparent over the native video: composite over black, or scrims lose their alpha in the shot.
            page.send("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 1})
            open(os.path.join(a.out, f"{tid}-osd.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
            page.send("Emulation.setDefaultBackgroundColorOverride")
            # What reaches the screen (the window composited over the native video), from the X display itself: the
            # DevTools screenshot above drops the page's alpha, so scrims look solid there whatever they do.
            shot_png = os.path.join(a.out, f"{tid}-screen.png")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1920x1080", "-i", os.environ.get("DISPLAY", ":99"),
                            "-frames:v", "1", shot_png], timeout=20)
            # The scrims fade: down columns of the picture (the test card's red bar), brightness changes
            # gradually through the title bar's scrim and the controls' scrim, with no edge (user report: a hard
            # cut-off). Text and the seek bar are skipped by checking only the scrim zones.
            # Three columns in the red bar: a scrim's edge runs across all of them at the same height; the test card's
            # moving diagonal crosses only one.
            cols = [subprocess.run(["ffmpeg", "-loglevel", "error", "-i", shot_png, "-vf", f"crop=1:720:{x}:0", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                                   capture_output=True, timeout=20).stdout for x in (40, 110, 180)]
            if all(len(c) == 720 for c in cols):
                col = None
                hb = int(js("Math.round(([...document.querySelectorAll('.skinHeader.osdHeader')].find(x => x.getClientRects().length) || {getBoundingClientRect: () => ({bottom: 60})}).getBoundingClientRect().bottom)"))
                bt = int(js("Math.round(window.__osd().querySelector('.osdControls').getBoundingClientRect().top)"))
                zones = [(hb - 20, min(719, hb + 80))]
                if EXPECT[tid][0] != "panel":
                    zones.append((max(0, bt - 130), bt - 25))
                jump = max(max(min(abs(c[y + 4] - c[y]) for c in cols) for y in range(z0, z1 - 4, 4)) for z0, z1 in zones)
                check(f"{tid}: on screen the scrims fade with no edge", jump <= 24, f"largest step {jump} in zones {zones}")
            else:
                check(f"{tid}: on screen the scrims fade with no edge", False, f"no screen capture ({[len(c) for c in cols]} bytes)")
            # The subtitles menu opens over the video, in the theme's menu colour.
            show_osd()
            js("window.__osd().querySelector('.btnSubtitles').click(); true")
            try:
                page.wait_for("!!document.querySelector('.actionSheet')", timeout=8)
                bg = js("getComputedStyle(document.querySelector('.actionSheet')).backgroundColor")
                wbg = probe("backgroundColor", "var(--icefin-osd-menuBackground, var(--icefin-color-surfaceRaised, var(--icefin-color-surface)))")
                check(f"{tid}: the subtitles menu opens in the theme's colours", bg == wbg, f"{bg} vs {wbg}")
                js("history.back(); true")  # jellyfin-web's dialogs close on Back
                page.wait_for("!document.querySelector('.actionSheet') && location.hash.startsWith('#/video')", timeout=8)
            except Exception as e:  # noqa: BLE001
                check(f"{tid}: the subtitles menu opens in the theme's colours", False, str(e))
            # The keyboard still drives playback: K resumes the paused clip.
            js("document.activeElement && document.activeElement.blur(); true")
            page.send("Input.dispatchKeyEvent", type="keyDown", key="k", code="KeyK", text="k", windowsVirtualKeyCode=75)
            page.send("Input.dispatchKeyEvent", type="keyUp", key="k", code="KeyK", windowsVirtualKeyCode=75)
            try:
                page.wait_for("!window.icefinPlaybackManager.paused()", timeout=8)
                resumed = True
            except Exception:  # noqa: BLE001
                resumed = False
            check(f"{tid}: K still plays and pauses (controller map untouched)", resumed)
            stop()
        switch("")
        play()
        check("theme off: stock controls (no layout attribute)", js("document.documentElement.hasAttribute('data-icefin-osd')") is False)
        stop()
        time.sleep(1.5)
        js("window.icefinThemeSync.idle().then(() => true)")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            try:
                os.killpg(app.pid, signal.SIGKILL)
            except Exception:  # noqa: BLE001
                pass
        if xv:
            xv.terminate()
    print("theme_osd:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
