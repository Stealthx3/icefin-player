"""wallpaper.py — the device wallpaper behind themes (PLAN 9.26): a looping WebM and an animated SVG behind a theme,
the theme background transparent over it, Low Motion holding it still, gone for Classic View. Lab guests only.
Usage: python3 wallpaper.py --app ~/build/src/icefin-player --out ~/r926
"""
import argparse, base64, json, os, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import hostmode  # noqa: E402

ROOT = "document.querySelector('#icefin-theme-root')"
THEMES = [t for t in ["orbit", "plaza"] if os.path.isdir(os.path.join(HERE, "..", "..", "..", "themes", t))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9266)
    ap.add_argument("--out", required=True)
    ap.add_argument("--themes", default=",".join(THEMES))
    hostmode.add_args(ap)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    app = xv = stop = None
    if a.host:
        # the host: one theme (the user's choice is switched once and put back), the user's own library, and nothing
        # saved to their server (no Favourite or Played round trip, no playback)
        page, stop = hostmode.start(a, a.out, theme=a.themes.split(",")[0])
    else:
        cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
        cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
        srv = Server(cfg)
        srv.wait()
        xv = start_x()
        cfgdir = tempfile.mkdtemp(prefix="icefin-pref-")
        log = open(os.path.join(a.out, "app.log"), "w")
        app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"wallpaper: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        if not a.host:
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
        js = lambda e: page.eval(e)
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        api = "window.icefinTheme.ctx.apiClient()"
        find = lambda types, name="": js(f"new Promise(r => {api}.getItems({api}.getCurrentUserId(), {{IncludeItemTypes: '{types}', Recursive: true, searchTerm: {json.dumps(name)}, Limit: 1}}).then(x => r((x.Items[0] || {{}}).Id || '')))")
        def switch(tid):
            for _ in range(3):
                try:
                    js(f"window.__det = 1; new Promise(r => window.api.theme.select({json.dumps(tid)}, '', '', r))")
                    break
                except Exception:  # noqa: BLE001
                    page.reconnect()
            end = time.time() + 60
            while time.time() < end:
                try:
                    if js(f"!!window.icefinTheme && !!window.icefinTheme.active() && window.icefinTheme.active().id === {json.dumps(tid)} && !!window.icefinTheme.ui && !!window.icefinTheme.ui.details && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()"):
                        time.sleep(1.5)
                        return True
                except Exception:  # noqa: BLE001
                    try:
                        page.reconnect(timeout=10)
                    except Exception:  # noqa: BLE001
                        pass
                time.sleep(1)
            return False

        wdir = os.path.join(cfgdir, "wallpapers")
        os.makedirs(wdir, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3", "-c:v", "libvpx-vp9", "-b:v", "300k", os.path.join(wdir, "w.webm")], check=True)
        open(os.path.join(wdir, "w.svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#123"/><circle cx="20" cy="45" r="10" fill="#fc0"><animate attributeName="cx" values="20;140;20" dur="2s" repeatCount="indefinite"/></circle></svg>')
        setv = lambda key, val: js("new Promise(r => window.api.settings.setValue('theme', %s, %s, () => r(true)))" % (json.dumps(key), json.dumps(val)))
        def reload():
            js("location.hash = '#/home'; location.reload(); true")
            time.sleep(8)
            page.reconnect()
            page.wait_for("!!window.icefinTheme && !!window.icefinTheme.ui && document.documentElement.classList.contains('icefin-themed')", timeout=90)
            time.sleep(3)
        tid = a.themes.split(",")[0]
        check(f"{tid} loads", switch(tid))
        check("no wallpaper by default", not js("!!document.getElementById('icefin-wallpaper')"))
        for name, kind in (("w.webm", "video"), ("w.svg", "svg")):
            setv("wallpaperName", name)
            setv("wallpaper", name)
            reload()
            info = js("new Promise(r => window.api.theme.wallpaper(r))")
            check(f"{kind}: the setting reads back", isinstance(info, dict) and info.get("kind") == kind, json.dumps(info))
            ok = False
            end = time.time() + 15
            while time.time() < end and not ok:
                ok = js("document.documentElement.hasAttribute('data-icefin-wallpaper') && !!document.querySelector('#icefin-wallpaper video, #icefin-wallpaper img, #icefin-wallpaper canvas')")
                time.sleep(0.5)
            check(f"{kind}: the layer is up", bool(ok))
            time.sleep(2)
            diag = js("""(() => { const l = document.getElementById('icefin-wallpaper'); if (!l) return {}; const c = l.firstElementChild; const r = l.getBoundingClientRect();
                return { display: getComputedStyle(l).display, z: getComputedStyle(l).zIndex, rect: [r.width, r.height], parent: l.parentNode && l.parentNode.tagName, child: c && c.tagName,
                  src: c && (c.currentSrc || c.src || '').slice(0, 40), natural: c && (c.naturalWidth || c.videoWidth || c.width || 0), ready: c && (c.readyState !== undefined ? c.readyState : c.complete),
                  err: c && c.error ? c.error.code : null, playing: document.documentElement.hasAttribute('data-icefin-osd-playing') }; })()""")
            check(f"{kind}: the picture loads and shows", isinstance(diag, dict) and diag.get("display") != "none" and (diag.get("natural") or 0) > 0, json.dumps(diag))
            time.sleep(1)
            left = js("""(() => { const out = []; for (const a of document.querySelectorAll('#icefin-theme-root, #icefin-stock-chrome')) for (const el of [a, ...a.querySelectorAll('*')]) {
                if (!el.getClientRects().length || el.closest('.dialog, [role=dialog]')) continue; const r = el.getBoundingClientRect(); if (r.width < innerWidth * 0.95 || r.height < innerHeight * 0.95) continue;
                if (getComputedStyle(el).visibility === 'hidden') continue; const cs = getComputedStyle(el); const m = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor || ''); const p = m ? m[1].split(/[ ,\\/]+/).filter(Boolean) : [];
                if ((cs.backgroundImage !== 'none') || (m && (p.length < 4 || parseFloat(p[3]) >= 0.95))) out.push(el.tagName + '.' + el.className); } return out.slice(0, 5); })()""")
            check(f"{kind}: nothing opaque covers it", not left, json.dumps(left))
            bg = js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-background').trim()")
            check(f"{kind}: the theme background token is transparent", bg == "transparent", bg)
            if kind == "video":
                t0 = js("(document.querySelector('#icefin-wallpaper video') || {}).currentTime || 0")
                time.sleep(1.5)
                t1 = js("(document.querySelector('#icefin-wallpaper video') || {}).currentTime || 0")
                check("video: it plays (the time moves; a loop may wrap it), muted", abs(t1 - t0) > 0.2 and js("document.querySelector('#icefin-wallpaper video').muted"), f"{t0} -> {t1}")
            open(os.path.join(a.out, f"{tid}-{kind}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        js("new Promise(r => window.api.theme.clearWallpaper ? (window.api.theme.clearWallpaper(), r(true)) : r(false))")
        time.sleep(2)
        check("Remove takes it away", not js("document.documentElement.hasAttribute('data-icefin-wallpaper')"))
    finally:
        if stop:
            stop()
        if app:
            app.terminate()
        if xv:
            xv.terminate()
    print("wallpaper:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
