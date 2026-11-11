#!/usr/bin/env python3
"""vaapi_import.py — VA-API decode with zero-copy DMA-BUF import on the Vulkan path (PLAN 5.3, D28).

The lab's virtual GPU has no video decoder, so this runs on the workstation: its NVIDIA GPU through
nvidia-vaapi-driver (Flathub's org.freedesktop.Platform.VAAPI.nvidia extension), which implements VA-API on NVDEC
and exports DMA-BUFs. mpv's `vaapi` hwdec and Icefin's DMA-BUF import then run the same code as on AMD and Intel
(docs/dev/HARDWARE-SIMULATION.md, option V1). Real AMD and Intel stay in docs/BETA-CHECKLIST.md (V1, V2).

With Renderer = Vulkan and Hardware Decoding = VA-API, for each clip (H.264, HDR10 HEVC 10-bit, AV1):
  1. mpv decodes with `vaapi`, not `vaapi-copy` and not software (the app log carries mpv's own line);
  2. frames reach the scene graph on the Vulkan path (zero-copy: no copy-back decoder is chosen);
  3. playback runs for a few seconds without mpv reporting a hwdec or interop error.
Each clip runs in a fresh app. NVIDIA's Vulkan driver has no DRM modifiers for 16-bit formats (r16), so 10-bit
(p010) surfaces can't be imported there: on this GPU the HDR10 clip is reported as not testable, not failed (AMD
and Intel import p010 through Mesa; docs/BETA-CHECKLIST.md V1, V2).
Usage (on the workstation, the lab's servers reached at the guest's address; nothing is built on the host):
  ICEFIN_SERVER_HOST=<lab ip> ICEFIN_JF_DIR=<dir with creds.json> \\
  ICEFIN_FLATPAK_ENV=LIBVA_DRIVER_NAME=nvidia,NVD_BACKEND=direct \\
  python3 tests/icefin/web/vaapi_import.py --app flatpak:io.github.stealthx3.IcefinPlayer --qpa session
"""
import argparse, json, os, re, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

CLIPS = [("SDR H264 AAC", "H.264 8-bit"), ("HDR10 HEVC AC3", "HEVC 10-bit HDR10"), ("SDR AV1 Opus", "AV1")]

LOAD = """(() => {
  window.labPlaying = false;
  if (!window.labHooked) { window.labHooked = true; window.api.player.playing.connect(() => { window.labPlaying = true; }); }
  window.api.player.load(%s, {startMilliseconds: 2000, autoplay: true},
    {type: 'video', headers: {}, metadata: {Id: 'lab', Name: 'Lab clip', ServerId: 'lab'}, media: {},
     icefinMediaSource: {MediaStreams: [{Type: 'Video', VideoRangeType: %s}]}}, -1, -1);
  return true; })()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9239)
    ap.add_argument("--qpa", default="session")
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    xv = start_x() if a.qpa != "session" else None
    cfgdir = tempfile.mkdtemp(prefix="icefin-vaapi-")
    fails, runs = [], []

    def check(label, ok, detail=""):
        print(f"vaapi_import: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def run(tag):
        path = os.path.join(cfgdir, f"app-{tag}.log")
        log = open(path, "w")
        app = launch(a.app, a.port, cfgdir, log, a.qpa, extra=["--log-level=debug"])
        runs.append((app, log))
        page = Page(a.port, timeout=90)
        page.wait_for("!!window.api && !!window.api.settings && !!window.api.player", timeout=90)
        return page, path

    def stop():
        app, log = runs[-1]
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        log.close()
        # A Flatpak instance takes a moment to go; the next launch needs the DevTools port free.
        for _ in range(40):
            if subprocess.run(["pgrep", "-x", "icefin-player"], capture_output=True).returncode != 0:
                break
            time.sleep(0.5)
        time.sleep(1.5)

    text = lambda p: open(p, errors="replace").read()
    try:
        page, path = run("setup")
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'vulkan', () => r(true)))")
        page.eval("new Promise(r => window.api.settings.setValue('video', 'hardwareDecoding', 'vaapi', () => r(true)))")
        time.sleep(1)
        stop()
        for name, what in CLIPS:
            page, path = run("vaapi-" + what.split()[0].lower().replace(".", ""))
            check(f"{what}: Vulkan path", "Icefin video: Vulkan path" in text(path) or (time.sleep(3) or "Icefin video: Vulkan path" in text(path)))
            items = srv.call("GET", f"/Items?Recursive=true&searchTerm={name.replace(' ', '%20')}&userId={uid}&IncludeItemTypes=Movie")["Items"]
            if not items:
                check(f"{what}: clip on the server", False, name)
                continue
            url = f"{srv.base}/Videos/{items[0]['Id']}/stream?static=true&api_key={srv.token}"
            mark = len(text(path))
            page.eval(LOAD % (json.dumps(url), json.dumps("HDR10" if "HDR10" in name else "SDR")))
            try:
                page.wait_for("window.labPlaying === true", timeout=60)
                playing = True
            except Exception:  # noqa: BLE001
                playing = False
            time.sleep(6)
            t = text(path)[mark:]
            if "10-bit" in what and "not available for format r16" in text(path):
                print(f"vaapi_import: skip {what}: this GPU's Vulkan driver can't import 16-bit DMA-BUFs (no r16 modifiers)", flush=True)
                stop()
                continue
            hw = re.findall(r"Using hardware decoding \(([^)]+)\)", t)
            soft = "Using software decoding" in t or re.search(r"Falling back to software decoding", t) is not None
            check(f"{what}: plays", playing)
            check(f"{what}: decoded by vaapi, zero-copy (not vaapi-copy, not software)", hw[-1:] == ["vaapi"] and not soft,
                  f"hwdec={hw} software={soft}")
            errs = [l for l in t.splitlines() if re.search(r"(vaapi|hwdec|interop|dmabuf|DRM PRIME).*(error|fail)", l, re.I)]
            check(f"{what}: no hwdec or interop errors", not errs, " | ".join(errs[:3]))
            m = re.search(r"Icefin video: first frame on the Vulkan path QSize\((\d+), (\d+)\)", text(path))
            check(f"{what}: frames reach the scene graph", bool(m), m.group(0) if m else "")
            page.eval("window.api.player.stop(); true")
            time.sleep(2)
            stop()
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
        try:
            if runs and runs[-1][0].poll() is None:
                stop()
        except Exception:  # noqa: BLE001
            pass
    finally:
        if xv:
            xv.terminate()
    print("vaapi_import:", "OK" if not fails else f"FAILED {fails}", "->", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
