#!/usr/bin/env python3
"""log_redaction.py — no secret reaches a log (PLAN 11.2). Lab guests only.

Signs in, plays an item, picks a theme (DisplayPreferences sync) and turns it off again. Then it searches every log
the app wrote for the literal secrets: the lab user's password, and every access token the server has issued to that
user (the app's own included). The app's stdout and the profile log files under --config-dir are both searched
(not QtWebEngine's storage, where jellyfin-web keeps its sign-in by design).
Usage: python3 log_redaction.py --app ~/build/src/icefin-player --server jf12
"""
import argparse, glob, json, os, signal, sys, tempfile, time

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
    ap.add_argument("--port", type=int, default=9235)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-redact-")
    out = open(os.path.join(cfgdir, "stdout.log"), "w")
    app = launch(a.app, a.port, cfgdir, out, "xcb", ["--log-level=debug"])
    fails = []

    def check(label, ok, detail=""):
        print(f"log_redaction: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    app_token = None
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
        page.wait_for("!!window.ApiClient && !!window.ApiClient.accessToken() && !!window.icefinThemeSync && window.icefinThemeSync.user() !== null", timeout=90)
        app_token = page.eval("window.ApiClient.accessToken()")
        sess = None
        for _ in range(30):
            cands = [s for s in srv.call("GET", "/Sessions?activeWithinSeconds=120") if s.get("UserName") == cred["user"] and s.get("SupportsRemoteControl")]
            if cands:
                sess = cands[0]
                break
            time.sleep(2)
        uid = srv.call("GET", "/Users/Me")["Id"]
        item = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]["Id"]
        srv.call("POST", f"/Sessions/{sess['Id']}/Playing?playCommand=PlayNow&itemIds={item}")
        time.sleep(15)
        srv.call("POST", f"/Sessions/{sess['Id']}/Playing/Stop")
        time.sleep(3)
        call = lambda f, *args: page.eval("new Promise(r => window.api.theme.%s(%sr))" % (f, "".join(json.dumps(x) + ", " for x in args)))
        call("setActiveTheme", "baseline", "")
        time.sleep(3)
        call("setActiveTheme", "", "")
        time.sleep(3)
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
        out.close()
    secrets = {"password": cred["password"], "admin token (this test)": srv.token}
    if app_token:
        secrets["app access token"] = app_token
    logs = [os.path.join(cfgdir, "stdout.log")] + glob.glob(os.path.join(cfgdir, "**", "*.log"), recursive=True)
    # QtWebEngine's storage (Local Storage leveldb "*.log" journals) is the browser's own data, where jellyfin-web keeps
    # its sign-in by design; it is not a log.
    logs = sorted(f for f in set(logs) if os.sep + "QtWebEngine" + os.sep not in f)
    check("app access token captured for the search", bool(app_token))
    total = sum(os.path.getsize(f) for f in logs)
    check("logs written", total > 10000, f"{len(logs)} files, {total} bytes")
    for name, value in secrets.items():
        hits = [os.path.relpath(f, cfgdir) for f in logs if value and value in open(f, errors="replace").read()]
        check(f"{name} in no log", not hits, f"found in {hits}" if hits else "")
    print("log_redaction:", "OK" if not fails else f"FAILED {fails}", "- logs:", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
