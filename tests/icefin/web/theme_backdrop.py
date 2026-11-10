#!/usr/bin/env python3
"""theme_backdrop.py — the native backdrop (PLAN 8.4) in the running app, with Tide as the theme that declares one. Lab guests only.

  - Tide's GLSL wave is baked into a .qsb and drawn by qml/icefin/Backdrop.qml between the video and the web view;
  - html[data-icefin-backdrop] makes the page transparent and Tide's web-layer canvas steps aside;
  - the backdrop draws: frames advance at the theme's fps (its gradient through the transparent page is reported
    only: Chromium keeps a page that loaded opaque as an opaque layer until a reload, open in PLAN 8.4);
  - a time-of-day palette from the web runtime reaches the shader's colour params;
  - low motion freezes it; ui.backdrop.hide()/show(); it hides while video plays and comes back after;
  - Media Center's ribbons are a backdrop too; turning the theme off removes it;
  - cost: window frame rate with the backdrop on and off (reported; the HTPC run adds GPU busy, the meaningful numbers).
Screenshots go to --out.
Usage: python3 theme_backdrop.py --app ~/build/src/icefin-player --server jf12 --out ~/r84/jf12
       HTPC (real GPU, strict pixel check, GPU busy cost): scripts/icefin/htpc.sh web theme_backdrop.py --server jf12
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9258)
    ap.add_argument("--out", required=True)
    ap.add_argument("--probe-repaint", action="store_true",
                    help="8.4 diagnosis: after the switch to Tide, try each web-view repaint (ThemeComponent::repaintWeb) and "
                         "report the pixels through the page and whether the page still gets frames; then stop")
    ap.add_argument("--qpa", default="xcb", help="session: the HTPC's on-screen session (htpc.sh web), where the pixel check is strict")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cfg["port"] = int(os.environ.get(f"ICEFIN_PORT_{a.server.upper()}", cfg["port"]))  # HTPC tier: tunnelled, shifted ports
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x() if a.qpa == "xcb" else None
    cfgdir = tempfile.mkdtemp(prefix="icefin-backdrop-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, a.qpa, gpu=True)
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_backdrop: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        themes = lambda: {t["id"]: t for t in js("new Promise(r => window.api.theme.themes(r))")}
        setv = lambda key, val: js("new Promise(r => window.api.settings.setValue('theme', %s, %s, () => r(true)))" % (json.dumps(key), json.dumps(val)))

        lm = themes().get("lumen", {})
        stats = lambda: js("new Promise(r => window.api.theme.backdropStats(r))") or {}
        bd = lambda: js("new Promise(r => window.api.theme.backdrop(r))") or {}

        tide = themes().get("tide", {})
        check("Tide offered as a built-in theme, usable", tide.get("ok") is True)
        js("new Promise(r => window.api.theme.setActiveTheme('tide', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-td-ready]')", timeout=40)
        b = bd()
        check("Tide's backdrop is baked and offered to the QML layer", str(b.get("shader", "")).endswith(".qsb") and b.get("fps") == 30
              and set((b.get("params") or {}).keys()) == {"colorTop", "colorBottom", "lineColor", "shade", "speed"}, json.dumps(b)[:300])
        check("the page marks the backdrop and goes transparent", js("document.documentElement.hasAttribute('data-icefin-backdrop')") is True
              and js("getComputedStyle(document.body).backgroundColor") in ("rgba(0, 0, 0, 0)", "transparent")
              and js("getComputedStyle(document.querySelector('.td-wave')).display") == "none", js("getComputedStyle(document.body).backgroundColor"))
        time.sleep(5)
        s1 = stats()
        check("the backdrop draws and moves", s1.get("shown") is True and s1.get("moving") is True and s1.get("time", 0) > 1.5 and s1.get("fps", 0) >= 5, json.dumps(s1))
        # a palette from the web runtime reaches the shader: July day, teal top, no shade
        js("window.icefinTheme.ui.timePalette.at('2026-07-15T13:00:00'); true")
        time.sleep(3)
        top = (bd().get("params") or {}).get("colorTop", {}).get("value")
        check("a time-of-day palette reaches the shader's colours", str(top).lower().startswith("#2fa3a0"), str(top))
        if a.probe_repaint:
            pts = [(0.5, 0.06), (0.85, 0.55), (0.62, 0.42)]

            def sample():
                js("new Promise(r => window.api.theme.grabWindow(r))")
                time.sleep(2)
                return [js(f"new Promise(r => window.api.theme.grabPixel({x}, {y}, r))") for x, y in pts]

            def alive():
                return js("new Promise(r => { const t = setTimeout(() => r(false), 3000); "
                          "requestAnimationFrame(() => { clearTimeout(t); r(true); }); })")

            print(f"theme_backdrop: probe before {sample()} frames {alive()}", flush=True)
            # least invasive first: bgAlpha froze the page on the HTPC once (#57)
            for mode in ["resize", "layer", "visible", "bgAlpha"]:
                ok = js(f"new Promise(r => window.api.theme.repaintWeb('{mode}', r))")
                time.sleep(1.5)
                print(f"theme_backdrop: probe {mode} {ok} {sample()} frames {alive()}", flush=True)
            js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")  # the choice syncs to the server user
            time.sleep(1.5)
            return 0
        # Qt's own render of the window (QML scene: backdrop, video item, web view texture), sampled in the app
        js("new Promise(r => window.api.theme.grabWindow(r))")
        page.wait_for("new Promise(r => window.api.theme.backdropStats(s => r(!!s.grab)))", timeout=15)
        qpx = js("new Promise(r => window.api.theme.grabPixel(0.5, 0.06, r))")
        # what's opaque at that point (anything that hides the backdrop), for the report
        opaque = js("""(() => { const out = []; const x = innerWidth * 0.5, y = innerHeight * 0.06;
            for (const el of document.elementsFromPoint(x, y)) { const cs = getComputedStyle(el);
                const bg = cs.backgroundColor, img = cs.backgroundImage;
                if ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || (img && img !== 'none'))
                    out.push((el.tagName + '#' + el.id + '.' + String(el.className).split(' ').join('.')).slice(0, 80) + ' ' + bg + ' ' + img.slice(0, 60)); }
            return out; })()""")
        print(f"theme_backdrop: info opaque at the top {json.dumps(opaque)}", flush=True)
        teal = bool(qpx) and abs(qpx[0] - 0x2f) < 40 and abs(qpx[1] - 0xa3) < 40 and abs(qpx[2] - 0xa0) < 40
        # reported only: Chromium keeps a page that loaded opaque as an opaque layer, so the gradient shows through
        # only after a reload (open in PLAN 8.4, on every X server, the HTPC's GPU included)
        print(f"theme_backdrop: info pixel at the top {qpx} ({'teal: the backdrop shows through' if teal else 'not visible through the page: the open 8.4 gap'})", flush=True)
        # motion
        js("window.icefinTheme.ui.motion.cap('low'); true")
        time.sleep(2.5)
        t1 = stats().get("time", 0)
        time.sleep(2.5)
        s2 = stats()
        check("low motion: the backdrop stands still", s2.get("moving") is False and abs(s2.get("time", 0) - t1) < 0.01, f"{t1} -> {json.dumps(s2)}")
        js("window.icefinTheme.ui.motion.cap('normal'); true")
        time.sleep(2.5)
        on = stats()
        js("window.icefinTheme.ui.backdrop.hide(); true")
        time.sleep(4.5)
        off = stats()
        check("ui.backdrop.hide() hides it", off.get("shown") is False)
        js("window.icefinTheme.ui.backdrop.show(); true")
        time.sleep(2.5)
        check("ui.backdrop.show() brings it back, moving", stats().get("shown") is True and stats().get("moving") is True)
        print(f"theme_backdrop: info window frame rate with the backdrop on {on.get('windowFps')} fps, hidden {off.get('windowFps')} fps", flush=True)
        # Cost (8.4: "measure transparent web-view cost"): GPU busy with the backdrop drawing under the transparent page
        # vs hidden. AMD exposes gpu_busy_percent; elsewhere this is reported as unavailable.
        import glob as _glob
        busy_files = _glob.glob("/sys/class/drm/card*/device/gpu_busy_percent")
        def busy(secs=8):
            vals = []
            for _ in range(secs * 4):
                for f in busy_files:
                    try:
                        vals.append(int(open(f).read().strip()))
                    except OSError:
                        pass
                time.sleep(0.25)
            return round(sum(vals) / len(vals), 1) if vals else None
        cost = {"window_fps_on": on.get("windowFps"), "window_fps_hidden": off.get("windowFps")}
        if busy_files:
            js("window.icefinTheme.ui.backdrop.show(); true"); time.sleep(2)
            cost["gpu_busy_on"] = busy()
            js("window.icefinTheme.ui.backdrop.hide(); true"); time.sleep(2)
            cost["gpu_busy_hidden"] = busy()
            js("window.icefinTheme.ui.backdrop.show(); true"); time.sleep(2)
        json.dump(cost, open(os.path.join(a.out, "cost.json"), "w"), indent=1)
        print(f"theme_backdrop: info cost {json.dumps(cost)}", flush=True)
        # video
        item = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {Recursive: true, IncludeItemTypes: 'Movie', SearchTerm: 'SDR H264 AAC'}).then(r => r.Items[0].Id)")
        js(f"window.icefinPlaybackManager.play({{ids: [{json.dumps(item)}], serverId: window.ApiClient.serverId()}}); true")
        try:
            page.wait_for("new Promise(r => window.api.theme.backdropStats(s => r(!!s.videoUp && !s.shown)))", timeout=30)
            hid = True
        except Exception:  # noqa: BLE001
            hid = False
        check("hidden while video plays", hid, json.dumps(stats()))
        js("window.api.player.stop(); true")
        try:
            page.wait_for("new Promise(r => window.api.theme.backdropStats(s => r(!s.videoUp && !!s.shown)))", timeout=30)
            back = True
        except Exception:  # noqa: BLE001
            back = False
        check("back after the video stops", back, json.dumps(stats()))
        # Media Center's ribbons are a backdrop too; its CSS field steps aside
        js("new Promise(r => window.api.theme.setActiveTheme('media-center', '', r))")
        time.sleep(4.5)
        mb, ms = bd(), stats()
        check("Media Center: ribbons baked and drawing, CSS field hidden", str(mb.get("shader", "")).endswith(".qsb") and mb.get("fps") == 24
              and set((mb.get("params") or {}).keys()) == {"surface", "background", "ribbon", "ribbonAlt", "speed"} and ms.get("shown") is True
              and "media-center" in str(ms.get("shader", "")) and js("(e => !e || getComputedStyle(e).display === 'none')(document.querySelector('.mc-field'))") is True,
              json.dumps(ms)[:200])
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(1.5)
        check("theme off: no backdrop, page marker gone", bd() == {} and js("document.documentElement.hasAttribute('data-icefin-backdrop')") is False, json.dumps(bd())[:120])
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
    print("theme_backdrop:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
