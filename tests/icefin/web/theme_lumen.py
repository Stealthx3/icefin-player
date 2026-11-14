#!/usr/bin/env python3
"""theme_lumen.py — the Lumen benchmark theme in the running app (PLAN 9.12; target Apple TV home). Lab guests only.

  - Lumen is a built-in theme, offered in Client Settings → Theme;
  - home: a frosted tab bar (Home, each library, Search, Settings, Classic home) over a full-bleed top shelf, and rows
    of posters (Up Next as 16:9 thumbs, New in each library);
  - the tab bar hides once focus goes down to the rows and comes back when focus goes up to it;
  - the top shelf shows the focused item's art and text, and dims while a lower row has focus;
  - the focused poster lifts and tilts (ui.parallax); at a row's end an arrow only tilts it;
  - the tab bar is a translucent material (backdrop blur), opaque when forced;
  - Back from a row goes to the first row, then the tab bar; Enter opens its details (9.18: the themed screen, or jellyfin-web's page for a book; Lumen's tokens);
  - Classic home shows the stock home; turning the theme off restores the stock UI.
Layout positions and motion timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_lumen.py --app ~/build/src/icefin-player --server jf12 --out ~/r912/jf12
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
from details_check import DETAILS_OK  # noqa: E402


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
    cfgdir = tempfile.mkdtemp(prefix="icefin-lumen-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_lumen: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        check("Lumen offered as a built-in theme, usable", lm.get("ok") is True and lm.get("source") == "bundled", json.dumps(lm)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('lumen', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-lm-ready]')", timeout=40)
        time.sleep(1.5)
        R = "document.querySelector('#icefin-theme-root')"
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('lm-tab')) return 'tab/' + f.textContent; "
                         "const s = f.closest('.lm-row'); return 'row/' + [...document.querySelectorAll('.lm-row')].indexOf(s) + '/' + f.lumenIndex; })()")
        tabs = json.loads(js("JSON.stringify([...document.querySelectorAll('.lm-tab')].map(e => e.textContent))"))
        check("tab bar: Home, the libraries, Search, Settings, Classic home", tabs[0] == "Home" and tabs[-3:] == ["Search", "Settings", "Classic home"] and len(tabs) >= 5, json.dumps(tabs))
        check("focus starts on the Home tab, bar shown", foc() == "tab/Home" and js(f"{R}.dataset.lmTabs") == "shown", foc())
        nrows = js("document.querySelectorAll('.lm-row').length")
        titles = json.loads(js("JSON.stringify([...document.querySelectorAll('.lm-row-title')].map(e => e.textContent))"))
        check("rows: Up Next (if any) then New in each library", nrows >= 2 and all(t == "Up Next" or t.startswith("New in ") for t in titles), json.dumps(titles))
        check("tab bar is a translucent material", "blur(28px)" in js("getComputedStyle(document.querySelector('.lm-tabs')).backdropFilter"),
              js("getComputedStyle(document.querySelector('.lm-tabs')).backdropFilter"))
        shot("home.png")
        act("right")
        check("left/right move along the tab bar", foc() == f"tab/{tabs[1]}", foc())
        act("left")
        act("down")
        time.sleep(0.8)
        check("down enters the first row; the tab bar hides", foc() == "row/0/0" and js(f"{R}.dataset.lmTabs") == "hidden"
              and js("getComputedStyle(document.querySelector('.lm-tabs')).opacity") != "1", f"{foc()} tabs={js(f'{R}.dataset.lmTabs')}")
        geo = json.loads(js("JSON.stringify((() => { const r = document.querySelector('.lm-row').getBoundingClientRect(); const s = document.querySelector('.lm-shelf').getBoundingClientRect(); return {row: r.top / innerHeight, shelf: s.height / innerHeight}; })())"))
        check("proportions: the shelf fills the screen, the first row starts near 60% down", geo["shelf"] > 0.99 and 0.55 <= geo["row"] <= 0.68, json.dumps(geo))
        time.sleep(0.5)
        first = js("document.querySelectorAll('.lm-row')[0].querySelector('.lm-card').classList.contains('icefin-lifted')")
        check("the focused poster lifts (parallax)", first is True and "matrix3d" in js("getComputedStyle(document.querySelector('.lm-card.icefin-focused')).transform"),
              js("getComputedStyle(document.querySelector('.lm-card.icefin-focused')).transform"))
        shelf0 = js(f"{R}.dataset.lmShelf")
        n0 = js("document.querySelectorAll('.lm-row')[0].querySelectorAll('.lm-card').length")
        if n0 >= 2:
            act("right")
            time.sleep(0.6)
            check("right moves along the row; the shelf follows the focused item", foc() == "row/0/1" and js(f"{R}.dataset.lmShelf") != shelf0, f"{foc()} shelf {shelf0} -> {js(f'{R}.dataset.lmShelf')}")
            act("left")
        tilt = js("window.icefinTheme.handleAction('left'); document.querySelector('.lm-card.icefin-focused').style.getPropertyValue('--icefin-tilt-x')")
        check("left at the row's start only tilts the poster", foc() == "row/0/0" and tilt not in ("", "0.00deg"), f"{foc()} tilt={tilt}")
        if nrows >= 2:
            act("down")
            time.sleep(1.0)
            g = json.loads(js("JSON.stringify((() => { const s = document.querySelectorAll('.lm-row')[1].getBoundingClientRect(); return {top: s.top / innerHeight, zone: document.querySelector('#icefin-theme-root').dataset.lmZone, op: +getComputedStyle(document.querySelector('.lm-shelf')).opacity}; })())"))
            check("down to a lower row: it slides up, the shelf dims", foc().startswith("row/1/") and g["top"] < 0.3 and g["op"] < 0.6, json.dumps(g))
            shot("rows.png")
            act("back")
            check("Back from a lower row goes to the first row", foc() == "row/0/0", foc())
        act("back")
        time.sleep(0.5)
        check("Back from the first row returns to the tab bar, shown again", foc() == "tab/Home" and js(f"{R}.dataset.lmTabs") == "shown", foc())
        act("down")
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        check("Enter on a poster opens its details (themed screen or, for a book, the stock page), styled by Lumen's tokens",
              (det := js(DETAILS_OK))["ok"]
              and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-surface').trim().toLowerCase()") == "#1c1c20", json.dumps(det))
        shot("details.png")
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-lm-ready]')", timeout=30)
        time.sleep(1)
        js("window.icefinTheme.ui.material.force('opaque'); true")
        check("forced opaque: the bar drops its blur", js("getComputedStyle(document.querySelector('.lm-tabs')).backdropFilter") == "none")
        js("window.icefinTheme.ui.material.force('auto'); true")
        for _ in range(len(tabs)):
            act("right")
        check("the tab bar stops at its last entry", foc() == "tab/Classic home", foc())
        act("enter")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)
        js("location.hash = '#/home'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-lm-ready]')", timeout=30)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        act("down")
        time.sleep(0.5)
        check("flat posters under the low-motion cap", js("document.querySelector('.lm-card.icefin-focused').style.getPropertyValue('--icefin-tilt-x')") in ("0deg", ""))
        js("window.icefinTheme.ui.motion.cap('normal'); true")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(1.5)
        check("turning the theme off restores the stock UI", js("new Promise(r => window.api.theme.activeTheme(r))") == "" and js("document.documentElement.hasAttribute('data-icefin-theme')") is False)
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
    print("theme_lumen:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
