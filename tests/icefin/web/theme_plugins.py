#!/usr/bin/env python3
"""theme_plugins.py — three-way plugin runs: engine off, Baseline, a styled theme (PLAN 8.2, SPEC "Server plugin
compatibility", DECISIONS D10). Lab guests only (the regression plugins live on the lab servers, tests/icefin/servers).

For each mode, on one app instance:
  - what UI-injecting plugins put into the page: home sections (Home Screen Sections via File Transformation), user
    menu and side-drawer entries (Plugin Pages), plugin script loaders (JavaScript Injector), and whether those are
    visible;
  - server work: a remote-controlled play and the Playback Reporting row it leaves (client name, play method).
Engine off is the reference. A difference under Baseline is an engine bug (fails the run); a difference only under the
styled theme is a theme or capability gap (reported, also fails, as a styled theme must not hide plugin UI).
The styled theme is the lab-contrast fixture (tokens + adapter); themes with their own screens get the same run in 8.6/9.x.
Usage: python3 theme_plugins.py --app ~/build/src/icefin-player --server jf12 --out ~/r82/jf12
"""
import argparse, datetime, json, os, signal, sys, tempfile, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))
MODES = [("off", ""), ("baseline", "baseline"), ("styled", "lab-contrast")]
PROBE = """(() => {
  const vis = (e) => !!(e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden');
  const txt = (sel) => [...document.querySelectorAll(sel)].filter(vis).map(e => e.textContent.trim()).filter(Boolean);
  return JSON.stringify({
    homeSections: txt('.sectionTitle'),
    homeSectionCount: [...document.querySelectorAll('.verticalSection, .homeSection')].filter(vis).length,
    drawer: [...document.querySelectorAll('.navMenuOption .navMenuOptionText')].map(e => e.textContent.trim()).filter(Boolean),
    pluginScripts: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
      .filter(s => /plugin|injector|transformation|HomeScreen/i.test(s)).map(s => s.split('?')[0]).sort()
  });
})()"""
MENU = "JSON.stringify([...document.querySelectorAll('.listItem .listItemBodyText')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim()))"


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9241)
    ap.add_argument("--seconds", type=int, default=28)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    item = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]
    os.environ["ICEFIN_THEME_PATH"] = THEMES
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-plugins-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    results, fails = {}, []

    def check(label, ok, detail=""):
        print(f"theme_plugins[{a.server}]: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

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
        page.wait_for("!!window.api && !!window.api.theme && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        sess = None
        for _ in range(30):
            c = [s for s in srv.call("GET", "/Sessions?activeWithinSeconds=120") if s.get("UserName") == cred["user"] and s.get("SupportsRemoteControl")]
            if c:
                sess = c[0]
                break
            time.sleep(2)
        if not sess:
            raise RuntimeError("app session not visible on server")

        for mode, theme in MODES:
            js("new Promise(r => window.api.theme.setActiveTheme(%s, '', r))" % json.dumps(theme))
            js("location.hash = '#/home'; location.reload(); true")
            time.sleep(7)
            page.reconnect()
            page.wait_for("!!window.api && !!document.querySelector('.skinHeader') && !!document.querySelector('.sectionTitle')", timeout=60)
            time.sleep(4)
            r = json.loads(js(PROBE))
            js("location.hash = '#/mypreferencesmenu?icefin=stock'; true")
            time.sleep(4)
            r["userMenu"] = json.loads(js(MENU))
            js("location.hash = '#/home'; true")
            time.sleep(3)
            r["themed"] = js("document.documentElement.classList.contains('icefin-themed')")
            started = now_iso()
            srv.call("POST", f"/Sessions/{sess['Id']}/Playing?playCommand=PlayNow&itemIds={item['Id']}")
            time.sleep(a.seconds)
            state = next((x for x in srv.call("GET", "/Sessions") if x["Id"] == sess["Id"]), {})
            r["playMethod"] = (state.get("PlayState") or {}).get("PlayMethod")
            srv.call("POST", f"/Sessions/{sess['Id']}/Playing/Stop")
            time.sleep(6)
            try:
                rows = srv.call("POST", "/user_usage_stats/submit_custom_query", {
                    "CustomQueryString": "SELECT ClientName, PlaybackMethod FROM PlaybackActivity "
                                         f"WHERE DateCreated >= '{started.replace('T', ' ')}'", "ReplaceUserId": False})
                r["reporting"] = rows.get("results", rows)
            except Exception as e:  # noqa: BLE001
                r["reporting"] = f"error: {e}"
            results[mode] = r
            print(f"theme_plugins[{a.server}]: {mode}: {len(r['homeSections'])} home sections, {len(r['userMenu'])} menu entries, "
                  f"{len(r['drawer'])} drawer entries, {len(r['pluginScripts'])} plugin scripts, play {r['playMethod']}, "
                  f"reporting {r['reporting'] if isinstance(r['reporting'], str) else len(r['reporting'])} row(s)", flush=True)
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")

        ref = results["off"]
        check("reference run saw plugin UI", ref["homeSectionCount"] > 0 and len(ref["userMenu"]) > 0, json.dumps({k: ref[k] for k in ("homeSections", "pluginScripts")})[:300])
        check("reference run reported playback", isinstance(ref["reporting"], list) and len(ref["reporting"]) >= 1, str(ref["reporting"])[:200])
        for mode in ("baseline", "styled"):
            r = results[mode]
            layer = "engine bug" if mode == "baseline" else "theme gap"
            check(f"{mode}: engine actually on", r["themed"] is True)
            for key in ("homeSections", "homeSectionCount", "drawer", "userMenu", "pluginScripts", "playMethod"):
                check(f"{mode}: {key} same as engine off", r[key] == ref[key], "" if r[key] == ref[key] else f"({layer}) off={ref[key]} {mode}={r[key]}")
            rows = r["reporting"] if isinstance(r["reporting"], list) else []
            check(f"{mode}: Playback Reporting row with Icefin's client name", any("Icefin" in json.dumps(x) for x in rows), str(rows)[:200])
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
    json.dump({"server": a.server, "results": results, "ok": not fails, "failures": fails}, open(os.path.join(a.out, "theme_plugins.json"), "w"), indent=1)
    print(f"theme_plugins[{a.server}]:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
