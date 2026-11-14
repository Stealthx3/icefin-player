#!/usr/bin/env python3
"""tide_probe.py — a quick look at Tide in the lab while it is built (PLAN 9.48): launches Icefin with the theme's
development folder (ICEFIN_THEME_PATH), signs in, switches to Tide, records console errors in the page, then runs the
steps given as JSON and prints each result. Steps: ["act", "down"], ["sleep", 0.5], ["js", "expr"], ["shot", "a.png"],
["hash", "#/search"]. Lab guests only.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 tide_probe.py --app ~/build/src/icefin-player --out ~/rprobe '[["act","back"],["js","…"]]'
"""
import argparse, base64, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

CAPTURE = """(() => { if (window.__tdErr) return true; window.__tdErr = [];
  const keep = (k) => (...a) => { window.__tdErr.push(k + ': ' + a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 400)); };
  const ce = console.error.bind(console); console.error = (...a) => { keep('error')(...a); ce(...a); };
  window.addEventListener('error', (e) => keep('uncaught')(e.message, e.filename + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => keep('rejection')(e.reason)); return true; })()"""


# Captures take the web layer alone: over the native backdrop (8.4) Tide's screens are transparent, and a capture drops
# the alpha (a soft glow comes out opaque). For screenshots, the gradient goes under the screen, as without the backdrop.
OPAQUE = "(() => { if (document.getElementById('td-test-opaque')) return true; const s = document.createElement('style'); s.id = 'td-test-opaque'; s.textContent = 'html[data-icefin-backdrop] [data-td-screen] { background: linear-gradient(180deg, var(--icefin-color-waveTop), var(--icefin-color-waveBottom)) !important; }'; document.head.append(s); return true; })()"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9272)
    ap.add_argument("--out", required=True)
    ap.add_argument("steps")
    a = ap.parse_args()
    steps = json.loads(a.steps)
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-tideprobe-")
    app = launch(a.app, a.port, cfgdir, open(os.path.join(a.out, "app.log"), "w"), "xcb")
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui", timeout=90)
        page.switch_theme_reloading("tide", "!!document.querySelector('#icefin-theme-root[data-td-ready]')")
        page.eval(CAPTURE)
        page.eval(OPAQUE)
        time.sleep(1.5)
        for st in steps:
            kind, arg = st[0], st[1] if len(st) > 1 else None
            if kind == "act":
                r = page.eval(f"window.icefinTheme.handleAction({json.dumps(arg)})")
            elif kind == "sleep":
                time.sleep(float(arg)); continue
            elif kind == "js":
                try:
                    r = page.eval(arg)
                except Exception as e:  # noqa: BLE001
                    r = f"EXC {e}"
            elif kind == "hash":
                r = page.eval(f"window.icefinTheme.ctx.navigate({json.dumps(arg)}); true"); time.sleep(2)
            elif kind == "shot":
                open(os.path.join(a.out, arg), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"])); r = arg
            print(f"probe: {json.dumps(st)[:120]} -> {json.dumps(r)[:600]}", flush=True)
        print("probe: errors " + json.dumps(page.eval("window.__tdErr || []"))[:3000], flush=True)
    finally:
        try:
            app.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    main()
