#!/usr/bin/env python3
"""vulkan_video.py — video on the Vulkan path in the running app (PLAN 5.3).

With Renderer = Vulkan (needs the patched libmpv, external/mpv), checks:
  1. the UI runs on Icefin's shared Vulkan device and mpv's render context is created on it (gpu-next);
  2. an SDR clip plays: the player reports playing and mpv's frames reach the scene graph on the Vulkan path
     (the picture on screen is checked on real hardware: the lab's Xvfb doesn't composite the transparent web view
     over video, on either renderer, so a screen grab there proves nothing);
  3. the router routes as Vulkan, with the display treated as SDR until HDR output exists (5.4/5.5), and the
     compositor's description reaches mpv as its target-* options with none rejected (5.2, D23);
  4. a second load plays on the Vulkan path again;
  5. Renderer = OpenGL plays the same clip on MpvQt's path, as upstream (5.7 stays upstream's).
Lab: lavapipe via ICEFIN_RENDERER_ALLOW_SOFTWARE=1. Real GPU: --qpa session and a flatpak:<id> app.
Usage: python3 vulkan_video.py --app ~/build/src/icefin-player --server jf12 [--qpa xcb|session]
"""
import argparse, json, os, re, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

LOAD = """(() => {
  window.labPlaying = false;
  if (!window.labHooked) { window.labHooked = true; window.api.player.playing.connect(() => { window.labPlaying = true; }); }
  window.api.player.load(%s, {startMilliseconds: 2000, autoplay: true},
    {type: 'video', headers: {}, metadata: {Id: 'lab', Name: 'Lab clip', ServerId: 'lab'}, media: {},
     icefinMediaSource: {MediaStreams: [{Type: 'Video', VideoRangeType: 'SDR'}]}}, -1, -1);
  return true; })()"""




def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9238)
    ap.add_argument("--qpa", default="xcb")
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    item = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]["Id"]
    url = f"{srv.base}/Videos/{item}/stream?static=true&api_key={srv.token}"
    xv = start_x() if a.qpa != "session" else None
    cfgdir = tempfile.mkdtemp(prefix="icefin-vkvideo-")
    fails, runs = [], []

    def check(label, ok, detail=""):
        print(f"vulkan_video: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def run(tag):
        path = os.path.join(cfgdir, f"app-{tag}.log")
        log = open(path, "w")
        app = launch(a.app, a.port, cfgdir, log, a.qpa)
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
        time.sleep(1.5)

    text = lambda p: open(p, errors="replace").read()
    try:
        page, path = run("setup")
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'vulkan', () => r(true)))")
        time.sleep(1)
        stop()

        page, path = run("vulkan")
        check("UI on the shared Vulkan device", "Icefin renderer: Qt Quick renders on the shared Vulkan device" in text(path) or
              (time.sleep(3) or "Icefin renderer: Qt Quick renders on the shared Vulkan device" in text(path)))
        check("MpvVideoItem uses the Vulkan path", "Icefin video: Vulkan path" in text(path))
        check("GPU wait after each frame (Qt WebEngine frees web frames early)",
              "Icefin renderer: waiting for the GPU after each frame" in text(path))
        page.eval(LOAD % json.dumps(url))
        page.wait_for("window.labPlaying === true", timeout=60)
        time.sleep(4)
        t = text(path)
        check("mpv renders through gpu-next on the shared device", "Icefin video: mpv renders through gpu-next on the shared Vulkan device" in t)
        m = re.search(r"Icefin video: first frame on the Vulkan path QSize\((\d+), (\d+)\)", t)
        check("frames reach the scene graph", bool(m), m.group(0) if m else "")
        tgt = re.search(r"Icefin video: mpv target (.*)", t)
        check("the compositor's description reaches mpv's target (5.2, D23)", bool(tgt) and "target-prim=" in tgt.group(1)
              and "mpv rejected" not in t, tgt.group(1) if tgt else "")
        route = re.findall(r"Icefin router: SDR -> .*", t)
        check("router routes it on the Vulkan path", any("SDR" in r for r in route), route[-1] if route else "")
        before = len(re.findall(r"Icefin router: SDR -> ", text(path)))
        page.eval("window.api.player.stop(); true")
        time.sleep(1)
        page.eval(LOAD % json.dumps(url))
        page.wait_for("window.labPlaying === true", timeout=60)
        time.sleep(3)
        t2 = text(path)
        check("a second load plays on the Vulkan path (same video image, no new render context)",
              len(re.findall(r"Icefin router: SDR -> ", t2)) > before and t2.count("mpv renders through gpu-next on the shared Vulkan device") == 1)
        page.eval("window.api.player.stop(); true")
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'opengl', () => r(true)))")
        time.sleep(1)
        stop()

        page, path = run("opengl")
        page.eval(LOAD % json.dumps(url))
        page.wait_for("window.labPlaying === true", timeout=60)
        time.sleep(3)
        t = text(path)
        check("OpenGL: MpvQt's path, as upstream", "Icefin video: Vulkan path" not in t and "Icefin renderer: OpenGL (setting opengl)" in t)
        page.eval("window.api.player.stop(); true")
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'auto', () => r(true)))")
        time.sleep(1)
        stop()
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
        if runs:
            stop()
    finally:
        if xv:
            xv.terminate()
    print("vulkan_video:", "OK" if not fails else f"FAILED {fails}", "- logs:", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
