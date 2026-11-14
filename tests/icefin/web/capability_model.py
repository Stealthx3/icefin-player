#!/usr/bin/env python3
"""capability_model.py — the client-side capability model in the running app (PLAN 6.7, D26).

Checks:
  1. OpenGL (Auto): router.capabilities() describes the renderer, the display, how each kind of video plays (Dolby
     Vision 5/8 asks: the capability prompt), the decoders and mpv's versions; icefinTheme.system is the frozen
     theme view of it, with no device paths or receiver names; the device profile reads its transcode list from it;
  2. OpenGL with a usable Vulkan GPU (the lab's lavapipe allowed): the prompt for Dolby Vision 5/8 offers "switch
     to Vulkan"; choosing it sets Renderer = Vulkan and restarts the app, which comes up on Vulkan with the
     compositor;
  3. the restarted app's model says Vulkan, and the router's change signal fires when the compositor changes.
Usage: python3 capability_model.py --app ~/build/src/icefin-player [--server jf12]
"""
import argparse, json, os, re, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

LOAD = """(() => {
  window.api.player.load(%s, {startMilliseconds: 1000, autoplay: true},
    {type: 'video', headers: {}, metadata: {Id: 'lab', Name: 'Lab clip', ServerId: 'lab'}, media: {},
     icefinMediaSource: {MediaStreams: [{Type: 'Video', VideoRangeType: 'DOVI'}]}}, -1, -1);
  return true; })()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9244)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    item = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]["Id"]
    url = f"{srv.base}/Videos/{item}/stream?static=true&api_key={srv.token}"
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-capmodel-")
    fails, runs = [], []

    def check(label, ok, detail=""):
        print(f"capability_model: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def run(tag, env=None):
        path = os.path.join(cfgdir, f"app-{tag}.log")
        log = open(path, "w")
        saved = dict(os.environ)
        os.environ.update(env or {})
        app = launch(a.app, a.port, cfgdir, log)
        os.environ.clear()
        os.environ.update(saved)
        runs.append((app, log))
        page = Page(a.port, timeout=120)
        page.wait_for("!!window.api && !!window.api.router && !!window.icefinTheme", timeout=120)
        return page, path

    def stop():
        # The name it runs under: a runner may start it through a symlink with another name (lab-matrix.py).
        name = os.path.basename(a.app)[:15]
        subprocess.run(["pkill", "-TERM", "-x", name], capture_output=True)
        for _ in range(30):
            if subprocess.run(["pgrep", "-x", name], capture_output=True).returncode:
                break
            time.sleep(0.5)
        for app, log in runs:
            try:
                app.wait(5)
            except Exception:  # noqa: BLE001
                pass
            log.close()
        runs.clear()
        time.sleep(2)

    caps = "new Promise(r => window.api.router.capabilities(m => r(m)))"
    try:
        # 1. OpenGL (Auto), Vulkan not offered: the lab's only Vulkan device is a software one.
        page, path = run("opengl")
        c = page.eval(caps)
        check("model describes the renderer", c.get("renderer", {}).get("api") == "opengl", json.dumps(c.get("renderer"))[:160])
        v = c.get("video", {})
        check("how each kind of video plays", set(v) >= {"SDR", "HDR10/HLG", "Dolby Vision 5/8", "Dolby Vision 7"}
              and v["Dolby Vision 5/8"]["output"] == "capability prompt" and v["SDR"]["output"] == "SDR",
              "; ".join(f"{k}: {x['output']}" for k, x in v.items()))
        check("mpv's versions", bool(c.get("versions", {}).get("mpv")) and bool(c.get("versions", {}).get("libplacebo")),
              json.dumps(c.get("versions")))
        check("decoders from the self-test", "transcode" in c.get("decoders", {}), json.dumps(c.get("decoders", {}).get("hwdec")))
        page.wait_for("window.icefinTheme.system !== null", timeout=30)
        t = page.eval("JSON.stringify(window.icefinTheme.system)")
        tv = json.loads(t)
        check("icefinTheme.system is the theme view", tv.get("renderer") == "opengl" and tv.get("video", {}).get("dolbyVision58") == "capability prompt", t[:200])
        check("icefinTheme.system is frozen", page.eval("(() => { const s = window.icefinTheme.system; try { s.renderer = 'x'; } catch (e) {} return Object.isFrozen(s) && Object.isFrozen(s.video) && s.renderer === 'opengl'; })()") is True)
        check("no device paths or receiver names for themes", not re.search(r"alsa|pipewire|hdmi:|\.mp4|/", t))
        check("the device profile reads the model", page.eval("Array.isArray(window.icefinDeviceProfile.transcodeCodecs()) && typeof window.icefinDeviceProfile.video() === 'object'") is True)
        check("the debug overlay's renderer line comes from the model", "Icefin capabilities: OpenGL (fallback)" in open(path, errors="replace").read())
        stop()

        # 2. OpenGL with a usable Vulkan GPU: the prompt offers the switch, and taking it restarts on Vulkan.
        page, path = run("opengl-vk", {"ICEFIN_RENDERER_ALLOW_SOFTWARE": "1"})
        c = page.eval(caps)
        opts = c.get("video", {}).get("Dolby Vision 5/8", {}).get("options", [])
        check("Vulkan available while on OpenGL", c.get("renderer", {}).get("vulkanAvailable") is True)
        check("the prompt offers switching to Vulkan", "switchToVulkan" in opts, ",".join(opts))
        page.eval("window.labPrompt = null; window.api.router.promptRequested.connect((i) => { window.labPrompt = i; }); true")
        page.eval(LOAD % json.dumps(url))
        page.wait_for("!!window.labPrompt", timeout=60)
        p = page.eval("window.labPrompt")
        check("Dolby Vision on OpenGL raises the prompt with the switch", any(o.get("id") == "switchToVulkan" for o in p.get("options", [])),
              ",".join(o.get("id") for o in p.get("options", [])))
        page.eval("window.api.router.resolve('switchToVulkan', false); true")
        deadline = time.time() + 60
        while time.time() < deadline and "Icefin: restarting (switching to the Vulkan renderer" not in open(path, errors="replace").read():
            time.sleep(1)
        check("choosing it restarts the app", "Icefin: restarting (switching to the Vulkan renderer" in open(path, errors="replace").read())
        time.sleep(6)

        # 3. The restarted app is on Vulkan with the compositor, and its model says so.
        page = Page(a.port, timeout=120)
        page.wait_for("!!window.api && !!window.api.router", timeout=120)
        time.sleep(3)
        c = page.eval(caps)
        check("restarted on Vulkan, with the compositor", c.get("renderer", {}).get("api") == "vulkan"
              and c.get("renderer", {}).get("compositor", {}).get("active") is True, json.dumps(c.get("renderer"))[:200])
        check("Renderer setting is Vulkan", page.eval("new Promise(r => window.api.settings.value('main', 'icefin_renderer', r))") == "vulkan")
        page.eval("window.labCaps = 0; window.api.router.capabilitiesChanged.connect(() => { window.labCaps++; }); true")
        page.eval("window.api.router.setUiBlend('linear'); true")
        time.sleep(2)
        check("the router's change signal fires", page.eval("window.labCaps") >= 1)
        page.eval("window.api.router.setUiBlend('srgb'); true")
        page.eval("new Promise(r => window.api.settings.setValue('main', 'icefin_renderer', 'auto', () => r(true)))")
        time.sleep(1)
        stop()
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
        stop()
    finally:
        if xv:
            xv.terminate()
    print("capability_model:", "OK" if not fails else f"FAILED {fails}", "- logs:", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
