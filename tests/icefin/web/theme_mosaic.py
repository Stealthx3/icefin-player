#!/usr/bin/env python3
"""theme_mosaic.py — the Mosaic benchmark theme in the running app (PLAN 9.9; target Xbox 360 Metro). Lab guests only.

  - Mosaic is in the opt-in benchmark pack: offered only with Client Settings → Benchmark Themes on;
  - pivot headers across the top (home, each library, settings), large and lowercase, the active one at the left;
  - each section a grid of flat tiles in three sizes (large 2×2, wide 2×1, small 1×1) flowing in columns;
  - live tiles cycle their content and freeze under low motion;
  - five-way: arrows move between mixed-size tiles; right past a section's last column moves to the next section and
    its header slides to the left; Back on another section returns to home;
  - Enter on a tile opens its page, styled by Mosaic's tokens.
Layout positions and timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_mosaic.py --app ~/build/src/icefin-player --server jf12 --out ~/r99/jf12
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9252)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-pivot-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_mosaic: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shot(name):
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

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
        themes = lambda: {t["id"]: t for t in js("new Promise(r => window.api.theme.themes(r))")}
        setv = lambda key, val: js("new Promise(r => window.api.settings.setValue('theme', %s, %s, () => r(true)))" % (json.dumps(key), json.dumps(val)))
        root = lambda name: js(f"document.getElementById('icefin-theme-root').getAttribute({json.dumps(name)})")
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f || !f.mosaicTile) return ''; "
                         "return f.mosaicTile.size + '/' + f.mosaicTile.label; })()")

        check("benchmark pack off by default", "mosaic" not in themes())
        setv("benchPack", True)
        time.sleep(1)
        p = themes().get("mosaic", {})
        check("Benchmark Themes on: Mosaic offered, bundled, usable", p.get("ok") is True and p.get("source") == "bundled", json.dumps(p)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('mosaic', '', r))")
        page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root[data-pv]'); return !!r && +r.getAttribute('data-pv-ready') > 0; })()", timeout=40)
        time.sleep(1.5)
        heads = json.loads(js("JSON.stringify([...document.querySelectorAll('.icefin-pivot-header')].map(e => e.textContent))"))
        check("pivot headers: home, the libraries, settings", heads[0] == "home" and heads[-1] == "settings" and all(h == h.lower() for h in heads), json.dumps(heads))
        hsize = js("parseFloat(getComputedStyle(document.querySelector('.icefin-pivot-header.active')).fontSize) / innerHeight")
        check("headers are large type (typography-led)", hsize >= 0.06, f"{hsize:.3f} of the height")
        sizes = json.loads(js("JSON.stringify([...document.querySelectorAll('.pv-tile')].map(t => t.mosaicTile.size))"))
        check("home is a grid of mixed sizes: large, wide and small", {"large", "wide", "small"} <= set(sizes), json.dumps(sizes))
        geo = json.loads(js("JSON.stringify((() => { const r = s => document.querySelector('.pv-' + s).getBoundingClientRect(); "
                            "const L = r('large'), W = r('wide'), Sm = r('small'); return {lw: L.width / Sm.width, lh: L.height / Sm.height, ww: W.width / Sm.width, wh: W.height / Sm.height}; })())"))
        check("tile proportions: large 2x2, wide 2x1 of a small tile", 1.9 < geo["lw"] < 2.3 and 1.9 < geo["lh"] < 2.3 and 1.9 < geo["ww"] < 2.3 and 0.9 < geo["wh"] < 1.1, json.dumps(geo))
        check("focus starts on the first tile", foc() == "large/continue", foc())
        time.sleep(5)
        live = js("[...document.querySelectorAll('.pv-live .icefin-live-tile')].map(e => e.getAttribute('data-live-index')).join(',')")
        check("live tiles are up", js("document.querySelectorAll('.pv-live .icefin-live-tile').length") >= 3, live)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        idx = "[...document.querySelectorAll('.pv-live .icefin-live-tile')].map(e => e.getAttribute('data-live-index')).join(',')"
        frozen0 = js(idx)
        time.sleep(5.5)
        check("live tiles freeze under low motion", js(idx) == frozen0, f"{frozen0} -> {js(idx)}")
        js("window.icefinTheme.ui.motion.cap('normal'); true")
        shot("home.png")

        # Known sections so the navigation checks don't depend on the server's content.
        js("document.getElementById('icefin-theme-root').mosaicBuild([0, 1, 2].map(s => ({title: 'sec' + s, tiles: ["
           "{size: 'large', label: 'L' + s, go: () => { location.hash = '#/search'; }}, {size: 'small', label: 'a' + s, go: () => {}}, "
           "{size: 'small', label: 'b' + s, go: () => {}}, {size: 'wide', label: 'W' + s, go: () => {}}]}))); true")
        time.sleep(0.6)
        check("a known section shows", root("data-pv-section") == "sec0" and foc() == "large/L0", foc())
        act("right")
        check("right from the large tile reaches the next column", foc() in ("small/a0", "small/b0", "wide/W0"), foc())
        before = js("document.querySelector('.icefin-pivot-headers').style.transform")
        for _ in range(4):
            act("right")
            if root("data-pv-section") != "sec0":
                break
        time.sleep(0.5)
        check("right past the last column moves to the next section", root("data-pv-section") == "sec1" and foc().endswith("1"), f"{root('data-pv-section')} {foc()}")
        check("the headers slide with it", js("document.querySelector('.icefin-pivot-headers').style.transform") != before
              and js("document.querySelector('.icefin-pivot-header.active').textContent") == "sec1")
        shot("section.png")
        act("back")
        check("Back on another section returns to home", root("data-pv-section") == "sec0", str(root("data-pv-section")))
        act("enter")
        page.wait_for("location.hash.startsWith('#/search')", timeout=10)
        time.sleep(2)
        check("Enter on a tile opens its page, styled by Mosaic's tokens", js("window.icefinTheme.active().route") is None
              and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-accent').trim().toLowerCase()") == "#2f8f1f")

        setv("benchPack", False)
        time.sleep(1.5)
        check("pack turned off while active: engine off, Mosaic gone", js("new Promise(r => window.api.theme.activeTheme(r))") == "" and "mosaic" not in themes())
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
    print("theme_mosaic:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
