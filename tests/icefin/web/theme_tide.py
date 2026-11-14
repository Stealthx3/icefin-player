#!/usr/bin/env python3
"""theme_tide.py — the Tide benchmark theme in the running app (PLAN 9.17; target the PS3 XMB). Lab guests only.

  - Tide is a built-in theme, offered in Client Settings → Theme;
  - home: a row of category icons (Settings, each library, Search) crossing a column of items at a fixed point;
    left/right change category with the focused icon staying at that point; up/down move through the column with the
    focused item staying just under the row; Enter opens the item; Back returns to the top of the column;
  - the background: a gradient whose colours follow the month (palettes m1-m12) dimmed by the time of day, and an
    animated wave that stops under the low-motion cap;
  - turning the theme off restores the stock UI and drops the palette.
The native shader backdrop (8.4) is not part of this run.
Layout positions and motion timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_tide.py --app ~/build/src/icefin-player --server jf12 --out ~/r917/jf12
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
    ap.add_argument("--port", type=int, default=9257)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-tide-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_tide: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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

        td = themes().get("tide", {})
        check("Tide offered as a built-in theme, usable", td.get("ok") is True and td.get("source") == "bundled", json.dumps(td)[:160])
        # Tide declares a backdrop: the page reloads once over it (8.4)
        page.switch_theme_reloading("tide", "!!document.querySelector('#icefin-theme-root[data-td-ready]') && !!document.querySelector('.td-e.focused')")
        time.sleep(1)
        R = "document.querySelector('#icefin-theme-root')"
        cat = lambda: js(f"{R}.dataset.tdCat")
        idx = lambda: int(js(f"{R}.dataset.tdIndex"))
        cats = json.loads(js("JSON.stringify([...document.querySelectorAll('.td-cat-label')].map(e => e.textContent))"))
        check("categories: Settings, the libraries, Search; opens on the first library", cats[0] == "Settings" and cats[-1] == "Search" and len(cats) >= 3 and cat() == cats[1], f"{cats} at {cat()}")
        pos = lambda: json.loads(js("JSON.stringify((() => { const c = document.querySelector('.td-cat.current').getBoundingClientRect(), f = document.querySelector('.td-e.focused .td-e-thumb').getBoundingClientRect(); return {cx: (c.left + c.width / 2) / innerWidth, cy: (c.top + c.height / 2) / innerHeight, fy: f.top / innerHeight, fx: f.left / innerWidth}; })())"))
        time.sleep(0.5)
        p0 = pos()
        check("the focused category sits at the fixed point, the focused item just under it", abs(p0["cx"] - 561 / 1920) < 0.02 and 0.2 < p0["cy"] < 0.35 and p0["cy"] < p0["fy"] < p0["cy"] + 0.2, json.dumps(p0))
        shot("home.png")
        n = int(js(f"{R}.dataset.tdCount"))
        if n >= 2:
            act("down")
            time.sleep(0.5)
            p1 = pos()
            check("down moves through the column; the focused item stays at the point", idx() == 1 and abs(p1["fy"] - p0["fy"]) < 0.01
                  and js("document.querySelectorAll('.td-e.above').length") == 1, f"{idx()} {json.dumps(p1)}")
            act("back")
            time.sleep(0.6)
            check("Back on the home asks to close (9.48), Cancel focused", js("!!document.querySelector('.td-panel') && /Cancel/.test((document.querySelector('#icefin-theme-overlay .icefin-focused') || {}).textContent || '')") is True)
            act("back")
            time.sleep(0.5)
        act("right")
        time.sleep(0.5)
        p2 = pos()
        check("right changes category; the new icon takes the fixed point", cat() == cats[2] and abs(p2["cx"] - 561 / 1920) < 0.02, f"{cat()} {json.dumps(p2)}")
        act("left"); act("left")
        time.sleep(0.4)
        check("left reaches Settings", cat() == "Settings", cat())
        act("left")
        check("the row stops at its first category", cat() == "Settings", cat())
        for _ in range(len(cats)):
            act("right")
        check("the row stops at its last category", cat() == "Search", cat())
        # palettes
        bgv = lambda v: js(f"getComputedStyle(document.documentElement).getPropertyValue('{v}').trim()")
        js("window.icefinTheme.ui.timePalette.at('2026-12-10T13:00:00'); true")
        time.sleep(9)
        dec = (bgv("--icefin-color-waveTop"), bgv("--icefin-color-shade"))
        js("window.icefinTheme.ui.motion.cap('low'); window.icefinTheme.ui.timePalette.at('2026-07-10T22:00:00'); true")
        time.sleep(0.3)
        jul = (bgv("--icefin-color-waveTop"), bgv("--icefin-color-shade"))
        check("the gradient follows the month and the time of day dims it", dec == ("#c0392b", "rgba(0, 0, 0, 0)") and jul == ("#2fa3a0", "rgba(0, 0, 0, 0.5)")
              and js("document.documentElement.dataset.icefinPalette") == "m7+night", f"dec={dec} jul={jul}")
        shot("night.png")
        # The wave is the native backdrop when the engine has it (8.4: its time stands still under low motion), else the
        # web canvas (its frame counter stands still).
        native = js("document.documentElement.hasAttribute('data-icefin-backdrop')") is True
        frame = (lambda: (js("new Promise(r => window.api.theme.backdropStats(r))") or {}).get("time")) if native else (lambda: js("document.querySelector('.td-wave').dataset.tdFrame"))
        wait = 2.5 if native else 1  # backdrop stats come every two seconds
        time.sleep(wait)
        f0 = frame()
        time.sleep(wait)
        check(f"the wave stops under the low-motion cap ({'native backdrop' if native else 'canvas'})", frame() == f0, f"{f0}")
        js("window.icefinTheme.ui.motion.cap('normal'); true")
        time.sleep(wait)
        f1 = frame()
        time.sleep(wait)
        check("the wave moves again when the cap lifts", frame() != f1, f"{f1}")
        js("window.icefinTheme.ui.timePalette.at(null); true")
        for _ in range(len(cats)):
            act("left")
        for _ in range(cats.index("Movies") if "Movies" in cats else 1):
            act("right")
        # into All movies (a folder opens as a column, 9.48), then the first film
        for _ in range(8):
            if js("(document.querySelector('.td-e.focused .td-e-name') || {}).textContent === 'All movies'"):
                act("enter")
                page.wait_for(f"!{R}.hasAttribute('data-td-loading') && !!document.querySelector('.td-e.focused .td-e-thumb')", timeout=20)
                time.sleep(0.6)
                break
            act("down")
            time.sleep(0.3)
        if int(js(f"{R}.dataset.tdCount")) >= 1 and js("!!document.querySelector('.td-e.focused .td-e-thumb')"):
            act("enter")
            page.wait_for("location.hash.startsWith('#/details')", timeout=15)
            time.sleep(2)
            page.wait_for("!!(document.querySelector('#icefin-theme-root') || {getAttribute: () => null}).getAttribute('data-icefin-details-ready')", timeout=20)
            check("Enter opens Tide's own details screen (9.18, 9.48)", js("window.icefinTheme.active().route") == "#/details"
                  and js("document.querySelector('#icefin-theme-root').dataset.tdScreen") == "details")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(1.5)
        check("turning the theme off restores the stock UI, palette dropped", js("new Promise(r => window.api.theme.activeTheme(r))") == "" and js("document.documentElement.hasAttribute('data-icefin-theme')") is False
              and js("document.documentElement.style.getPropertyValue('--icefin-color-waveTop')") == "" and js("document.documentElement.hasAttribute('data-icefin-palette')") is False)
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
    print("theme_tide:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
