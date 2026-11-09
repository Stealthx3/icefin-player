#!/usr/bin/env python3
"""audio_test_page.py — Client Settings -> Audio test in the running app (PLAN 3.8, software part). Lab guests only.

The lab VM has no sound card, so every clip must decode and come out as PCM (mpv's null output) with the right channel
count, and the decision must say why it isn't bitstreamed. With passthrough toggles on but no receiver, the decision
is checked once with HDMI device type and AC-3 passthrough on: the VM's output can't take a bitstream, and the page must
say so plainly. The bitstream itself is checked on the HTPC.
The receiver run (what the receiver shows) is an HTPC row.
Usage: python3 audio_test_page.py --app ~/build/src/icefin-player
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_play import launch, start_x  # noqa: E402
from cdp import Page  # noqa: E402

WANT = {"ac3": 6, "eac3": 6, "dts": 6, "truehd": 6, "lpcm71": 8}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--port", type=int, default=9242)
    a = ap.parse_args()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-audiotest-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"audio_test_page: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("!!window.api && !!window.api.audiotest && !!window.NativeShell", timeout=90)
        js = page.eval
        fmts = js("new Promise(r => window.api.audiotest.formats(r))")
        check("five formats offered", [f["id"] for f in fmts] == list(WANT), str([f["id"] for f in fmts]))
        js("window.NativeShell.openClientSettings(); true")
        page.wait_for("document.querySelectorAll('#icefin-audiotest-section .icefin-at-row').length === 5", timeout=20)
        check("Client Settings shows the Audio test rows", True)
        js("window.labAt = {}; window.api.audiotest.result.connect(r => { window.labAt[r.id] = r; }); true")
        for fid, ch in WANT.items():
            js(f"document.querySelector('#icefin-audiotest-section .icefin-at-row[data-id={fid}] .icefin-at-play').click(); true")
            page.wait_for(f"!!window.labAt[{json.dumps(fid)}]", timeout=30)
            r = js(f"JSON.stringify(window.labAt[{json.dumps(fid)}])")
            r = json.loads(r)
            o = r.get("output", {})
            check(f"{fid}: played, PCM {ch} channels in the VM", r.get("ok") and str(o.get("channels")) == str(ch) and not str(o.get("format", "")).startswith("spdif"),
                  f"{o.get('format')} {o.get('channels')}ch ao={o.get('ao')} · {r['decision']['reason']}")
            time.sleep(0.5)
            shown = js(f"document.querySelector('#icefin-audiotest-section .icefin-at-row[data-id={fid}] .icefin-at-result').textContent")
            check(f"{fid}: result shown on the page", shown.startswith("Sent "), shown)
        # Passthrough on (HDMI, AC-3 enabled, "auto" device: no ELD, so the toggle is trusted): AC-3 goes out as a bitstream.
        for k, v in (("devicetype", "hdmi"), ("passthrough.ac3", True)):
            js("new Promise(r => window.api.settings.setValue('audio', %s, %s, () => r(true)))" % (json.dumps(k), json.dumps(v)))
        time.sleep(1)
        js("delete window.labAt.ac3; document.querySelector('#icefin-audiotest-section .icefin-at-row[data-id=ac3] .icefin-at-play').click(); true")
        page.wait_for("!!window.labAt.ac3", timeout=30)
        r = json.loads(js("JSON.stringify(window.labAt.ac3)"))
        o = r.get("output", {})
        # The VM has no sound device that takes a bitstream: the page must say so, not pretend.
        check("passthrough on: AC-3 decided as passthrough", r["decision"]["mode"] == "passthrough" and r["decision"]["spdif"] == "ac3")
        check("no bitstream-capable output in the VM: reported plainly",
              r.get("ok") is False and "didn't accept the ac3 bitstream" in r.get("error", ""), r.get("error", ""))
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
    print("audio_test_page:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
