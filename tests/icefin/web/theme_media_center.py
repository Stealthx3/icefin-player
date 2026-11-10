#!/usr/bin/env python3
"""theme_media_center.py — the bundled Media Center theme in the running app (PLAN 8.6, first version). Lab guests only.

  - bundled and usable; the start strip replaces the home route with one row per library (+ Continue, + More);
  - remote navigation: down moves between categories and keeps the focused one on its line, right moves along a row,
    Enter opens the item's details page (jellyfin-web's own, themed by tokens);
  - "Classic home" (?icefin=stock) shows the stock home with plugin sections;
  - other routes are jellyfin-web's, styled by the theme's tokens;
  - UI sounds play; the ribbons stop under the low-motion cap;
  - three-way plugin check for the home route is replaced by the Classic home path (documented in docs/themes).
Screenshots of the start strip and a details page go to --out.
Usage: python3 theme_media_center.py --app ~/build/src/icefin-player --server jf12 --out ~/r86/jf12
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
    ap.add_argument("--port", type=int, default=9247)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-mc-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_media_center: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        listed = {t["id"]: t for t in js("new Promise(r => window.api.theme.themes(r))")}
        check("Media Center bundled and usable", listed.get("media-center", {}).get("ok") is True and listed["media-center"]["source"] == "bundled")
        # Media Center declares a backdrop: the page reloads once over it (8.4)
        page.switch_theme_reloading("media-center", "!!document.querySelector('#icefin-theme-root')")
        page.wait_for("+(document.querySelector('#icefin-theme-root[data-mc-ready]') || {dataset: {}}).dataset.mcReady > 0 || +((document.querySelector('#icefin-theme-root') || {}).getAttribute && document.querySelector('#icefin-theme-root').getAttribute('data-mc-ready')) > 0", timeout=30)
        cats = js("JSON.stringify([...document.querySelectorAll('.mc-cat-title')].map(e => e.textContent))")
        check("start strip: one row per library, plus More", json.loads(cats)[-1] == "More" and len(json.loads(cats)) >= 3, cats)
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); return f ? (f.closest('.mc-cat').querySelector('.mc-cat-title').textContent + '/' + (f.textContent || '')) : ''; })()")
        time.sleep(1.2)
        shot("start.png")
        # Go down to the first row with at least two tiles, then check right, down, up.
        for _ in range(4):
            n = js("document.querySelector('#icefin-theme-root .icefin-focused').closest('.mc-row').querySelectorAll('.mc-tile').length")
            if n >= 2:
                break
            act("down")
        first = foc()
        act("right")
        time.sleep(0.4)
        along = foc()
        check("right moves along the row", along.split('/')[0] == first.split('/')[0] and along != first, f"{first} -> {along}")
        last = js("(() => { const cats = [...document.querySelectorAll('.mc-cat')]; return cats.indexOf(document.querySelector('#icefin-theme-root .icefin-focused').closest('.mc-cat')) === cats.length - 1; })()")
        away, back = ("up", "down") if last else ("down", "up")
        act(away)
        time.sleep(0.5)
        second = foc()
        check(f"{away} moves to the neighbouring category", first.split('/')[0] != second.split('/')[0], f"{along} -> {second}")
        check("the focused category is marked current", js("document.querySelector('.mc-cat.current .mc-cat-title').textContent") == second.split('/')[0])
        act(back)
        time.sleep(0.4)
        check(f"{back} returns to the column the row remembered", foc() == along, foc())
        snd = js("new Promise(r => window.api.theme.soundState(r))")
        check("UI sounds play", snd.get("played", 0) >= 2, json.dumps(snd))
        for _ in range(6):
            act("up")  # back to the first row: a media tile
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        check("Enter opens the details page (stock, themed by tokens)", js("window.icefinTheme.active().route") is None
              and js("document.documentElement.classList.contains('icefin-themed')") is True)
        shot("details.png")
        js("location.hash = '#/home?icefin=stock'; true")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)
        js("location.hash = '#/home'; true")
        page.wait_for("+(document.querySelector('#icefin-theme-root').getAttribute('data-mc-ready')) > 0", timeout=20)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        check("ribbons stop under the low-motion cap", js("getComputedStyle(document.querySelector('.mc-ribbon')).animationName") == "none")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
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
    print("theme_media_center:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
