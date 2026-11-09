#!/usr/bin/env python3
"""hardware_selftest.py — the decoder self-test and Client Settings -> Hardware in the running app (PLAN 4.1).

Runs the self-test through api.hardware, checks all four samples decoded (in the lab VM: in software), that the
result is kept, and that Client Settings shows a Hardware section with one row per sample and a working
"Test again" button. Lab guests only.
Usage: python3 hardware_selftest.py --app ~/build/src/icefin-player
"""
import argparse, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_play import launch, start_x  # noqa: E402
from cdp import Page  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--port", type=int, default=9230)
    a = ap.parse_args()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-hw-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"hardware_selftest: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("!!window.api && !!window.api.hardware && !!window.NativeShell", timeout=90)
        results = lambda: page.eval("new Promise(r => window.api.hardware.results(r))")
        page.eval("window.api.hardware.run(); true")
        page.wait_for("new Promise(r => window.api.hardware.results(x => r(!x.running && (x.samples || []).length === 4)))", timeout=120)
        r = results()
        got = {s["codec"]: s for s in r["samples"]}
        check("four samples tested", sorted(got) == ["av1", "h264", "hevc", "vp9"], str(sorted(got)))
        check("all decoded to the end", all(s["ok"] for s in r["samples"]), str([(s["codec"], s["error"]) for s in r["samples"] if not s["ok"]]))
        check("speeds measured", all(s["speed"] > 0 for s in r["samples"]),
              ", ".join(f"{s['codec']} {s['hwdec'] or 'sw'} {s['speed']:.1f}x" for s in r["samples"]))
        check("fingerprint kept", bool(r.get("fingerprint")), r.get("fingerprint", ""))
        check("transcode list present", isinstance(r.get("transcode"), list), str(r.get("transcode")))
        page.eval("window.NativeShell.openClientSettings(); true")
        page.wait_for("document.querySelectorAll('#icefin-hardware-section .icefin-hw-row').length === 4", timeout=20)
        check("Client Settings shows Hardware with 4 rows", True)
        before = r["time"]
        time.sleep(1.2)
        page.eval("document.querySelector('#icefin-hardware-section .icefin-hw-run').click(); true")
        page.wait_for("new Promise(r => window.api.hardware.results(x => r(!x.running && x.time !== %r)))" % before, timeout=120)
        page.wait_for("document.querySelectorAll('#icefin-hardware-section .icefin-hw-row').length === 4", timeout=10)
        check("Test again re-runs and redraws", True)
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
    print("hardware_selftest:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
