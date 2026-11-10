#!/usr/bin/env python3
"""theme_capabilities.py — the generic engine capabilities in the running app (PLAN 9.2, 9.3). Lab guests only.

Drives the lab-capabilities fixture through window.icefinTheme.handleAction (the entry the inputPlugin.js hook feeds):
  - chrome: top bar and side rail around the home screen, reachable by arrows;
  - paged grid: 30 items in 4x3 pages, right at the page edge turns the page, indicators follow;
  - 3D carousel: the focused item is in front (largest z-index), neighbours recede;
  - pivot headers: right at a section's edge slides to the next section, headers move with it;
  - global overlay: icefin_overlay opens it over a themed screen and over a stock jellyfin-web page, it is modal,
    Back closes it;
  - live tile: cycles, and freezes under the low-motion cap;
  - low-motion cap: <html data-icefin-motion="low">, durations capped;
  - pointer-first: hover moves focus;
  - muted preview: the page's own <video>, muted, playing a server transcode of a lab item;
  - expanding side rail (9.11): collapsed to its narrow width, expanded while focus is inside, the content column never moves;
  - focus parallax (9.11): the focused card lifts, an arrow press tilts it, pointer motion moves tilt and highlight,
    flat under low motion;
  - translucent materials (9.11): backdrop blur from material.* tokens, opaque fallback (forced, and by the frame-rate
    watch when frames are slow);
  - in-row card expansion (9.11): after the dwell a panel grows over the neighbours with a muted trailer, the row's
    cards don't move, and moving focus collapses it.
Usage: python3 theme_capabilities.py --app ~/build/src/icefin-player --server jf12
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9245)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    item = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]["Id"]
    os.environ["ICEFIN_THEME_PATH"] = THEMES
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-caps-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_capabilities: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("document.getElementById('address') !== null", timeout=60)
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
        foc = lambda: js("(document.querySelector('#icefin-theme-root .icefin-focused') || {}).textContent || ''")
        js(f"window.labPreviewItem = {json.dumps(item)}; new Promise(r => window.api.theme.setActiveTheme('lab-capabilities', '', r))")
        page.wait_for("window.icefinTheme.active() && window.icefinTheme.active().route === '#/home' && !!window.labGrid", timeout=20)

        # chrome + paged grid
        check("chrome: top bar and side rail mounted", js("!!document.querySelector('.icefin-topbar #lab-top') && !!document.querySelector('.icefin-siderail .lab-cell')"))
        check("paged grid: 3 pages, first cell focused", js("window.labGrid.pages()") == 3 and foc() == "g1", foc())
        trail = []
        for _ in range(3):
            trail.append(f"{act('right')}:{foc()}")
        check("arrows move within the page", foc() == "g4", " ".join(trail))
        act("right")
        check("right at the page edge turns the page", js("window.labGrid.page()") == 1 and foc() == "g13", f"page={js('window.labGrid.page()')} focused={foc()}")
        check("page indicators follow", js("document.querySelector('.icefin-page-indicators').dataset.page") == "2/3")
        act("left")
        check("left at the page edge turns back", js("window.labGrid.page()") == 0 and foc() == "g4", f"page={js('window.labGrid.page()')} focused={foc()}")
        # expanding side rail (9.11): g1 is at the left edge of page 1, so left goes to the rail
        js("window.labGrid.go(0); true")
        content_x = js("document.querySelector('#icefin-theme-root .icefin-content').getBoundingClientRect().left")
        check("rail: collapsed while focus is elsewhere", js("document.querySelector('.icefin-siderail').dataset.icefinRail") == "collapsed"
              and js("document.querySelector('.icefin-siderail').style.width") == "4em")
        act("left")
        time.sleep(0.4)
        check("rail: expands when it takes focus", foc().startswith("rail-movies") and js("document.querySelector('.icefin-siderail').dataset.icefinRail") == "expanded"
              and js("document.querySelector('.icefin-siderail').getBoundingClientRect().width") > js("document.querySelector('.icefin-content').getBoundingClientRect().left") - 1, foc())
        check("rail: the content column doesn't move", abs(js("document.querySelector('#icefin-theme-root .icefin-content').getBoundingClientRect().left") - content_x) < 0.5)
        act("right")
        time.sleep(0.4)
        check("rail: collapses when focus leaves", js("document.querySelector('.icefin-siderail').dataset.icefinRail") == "collapsed", foc())
        act("up")
        check("chrome reachable by arrows (top bar)", foc() == "top-home", foc())

        # global overlay over a themed screen
        act("icefin_overlay")
        check("overlay opens over a themed screen", js("!!document.getElementById('icefin-theme-overlay')"))
        before = foc()
        act("down"); act("enter")
        check("overlay is modal (arrows and select stay inside)", js("JSON.stringify(window.labOverlayClicks || [])") in ('["guide-b"]', '["guide-a"]') and foc() == before,
              js("JSON.stringify(window.labOverlayClicks || [])"))
        act("back")
        check("Back closes the overlay", js("!document.getElementById('icefin-theme-overlay')"))

        # 3D carousel
        js("location.hash = '#/movies'; true")
        page.wait_for("window.icefinTheme.active().route === '#/movies' && !!window.labCarousel", timeout=15)
        act("right"); act("right")
        time.sleep(0.6)
        front = js("[...document.querySelectorAll('.icefin-carousel3d .lab-cell')].sort((a, b) => b.style.zIndex - a.style.zIndex)[0].textContent")
        check("carousel: the focused item is in front", js("window.labCarousel.index()") == 2 and front == "c3" and foc() == "c3", f"front={front} focused={foc()}")
        check("carousel: neighbours recede in depth", "translateZ(-220px)" in js("document.querySelectorAll('.icefin-carousel3d .lab-cell')[1].style.transform"))

        # pivot
        js("location.hash = '#/tv'; true")
        page.wait_for("window.icefinTheme.active().route === '#/tv' && !!window.labPivot", timeout=15)
        act("right")
        check("pivot: arrows move inside the section", foc() == "one-2", foc())
        act("right")
        time.sleep(0.4)
        check("pivot: right at the edge slides to the next section", js("window.labPivot.index()") == 1 and foc() == "two-1", foc())
        check("pivot: headers move with the content", js("document.querySelector('.icefin-pivot-headers').style.transform") != "translateX(0px)")

        # overlay over a stock page
        js("location.hash = '#/mypreferencesmenu'; true")
        time.sleep(3)
        act("icefin_overlay")
        check("overlay opens over a stock jellyfin-web page", js("!!document.getElementById('icefin-theme-overlay')") and js("window.icefinTheme.active().route") is None)
        act("back")

        # live tile + low motion + preview
        js("location.hash = '#/music'; true")
        page.wait_for("window.icefinTheme.active().route === '#/music' && !!window.labLive", timeout=15)
        a0 = js("document.querySelector('.lab-live').dataset.liveIndex")
        time.sleep(1.0)
        a1 = js("document.querySelector('.lab-live').dataset.liveIndex")
        check("live tile cycles", a0 != a1, f"{a0} -> {a1}")
        js("window.icefinTheme.ui.motion.cap('low'); true")
        check("low-motion cap marks the page and caps durations",
              js("document.documentElement.getAttribute('data-icefin-motion')") == "low" and js("window.icefinTheme.ui.motion.duration(400)") == 80)
        b0 = js("document.querySelector('.lab-live').dataset.liveIndex")
        time.sleep(1.0)
        check("live tile frozen under low motion", js("document.querySelector('.lab-live').dataset.liveIndex") == b0)
        page.wait_for("!!document.querySelector('video.icefin-preview')", timeout=10)
        js("window.icefinTheme.ui.motion.cap('normal'); window.labPreview.video.play().catch(() => {}); true")
        try:
            page.wait_for("document.querySelector('video.icefin-preview').currentTime > 0.3", timeout=25)
            playing = True
        except Exception:  # noqa: BLE001
            playing = False
        check("muted preview: the page's own video, muted", js("(() => { const v = document.querySelector('video.icefin-preview'); return v.muted && v.tagName === 'VIDEO'; })()"))
        check("muted preview plays a server transcode", playing, js("JSON.stringify({t: document.querySelector('video.icefin-preview').currentTime, e: (document.querySelector('video.icefin-preview').error || {}).message || ''})"))

        # 9.11: parallax, materials, card expansion
        js("window.labMaterialForce = 'translucent'; location.hash = '#/search'; true")
        page.wait_for("window.icefinTheme.active().route === '#/search' && !!window.labExpand", timeout=15)
        tile = lambda i: f"document.querySelectorAll('.lab-row .lab-cell')[{i}]"
        js(f"window.icefinTheme._engine.focus({tile(0)}); true")
        time.sleep(0.4)
        check("parallax: the focused card lifts and carries a highlight", js(f"{tile(0)}.classList.contains('icefin-lifted') && !!{tile(0)}.querySelector('.icefin-glare')"))
        check("parallax: the lift is a transform", "scale" in js(f"getComputedStyle({tile(0)}).transform") or js(f"getComputedStyle({tile(0)}).transform") != "none",
              js(f"getComputedStyle({tile(0)}).transform"))
        lefts = js("JSON.stringify([...document.querySelectorAll('.lab-row .lab-cell')].map(c => c.offsetLeft))")
        js(f"window.icefinTheme._engine.focus({tile(5)}); true")
        time.sleep(0.4)
        tilt = js(f"window.icefinTheme.handleAction('right'); {tile(5)}.style.getPropertyValue('--icefin-tilt-x')")
        check("parallax: an arrow press at the row's end tilts the card toward it", foc() == "r6" and tilt == "8.00deg", f"focused={foc()} tilt-x={tilt}")
        time.sleep(0.5)
        check("parallax: then it settles flat", js(f"{tile(5)}.style.getPropertyValue('--icefin-tilt-x')") == "0.00deg", js(f"{tile(5)}.style.getPropertyValue('--icefin-tilt-x')"))
        js(f"window.icefinTheme._engine.focus({tile(0)}); true")
        act("right")
        check("parallax: focus moves on with the arrows", foc() == "r2", foc())
        time.sleep(0.5)
        r = json.loads(js(f"JSON.stringify((() => {{ const c = {tile(1)}.getBoundingClientRect(); return [c.left + c.width * 0.9, c.top + c.height * 0.2]; }})())"))
        page.send("Input.dispatchMouseEvent", type="mouseMoved", x=r[0], y=r[1])
        time.sleep(0.3)
        tx = js(f"parseFloat({tile(1)}.style.getPropertyValue('--icefin-tilt-x'))")
        gx = js(f"parseFloat({tile(1)}.style.getPropertyValue('--icefin-glare-x'))")
        check("parallax: pointer motion tilts the card and moves the highlight", tx > 3 and gx > 70, f"tilt-x={tx} glare-x={gx}")
        # card expansion: dwell 300 ms
        time.sleep(0.6)
        check("card expansion: a panel grows from the focused card", js("(document.querySelector('.icefin-card-expanded') || {}).textContent || ''").startswith("expanded-r2"))
        pr = json.loads(js("JSON.stringify((() => { const p = document.querySelector('.icefin-card-expanded').getBoundingClientRect(); return [p.width, p.height]; })())"))
        cr = json.loads(js(f"JSON.stringify((() => {{ const c = {tile(1)}.getBoundingClientRect(); return [c.width, c.height]; }})())"))
        check("card expansion: larger than the card, over its neighbours", pr[0] > cr[0] * 1.3 and pr[1] > cr[1] * 1.3, f"panel={pr} card={cr}")
        check("card expansion: the row doesn't reflow", js("JSON.stringify([...document.querySelectorAll('.lab-row .lab-cell')].map(c => c.offsetLeft))") == lefts)
        try:
            page.wait_for("!!document.querySelector('.icefin-card-expanded video.icefin-preview') && document.querySelector('.icefin-card-expanded video.icefin-preview').muted", timeout=5)
            trailer = True
        except Exception:  # noqa: BLE001
            trailer = False
        check("card expansion: a muted trailer in the panel", trailer)
        act("right")
        check("card expansion: moving focus collapses it", js("!document.querySelector('.icefin-card-expanded')") and foc() == "r3")
        # materials
        check("material: blurred translucent panel from tokens", "blur(18px)" in js("getComputedStyle(window.labMaterial).backdropFilter"),
              js("getComputedStyle(window.labMaterial).backdropFilter"))
        js("window.icefinTheme.ui.material.force('opaque'); true")
        check("material: opaque fallback uses material.panel.opaque", js("getComputedStyle(window.labMaterial).backdropFilter") == "none"
              and js("getComputedStyle(window.labMaterial).backgroundColor") == "rgb(36, 18, 74)", js("getComputedStyle(window.labMaterial).backgroundColor"))
        # frame-rate watch: block the main thread so frames fall under 50 fps; the watch switches to opaque on its own
        js("window.icefinTheme.ui.material.force('auto'); window.labJank = setInterval(() => { const t = performance.now(); while (performance.now() - t < 40) {} }, 0); true")
        try:
            page.wait_for("window.icefinTheme.ui.material.mode() === 'opaque'", timeout=8)
            jank = True
        except Exception:  # noqa: BLE001
            jank = False
        js("clearInterval(window.labJank); true")
        check("material: slow frames switch to opaque by themselves", jank, f"fps={js('document.documentElement.dataset.icefinMaterialFps')}")
        # parallax frozen under low motion
        js("window.icefinTheme.ui.motion.cap('low'); true")
        act("left")
        time.sleep(0.3)
        check("parallax: flat under low motion", js(f"{tile(1)}.style.getPropertyValue('--icefin-tilt-x')") in ("0deg", ""), js(f"{tile(1)}.style.getPropertyValue('--icefin-tilt-x')"))
        js("window.icefinTheme.ui.motion.cap('normal'); true")

        # pointer-first
        js("location.hash = '#/home'; true")
        page.wait_for("window.icefinTheme.active().route === '#/home' && !!document.querySelector('.icefin-grid-page')", timeout=15)
        js("window.icefinTheme.ui.pointerFirst(true); true")
        r = js("JSON.stringify((() => { const c = document.querySelectorAll('.icefin-grid-page .lab-cell')[5].getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2]; })())")
        x, y = json.loads(r)
        page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
        time.sleep(0.4)
        check("pointer-first: hover moves focus", foc() == "g6", f"{foc()} (element at point: {js(f'(document.elementFromPoint({x}, {y}) || {{}}).className')})")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(1)
        check("theme off: capabilities reset", js("document.documentElement.hasAttribute('data-icefin-pointer')") is False)
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
    print("theme_capabilities:", "OK" if not fails else f"FAILED {fails}", "- log:", log.name)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
