#!/usr/bin/env python3
"""theme_tokens.py — the theme token engine in the running app (PLAN 6.5). Lab guests only.

Starts the app with ICEFIN_THEME_PATH=tests/icefin/themes, signs in to a lab server, opens home, then checks:
  1. the package list: lab-contrast usable, lab-broken refused with errors;
  2. engine off: stock colors, no Icefin stylesheet;
  3. lab-contrast on: the page background and jellyfin-web's own palette follow the tokens, live;
  4. the "green" preset changes the accent and the focus color;
  5. a broken theme is refused and the current one stays;
  6. off again: stock colors back with no reload;
  7. after a restart, the saved theme is active again.
Screenshots go next to --out. Exit 0 when every check passes.

Usage: python3 theme_tokens.py --app ~/build/src/icefin-player --server jf1011 --out ~/r65/jf1011
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))
CALL = "new Promise(r => window.api.theme.{f}({args}r))"
STYLE = ("(() => { const cs = getComputedStyle(document.documentElement); return JSON.stringify({"
         "bg: cs.backgroundColor, themed: document.documentElement.classList.contains('icefin-themed'),"
         "style: !!document.getElementById('icefin-theme-tokens'),"
         "jfPrimary: cs.getPropertyValue('--jf-palette-primary-main').trim(),"
         "accent: cs.getPropertyValue('--icefin-color-accent').trim(), focus: cs.getPropertyValue('--icefin-color-focus').trim(),"
         "font: getComputedStyle(document.body).fontFamily}); })()")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf1011")
    ap.add_argument("--port", type=int, default=9224)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    os.environ["ICEFIN_THEME_PATH"] = THEMES
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-theme-")
    results, fails = [], []

    def check(label, ok, detail=""):
        results.append({"check": label, "ok": bool(ok), "detail": detail})
        print(f"theme_tokens: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def start(logname):
        log = open(os.path.join(a.out, logname), "w")
        app = launch(a.app, a.port, cfgdir, log, "xcb")
        page = Page(a.port, timeout=90)
        return app, page, log

    def stop(app):
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass

    def shot(page, name):
        data = page.send("Page.captureScreenshot", format="png")["data"]
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(data))

    app = None
    try:
        app, page, log = start("app-1.log")
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        ok = page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
        if not ok:
            raise RuntimeError("login failed")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.api.theme && !!document.querySelector('.skinHeader')", timeout=90)
        time.sleep(3)

        call = lambda f, *args: page.eval(CALL.format(f=f, args="".join(json.dumps(x) + ", " for x in args)))
        style = lambda: json.loads(page.eval(STYLE))

        themes = {t["id"]: t for t in call("themes")}
        check("lab-contrast listed and usable", themes.get("lab-contrast", {}).get("ok") is True)
        broken = themes.get("lab-broken", {})
        check("lab-broken listed and refused", broken.get("ok") is False and len(broken.get("errors", [])) >= 3,
              f"({len(broken.get('errors', []))} errors)")

        # The lab user's theme choice syncs to the server (8.5), so an earlier run can leave one: start from off.
        if call("activeTheme"):
            call("setActiveTheme", "", "")
            time.sleep(1.5)
        off = style()
        check("engine off: no Icefin stylesheet", not off["themed"] and not off["style"], f"bg={off['bg']}")
        shot(page, "1-off.png")

        check("set lab-contrast", call("setActiveTheme", "lab-contrast", "") is True)
        time.sleep(1.5)
        on = style()
        check("lab-contrast: page background follows color.background", on["bg"] == "rgb(22, 11, 46)", f"bg={on['bg']}")
        check("lab-contrast: accent token on the page", on["accent"] == "#d0167a", f"accent={on['accent']}")
        check("lab-contrast: font token", "monospace" in on["font"], f"font={on['font']}")
        # jellyfin-web 10.12+ reads --jf-palette-*; on 10.11 the restated rules carry the colors.
        check("jellyfin-web palette follows the accent", on["jfPrimary"] in ("var(--icefin-color-accent)", "#d0167a"),
              f"--jf-palette-primary-main={on['jfPrimary'] or '(unset: 10.11)'}")
        shot(page, "2-lab-contrast.png")

        check("set preset green", call("setActiveTheme", "lab-contrast", "green") is True)
        time.sleep(1.5)
        g = style()
        check("preset: accent and focus follow it", g["accent"] == "#1fa83a" and g["focus"] == "#1fa83a", f"accent={g['accent']} focus={g['focus']}")

        check("broken theme refused", call("setActiveTheme", "lab-broken", "") is False)
        still = style()
        check("current theme kept after refusal", still["accent"] == "#1fa83a")

        check("turn engine off", call("setActiveTheme", "", "") is True)
        time.sleep(1.5)
        back = style()
        check("off: stock background back without reload", back["bg"] == off["bg"] and not back["style"], f"bg={back['bg']}")
        shot(page, "3-off-again.png")

        call("setActiveTheme", "lab-contrast", "")
        time.sleep(1)
        stop(app)
        log.close()
        time.sleep(2)
        app, page, log = start("app-2.log")
        page.wait_for("!!window.api && !!window.api.theme && !!document.querySelector('.skinHeader')", timeout=120)
        time.sleep(4)
        again = style()
        check("restart: saved theme active again", again["themed"] and again["bg"] == "rgb(22, 11, 46)", f"bg={again['bg']}")
        call("setActiveTheme", "", "")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        if app:
            stop(app)
        if xv:
            xv.terminate()
    json.dump({"server": a.server, "results": results, "ok": not fails}, open(os.path.join(a.out, "theme_tokens.json"), "w"), indent=1)
    print("theme_tokens:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
