#!/usr/bin/env python3
"""diagnostics_report.py — Client Settings -> Hardware -> Copy report (PLAN 11.4). Lab guests only.

Signs in, plays an item by remote command and, while it plays, copies the report twice: through api.hardware and with
the button in Client Settings -> Hardware. Checks the report's sections, that it holds the playback (now playing, the
router's decision and the player's state lines in the recent log), that the clipboard got the same text (xclip, when
the guest has it), and that no secret or personal detail is in it: the password, the access tokens, the server's
address, the home directory and the host name.
Usage: python3 diagnostics_report.py --app ~/build/src/icefin-player --server jf12
"""
import argparse, json, os, shutil, signal, socket, subprocess, sys, tempfile, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

SECTIONS = ["# Icefin Player diagnostics report", "## Summary", "- **Renderer**:", "- **Decode**:", "- **Display**:", "- **Audio**:",
            "- **Versions**:", "## Screens", "## Now playing", "## Recent log", "## Capability model", "## Audio", "## Web layer", "## Settings"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9236)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-diag-")
    out = open(os.path.join(cfgdir, "stdout.log"), "w")
    app = launch(a.app, a.port, cfgdir, out, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"diagnostics_report: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    api_report, ui_report, clip, app_token = "", "", None, None
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
        page.wait_for("!!window.ApiClient && !!window.ApiClient.accessToken() && !!window.api && !!window.api.hardware", timeout=90)
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
        time.sleep(12)
        api_report = page.eval("new Promise(r => window.api.hardware.copyReport(r))") or ""
        if shutil.which("xclip"):
            try:
                clip = subprocess.run(["xclip", "-o", "-selection", "clipboard"], env=dict(os.environ, DISPLAY=":99"),
                                      capture_output=True, text=True, timeout=10).stdout
            except Exception as e:  # noqa: BLE001
                clip = f"xclip failed: {e}"
        srv.call("POST", f"/Sessions/{sess['Id']}/Playing/Stop")
        time.sleep(3)
        page.eval("window.NativeShell.openClientSettings(); true")
        page.wait_for("!!document.querySelector('#icefin-hardware-section .icefin-hw-report')", timeout=30)
        page.eval("document.querySelector('#icefin-hardware-section .icefin-hw-report').click(); true")
        page.wait_for("(document.querySelector('#icefin-hardware-section .icefin-hw-report-text') || {}).value", timeout=20)
        ui_report = page.eval("document.querySelector('#icefin-hardware-section .icefin-hw-report-text').value")
        check("the button shows the report", ui_report.startswith("# Icefin Player diagnostics report"), ui_report[:60])
        check("the button's note says it was copied",
              "Copied" in page.eval("document.querySelector('#icefin-hardware-section .icefin-hw-report-note').textContent"))
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

    with open(os.path.join(cfgdir, "report-playing.md"), "w") as f:
        f.write(api_report)
    with open(os.path.join(cfgdir, "report-button.md"), "w") as f:
        f.write(ui_report)
    missing = [s for s in SECTIONS if s not in api_report]
    check("every section", not missing, f"missing {missing}" if missing else f"{len(api_report)} characters")
    now = api_report.split("## Now playing", 1)[-1].split("## Recent log", 1)[0]
    check("now playing filled while playing", "```" in now and "Codec:" in now, now.strip()[:80])
    recent = api_report.split("## Recent log", 1)[-1].split("## Capability model", 1)[0]
    check("recent log has the router's decision", "Icefin router:" in recent)
    check("recent log has the player's state", "Entering state: playing" in recent)
    check("settings section has audio and video", '"audio"' in api_report.split("## Settings", 1)[-1] and '"video"' in api_report.split("## Settings", 1)[-1])
    check("URLs keep their path with the host masked", "://[server]/" in api_report)
    if clip is None:
        print("diagnostics_report: skip clipboard (no xclip in this guest)", flush=True)
    else:
        check("clipboard holds the report", clip.strip() == api_report.strip(), f"{len(clip)} vs {len(api_report)} characters")
    host = urllib.parse.urlsplit(srv.base).hostname
    port = str(urllib.parse.urlsplit(srv.base).port or "")
    secrets = {"password": cred["password"], "admin token": srv.token, "app access token": app_token,
               "server address": f"{host}:{port}" if port else host, "home directory": os.path.expanduser("~"),
               "host name": socket.gethostname()}
    for name, value in secrets.items():
        if not value:
            check(f"{name} known for the search", False)
            continue
        for label, text in (("API", api_report), ("button", ui_report)):
            check(f"no {name} in the {label} report", value not in text)
    log = open(os.path.join(cfgdir, "stdout.log"), errors="replace").read()
    check("copy logged", "diagnostics report copied" in log)
    print("diagnostics_report:", "OK" if not fails else f"FAILED {fails}", "- reports:", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
