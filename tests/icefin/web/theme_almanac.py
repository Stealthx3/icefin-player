#!/usr/bin/env python3
"""theme_almanac.py — the Almanac benchmark theme in the running app (PLAN 9.15; target a TiVo / cable guide). Lab guests only.

  - needs Live TV on the server: run tests/icefin/servers/livetv.py first (it also moves the guide to now);
  - Almanac is in the benchmark pack (Client Settings → Benchmark Themes); Home and Live TV open the guide;
  - the guide: channels by number down the side, a time axis, programme cells sized by duration (ui.guideGrid), a now
    line, the live programme focused first; left/right through a channel's programmes and pages of time, up/down
    keeping the time and scrolling by channel;
  - the info pane follows the focused programme; after a dwell the focused channel plays live and muted in the corner
    (the page's own <video>, never mpv); changing channel stops it and closes its live stream;
  - up from the first channel and Back go to the menu row; down returns to the guide where it was;
  - Enter on a future programme opens its details; turning the pack off switches the engine off.
Layout positions and motion timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_almanac.py --app ~/build/src/icefin-player --server jf12 --out ~/r915/jf12
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
    ap.add_argument("--port", type=int, default=9255)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-almanac-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_almanac: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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

        check("Almanac not offered while the pack is off", "almanac" not in themes())
        setv("benchPack", True)
        time.sleep(1)
        al = themes().get("almanac", {})
        check("Benchmark Themes on: Almanac offered, bundled, usable", al.get("ok") is True and al.get("source") == "bundled", json.dumps(al)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('almanac', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-al-ready]')", timeout=40)
        nch = int(js("document.querySelector('#icefin-theme-root').dataset.alReady"))
        check("Live TV channels listed", nch >= 20, f"{nch} channels (run tests/icefin/servers/livetv.py)")
        page.wait_for("[...document.querySelectorAll('.icefin-guide-cell')].some(c => !c.classList.contains('icefin-guide-gap'))", timeout=30)
        time.sleep(1)
        R = "document.querySelector('#icefin-theme-root')"
        gf = lambda: js("JSON.stringify((() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return null; if (f.classList.contains('al-menu-item')) return {menu: f.textContent}; const p = f.guideProgramme; return p ? {id: p.id, row: f.guideRow, s: p.start, e: p.end, gap: !!p.gap, ch: f.guideChannel.ch.ChannelNumber} : {other: f.className}; })())")
        now = js("Date.now()")
        g0 = json.loads(gf())
        check("focus starts on the first channel's programme on now", g0 and g0.get("row") == 0 and not g0.get("gap") and g0["s"] <= now < g0["e"] and str(g0.get("ch")) == "1", gf())
        geo = json.loads(js("JSON.stringify((() => { const r = [...document.querySelectorAll('.icefin-guide-row')]; const p = document.querySelector('.al-preview').getBoundingClientRect(); return {rows: r.length, rowH: r[0].getBoundingClientRect().height / innerHeight, chW: document.querySelector('.icefin-guide-channel').getBoundingClientRect().width / innerWidth, prevRight: p.right / innerWidth, prevTop: p.top / innerHeight, times: document.querySelectorAll('.icefin-guide-time').length}; })())"))
        check("layout: seven channel rows, channels about 15% wide, three half-hour columns, preview in the top-right corner",
              geo["rows"] == 7 and 0.13 <= geo["chW"] <= 0.17 and geo["times"] == 3 and geo["prevRight"] > 0.9 and geo["prevTop"] < 0.1, json.dumps(geo))
        ratio = json.loads(js("JSON.stringify((() => { const r = [...document.querySelectorAll('.icefin-guide-cell')].filter(c => !c.className.includes('cut') && !c.classList.contains('icefin-guide-gap')).map(c => c.getBoundingClientRect().width / (c.guideProgramme.end - c.guideProgramme.start)); return r.length ? [r.length, Math.max(...r) / Math.min(...r)] : [0, 0]; })())"))
        check("programme cells sized by duration (same width per minute)", ratio[0] >= 3 and ratio[1] < 1.04, json.dumps(ratio))
        check("a now line", js("!!document.querySelector('.al-guide .icefin-guide-now')"))
        check("the info pane shows the focused programme", js("document.querySelector('.al-title').textContent") != "" and "On now" in js("document.querySelector('.al-when').textContent"),
              js("document.querySelector('.al-when').textContent"))
        shot("guide.png")
        try:
            page.wait_for(f"!!{R}.dataset.alPreview && !!document.querySelector('.al-preview video.icefin-preview') && document.querySelector('.al-preview video.icefin-preview').currentTime > 0.3", timeout=40)
            live = True
        except Exception:  # noqa: BLE001
            live = False
        check("after a dwell the focused channel plays live and muted in the corner", live and js("document.querySelector('.al-preview video.icefin-preview').muted") is True,
              js("JSON.stringify((v => v ? {t: v.currentTime, e: (v.error || {}).message || '', src: (v.currentSrc || '').slice(0, 80)} : null)(document.querySelector('.al-preview video.icefin-preview')))"))
        check("the preview isn't mpv (no player session)", js("!!(window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying())") is False)
        shot("preview.png")
        act("right")
        g1 = json.loads(gf())
        check("right steps to the next programme on the channel", g1.get("row") == 0 and g1["s"] == g0["e"], gf())
        act("down")
        time.sleep(0.3)
        g2 = json.loads(gf())
        check("down moves to the next channel at the same time; the preview follows the channel", g2.get("row") == 1 and g2["s"] < g1["e"] and g2["e"] > g1["s"]
              and js(f"{R}.dataset.alPreview || ''") == "", f"{g1} -> {g2}")
        for _ in range(7):
            act("down")
        check("past the last visible row the guide scrolls by channel", json.loads(gf()).get("row") == 8 and int(js("document.querySelector('.al-guide').dataset.top")) >= 2, gf())
        for _ in range(12):
            act("right")
        w = js("+document.querySelector('.al-guide .icefin-guide-times').dataset.start")
        check("past the window's end the guide pages forward by time", w > now, f"start={w} now={now}")
        fut = json.loads(gf())
        act("enter")
        try:
            page.wait_for("location.hash.startsWith('#/details')", timeout=15)
            det = True
        except Exception:  # noqa: BLE001
            det = False
        check("Enter on a future programme opens its details", det and fut["s"] > now, f"{fut} hash={js('location.hash')}")
        time.sleep(2)
        js("location.hash = '#/livetv'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-al-ready]') && window.icefinTheme.active().route === '#/livetv'", timeout=30)
        page.wait_for("[...document.querySelectorAll('.icefin-guide-cell')].some(c => !c.classList.contains('icefin-guide-gap'))", timeout=30)
        time.sleep(0.5)
        check("Live TV opens the guide too", json.loads(gf()).get("row") == 0, gf())
        act("up")
        check("up from the first channel goes to the menu row", json.loads(gf()).get("menu") == "Guide", gf())
        act("right")
        act("down")
        check("down returns to the guide where it was", json.loads(gf()).get("row") == 0, gf())
        act("back")
        check("Back goes to the menu row", json.loads(gf()).get("menu") == "Guide", gf())
        setv("benchPack", False)
        time.sleep(1.5)
        check("pack turned off while active: engine off, Almanac gone", js("new Promise(r => window.api.theme.activeTheme(r))") == "" and "almanac" not in themes())
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
    print("theme_almanac:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
