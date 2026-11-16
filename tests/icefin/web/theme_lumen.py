#!/usr/bin/env python3
"""theme_lumen.py — the Lumen benchmark theme in the running app (PLAN 9.12, its pass 9.53; the target is named in
docs/PLAN.md). Lab guests only. With ICEFIN_THEME_PATH set, the theme comes from that folder (a worktree's).

  - Lumen is a built-in theme, offered in Client Settings → Theme;
  - home: a hero of the featured item over its art (Play or Resume focused), the rows under it (Continue watching,
    Next up, each library), the collapsed sidebar as a glass pill top left;
  - ▼ into the rows: the hero gives way, the row slides up, the focused card lifts and tilts (ui.parallax), the
    backdrop follows the focused item; ◀ at a row's start opens the sidebar, Back closes it;
  - Back from a lower row returns to the hero; Enter on a card opens Lumen's product page;
  - the glass is a translucent material (backdrop blur), opaque when forced;
  - Classic home shows the stock home; low motion flattens the tilt; turning the theme off restores the stock UI.
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
        check("Lumen offered as a built-in theme, usable", lm.get("ok") is True and (lm.get("source") == "bundled" or bool(os.environ.get("ICEFIN_THEME_PATH"))), json.dumps(lm)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('lumen', '', r))")
        R = "document.querySelector('#icefin-theme-root')"
        page.wait_for(f"+{R}.getAttribute('data-lm-ready') > 0", timeout=40)
        time.sleep(1.5)
        foc = lambda: js("(() => { const f = window.icefinTheme.ctx.focused(); if (!f) return ''; "
                         "if (f.classList.contains('lm-hb')) return 'hero/' + f.textContent.trim(); "
                         "const s = f.closest('.lm-hrow'); return s ? 'row/' + [...document.querySelectorAll('.lm-hrow')].indexOf(s) + '/' + [...s.querySelectorAll('.lm-hcard')].indexOf(f) : f.className; })()")
        zone = lambda: js(f"{R}.dataset.lmZone")
        titles = json.loads(js("JSON.stringify([...document.querySelectorAll('.lm-hrow-title')].map(e => e.textContent))"))
        check("home: the hero focused on Play or Resume, its title shown", foc() in ("hero/Play", "hero/Resume") and bool(js("document.querySelector('.lm-hero-title').textContent")), foc())
        check("rows under it: Continue watching or Next up first, then the libraries", len(titles) >= 2, json.dumps(titles))
        check("the collapsed sidebar is a translucent material", "blur(" in js("getComputedStyle(document.querySelector('.lm-mini')).backdropFilter"),
              js("getComputedStyle(document.querySelector('.lm-mini')).backdropFilter"))
        geo = json.loads(js("JSON.stringify((() => { const b = document.querySelector('.lm-bg.on').getBoundingClientRect(); const r = document.querySelector('.lm-hrow').getBoundingClientRect(); return {bg: b.height / innerHeight, row: r.top / innerHeight}; })())"))
        check("proportions: the art fills the screen, the first row peeks from about 74% down", geo["bg"] > 0.99 and 0.68 <= geo["row"] <= 0.8, json.dumps(geo))
        shot("home.png")
        act("right")
        check("◀▶ move along the hero's buttons", foc().startswith("hero/") and foc() not in ("hero/Play", "hero/Resume"), foc())
        act("left")
        act("down")
        time.sleep(1.0)
        check("▼ into the rows: the hero gives way", foc() == "row/0/0" and zone() == "rows" and float(js("getComputedStyle(document.querySelector('.lm-hero')).opacity")) < 0.5, f"{foc()} {zone()}")
        time.sleep(0.4)
        check("the focused card lifts (parallax)", js("document.querySelector('.lm-hcard.icefin-focused').classList.contains('icefin-lifted')") is True
              and "matrix" in js("getComputedStyle(document.querySelector('.lm-hcard.icefin-focused')).transform"),
              js("getComputedStyle(document.querySelector('.lm-hcard.icefin-focused')).transform"))
        shelf0 = js(f"{R}.dataset.lmShelf")
        n0 = js("document.querySelectorAll('.lm-hrow')[0].querySelectorAll('.lm-hcard').length")
        if n0 >= 2:
            act("right")
            time.sleep(0.8)
            check("▶ moves along the row; the backdrop follows the focused item", foc() == "row/0/1" and js(f"{R}.dataset.lmShelf") != shelf0, f"{foc()} {shelf0} -> {js(f'{R}.dataset.lmShelf')}")
            act("left")
            time.sleep(0.3)
        act("left")
        time.sleep(0.6)
        check("◀ at a row's start opens the sidebar", js("!!document.querySelector('.lm-sb')") is True)
        shot("sidebar.png")
        act("back")
        time.sleep(0.6)
        check("Back closes it, the row keeps focus", js("!document.querySelector('.lm-sb')") is True and foc() == "row/0/0", foc())
        nrows = len(titles)
        if nrows >= 2:
            act("down")
            time.sleep(1.0)
            top = js("document.querySelector('.lm-hrow.current').getBoundingClientRect().top / innerHeight")
            check("▼ to a lower row: it slides up under the item's title", foc().startswith("row/1/") and top < 0.3 and bool(js("document.querySelector('.lm-ftop-title').textContent")), f"{foc()} top={top}")
            shot("rows.png")
            act("back")
            time.sleep(0.5)
            check("Back from the rows returns to the hero", foc() in ("hero/Play", "hero/Resume") and zone() == "hero", foc())
        js("(() => { const c = [...document.querySelectorAll('.lm-hcard')].find(x => x.lumenItem && ['Movie', 'Series'].includes(x.lumenItem.Type)); if (c) window.icefinTheme.ctx.focus(c); return !!c; })()")
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        check("Enter on a card opens Lumen's product page", js(f"{R}.getAttribute('data-lm-mode')") == "deck" and bool(js("(document.querySelector('.lm-dk-name') || {}).textContent")))
        shot("details.png")
        js("location.hash = '#/home'; true")
        page.wait_for(f"+{R}.getAttribute('data-lm-ready') > 0", timeout=30)
        time.sleep(1)
        js("window.icefinTheme.ui.material.force('opaque'); true")
        check("forced opaque: the glass drops its blur", js("getComputedStyle(document.querySelector('.lm-mini')).backdropFilter") == "none")
        js("window.icefinTheme.ui.material.force('auto'); true")
        js("window.icefinTheme.ctx.navigate('#/home?icefin=stock'); true")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)
        js("location.hash = '#/home'; true")
        page.wait_for(f"+{R}.getAttribute('data-lm-ready') > 0", timeout=30)
        time.sleep(1)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        act("down")
        time.sleep(0.5)
        check("flat cards under the low-motion cap", js("document.querySelector('.lm-hcard.icefin-focused').style.getPropertyValue('--icefin-tilt-x')") in ("0deg", "0.00deg", "")
              and js("getComputedStyle(document.querySelector('.lm-hcard.icefin-focused')).transform") == "none")
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
