#!/usr/bin/env python3
"""theme_baseline.py — Baseline looks like the stock web client with every engine layer on (PLAN 8.1). Lab guests only.

For each page (home, an item's details, the user menu, a library), screenshots with the engine off and with the
bundled Baseline theme, then compares them pixel by pixel. Also checks Baseline is bundled and that its tokens,
styles and scripts layers all ran.
Pass: no differing pixels on jellyfin-web 10.12+ (Baseline uses its palette). On 10.11 the stock palette differs
(it predates the palette variables), so the differences are measured and reported, not failed.
Usage: python3 theme_baseline.py --app ~/build/src/icefin-player --server jf12 --out ~/r81/jf12
"""
import argparse, base64, io, json, os, signal, sys, tempfile, time

from PIL import Image, ImageChops

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
    ap.add_argument("--port", type=int, default=9226)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    item = srv.call("GET", f"/Items?Recursive=true&IncludeItemTypes=Movie&userId={uid}&Limit=1")["Items"][0]["Id"]
    lib = srv.call("GET", f"/Users/{uid}/Views")["Items"][0]["Id"]
    pages = {"home": "#/home", "details": f"#/details?id={item}", "menu": "#/mypreferencesmenu", "library": f"#/list?parentId={lib}"}
    newer = int(srv.call("GET", "/System/Info")["Version"].split(".")[1]) >= 12 or srv.call("GET", "/System/Info")["Version"].startswith("12")

    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-baseline-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    results, fails = [], []

    def check(label, ok, detail="", soft=False):
        results.append({"check": label, "ok": bool(ok), "detail": detail, "soft": soft})
        print(f"theme_baseline: {'ok  ' if ok else ('note' if soft else 'FAIL')} {label} {detail}", flush=True)
        if not ok and not soft:
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

        listed = {t["id"]: t for t in call("themes")}
        check("Baseline bundled and usable", listed.get("baseline", {}).get("source") == "bundled" and listed["baseline"]["ok"],
              json.dumps(listed.get("baseline", {}))[:120])

        def grab(name, route):
            js(f"location.hash = {json.dumps(route)}; true")
            time.sleep(4)
            # Same for both shots: hide spinners and the "ends at" clock (content, not theme). Animations stay on:
            # jellyfin-web's image fade-in only finishes when its animation ends.
            js("(() => { if (!document.getElementById('lab-stabilize')) { const s = document.createElement('style'); s.id = 'lab-stabilize';"
               " s.textContent = '.mdl-spinner,.docspinner,.progressring,.endsAt{visibility:hidden!important}';"
               " document.documentElement.appendChild(s); } return true; })()")
            js("document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); true")
            shot = lambda: Image.open(io.BytesIO(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))).convert("RGB")
            # Wait for a still page (loading spinners, image fades): two identical screenshots in a row.
            img = shot()
            for _ in range(20):
                time.sleep(1)
                nxt = shot()
                if ImageChops.difference(img, nxt).getbbox() is None:
                    break
                img = nxt
            img.save(os.path.join(a.out, name + ".png"))
            return img

        # Computed styles of the main controls on home, off vs on: names the property behind any pixel difference.
        PROPS = ["backgroundColor", "color", "borderTopLeftRadius", "borderTopColor", "boxShadow"]  # not opacity: image loading state
        SEL = [".skinHeader", ".cardBox", ".cardScalable", ".cardPadder", ".cardImageContainer", ".cardContent", ".blurhash-canvas",
               ".cardOverlayContainer", ".emby-tab-button", ".emby-tab-button-active", ".cardText", ".sectionTitle", "html", "body"]
        styles = lambda: json.loads(js("JSON.stringify(Object.fromEntries(%s.map(sel => { const e = document.querySelector(sel);"
                                       " if (!e) return [sel, null]; const cs = getComputedStyle(e); return [sel, Object.fromEntries(%s.map(p => [p, cs[p]]))]; })))"
                                       % (json.dumps(SEL), json.dumps(PROPS))))
        js("location.hash = '#/home'; true")
        page.wait_for("[...document.querySelectorAll('.cardImageContainer')].filter(e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }).every(e => getComputedStyle(e).opacity === '1')", timeout=30)
        st_off = styles()
        off = {k: grab(f"{k}-off", r) for k, r in pages.items()}
        check("set Baseline", call("setActiveTheme", "baseline", "") is True)
        time.sleep(2)
        layers = json.loads(js("JSON.stringify({tokens: document.documentElement.classList.contains('icefin-themed'),"
                               " styles: getComputedStyle(document.documentElement).getPropertyValue('--icefin-baseline-styles').trim(),"
                               " scripts: !!window.icefinBaselineLoaded, runtime: (window.icefinTheme.active() || {}).id})"))
        check("all engine layers on (tokens, styles, scripts, runtime)",
              layers["tokens"] and layers["styles"] == "on" and layers["scripts"] and layers["runtime"] == "baseline", json.dumps(layers))
        js("location.hash = '#/home'; true")
        page.wait_for("[...document.querySelectorAll('.cardImageContainer')].filter(e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }).every(e => getComputedStyle(e).opacity === '1')", timeout=30)
        st_on = styles()
        style_diffs = [f"{sel} {p}: {st_off[sel][p]} -> {st_on[sel][p]}" for sel in SEL if st_off.get(sel) and st_on.get(sel)
                       for p in PROPS if st_off[sel][p] != st_on[sel][p]]
        check("home: computed styles of the main controls match", not style_diffs, "; ".join(style_diffs)[:600], soft=not newer)
        on = {k: grab(f"{k}-baseline", r) for k, r in pages.items()}
        for k in pages:
            diff = ImageChops.difference(off[k], on[k]).convert("L").point(lambda v: 255 if v > 3 else 0)
            n = sum(1 for v in diff.getdata() if v)
            pct = 100.0 * n / (diff.width * diff.height)
            if n:
                diff.save(os.path.join(a.out, f"{k}-diff.png"))
            check(f"{k}: Baseline matches stock", n == 0, f"{n} px differ ({pct:.2f}%)", soft=not newer)
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
    json.dump({"server": a.server, "results": results, "ok": not fails}, open(os.path.join(a.out, "theme_baseline.json"), "w"), indent=1)
    print("theme_baseline:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
