#!/usr/bin/env python3
"""parity.py — Icefin's Vulkan path against stock mpv gpu-next (PLAN 5.8, D23, D25).

The same film, paused on the same frame, drawn by Icefin (patched libmpv in the single-surface compositor, UI layer
hidden) and by stock mpv 0.42 (--vo=gpu-next --gpu-api=vulkan) built against the same libplacebo, both on the lab's
lavapipe under Xvfb in a 1280x720 window with the same target: BT.709, gamma 2.2, SDR white 203 nits (what Icefin's
compositor encodes for an SDR display). The two window grabs are compared pixel by pixel (mean and 99th percentile
of the absolute difference per channel, 0-255). Both players run with hdr-compute-peak=no: libplacebo's peak
detection smooths over successive renders, and a paused frame has been rendered a different number of times by each
player (HLG, which has no metadata to anchor the tone mapping, differs by ~12/255 with it on); --opt adds options.
Rows: the lab servers' SDR, HDR10 and HLG films (make-media.sh), tone-mapped to SDR. HDR10+ and Dolby Vision need
real samples (not generated; D25).
Usage: python3 parity.py --app ~/build-mpv/src/icefin-player --mpv ~/mpv-stock/bin/mpv [--server jf12] [--max-mean 2]
"""
import argparse, json, os, signal, socket, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

FILMS = [("sdr", "SDR H264 AAC", "SDR"), ("hdr10", "HDR10 HEVC", "HDR10"), ("hlg", "HLG HEVC", "HLG")]
SECONDS = 4.0
TARGET = ["--target-prim=bt.709", "--target-trc=gamma2.2", "--target-peak=203", "--hdr-reference-white=203"]

LOAD = """(() => {
  window.labPlaying = false;
  if (!window.labHooked) { window.labHooked = true; window.api.player.playing.connect(() => { window.labPlaying = true; }); }
  window.api.player.load(%s, {startMilliseconds: %d, autoplay: true},
    {type: 'video', headers: {}, metadata: {Id: 'lab', Name: 'Lab clip', ServerId: 'lab'}, media: {},
     icefinMediaSource: {MediaStreams: [{Type: 'Video', VideoRangeType: %s}]}}, -1, -1);
  return true; })()"""


def grab(path):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1280x720", "-i", ":99+0,0",
                    "-frames:v", "1", path], check=False)


def compare(a, b):
    from PIL import Image, ImageChops
    import statistics
    x, y = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    d = ImageChops.difference(x, y)
    out = []
    for ch in d.split():
        h = ch.histogram()
        n = sum(h)
        mean = sum(i * c for i, c in enumerate(h)) / n
        acc, p99 = 0, 0
        for i, c in enumerate(h):
            acc += c
            if acc >= 0.99 * n:
                p99 = i
                break
        out.append((mean, p99))
    return out


def mpv_ipc(sock, cmd):
    s = socket.socket(socket.AF_UNIX)
    s.connect(sock)
    s.sendall((json.dumps({"command": cmd}) + "\n").encode())
    s.settimeout(5)
    try:
        return s.recv(4096).decode()
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--mpv", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9243)
    ap.add_argument("--max-mean", type=float, default=2.0)
    ap.add_argument("--rows", default=",".join(f[0] for f in FILMS))
    ap.add_argument("--opt", action="append", default=[], help="an mpv option for both players")
    a = ap.parse_args()
    a.opt = ["hdr-compute-peak=no"] + a.opt
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    xv = start_x()
    out = tempfile.mkdtemp(prefix="icefin-parity-")
    env = dict(os.environ, DISPLAY=":99")
    fails = []

    def check(label, ok, detail=""):
        print(f"parity: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        for row, term, rng in FILMS:
            if row not in a.rows.split(","):
                continue
            items = srv.call("GET", f"/Items?Recursive=true&searchTerm={term.replace(' ', '%20')}&userId={uid}&IncludeItemTypes=Movie")["Items"]
            if not items:
                check(f"{row}: film on the server", False, term)
                continue
            url = f"{srv.base}/Videos/{items[0]['Id']}/stream?static=true&api_key={srv.token}"

            # Stock mpv: gpu-next on Vulkan, paused on the frame at SECONDS.
            sock = os.path.join(out, f"mpv-{row}.sock")
            mlog = open(os.path.join(out, f"mpv-{row}.log"), "w")
            m = subprocess.Popen([a.mpv, "--no-config", "--vo=gpu-next", "--gpu-api=vulkan", "--hwdec=no", "--no-audio",
                                  "--geometry=1280x720+0+0", "--no-border", "--osd-level=0", "--gpu-sw=yes", "--keepaspect-window=no",
                                  f"--start={SECONDS}", "--hr-seek=yes", "--pause", f"--input-ipc-server={sock}",
                                  "--msg-level=all=v"] + TARGET + [f"--{o}" for o in a.opt] + [url],
                                 env=env, stdout=mlog, stderr=subprocess.STDOUT)
            time.sleep(12)
            grab(os.path.join(out, f"{row}-mpv.png"))
            m.terminate()
            m.wait(10)
            mlog.close()

            # Icefin: Vulkan renderer, the compositor's UI layer hidden, the same frame.
            alog = open(os.path.join(out, f"icefin-{row}.log"), "w")
            os.environ.update(ICEFIN_RENDERER="vulkan", ICEFIN_RENDERER_ALLOW_SOFTWARE="1")
            app = launch(a.app, a.port, os.path.join(out, f"cfg-{row}"), alog)
            page = Page(a.port, timeout=120)
            page.wait_for("!!window.api && !!window.api.player && !!window.api.router", timeout=120)
            page.eval(f"new Promise(r => window.api.settings.setValue('video', 'hardwareDecoding', 'off', () => r(true)))")
            page.eval("window.api.router.setUiLayerVisible(false); true")
            for o in a.opt:
                k, v = o.split("=", 1)
                page.eval(f"window.api.player.userCommand({json.dumps('set ' + k + ' ' + v)}); true")
            page.eval(LOAD % (json.dumps(url), int(SECONDS * 1000), json.dumps(rng)))
            page.wait_for("window.labPlaying === true", timeout=120)
            page.eval("window.api.player.userCommand('set pause yes'); true")
            time.sleep(2)
            page.eval(f"window.api.player.userCommand('seek {SECONDS} absolute+exact'); true")
            time.sleep(8)
            grab(os.path.join(out, f"{row}-icefin.png"))
            try:
                os.killpg(app.pid, signal.SIGTERM)
                app.wait(15)
            except Exception:  # noqa: BLE001
                pass
            alog.close()
            time.sleep(2)

            stats = compare(os.path.join(out, f"{row}-mpv.png"), os.path.join(out, f"{row}-icefin.png"))
            worst = max(s[0] for s in stats)
            check(f"{row}: Icefin matches stock gpu-next (mean |diff| <= {a.max_mean})", worst <= a.max_mean,
                  "mean " + "/".join(f"{s[0]:.2f}" for s in stats) + ", p99 " + "/".join(str(s[1]) for s in stats))
    finally:
        if xv:
            xv.terminate()
    print("parity:", "OK" if not fails else f"FAILED {fails}", "- grabs:", out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
