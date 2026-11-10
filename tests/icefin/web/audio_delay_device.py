#!/usr/bin/env python3
"""audio_delay_device.py — check that the audio delay follows the output device (PLAN 3.7). Lab guests only.

Drives the running app's settings over the WebChannel (window.api.settings), as the web client does:
  1. on device A set audio_delay.normal = 100;
  2. switch to device B (first time): the delay stays 100; set it to 250 and 24 Hz to 40;
  3. back to A: 100 and 0; to B again: 250 and 40.
The device names need not exist: Icefin keys the delay by the user's choice, and upstream falls back to
"auto" for playback when a device is missing.

Usage: python3 audio_delay_device.py --app ~/build/src/icefin-player [--server jf1011]
Exit 0 when every step matches.
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

GET = "new Promise(r => window.api.settings.value({s!r}, {k!r}, r))"
SET = "new Promise(r => window.api.settings.setValue({s!r}, {k!r}, {v}, () => r(true)))"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf1011")
    ap.add_argument("--port", type=int, default=9223)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    srv = Server(cfg)
    srv.wait()

    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-delay-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []
    try:
        page = Page(a.port, timeout=90)
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; "
                  "document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("!!window.api && !!window.api.settings", timeout=90)

        get = lambda s, k: page.eval(GET.format(s=s, k=k))
        put = lambda s, k, v: (page.eval(SET.format(s=s, k=k, v=json.dumps(v))), time.sleep(0.5))
        dev = lambda d: put("audio", "device", d)

        def expect(label, normal, hz24):
            got = (get("video", "audio_delay.normal"), get("video", "audio_delay.24hz"))
            ok = float(got[0]) == normal and float(got[1]) == hz24
            print(f"audio_delay_device: {'ok  ' if ok else 'FAIL'} {label}: normal={got[0]} 24hz={got[1]} (want {normal}, {hz24})")
            if not ok:
                fails.append(label)

        dev("lab/device-a")
        put("video", "audio_delay.normal", 100)
        expect("A set", 100, 0)
        dev("lab/device-b")
        expect("B first time inherits A", 100, 0)
        put("video", "audio_delay.normal", 250)
        put("video", "audio_delay.24hz", 40)
        dev("lab/device-a")
        expect("back to A", 100, 0)
        dev("lab/device-b")
        expect("B again", 250, 40)
        store = get("state", "icefin_audio_delays")
        print("audio_delay_device: store", store)
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        if xv:
            xv.terminate()
    log.close()
    print("audio_delay_device:", "OK" if not fails else f"FAILED {fails}", "- log:", log.name)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
