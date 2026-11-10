#!/usr/bin/env python3
"""hwdec_setting.py — Icefin's hardware decoding choices in the running app (PLAN 4.2). Lab guests only.

Checks that Client Settings → Video → Hardware Decoding offers Icefin's six choices (default Auto), and that an
upstream value saved before Icefin (enabled / disabled) is migrated to Auto / Off the first time it's applied.
With --server: a change made while a video plays waits for the next load (switching mpv's decoder under the running
render path left the picture white), and the next load applies it.
Usage: python3 hwdec_setting.py --app ~/build/src/icefin-player [--server jf12]
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from cdp import Page  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--port", type=int, default=9229)
    ap.add_argument("--server", default="")
    a = ap.parse_args()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-hwdec-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"hwdec_setting: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("!!window.api && !!window.api.settings", timeout=90)
        get = lambda: page.eval("new Promise(r => window.api.settings.value('video', 'hardwareDecoding', r))")
        put = lambda v: page.eval("new Promise(r => window.api.settings.setValue('video', 'hardwareDecoding', %s, () => r(true)))" % json.dumps(v))
        desc = page.eval("new Promise(r => window.api.settings.settingDescriptions(r))")
        video = next(s for s in desc if s.get("key") == "video")
        hw = next(v for v in video["settings"] if v.get("key") == "hardwareDecoding")
        opts = [o.get("value") for o in hw.get("options") or []]
        check("six Icefin choices", opts == ["auto", "vaapi", "nvdec", "vulkan", "copy", "off"], f"options={opts}")
        check("default is Auto", get() == "auto", f"value={get()}")
        put("enabled")
        time.sleep(1.5)
        check("upstream 'enabled' migrates to auto", get() == "auto", f"value={get()}")
        put("disabled")
        time.sleep(1.5)
        check("upstream 'disabled' migrates to off", get() == "off", f"value={get()}")
        put("vaapi")
        time.sleep(1.0)
        check("Icefin choice kept", get() == "vaapi")

        if a.server:
            from setup import Server  # noqa: E402
            cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
            cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
            srv = Server(cfg)
            srv.wait()
            srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
            uid = srv.call("GET", "/Users/Me")["Id"]
            item = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]["Id"]
            url = f"{srv.base}/Videos/{item}/stream?static=true&api_key={srv.token}"
            logtext = lambda: open(os.path.join(cfgdir, "app.log"), errors="replace").read()
            deferred = lambda: logtext().count("applies to the next video")
            play = lambda: page.eval(
                "(() => { window.labPlaying = false; if (!window.labHooked) { window.labHooked = true; "
                "window.api.player.playing.connect(() => { window.labPlaying = true; }); } "
                "window.api.player.load(%s, {startMilliseconds: 0, autoplay: true}, {type: 'video', headers: {}, "
                "metadata: {Id: 'lab', Name: 'Lab clip', ServerId: 'lab'}, media: {}}, -1, -1); return true; })()" % json.dumps(url))
            put("auto")
            time.sleep(1.0)
            play()
            page.wait_for("window.labPlaying === true", timeout=30)
            time.sleep(2)
            before = deferred()
            put("off")
            time.sleep(1.5)
            check("a change while a video plays waits for the next video", deferred() == before + 1, f"deferrals {before} -> {deferred()}")
            page.eval("window.api.player.stop(); true")
            time.sleep(2)
            after = deferred()
            play()
            page.wait_for("window.labPlaying === true", timeout=30)
            time.sleep(2)
            check("the next load applies it (no deferral on load)", deferred() == after, f"deferrals {after} -> {deferred()}")
            page.eval("window.api.player.stop(); true")
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
    print("hwdec_setting:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
