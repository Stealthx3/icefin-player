#!/usr/bin/env python3
"""device_profile.py — the Auto device profile in the running app (PLAN 6.4). Lab guests only.

  1. With this machine's real self-test (the lab VM decodes all four samples in real time in software), Auto adds
     nothing: the profile equals upstream's.
  2. With a self-test result saying AV1 is too slow here, Auto asks the server to convert AV1 only.
  3. Upstream's force-transcode switches still apply on top (force_transcode_hevc).
  4. Turning Automatic Device Profile off drops the self-test codecs again.
Usage: python3 device_profile.py --app ~/build/src/icefin-player
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_play import launch, start_x  # noqa: E402
from cdp import Page  # noqa: E402

PROFILE = "JSON.stringify(window.NativeShell.AppHost.getDeviceProfile().CodecProfiles.filter(p => p.Codec).map(p => p.Codec))"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--port", type=int, default=9237)
    a = ap.parse_args()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-profile-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"device_profile: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("!!window.api && !!window.api.hardware && !!window.icefinDeviceProfile && !!window.NativeShell", timeout=90)
        js = page.eval
        setv = lambda sec, key, val: js("new Promise(r => window.api.settings.setValue(%s, %s, %s, () => r(true)))" % (json.dumps(sec), json.dumps(key), json.dumps(val)))
        js("window.api.hardware.run(); true")
        page.wait_for("new Promise(r => window.api.hardware.results(x => r(!x.running && (x.samples || []).length === 4)))", timeout=120)
        time.sleep(1)
        real = js("new Promise(r => window.api.hardware.results(x => r(JSON.stringify(x.transcode))))")
        check("real self-test: nothing to convert in the lab VM", real == "[]", real)
        check("Auto on, nothing slow: profile adds no codec rules", js(PROFILE) == "[]", js(PROFILE))

        fake = {"fingerprint": "lab", "time": "2026-11-08T00:00:00Z", "transcode": ["av1"],
                "samples": [{"codec": "av1", "ok": True, "hwdec": "", "speed": 0.6, "hardware": False, "realtime": False}]}
        setv("state", "icefin_hw_selftest", json.dumps(fake))
        js("location.reload(); true")
        time.sleep(6)
        page.reconnect()
        page.wait_for("!!window.icefinDeviceProfile && !!window.NativeShell && window.icefinDeviceProfile.transcodeCodecs().length === 1", timeout=60)
        check("slow AV1: the server converts AV1 only", js(PROFILE) == '["av1"]', js(PROFILE))
        setv("video", "force_transcode_hevc", True)
        time.sleep(1)
        codecs = json.loads(js(PROFILE))
        check("upstream switch still applies on top", "av1" in codecs and any("hevc" in c for c in codecs), str(codecs))
        setv("video", "icefin_auto_profile", False)
        time.sleep(1)
        codecs = json.loads(js(PROFILE))
        check("Auto off: self-test codecs dropped, switch kept", "av1" not in codecs and any("hevc" in c for c in codecs), str(codecs))
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
    print("device_profile:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
