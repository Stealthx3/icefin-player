#!/usr/bin/env python3
"""theme_orbit.py — the Orbit benchmark theme in the running app (PLAN 9.8; target Xbox 360 NXE). Lab guests only.

  - Orbit is a built-in theme, offered in Client Settings → Theme;
  - a vertical stack of channels (spotlight, one per library, system), each a 3D carousel of large tiles: the focused
    tile in front, the others receding in depth and tilt;
  - five-way: left/right step through a channel's carousel and stop at its ends, up/down change channel with the
    focused channel on the centre line, and each channel keeps its tile; the backdrop moves a fraction (parallax);
  - the guide (long press on View, icefin_overlay) opens over the themed home and over a stock page, is modal, and
    Back closes it with focus returned;
  - Enter on a tile opens its page, styled by Orbit's tokens.
Layout positions and timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_orbit.py --app ~/build/src/icefin-player --server jf12 --out ~/r98/jf12
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
    ap.add_argument("--port", type=int, default=9251)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-orbit-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_orbit: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        foc = lambda: js("(() => { const f = document.querySelector('.icefin-focused'); if (!f) return ''; "
                         "if (f.classList.contains('ob-guide-item')) return 'guide/' + f.textContent; "
                         "const row = f.closest('.ob-channel'); if (!row) return 'other'; "
                         "return 'tile/' + row.getAttribute('data-ob-channel') + '/' + [...row.querySelectorAll('.ob-tile')].indexOf(f); })()")

        p = themes().get("orbit", {})
        check("Orbit offered as a built-in theme, usable", p.get("ok") is True and p.get("source") == "bundled", json.dumps(p)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('orbit', '', r))")
        page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root[data-ob]'); return !!r && +r.getAttribute('data-ob-ready') > 0; })()", timeout=40)
        time.sleep(1.5)
        titles = json.loads(js("JSON.stringify([...document.querySelectorAll('.ob-channel-title')].map(e => e.textContent))"))
        check("channels: one per library and system last", len(titles) >= 2 and titles[-1] == "system", json.dumps(titles))
        check("focus starts on the first channel's front tile", foc() == "tile/0/0", foc())

        # Load a known stack so the carousel checks don't depend on the server's content.
        js("document.getElementById('icefin-theme-root').orbitFill([0, 1, 2].map(c => ({title: 'ch' + c, tiles: Array.from({length: 6}, (_, i) => "
           "({label: 'T' + c + '.' + i, sub: '', art: '', go: () => { location.hash = '#/search'; }}))}))); true")
        time.sleep(0.8)
        depth = json.loads(js("JSON.stringify([...document.querySelectorAll('.ob-channel[data-ob-channel=\"0\"] .ob-tile')].slice(0, 3).map(t => t.style.transform))"))
        check("a 3D carousel: the front tile flat, the next ones further back and tilted",
              "translateZ(0px)" in depth[0] and "translateZ(-260px)" in depth[1] and "rotateY(-28deg)" in depth[1] and "translateZ(-520px)" in depth[2], json.dumps(depth))
        shot("home.png")
        act("right")
        act("right")
        check("right steps through the carousel", foc() == "tile/0/2" and "translateZ(0px)" in js("document.querySelector('.ob-tile.icefin-focused').style.transform"), foc())
        for _ in range(6):
            act("right")
        check("the carousel stops at its end", foc() == "tile/0/5", foc())
        bd0 = js("document.querySelector('.ob-backdrop').style.transform")
        act("down")
        time.sleep(0.5)
        centre = js("(() => { const r = document.querySelector('.ob-channel.current').getBoundingClientRect(); return Math.abs((r.top + r.height / 2) - innerHeight / 2) / innerHeight; })()")
        check("down changes channel, centred", foc() == "tile/1/0" and root("data-ob-index") == "1" and centre < 0.03, f"{foc()} off-centre {centre:.3f}")
        check("the backdrop moves with the channel (parallax)", js("document.querySelector('.ob-backdrop').style.transform") != bd0)
        act("up")
        check("up returns and the channel kept its tile", foc() == "tile/0/5", foc())
        act("up")
        check("up at the first channel stays", foc() == "tile/0/5", foc())

        # The guide over the themed home.
        act("icefin_overlay")
        page.wait_for("!!document.querySelector('#icefin-theme-overlay .ob-guide')", timeout=5)
        check("the guide opens over the home screen, focus inside it", foc() == "guide/Home", foc())
        act("down")
        check("the guide is navigable", foc() == "guide/Search", foc())
        shot("guide.png")
        act("back")
        time.sleep(0.3)
        check("Back closes the guide, focus returns", not js("!!document.getElementById('icefin-theme-overlay')") and foc() == "tile/0/5", foc())

        # Enter on a tile, then the guide over a stock page.
        act("enter")
        page.wait_for("location.hash.startsWith('#/search')", timeout=10)
        time.sleep(2)
        check("Enter on a tile opens its page, styled by Orbit's tokens", js("window.icefinTheme.active().route") is None
              and js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-focus').trim().toLowerCase()") == "#5cb82a")
        act("icefin_overlay")
        page.wait_for("!!document.querySelector('#icefin-theme-overlay .ob-guide')", timeout=5)
        check("the guide opens over a stock page too", True)
        js("document.querySelector('.ob-guide-item').click(); true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-ob]')", timeout=15)
        check("Home in the guide returns to Orbit's home", not js("!!document.getElementById('icefin-theme-overlay')"))

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
    print("theme_orbit:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
