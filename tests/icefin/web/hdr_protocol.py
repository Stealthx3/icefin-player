#!/usr/bin/env python3
"""hdr_protocol.py — the virtual HDR display (PLAN 5.10, SPEC "Testing" protocol test, Virtual AV tier HDR half).

A headless Weston 15+ with color management stands in for the display. Per routing row it is started as an HDR
output (PQ, BT.2020) or an SDR one, Icefin's Flatpak runs on it with the Vulkan renderer (Flatpak Mesa's lavapipe
offers HDR10 on Wayland) and a Wayland protocol log (WAYLAND_DEBUG=client), and the test checks what Icefin told the
compositor about its surface:
  hdr-idle     HDR display, nothing playing: HDR10 swapchain; the surface tagged PQ / BT.2020 with the reference white,
               no mastering metadata;
  hdr-hdr10    the HDR10 film: the router picks HDR output; the tag gains the film's mastering display primaries and
               luminance, MaxCLL and MaxFALL, exactly as make-media.sh wrote them;
  hdr-hlg      the HLG film: HDR output; the surface stays PQ (the compositor pass encodes PQ);
  sdr-display  SDR display: HDR output not requested, no colour-management surface, HDR10 routed as tone-mapped SDR;
  hdr-off      HDR display with HDR Output off: not requested, no colour-management surface.
It shows what Icefin sends; what a TV does with it is the hardware lab's job (5.8).
Needs: Weston 15+ built with color management (WESTON, default ~/weston-16/bin/weston), the app installed as a
Flatpak with the GL.default runtime extension, the lab's Jellyfin servers with make-media.sh's films.
Usage: python3 hdr_protocol.py [--server jf12] [--app io.github.stealthx3.IcefinPlayer] [--rows hdr-idle,hdr-hdr10]
"""
import argparse, glob, json, os, re, signal, subprocess, sys, tempfile, time

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
    #             display  hdr setting  film         range
    "hdr-idle":    ("hdr", "auto", None, None),
    "hdr-hdr10":   ("hdr", "auto", "HDR10 HEVC", "HDR10"),
    "hdr-hlg":     ("hdr", "auto", "HLG HEVC", "HLG"),
    "sdr-display": ("sdr", "auto", "HDR10 HEVC", "HDR10"),
    "hdr-off":     ("hdr", "off", None, None),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--app", default="io.github.stealthx3.IcefinPlayer")
    ap.add_argument("--port", type=int, default=9242)
    ap.add_argument("--rows", default=",".join(ROWS))
    a = ap.parse_args()
    weston = os.environ.get("WESTON", os.path.expanduser("~/weston-16/bin/weston"))
    libdir = (glob.glob(os.path.join(os.path.dirname(os.path.dirname(weston)), "lib", "*-linux-gnu")) or [""])[0]
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]

    def film(term):
        items = srv.call("GET", f"/Items?Recursive=true&searchTerm={term.replace(' ', '%20')}&userId={uid}&IncludeItemTypes=Movie")["Items"]
        return f"{srv.base}/Videos/{items[0]['Id']}/stream?static=true&api_key={srv.token}" if items else None

    out = tempfile.mkdtemp(prefix="icefin-hdrproto-")
    runtime = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    fails = []

    def check(label, ok, detail=""):
        print(f"hdr_protocol: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    for row in a.rows.split(","):
        display, hdr_setting, film_term, rng = ROWS[row]
        d = os.path.join(out, row)
        os.makedirs(d)
        ini = os.path.join(d, "weston.ini")
        with open(ini, "w") as f:
            f.write("[core]\ncolor-management=true\n[output]\nname=headless\n")
            f.write("eotf-mode=st2084\ncolorimetry-mode=bt2020rgb\n" if display == "hdr" else "eotf-mode=sdr\ncolorimetry-mode=default\n")
        sock = f"wl-icefin-hdr-{row}"
        wenv = dict(os.environ, LD_LIBRARY_PATH=libdir, XDG_RUNTIME_DIR=runtime)
        w = subprocess.Popen([weston, f"--config={ini}", "--backend=headless", "--renderer=gl", "--width=1920", "--height=1080",
                              f"--socket={sock}", f"--log={d}/weston.log"], env=wenv, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        time.sleep(3)
        applog = os.path.join(d, "app.log")
        env = dict(os.environ, WAYLAND_DISPLAY=sock, WAYLAND_DEBUG="client", XDG_RUNTIME_DIR=runtime)
        cmd = ["flatpak", "run", "--user", "--socket=wayland", "--nosocket=x11", "--env=QT_QPA_PLATFORM=wayland",
               "--env=ICEFIN_RENDERER=vulkan", "--env=ICEFIN_RENDERER_ALLOW_SOFTWARE=1", f"--env=ICEFIN_HDR_OUTPUT={hdr_setting}",
               a.app, f"--config-dir=/var/tmp/icefin-hdrproto-{row}", f"--remote-debugging-port={a.port}", "--log-level=info"]
        app = subprocess.Popen(cmd, env=env, stdout=open(applog, "w"), stderr=subprocess.STDOUT, start_new_session=True)
        decision = {}
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
                    time.sleep(8)  # the metadata poll runs every second; lavapipe decodes 10-bit HEVC slowly
                decision = page.eval(f"new Promise(r => window.api.router.decide({json.dumps(rng)}, m => r(m)))") or {}
            comp = page.eval("new Promise(r => window.api.router.compositor(m => r(m)))") or {}
        except Exception as e:  # noqa: BLE001
            check(f"{row}: run", False, f"{type(e).__name__}: {e}")
            comp = {}
        finally:
            # A graceful quit: flatpak kill leaves Qt WebEngine's helper sandboxes behind.
            subprocess.run(["pkill", "-TERM", "-x", "icefin-player"], capture_output=True)
            for _ in range(20):
                if subprocess.run(["pgrep", "-x", "icefin-player"], capture_output=True).returncode:
                    break
                time.sleep(0.5)
            subprocess.run(["flatpak", "kill", a.app], capture_output=True)
            try:
                app.wait(15)
            except Exception:  # noqa: BLE001
                pass
            w.send_signal(signal.SIGTERM)
            w.wait(10)
            time.sleep(1)
        t = open(applog, errors="replace").read()
        reqs = [l.split("-> ", 1)[1] for l in t.splitlines() if "-> wp_" in l and re.search(r"wp_color_manager_v1#\d+\.get_surface|creator_params_v1|set_image_description", l)]
        open(os.path.join(d, "protocol.txt"), "w").write("\n".join(reqs) + "\n")
        got_surface = any(".get_surface(" in r and "wp_color_management_surface_v1" in r for r in reqs)
        weston_hdr = "attempts EOTF mode ST2084" in open(os.path.join(d, "weston.log"), errors="replace").read()
        check(f"{row}: Weston output is {display.upper()}", weston_hdr == (display == "hdr"))
        if display == "hdr" and hdr_setting == "auto":
            check(f"{row}: HDR10 swapchain, HDR output on", comp.get("output") == "hdr10" and comp.get("tagged") is True,
                  f"output={comp.get('output')} tagged={comp.get('tagged')} reason={comp.get('hdrReason')}")
            check(f"{row}: surface tagged PQ / BT.2020 / reference white",
                  got_surface and any("set_tf_named(11)" in r for r in reqs) and any("set_primaries_named(6)" in r for r in reqs)
                  and any(re.search(r"set_luminances\(50, 10000, \d+\)", r) for r in reqs) and any("set_image_description(" in r for r in reqs))
            mastering = [r for r in reqs if "set_mastering_display_primaries" in r]
            if row == "hdr-hdr10":
                check(f"{row}: router picks HDR output", decision.get("output") == "HDR output", decision.get("reason", ""))
                check(f"{row}: the film's mastering primaries", any("set_mastering_display_primaries(680000, 320000, 265000, 690000, 150000, 60000, 312700, 329000)" in r for r in mastering),
                      mastering[-1] if mastering else "none")
                check(f"{row}: mastering luminance 0.0001-1000 nits", any("set_mastering_luminance(1, 1000)" in r for r in reqs))
                check(f"{row}: MaxCLL 1000, MaxFALL 400", any("set_max_cll(1000)" in r for r in reqs) and any("set_max_fall(400)" in r for r in reqs))
            elif row == "hdr-hlg":
                check(f"{row}: router picks HDR output", decision.get("output") == "HDR output", decision.get("reason", ""))
                check(f"{row}: no HDR10 mastering metadata", not mastering)
            else:
                check(f"{row}: no mastering metadata without a film", not mastering)
        else:
            check(f"{row}: HDR output not requested, no colour-management surface",
                  comp.get("hdrRequested") is False and not got_surface, f"reason={comp.get('hdrReason')}")
            if decision:
                check(f"{row}: HDR10 routed as tone-mapped SDR", decision.get("output") == "tone-mapped SDR", decision.get("reason", ""))
        check(f"{row}: no Wayland protocol error", "wl_display#1.error" not in t and "protocol error" not in t.lower())

    print("hdr_protocol:", "OK" if not fails else f"FAILED {fails}", "- logs:", out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
