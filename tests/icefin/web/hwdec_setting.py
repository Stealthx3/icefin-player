#!/usr/bin/env python3
"""hwdec_setting.py — Icefin's hardware decoding choices in the running app (PLAN 4.2). Lab guests only.

Checks that Client Settings → Video → Hardware Decoding offers Icefin's six choices (default Auto), and that an
upstream value saved before Icefin (enabled / disabled) is migrated to Auto / Off the first time it's applied.
Usage: python3 hwdec_setting.py --app ~/build/src/icefin-player
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_play import launch, start_x  # noqa: E402
from cdp import Page  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--port", type=int, default=9229)
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
