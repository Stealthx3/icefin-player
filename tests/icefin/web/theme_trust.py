#!/usr/bin/env python3
"""theme_trust.py — theme trust levels and stand-down in the running app (PLAN 8.5). Lab guests only.

A user-installed theme made here has a stylesheet that tries to leak (@import and remote url()) and uses a package
image, plus a script and an SVG. Checks:
  - untrusted: the stylesheet is served sanitized (remote fetches gone, package image rewritten) and applies; the
    script and SVG are not served and no request leaves for the leak host;
  - trusted: the script runs and the SVG is served;
  - a changed file drops the trust;
  - stand-down: when a server plugin runtime announces itself, the token stylesheet and the runtime step aside and
    the handshake hands it the tokens.
Usage: python3 theme_trust.py --app ~/build/src/icefin-player --server jf12 --out ~/r85/jf12
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
LEAK = "127.0.0.1:9"  # nothing listens; a request here would show up in the page's resource timing


def user_theme(cfgdir):
    d = os.path.join(cfgdir, "themes", "lab-untrusted")
    os.makedirs(os.path.join(d, "img"))
    import shutil
    shutil.copy(os.path.join(THEMES, "lab-contrast", "tokens.json"), d)
    open(os.path.join(d, "img", "a.png"), "wb").write(PNG)
    open(os.path.join(d, "icon.svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg"/>')
    open(os.path.join(d, "s.js"), "w").write("window.labUntrustedScript = true;\n")
    open(os.path.join(d, "styles.css"), "w").write(
        f"@import url(http://{LEAK}/import.css);\n"
        "html[data-icefin-theme] { --lab-css: applied; }\n"
        f".skinHeader {{ background-image: url(http://{LEAK}/leak.png); }}\n"
        ".lab-probe { background-image: url(img/a.png); }\n")
    json.dump({"schema": 1, "id": "lab-untrusted", "name": "Lab Untrusted (test fixture)", "version": "1",
               "styles": "styles.css", "scripts": ["s.js"]}, open(os.path.join(d, "theme.json"), "w"))
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9227)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    os.environ["ICEFIN_THEME_PATH"] = THEMES
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-trust-")
    tdir = user_theme(cfgdir)
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    results, fails = [], []

    def check(label, ok, detail=""):
        results.append({"check": label, "ok": bool(ok), "detail": detail})
        print(f"theme_trust: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        if not page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)"):
            raise RuntimeError("login failed")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.api.theme && !!window.icefinTheme && !!document.querySelector('.skinHeader')", timeout=90)
        call = lambda f, *args: page.eval("new Promise(r => window.api.theme.%s(%sr))" % (f, "".join(json.dumps(x) + ", " for x in args)))
        js = page.eval
        fetch_ok = lambda u: js(f"fetch({json.dumps(u)}).then(r => r.ok, () => false)")

        listed = {t["id"]: t for t in call("themes")}
        lt = listed.get("lab-untrusted", {})
        check("user theme listed, untrusted, has scripts", lt.get("ok") and lt.get("trusted") is False and lt.get("hasScripts") is True, json.dumps(lt)[:160])
        check("set lab-untrusted", call("setActiveTheme", "lab-untrusted", "") is True)
        time.sleep(2)
        pkg = call("activePackage")
        check("untrusted: stylesheet offered, scripts not", bool(pkg.get("styles")) and pkg.get("scripts") == [], json.dumps(pkg)[:200])
        css = js("fetch('icefin-theme://lab-untrusted/styles.css').then(r => r.text(), () => '')")
        check("served CSS: remote fetches removed", LEAK not in css and "@import" not in css, css.replace("\n", " ")[:200])
        check("served CSS: package image rewritten", 'url("icefin-theme://lab-untrusted/img/a.png")' in css)
        check("sanitized CSS applies", js("getComputedStyle(document.documentElement).getPropertyValue('--lab-css').trim()") == "applied")
        js("(() => { const e = document.createElement('div'); e.className = 'lab-probe'; document.body.appendChild(e); return true; })()")
        time.sleep(1)
        check("package image used through the rewritten url", "icefin-theme://lab-untrusted/img/a.png" in js("getComputedStyle(document.querySelector('.lab-probe')).backgroundImage"))
        check("untrusted: script not served", fetch_ok("icefin-theme://lab-untrusted/s.js") is False and js("window.labUntrustedScript === true") is False)
        check("untrusted: SVG not served", fetch_ok("icefin-theme://lab-untrusted/icon.svg") is False)
        leaks = js(f"performance.getEntriesByType('resource').filter(e => e.name.includes({json.dumps(LEAK)})).length")
        check("no request reached the leak host", leaks == 0, f"requests={leaks}")

        warning = call("trustWarning")
        check("trust warning mentions the access token", "access token" in warning)
        check("trust the theme", call("setTrusted", "lab-untrusted", True) is True)
        page.wait_for("window.labUntrustedScript === true", timeout=15)
        check("trusted: script runs", js("window.labUntrustedScript") is True)
        check("trusted: SVG served", fetch_ok("icefin-theme://lab-untrusted/icon.svg") is True)

        with open(os.path.join(tdir, "s.js"), "a") as f:
            f.write("// changed\n")
        call("rescan")
        check("changed file drops the trust", call("isTrusted", "lab-untrusted") is False and fetch_ok("icefin-theme://lab-untrusted/s.js") is False)

        check("set lab-screens (development)", call("setActiveTheme", "lab-screens", "") is True)
        page.wait_for("window.icefinTheme.active() && window.icefinTheme.active().id === 'lab-screens'", timeout=15)
        check("before stand-down: Icefin runtime and tokens active",
              js("!!document.getElementById('icefin-theme-tokens') && document.documentElement.classList.contains('icefin-themed')") is True)
        js("window.icefinPluginRuntime = { attachNative(n) { window.labHandshake = n; n.tokens().then(t => { window.labHandshakeTokens = Object.keys(t).length; }); } };"
           " window.dispatchEvent(new Event('icefin-plugin-runtime')); true")
        page.wait_for("window.labHandshakeTokens > 0", timeout=15)
        check("stand-down: handshake with tokens", js("window.labHandshake.version === 1 && window.labHandshake.client === 'icefin-player'") is True,
              f"tokens={js('window.labHandshakeTokens')}")
        check("stand-down: Icefin tokens stylesheet removed",
              js("!document.getElementById('icefin-theme-tokens') && !document.documentElement.classList.contains('icefin-themed')") is True)
        check("stand-down: Icefin runtime not mounted", js("window.icefinTheme.active() === null && window.icefinTheme.stoodDown()") is True)
        call("setActiveTheme", "", "")
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
    json.dump({"server": a.server, "results": results, "ok": not fails}, open(os.path.join(a.out, "theme_trust.json"), "w"), indent=1)
    print("theme_trust:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
