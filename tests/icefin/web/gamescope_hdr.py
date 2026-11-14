#!/usr/bin/env python3
"""gamescope_hdr.py — Icefin under Gamescope, headless (PLAN 11.5 option D, SPEC "Gamescope"). Lab guests only.

Gamescope's headless backend with HDR forced on stands in for Steam's game mode on an HDR TV (Bazzite, a Deck on a
TV). Icefin runs inside it as Gamescope runs apps, through its Xwayland, with Gamescope's WSI Vulkan layer, the
Vulkan renderer and lavapipe. Per routing row the test checks what Icefin hands Gamescope:
  hdr-idle     HDR display, nothing playing: the display reads as HDR from the swapchain's colour spaces; HDR10 output;
  hdr-hdr10    the HDR10 film: the router picks HDR output; VK_EXT_hdr_metadata on the swapchain carries the film's
               mastering primaries and 0.0001-1000 nits, MaxCLL 1000, MaxFALL 400 (make-media.sh's values);
  hdr-hlg      the HLG film: HDR output; the metadata is the BT.2020 container (HLG has no mastering metadata);
  hdr-dv81     Dolby Vision 8.1 (make-hdr-media.sh): HDR output with the HDR10 base layer's mastering metadata;
  sdr-display  Gamescope without HDR: SDR output, the HDR10 film tone-mapped;
  hdr-off      HDR display with HDR Output off: SDR output, tone-mapped.
It shows what Icefin sends Gamescope; what a TV makes of it is beta row H4 (docs/BETA-CHECKLIST.md).
Needs: Gamescope built in the lab (GAMESCOPE, default ~/gamescope-lab: docs/LAB.md "Gamescope"), an Icefin build with
the patched libmpv (LD_LIBRARY_PATH as in LAB.md), the lab servers with make-media.sh's and make-hdr-media.sh's films.
Usage: LD_LIBRARY_PATH=~/mpv-icefin/lib/x86_64-linux-gnu python3 gamescope_hdr.py --app ~/build-vk/src/icefin-player
       [--server jf12] [--rows hdr-idle,hdr-hdr10]
"""
import argparse, json, os, re, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

LOAD = """(() => {
  window.labPlaying = false;
  if (!window.labHooked) { window.labHooked = true; window.api.player.playing.connect(() => { window.labPlaying = true; }); }
  window.api.player.load(%s, {startMilliseconds: 1000, autoplay: true},
    {type: 'video', headers: {}, metadata: {Id: 'lab', Name: 'Lab clip', ServerId: 'lab'}, media: {},
     icefinMediaSource: {MediaStreams: [{Type: 'Video', VideoRangeType: %s}]}}, -1, -1);
  return true; })()"""

ROWS = {
    #             display  hdr setting  film              range
    "hdr-idle":    ("hdr", "auto", None, None),
    "hdr-hdr10":   ("hdr", "auto", "HDR10 HEVC", "HDR10"),
    "hdr-hlg":     ("hdr", "auto", "HLG HEVC", "HLG"),
    "hdr-dv81":    ("hdr", "auto", "DV P8.1 HEVC", "DOVIWithHDR10"),
    "sdr-display": ("sdr", "auto", "HDR10 HEVC", "HDR10"),
    "hdr-off":     ("hdr", "off", "HDR10 HEVC", "HDR10"),
}
METADATA = re.compile(r"HDR metadata on the swapchain: mastering ([0-9.e-]+)-([0-9.]+) nits, (mastering primaries|BT\.2020 container), "
                      r"MaxCLL (\d+), MaxFALL (\d+)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9249)
    ap.add_argument("--rows", default=",".join(ROWS))
    a = ap.parse_args()
    gs_root = os.path.expanduser(os.environ.get("GAMESCOPE", "~/gamescope-lab"))
    gs_lib = os.path.join(gs_root, "lib", "x86_64-linux-gnu")
    layer_dir = os.path.join(gs_root, "share", "vulkan", "implicit_layer.d")
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]

    def film(term):
        items = srv.call("GET", f"/Items?Recursive=true&searchTerm={term.replace(' ', '%20')}&userId={uid}&IncludeItemTypes=Movie")["Items"]
        return f"{srv.base}/Videos/{items[0]['Id']}/stream?static=true&api_key={srv.token}" if items else None

    out = tempfile.mkdtemp(prefix="icefin-gamescope-")
    # Started through a symlink: other lab sessions clear stray apps with pkill -x icefin-player.
    binary = os.path.join(out, "icefin-gamescope")
    os.symlink(os.path.abspath(os.path.expanduser(a.app)), binary)
    runtime = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    fails = []

    def check(label, ok, detail=""):
        print(f"gamescope_hdr: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    for row in a.rows.split(","):
        display, hdr_setting, film_term, rng = ROWS[row]
        d = os.path.join(out, row)
        os.makedirs(d)
        applog, gslog = os.path.join(d, "app.log"), os.path.join(d, "gamescope.log")
        # The app's environment inside Gamescope: Gamescope's WSI layer (its X11 HDR path), the Vulkan renderer on
        # lavapipe, the patched libmpv; not Gamescope's own private libraries.
        child = ["env", f"VK_ADD_IMPLICIT_LAYER_PATH={layer_dir}", "ENABLE_GAMESCOPE_WSI=1", "QT_QPA_PLATFORM=xcb",
                 "ICEFIN_RENDERER=vulkan", "ICEFIN_RENDERER_ALLOW_SOFTWARE=1", f"ICEFIN_HDR_OUTPUT={hdr_setting}",
                 f"LD_LIBRARY_PATH={os.environ.get('LD_LIBRARY_PATH', '')}", "LC_ALL=C.UTF-8",
                 "sh", "-c", f'exec "$0" "$@" > {applog} 2>&1', binary, f"--config-dir={d}/config", "--windowed", "--desktop",
                 f"--remote-debugging-port={a.port}", "--log-level=info"]
        gs = [os.path.join(gs_root, "bin", "gamescope"), "--backend", "headless", "-W", "1920", "-H", "1080"]
        if display == "hdr":
            gs += ["--hdr-enabled", "--hdr-debug-force-support"]
        genv = dict(os.environ, PATH=os.path.join(gs_root, "bin") + ":" + os.environ["PATH"], LD_LIBRARY_PATH=gs_lib,
                    XDG_RUNTIME_DIR=runtime)
        g = subprocess.Popen(gs + ["--"] + child, env=genv, stdout=open(gslog, "w"), stderr=subprocess.STDOUT, start_new_session=True)
        decision, comp, playing = {}, {}, False
        try:
            page = Page(a.port, timeout=120)
            page.wait_for("!!window.api && !!window.api.player && !!window.api.router", timeout=120)
            time.sleep(4)
            if film_term:
                url = film(film_term)
                check(f"{row}: the film '{film_term}' is on the server", bool(url))
                if url:
                    page.eval(LOAD % (json.dumps(url), json.dumps(rng)))
                    page.wait_for("window.labPlaying === true", timeout=120)
                    playing = True
                    time.sleep(8)  # the metadata poll runs every second; lavapipe decodes 10-bit HEVC slowly
                decision = page.eval(f"new Promise(r => window.api.router.decide({json.dumps(rng)}, m => r(m)))") or {}
            comp = page.eval("new Promise(r => window.api.router.compositor(m => r(m)))") or {}
        except Exception as e:  # noqa: BLE001
            check(f"{row}: run", False, f"{type(e).__name__}: {e}")
        finally:
            try:
                os.killpg(g.pid, signal.SIGTERM)
                g.wait(20)
            except Exception:  # noqa: BLE001
                os.killpg(g.pid, signal.SIGKILL)
            time.sleep(1)
        t = open(applog, errors="replace").read() if os.path.exists(applog) else ""
        disp = next((l for l in t.splitlines() if l.startswith("Icefin display:")), "")
        md = METADATA.findall(t)
        if display == "hdr" and hdr_setting == "auto":
            check(f"{row}: the display reads as HDR (swapchain colour spaces through Gamescope's layer)", disp.startswith("Icefin display: HDR"), disp[:160])
            check(f"{row}: HDR10 swapchain, HDR output on", comp.get("output") == "hdr10" and comp.get("tagged") is True,
                  f"output={comp.get('output')} tagged={comp.get('tagged')} reason={comp.get('hdrReason')}")
            if rng:
                check(f"{row}: router picks HDR output", decision.get("output") == "HDR output", decision.get("reason", ""))
            if rng in ("HDR10", "DOVIWithHDR10"):
                # Dolby Vision 8.1: mpv takes the range from the RPU (PQ-coded): 0.000104-1001 nits for the film's 0.0001-1000.
                lo_max, hi_ok = (0.00011, ("1000", "1001")) if rng.startswith("DOVI") else (0.0001 + 1e-9, ("1000",))
                ok = any(float(lo) <= lo_max and hi in hi_ok and src == "mastering primaries" and cll == "1000" and fall == "400"
                         for lo, hi, src, cll, fall in md)
                check(f"{row}: VK_EXT_hdr_metadata with the film's mastering display, MaxCLL 1000, MaxFALL 400", ok, str(md[-1:]))
            elif rng == "HLG":
                check(f"{row}: VK_EXT_hdr_metadata: the BT.2020 container, no content light levels", any(src == "BT.2020 container" for _, _, src, _, _ in md), str(md[-1:]))
        else:
            check(f"{row}: SDR output, no HDR metadata", comp.get("output") != "hdr10" and not md,
                  f"output={comp.get('output')} reason={comp.get('hdrReason')} metadata={md[-1:]}")
            if hdr_setting == "off":
                check(f"{row}: the reason is the setting, not the display", "off in the settings" in (comp.get("hdrReason") or ""),
                      f"reason={comp.get('hdrReason')}; {disp[:100]}")
            if rng:
                check(f"{row}: HDR10 routed as tone-mapped SDR", decision.get("output") == "tone-mapped SDR", decision.get("reason", ""))
        if film_term:
            check(f"{row}: the film plays", playing)
        check(f"{row}: no Vulkan device loss or crash", "VK_ERROR_DEVICE_LOST" not in t and "Segmentation fault" not in t)

    print("gamescope_hdr:", "OK" if not fails else f"FAILED {fails}", "- logs:", out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
