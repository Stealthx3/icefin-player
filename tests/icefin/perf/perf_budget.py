#!/usr/bin/env python3
"""perf_budget.py — the low-spec performance budget (PLAN 11.5 option P, docs/dev/HARDWARE-SIMULATION.md).

Runs Icefin (by default its Flatpak) held to two CPUs (taskset) in the lab's stand-in HTPC guest (lab-icefin-htpcsim:
a headless 4K Weston TV session, lavapipe and llvmpipe, no GPU), and measures:
  - per theme (stock jellyfin-web and every installed theme), on its home screen, while idle and while focus moves
    (arrow keys every 300 ms);
  - over video (the lab's 1080p H.264 film, 15 s), with mpv's dropped frames (hardware.playbackStats).
What counts is what Qt Quick draws, the whole 4K window (web page, theme backdrop, video): hardware.frameStats gives
each frame's cost (scene-graph sync to swap), frames per second, the 95th-percentile interval and the share of
intervals over 50 ms (jank). The page's requestAnimationFrame can't show this: Chromium ticks it at 60 Hz whatever
Qt manages to draw. Qt draws on demand, so an idle screen with nothing animating draws few frames.
The numbers become a budget (tests/icefin/perf/budget.json): a change that makes this machine slower than the
budget plus a margin fails. Scenarios recorded with fewer than 30 frames (a static screen) are reported, not checked.
A change meant to alter a screen (a new animation, a theme filled in) records the budget again with --record. It can't say what a real low-end GPU will do; that stays with beta row V4.
  perf_budget.py [--record]   measure; with --record, write the budget from this run instead of checking it
Run in the guest (docs/LAB.md, "Performance budget"); the servers are on lab-icefin-main (ICEFIN_SERVER_HOST).
"""
import argparse, json, os, signal, statistics, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "..", "web")
sys.path.insert(0, WEB)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

BUDGET = os.path.join(HERE, "budget.json")
# Margins: a change fails when a scenario is clearly slower than the recorded run, not on run-to-run noise.
# Frame costs repeat within a few per cent run to run on this guest (Plaza 28.6 then 29.4 ms), and the app on one
# CPU instead of two costs about 30% more: 15% plus 1 ms catches that without tripping on noise.
MARGIN = {"fps": (0.85, -1.0), "cost_p50_ms": (1.15, 1.0), "cost_p95_ms": (1.15, 1.0), "jank_pct": (1.0, 5.0),
          "drops_per_min": (1.25, 30.0)}
METRICS = ("fps", "cost_p50_ms", "cost_p95_ms", "interval_p95_ms", "jank_pct", "frames")
# A recorded scenario with fewer frames than this has no budget: a static screen (or one the arrow keys don't move)
# gives a handful of frames, and its numbers would flag any later animation as a regression. Reported, not checked.
MIN_FRAMES = 30

LOAD = """(() => { window.api.player.load(%s, {startMilliseconds: 0, autoplay: true},
  {type: 'video', headers: {}, metadata: {Id: 'perf', Name: 'Perf clip', ServerId: 'lab'}, media: {},
   icefinMediaSource: {MediaStreams: [{Type: 'Video', VideoRangeType: 'SDR'}]}}, -1, -1); return true; })()"""


def within(metric, got, budget):
    mul, add = MARGIN[metric]
    if metric == "fps":
        return budget < 20 or got >= budget * mul + add  # an idle screen drawing on demand: no frame rate to keep
    return got <= budget * mul + add


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default="flatpak:io.github.stealthx3.IcefinPlayer")
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9253)
    ap.add_argument("--cpus", default="0,1", help="CPUs the app may use (taskset)")
    ap.add_argument("--runs", type=int, default=2, help="runs per scenario; the median counts")
    ap.add_argument("--themes", help="comma-separated theme ids (default: stock plus every installed theme)")
    ap.add_argument("--record", action="store_true")
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    film = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]
    film_url = f"{srv.base}/Videos/{film['Id']}/stream?static=true&api_key={srv.token}"

    out = tempfile.mkdtemp(prefix="icefin-perf-")
    runtime = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    env = dict(os.environ, XDG_RUNTIME_DIR=runtime, WAYLAND_DISPLAY=os.environ.get("WAYLAND_DISPLAY", "wayland-0"))
    if a.app.startswith("flatpak:"):
        cmd = ["flatpak", "run", "--user", "--env=QT_QPA_PLATFORM=wayland", a.app.split(":", 1)[1],
               "--config-dir=/var/tmp/icefin-perf"]
    else:
        cmd = [os.path.expanduser(a.app), f"--config-dir={out}/config"]
        env["QT_QPA_PLATFORM"] = "wayland"
    cmd = ["taskset", "-c", a.cpus] + cmd + ["--tv", f"--remote-debugging-port={a.port}", "--log-level=info"]
    log = open(os.path.join(out, "app.log"), "w")
    app = subprocess.Popen(cmd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    results, fails = {}, []

    def note(msg):
        print(f"perf_budget: {msg}", flush=True)

    try:
        page = Page(a.port, timeout=180)
        js = page.eval
        # A saved sign-in navigates to the server right away: read the page once it has settled.
        for _ in range(60):
            try:
                if js("document.readyState === 'complete'"):
                    break
            except RuntimeError:
                pass
            time.sleep(1)
        time.sleep(5)
        page.reconnect()
        if js("typeof tryConnect === 'function' && document.getElementById('address') !== null"):
            js(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(6)
            page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=180)
        if not js("!!window.ApiClient.accessToken()"):
            js(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
            js("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(10)
            page.reconnect()
        page.wait_for("!!window.api && !!window.api.theme && !!window.api.hardware && !!document.querySelector('.skinHeader')", timeout=180)
        page.wait_for("new Promise(r => window.api.hardware.results(x => r(!x.running)))", timeout=240)  # the start-up self-test
        themes = a.themes.split(",") if a.themes else [""] + sorted(t["id"] for t in js("new Promise(r => window.api.theme.themes(r))"))
        note(f"themes: {['stock' if not t else t for t in themes]}")

        def record(seconds, keys=False):
            js("window.api.hardware.startFrameStats(); true")
            if keys:
                for i in range(int(seconds / 0.3)):
                    k = "ArrowRight" if (i // 8) % 2 == 0 else "ArrowLeft"
                    for typ in ("rawKeyDown", "keyUp"):
                        page.send("Input.dispatchKeyEvent", type=typ, key=k, code=k, windowsVirtualKeyCode=39 if k == "ArrowRight" else 37)
                    time.sleep(0.3)
            else:
                time.sleep(seconds)
            st = js("new Promise(r => window.api.hardware.frameStats(r))")
            return {k: st.get(k, 0) for k in METRICS}

        def median(runs):
            return {k: round(statistics.median(r[k] for r in runs), 1) for k in runs[0]}

        for theme in themes:
            name = theme or "stock"
            js(f"new Promise(r => window.api.theme.setActiveTheme({json.dumps(theme)}, '', r))")
            js("location.hash = '#/home'; true")
            time.sleep(6)  # the theme's home and backdrop settle
            idle, nav = [], []
            for _ in range(a.runs):
                idle.append(record(6))
                nav.append(record(6, keys=True))
            results[f"{name}/idle"] = median(idle)
            results[f"{name}/navigate"] = median(nav)
            note(f"{name}: idle {results[name + '/idle']}, navigate {results[name + '/navigate']}")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")

        video = []
        for _ in range(a.runs):
            js(LOAD % json.dumps(film_url))
            page.wait_for("new Promise(r => window.api.hardware.playbackStats(s => r((s['playback-time'] || 0) > 2)))", timeout=60)
            s0, t0 = js("new Promise(r => window.api.hardware.playbackStats(r))"), time.time()
            fr = record(15)
            s1, t1 = js("new Promise(r => window.api.hardware.playbackStats(r))"), time.time()
            drops = sum((s1.get(k) or 0) - (s0.get(k) or 0) for k in ("frame-drop-count", "decoder-frame-drop-count"))
            fr["drops_per_min"] = round(drops * 60.0 / (t1 - t0), 1)
            video.append(fr)
            js("window.api.player.stop(); true")
            time.sleep(3)
        results["video-1080p-h264"] = median(video)
        hw = s1.get("hwdec-current")
        note(f"video: {results['video-1080p-h264']} ({'software' if hw in (None, '', 'no') else hw} decoding, {s1.get('width')}x{s1.get('height')})")
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        fails.append(f"run: {type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(20)
        except Exception:  # noqa: BLE001
            pass
        log.close()

    meta = {"guest": os.uname().nodename, "cpus": a.cpus, "nproc": os.cpu_count(), "app": a.app, "runs": a.runs,
            "recorded": time.strftime("%Y-%m-%d %H:%M")}
    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump({"meta": meta, "results": results}, f, indent=1)
    # Qt drawing nothing means the window wasn't exposed (a locked or idle session), not a fast machine.
    for scen, got in results.items():
        if not scen.endswith("/idle") and got.get("frames", 0) == 0:
            fails.append(f"{scen}: Qt drew no frames (window not exposed?)")
    if a.record and not fails:
        with open(BUDGET, "w") as f:
            json.dump({"meta": meta, "margin": MARGIN, "scenarios": results}, f, indent=1)
            f.write("\n")
        note(f"budget recorded: {BUDGET}")
    elif not fails:
        budget = json.load(open(BUDGET))["scenarios"] if os.path.exists(BUDGET) else {}
        for scen, got in results.items():
            want = budget.get(scen)
            if not want:
                note(f"note {scen}: no budget yet")
                continue
            if want.get("frames", 0) < MIN_FRAMES:
                note(f"note {scen}: {want.get('frames', 0)} frames when recorded, no budget ({got.get('frames', 0)} now)")
                continue
            for metric in MARGIN:
                if metric in want and metric in got and not within(metric, got[metric], want[metric]):
                    fails.append(f"{scen} {metric}: {got[metric]} (budget {want[metric]})")
    for f_ in fails:
        note(f"FAIL {f_}")
    note(("OK" if not fails else f"FAILED ({len(fails)})") + f" - logs: {out}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
