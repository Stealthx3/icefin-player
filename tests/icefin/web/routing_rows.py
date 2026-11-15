#!/usr/bin/env python3
"""routing_rows.py — every routing-table row in the running app (PLAN 6.6, SPEC "Routing rules"). Lab guests only.

Plays each lab film through the server (the session's PlayNow, so jellyfin-web's own path hands the real media
source's VideoRangeType to the router): SDR, HDR10, HLG, HDR10+ and Dolby Vision 5 and 8.1 (make-hdr-media.sh).
Once on the OpenGL fallback and once on the Vulkan renderer (lavapipe on an SDR X11 display). Per film and renderer:
  - the server classifies the film as expected (VideoRangeType), so the row is the one meant;
  - Icefin's router line says what the routing table says (SDR, tone-mapped SDR, or the capability prompt);
  - the capability prompt appears exactly where the table says (Dolby Vision 5/8 on OpenGL), and Play anyway plays;
  - the server sees the film play, and how (PlayMethod): every film direct-plays (SPEC "Device profile": Icefin turns
    upstream's Force Transcode Dolby Vision default off, so profile 5 reaches the renderer or the prompt's Play anyway).
With --upstream, the same films play in upstream jellyfin-desktop v2.0.0 and the server must see each play with the
same play method as Icefin's ("playback reports match upstream"), except Dolby Vision 5: upstream's default has the
server transcode it.
The renderer comes from ICEFIN_RENDERER, with ICEFIN_RENDERER_ALLOW_SOFTWARE=1 for the lab's lavapipe. The Vulkan
pass needs a build with the patched libmpv (LAB.md "Patched libmpv for native builds"): run with its LD_LIBRARY_PATH.
Dolby Vision 7 (dual layer) has no lab clip yet: dovi_tool generates single-layer RPUs only.
Usage: LD_LIBRARY_PATH=~/mpv-icefin/lib/x86_64-linux-gnu python3 routing_rows.py --app ~/build-vk/src/icefin-player
       [--upstream ~/build-upstream/src/jellyfin-desktop] [--server jf12]
"""
import argparse, json, os, re, signal, subprocess, sys, tempfile, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
import session_play  # noqa: E402
from session_play import launch, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

# Film (search term) -> the VideoRangeType Jellyfin should report.
FILMS = [("SDR H264 AAC", "SDR"), ("HDR10 HEVC AC3", "HDR10"), ("HLG HEVC EAC3", "HLG"), ("HDR10Plus HEVC AC3", "HDR10Plus"),
         ("DV P5 HEVC AC3", "DOVI"), ("DV P8.1 HEVC AC3", "DOVIWithHDR10")]
# The routing table on an SDR display (SPEC "Routing rules").
EXPECT = {
    "opengl": {"SDR": "SDR", "HDR10": "tone-mapped SDR", "HLG": "tone-mapped SDR", "HDR10Plus": "tone-mapped SDR",
               "DOVI": "capability prompt", "DOVIWithHDR10": "capability prompt"},
    "vulkan": {"SDR": "SDR", "HDR10": "tone-mapped SDR", "HLG": "tone-mapped SDR", "HDR10Plus": "tone-mapped SDR",
               "DOVI": "tone-mapped SDR", "DOVIWithHDR10": "tone-mapped SDR"},
}
# Play methods that differ from upstream by design (upstream's Force Transcode Dolby Vision is on by default).
UPSTREAM = {"DOVI": "Transcode"}
PROMPT = "!!document.getElementById('icefin-capability-prompt')"


def own_x(logdir):
    """An Xvfb of this run's own on a free, high display number: a long run must not sit on a shared :99 that another
    lab session (or an earlier run's leftover) may stop, nor on :0, where tools without a DISPLAY end up."""
    num = next(n for n in range(140, 200) if not os.path.exists(f"/tmp/.X11-unix/X{n}") and not os.path.exists(f"/tmp/.X{n}-lock"))
    p = subprocess.Popen(["Xvfb", f":{num}", "-screen", "0", "1920x1080x24", "-nolisten", "tcp", "-noreset"],
                         stdout=subprocess.DEVNULL, stderr=open(os.path.join(logdir, "xvfb.log"), "w"), start_new_session=True)
    time.sleep(2)
    session_play.LAB_DISPLAY = f":{num}"
    return p


class App:
    """One app run: started, signed in, its server session found."""

    def __init__(self, a, srv, cred, binary, cfgdir, tag, icefin=True, renderer=None):
        self.a, self.srv, self.cred, self.icefin = a, srv, cred, icefin
        self.logpath = os.path.join(cfgdir, f"app-{tag}.log")
        self.log = open(self.logpath, "w")
        if renderer:
            os.environ.update(ICEFIN_RENDERER=renderer, ICEFIN_RENDERER_ALLOW_SOFTWARE="1")
        self.proc = launch(binary, a.port, cfgdir, self.log, "xcb", ["--log-level=info"])
        self.page = Page(a.port, timeout=120)

    def text(self):
        return open(self.logpath, errors="replace").read()

    def sign_in(self):
        p = self.page
        if p.eval("typeof tryConnect === 'function' && document.getElementById('address') !== null"):
            p.eval(f"document.getElementById('address').value = '{self.srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(5)
            p.reconnect()
        p.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress()", timeout=90)
        if not p.eval("!!window.ApiClient.accessToken()"):
            p.eval(f"window.ApiClient.authenticateUserByName({json.dumps(self.cred['user'])}, {json.dumps(self.cred['password'])}).then(r => !!r.AccessToken)")
            p.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(8)
            p.reconnect()
        p.wait_for("!!window.ApiClient && !!window.ApiClient.accessToken()" + (" && !!window.icefinCapabilityPrompt" if self.icefin else ""), timeout=90)

    def session(self):
        for _ in range(40):
            for s in self.srv.call("GET", "/Sessions?activeWithinSeconds=120"):
                if s.get("UserName") == self.cred["user"] and s.get("SupportsRemoteControl") and s.get("Client") != "icefin-lab-setup":
                    return s
            time.sleep(2)
        raise RuntimeError("app session not visible on the server")

    def stop(self):
        try:
            os.killpg(self.proc.pid, signal.SIGTERM)
            self.proc.wait(15)
        except Exception:  # noqa: BLE001
            pass
        self.log.close()
        time.sleep(2)


def play(app, sess, item_id, srv, answer_prompt=True, seconds=10):
    """PlayNow; answer a capability prompt with Play anyway. Returns {prompt, method, played, route}.
    Played: the server's session shows this item past 2 s (a 4K software transcode takes a while in the lab)."""
    before = len(app.text())
    srv.call("POST", f"/Sessions/{sess['Id']}/Playing?playCommand=PlayNow&itemIds={item_id}")
    prompt, method, played, t0, t_played = False, None, False, time.time(), None
    while time.time() - t0 < 150:
        if app.icefin and not prompt and app.page.eval(PROMPT):
            prompt = True
            if answer_prompt:
                app.page.eval("document.querySelector('#icefin-capability-prompt [data-choice=play]').click(); true")
        s = next((x for x in srv.call("GET", "/Sessions") if x["Id"] == sess["Id"]), {})
        ps = s.get("PlayState") or {}
        if (s.get("NowPlayingItem") or {}).get("Id") == item_id and (ps.get("PositionTicks") or 0) > 2e7:
            played, method = True, ps.get("PlayMethod")
            t_played = t_played or time.time()
            if time.time() - t_played > seconds:
                break
        time.sleep(1)
    srv.call("POST", f"/Sessions/{sess['Id']}/Playing/Stop")
    time.sleep(3)
    new = app.text()[before:]
    routes = re.findall(r"Icefin router: (\S+) -> (.+?) \(", new)
    return {"prompt": prompt, "method": method, "played": played, "route": routes[0] if routes else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--upstream")
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9247)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    fails, results = [], {}

    def check(label, ok, detail=""):
        print(f"routing_rows: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    films = []
    for term, vrt in FILMS:
        q = urllib.parse.urlencode({"Recursive": "true", "searchTerm": term, "userId": uid, "IncludeItemTypes": "Movie", "Fields": "MediaStreams"})
        items = srv.call("GET", f"/Items?{q}")["Items"]
        if not items:
            check(f"{term}: in the library", False, "run make-hdr-media.sh and rescan")
            continue
        it = items[0]
        full = srv.call("GET", f"/Users/{uid}/Items/{it['Id']}")
        got = next((s.get("VideoRangeType") for s in full.get("MediaStreams", []) if s.get("Type") == "Video"), None)
        check(f"{term}: the server reports {vrt}", got == vrt, f"got {got}")
        films.append((term, vrt, it["Id"]))

    cfgdir = tempfile.mkdtemp(prefix="icefin-routing-")
    xv = own_x(cfgdir)
    # Started through a symlink so its process name isn't "icefin-player": other lab sessions clear stray apps with
    # pkill -x icefin-player, which would end this long run mid-film.
    binary = os.path.join(cfgdir, "icefin-routing")
    os.symlink(os.path.abspath(os.path.expanduser(a.app)), binary)
    try:
        for renderer in ("opengl", "vulkan"):
            app = App(a, srv, cred, binary, cfgdir, renderer, renderer=renderer)
            app.sign_in()
            on = app.page.eval("new Promise(r => window.api.router.capabilities(c => r(c.renderer.api)))")
            check(f"{renderer}: running on {renderer}", on == renderer, f"capabilities say {on}")
            if renderer == "vulkan":
                path = "no Vulkan video path" not in app.text()
                check("vulkan: the build has the Vulkan video path", path,
                      "" if path else "built against stock libmpv: use the patched one (LAB.md)")
            sess = app.session()
            for term, vrt, item_id in films:
                r = play(app, sess, item_id, srv)
                want = EXPECT[renderer][vrt]
                results[(renderer, vrt)] = r
                check(f"{renderer} {vrt}: router -> {want}", r["route"] == (vrt, want), str(r["route"]))
                check(f"{renderer} {vrt}: prompt {'shown' if want == 'capability prompt' else 'not shown'}", r["prompt"] == (want == "capability prompt"))
                check(f"{renderer} {vrt}: plays, direct ({r['method']})", r["played"] and r["method"] == "DirectPlay")
            app.stop()

        if a.upstream:
            for k in ("ICEFIN_RENDERER", "ICEFIN_RENDERER_ALLOW_SOFTWARE"):
                os.environ.pop(k, None)
            app = App(a, srv, cred, a.upstream, tempfile.mkdtemp(prefix="upstream-routing-"), "upstream", icefin=False)
            app.sign_in()
            sess = app.session()
            for term, vrt, item_id in films:
                r = play(app, sess, item_id, srv)
                mine = results.get(("opengl", vrt), {}).get("method")
                want = UPSTREAM.get(vrt, mine)
                check(f"upstream {vrt}: plays, {want} ({r['method']})", r["played"] and r["method"] == want,
                      f"Icefin: {mine}" + (" (differs by design)" if vrt in UPSTREAM else ""))
            app.stop()
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        if xv.poll() is not None:
            check("Xvfb ran to the end", False, f"{session_play.LAB_DISPLAY} exited with {xv.returncode}")
        xv.terminate()
    with open(os.path.join(cfgdir, "results.json"), "w") as f:
        json.dump({f"{k[0]}/{k[1]}": v for k, v in results.items()}, f, indent=1)
    print("routing_rows:", "OK" if not fails else f"FAILED {fails}", "- logs:", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
