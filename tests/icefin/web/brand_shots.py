"""brand_shots.py — the server's brand where each clone's target shows its own (PLAN 9.27): the home and now
playing in each theme, for the user's review. Lab guests only (or --host). Usage: python3 brand_shots.py --app ~/build/src/icefin-player --out ~/r962
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import hostmode  # noqa: E402

ROOT = "document.querySelector('#icefin-theme-root')"
THEMES = [t for t in ["harbor", "orbit", "mosaic", "arcade", "lumen"] if os.path.isdir(os.path.join(HERE, "..", "..", "..", "themes", t))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9265)
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
        print(f"brand_shots: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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

        brand = js("window.icefinTheme.ui.brand().then(b => JSON.stringify(b))")
        print("brand_shots: the server's brand", brand, flush=True)
        for tid in a.themes.split(","):
            if not switch(tid):
                check(f"{tid}: theme loads", False)
                continue
            for route in ["home", "queue"]:
                js(f"location.hash = '#/{route}'; true")
                time.sleep(6)
                v = js("(() => { const m = [...document.querySelectorAll('#icefin-theme-root [class$=\"-mark\"], #icefin-theme-root .hb-brand')].find(e => e.getClientRects().length); if (!m) return ''; const cs = getComputedStyle(m); return m.className + ' ' + (m.querySelector('img') ? m.querySelector('img').src : cs.backgroundImage).slice(0, 120); })()")
                check(f"{tid}: {route} shows the brand spot", bool(v), v)
                open(os.path.join(a.out, f"{tid}-{route}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
    finally:
        if stop:
            stop()
        if app:
            app.terminate()
        if xv:
            xv.terminate()
    print("brand_shots:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
