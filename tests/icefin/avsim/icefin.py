#!/usr/bin/env python3
"""icefin.py — Icefin in the avsim client (PLAN 3.9): the rows `matrix.py --player icefin --app APP` runs.

The native lab build runs inside the client (start it from the Icefin disk: `avsim.sh icefin-image APP` once, then
`AVSIM_MEM_MB=4096 AVSIM_BASE=avsim-icefin avsim.sh up`) under Xvfb, with its audio set to the client's HDMI output
over ALSA and every passthrough format enabled. matrix.py drives it over DevTools through an SSH tunnel and plays
the samples with api.player.load, so each track goes through Icefin's own per-track decision (AudioPolicy at
preload) and the virtual receiver records what came out.

Rows:
  icefin/<profile>/<codec>  for every profile with an `expect` map: what the sink captured matches it (a bitstream
                            bit for bit with the reference bursts, or PCM with no bursts), Icefin's decision line
                            says the same, and the track plays to the end (no stall)
  icefin/hotplug-reread     those decisions came from each new receiver's ELD, read again after every profile
                            switch, without restarting Icefin
  icefin/standby            receiver in standby (ELD not valid) after a full receiver: the decision uses the
                            remembered ELD, marked stale, and the bursts still go out bit for bit. Linux doesn't set
                            up the HDMI pin while the ELD is invalid (no non-audio bit, HBR left from the previous
                            stream; stock mpv the same), so those are recorded, not required
  icefin/unplug             the receiver unplugged mid-track and the next track played while unplugged: both play
                            to the end or the never-silent fallback steps in; nothing stalls
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "web"))
from cdp import Page  # noqa: E402

KEY = os.path.expanduser("~/.ssh/avsim")
REMOTE_PORT, LOCAL_PORT = 9240, 9391
PASSTHROUGH = ["ac3", "eac3", "dts", "dts-hd", "truehd"]
# Audio stream 1: the samples' one track (a Jellyfin stream index is mpv's track id; -1 would select none).
LOAD = """(() => {
  window.api.player.load(%s, {startMilliseconds: 0, autoplay: true},
    {type: 'music', headers: {}, metadata: {Id: 'avsim', Name: 'avsim %s', ServerId: 'lab'}, media: {}}, 1, -1);
  return true; })()"""


class Icefin:
    def __init__(self, M, app):
        self.M, self.app, self.tunnel, self.page = M, os.path.expanduser(app), None, None

    def log(self):
        return self.M.client("cat /tmp/icefin.log", timeout=30)[1]

    def start(self, device):
        M = self.M
        with open(self.app, "rb") as f:
            subprocess.run(M.AVSIM + ["ssh", "cat > /tmp/icefin-player && chmod +x /tmp/icefin-player"], stdin=f, check=True, capture_output=True)
        rc, out = M.client("ldd /tmp/icefin-player | grep 'not found' || true")
        if "not found" in out:
            raise SystemExit("matrix: Icefin can't run in this client (missing libraries); start it from the Icefin disk:\n"
                             "  avsim.sh icefin-image APP; AVSIM_MEM_MB=4096 AVSIM_BASE=avsim-icefin avsim.sh up\n" + out)
        M.client("pkill -x icefin-player; pkill -x Xvfb; sleep 1; rm -rf /tmp/icf; mkdir -p /tmp/icf; "
                 "nohup setsid Xvfb :99 -screen 0 1280x720x24 -nolisten tcp >/tmp/xvfb.log 2>&1 </dev/null & sleep 1; "
                 "DISPLAY=:99 QT_QPA_PLATFORM=xcb LC_ALL=C.UTF-8 nohup setsid dbus-run-session -- /tmp/icefin-player "
                 f"--config-dir=/tmp/icf --windowed --desktop --disable-gpu --remote-debugging-port={REMOTE_PORT} --log-level=info "
                 ">/tmp/icefin.log 2>&1 </dev/null & true")
        self.tunnel = subprocess.Popen(["ssh", "-i", KEY, "-p", "2222", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                                        "-o", "LogLevel=ERROR", "-o", "ExitOnForwardFailure=yes", "-N", "-L",
                                        f"{LOCAL_PORT}:127.0.0.1:{REMOTE_PORT}", "lab@127.0.0.1"])
        self.page = Page(LOCAL_PORT, timeout=180)
        self.page.wait_for("!!window.api && !!window.api.player && !!window.api.settings", timeout=180)
        settings = [("backend", "alsa"), ("devicetype", "hdmi"), ("device", f"alsa/{device}")] + [(f"passthrough.{c}", True) for c in PASSTHROUGH]
        for k, v in settings:
            self.page.eval("new Promise(r => window.api.settings.setValue('audio', %s, %s, () => r(true)))" % (json.dumps(k), json.dumps(v)))
        time.sleep(2)

    def stop(self):
        try:
            self.M.client("pkill -x icefin-player; pkill -x Xvfb; true")
        finally:
            if self.tunnel:
                self.tunnel.terminate()

    def play(self, codec, during=None, timeout=45):
        """Load /tmp/<codec>.mka; wait until it ends (finished, error or canceled). during(): called 2 s in.
        Returns (ended, audio decision line, new log text, newest captured segment)."""
        M = self.M
        before_log = len(self.log())
        before = set(M.segments())
        self.page.eval(LOAD % (json.dumps(f"file:///tmp/{codec}.mka"), codec))
        if during:
            time.sleep(2)
            during()
        ended, new = False, ""
        t0 = time.time()
        while time.time() - t0 < timeout:
            time.sleep(1)
            new = self.log()[before_log:]
            if any(s in new for s in ("Entering state: finished", "Entering state: error", "Entering state: canceled")):
                ended = True
                break
        time.sleep(1)
        lines = [l for l in new.splitlines() if "Icefin audio:" in l and " -> " in l]
        return ended, (lines[-1] if lines else ""), new, M.newest_segment_since(before)


def decision_of(line):
    # "Icefin audio: eac3  6 ch on alsa/hdmi:... -> PCM 2ch (receiver's ...) ELD: ..." / "-> eac3 (E-AC-3 passthrough)"
    if " -> " not in line:
        return None
    out = line.split(" -> ", 1)[1]
    return "pcm" if out.startswith("PCM") else "bitstream"


def check_stream(M, codec, want, seg, pin_setup=True):
    """Does the captured stream match `want` (bitstream / pcm)? Returns (ok, detail). pin_setup=False: check the
    bursts only, not the IEC958 non-audio bit, HBR mode and channel count, which Linux doesn't set up while the
    ELD is invalid (the pin keeps the previous stream's state; stock mpv alike)."""
    if not seg:
        return False, {"reason": "no stream reached the sink"}
    with open(f"{M.CAP}/{seg['raw']}", "rb") as f:
        cap = M.iec61937.bursts(f.read())
    detail = {"seg": seg["seg"], "rate": seg["rate"], "channels": seg["channels"], "non_pcm": seg["non_pcm"], "hbr": seg["hbr"],
              "bursts": M.iec61937.summary(cap)}
    if want == "pcm":
        return (not seg["non_pcm"]) and not cap, detail
    with open(f"{M.SAMPLES}/{codec}.spdif", "rb") as f:
        ref = M.iec61937.bursts(f.read())
    cmp = M.iec61937.compare(cap, ref)
    hbr = codec in M.HBR
    detail["compare"] = cmp
    if not pin_setup:
        return cmp["ok"], detail
    return cmp["ok"] and seg["non_pcm"] and seg["hbr"] == hbr and seg["channels"] == (8 if hbr else 2), detail


def rows(M, app, codecs):
    out = []
    dev = M.hdmi_device()
    ice = Icefin(M, app)
    profiles = []
    for fn in sorted(os.listdir(f"{HERE}/profiles")):
        with open(f"{HERE}/profiles/{fn}") as f:
            p = json.load(f)
        p["name"] = fn[:-5]
        profiles.append(p)
    try:
        M.sh(M.AVSIM + ["profile", "avr-full"], check=True)
        time.sleep(2)
        ice.start(dev)
        reread = []
        for p in profiles:
            if not p.get("expect"):
                continue
            M.sh(M.AVSIM + ["profile", p["name"]], check=True)
            time.sleep(2)
            for codec, want in p["expect"].items():
                if codec not in codecs:
                    continue
                ended, line, _, seg = ice.play(codec)
                got = decision_of(line)
                ok_stream, detail = check_stream(M, codec, want, seg)
                eld = line.split("ELD: ", 1)[1] if "ELD: " in line else ""
                reread.append({"profile": p["name"], "codec": codec, "monitor": p.get("monitor_name", ""), "eld": eld})
                out.append(M.row(f"icefin/{p['name']}/{codec}", ended and got == want and ok_stream, want=want, decision=got,
                                 ended=ended, line=line[-300:], **detail))
        missing = [r for r in reread if r["monitor"] and r["monitor"] not in r["eld"]]
        out.append(M.row("icefin/hotplug-reread", bool(reread) and not missing, decisions=len(reread),
                         mismatched=[(r["profile"], r["codec"], r["eld"][:80]) for r in missing]))

        # Standby: a full receiver first, so there is something to remember; then its ELD goes invalid.
        M.sh(M.AVSIM + ["profile", "avr-full"], check=True)
        time.sleep(2)
        ice.play("ac3")
        M.sh(M.AVSIM + ["profile", "standby"], check=True)
        time.sleep(2)
        c = "truehd" if "truehd" in codecs else "ac3"
        ended, line, _, seg = ice.play(c)
        ok_stream, detail = check_stream(M, c, "bitstream", seg, pin_setup=False)
        out.append(M.row("icefin/standby", ended and "stale" in line and decision_of(line) == "bitstream" and ok_stream,
                         codec=c, ended=ended, line=line[-300:],
                         note="Linux doesn't set up the HDMI pin while the ELD is invalid: no IEC958 non-audio bit, HBR "
                              "left as the previous stream had it (stock mpv the same); the bursts are intact", **detail))

        # Unplug mid-track, then a whole track while unplugged.
        M.sh(M.AVSIM + ["profile", "avr-full"], check=True)
        time.sleep(2)
        ended1, line1, log1, _ = ice.play("ac3", during=lambda: M.sh(M.AVSIM + ["unplug"], check=True))
        time.sleep(1)
        ended2, line2, log2, _ = ice.play("ac3")
        M.sh(M.AVSIM + ["plug"], check=True)
        time.sleep(2)
        fallback = [l for l in (log1 + log2).splitlines() if "Icefin audio fallback" in l]
        out.append(M.row("icefin/unplug", ended1 and ended2, ended_mid_track_unplug=ended1, ended_while_unplugged=ended2,
                         line_unplugged=line2[-300:], fallback=fallback[-3:]))
    finally:
        try:
            os.makedirs(M.RESULTS, exist_ok=True)
            with open(f"{M.RESULTS}/icefin-{time.strftime('%Y%m%d-%H%M%S')}.log", "w") as f:
                f.write(ice.log())
        except Exception:  # noqa: BLE001
            pass
        ice.stop()
    return out
