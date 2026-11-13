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
  icefin/standby            receiver in standby (ELD not valid) after a full receiver: PCM, no bursts, the track ends
                            (Linux doesn't set up the HDMI pin for a bitstream while the ELD is invalid: no non-audio
                            bit, HBR left over; stock mpv alike)
  icefin/standby-wake       receiver wakes 3 s into a 30 s TrueHD track: PCM first, then the bitstream (bit-exact,
                            HBR, 8 channels), starting kWakeDelayMs (4 s) or a little more after the wake
  icefin/standby-flap       wakes, back to standby 2 s later (inside the delay), wakes again: no bitstream until 4 s
                            after the second wake
  icefin/standby-pcm        Receiver in Standby = Always PCM: the receiver wakes mid-track, PCM to the end
  icefin/standby-bitstream  Receiver in Standby = Keep Bitstream: the remembered ELD's bitstream straight away,
                            the bursts bit for bit (the pin set-up is the kernel's, recorded)
  icefin/unplug             the receiver unplugged mid-track and the next track played while unplugged: both play
                            to the end or the never-silent fallback steps in; nothing stalls
  icefin/fallback-default   another program holds the HDMI device (as a sound server that won't let go does): the
                            output fails, the fallback retries as PCM, then on the default device (a null device
                            here), and the track plays to the end without the last step (3.6)
  icefin/fallback-silent    the HDMI device held and no other device: all three steps, the on-screen notice, and
                            the track still plays to the end silently instead of stalling
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "web"))
from cdp import Page  # noqa: E402

KEY = os.path.expanduser("~/.ssh/avsim")
REMOTE_PORT, LOCAL_PORT = 9240, 9391
LONG = 30  # seconds: long samples, room for a wake mid-track and the 4 s delay
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

    def set_standby(self, value):
        self.page.eval("new Promise(r => window.api.settings.setValue('audio', 'icefin_standby', %s, () => r(true)))" % json.dumps(value))
        time.sleep(1)

    def play_with_events(self, codec, events, timeout=LONG + 25):
        """Load /tmp/<codec>.mka and run events [(seconds after load, fn)]; poll the sink's segments every 0.25 s.
        Returns (ended, log text, [(seconds after load, segment meta)] in order of appearance, {event: time run})."""
        M = self.M
        before_log = len(self.log())
        before = set(M.segments())
        seen, appeared, when = set(), [], {}
        self.page.eval(LOAD % (json.dumps(f"file:///tmp/{codec}.mka"), codec))
        t0 = time.time()
        pending = sorted(events, key=lambda e: e[0])
        ended, new, last_log = False, "", 0.0
        while time.time() - t0 < timeout:
            now = time.time() - t0
            while pending and now >= pending[0][0]:
                at, fn = pending.pop(0)
                fn()
                when[at] = time.time() - t0
            for m in metas_since(M, before):
                if m["seg"] not in seen:
                    seen.add(m["seg"])
                    appeared.append((round(time.time() - t0, 2), m))
            if now - last_log >= 1.0:
                last_log = now
                new = self.log()[before_log:]
                if not pending and any(x in new for x in ("Entering state: finished", "Entering state: error", "Entering state: canceled")):
                    ended = True
                    break
            time.sleep(0.25)
        time.sleep(1)
        final = {m["seg"]: m for m in metas_since(M, before)}  # the metas as the streams ended (sizes)
        return ended, self.log()[before_log:], [(t, final.get(m["seg"], m)) for t, m in appeared], when

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


def ensure_long(M, codec):
    """/tmp/<codec>-long.mka in the client (30 s) and its spdif reference next to the short samples."""
    mka, ref = f"{M.SAMPLES}/{codec}-long.mka", f"{M.SAMPLES}/{codec}-long.spdif"
    if not os.path.exists(mka):
        args, ch = M.SAMPLE_SPEC[codec]
        layout = "5.1" if ch == 6 else "stereo"
        M.sh(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
              f"sine=frequency=440:duration={LONG},aformat=channel_layouts={layout}", "-ar", "48000", *args, mka], check=True)
    if not os.path.exists(ref):
        M.sh(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", mka, "-c:a", "copy", "-f", "spdif", ref], check=True)
    rc, out = M.client(f"test -f /tmp/{codec}-long.mka && echo have")
    if "have" not in out:
        with open(mka, "rb") as f:
            subprocess.run(M.AVSIM + ["ssh", f"cat > /tmp/{codec}-long.mka"], stdin=f, check=True, capture_output=True)


def metas_since(M, before):
    out = []
    for n in sorted(set(M.segments()) - before):
        try:
            with open(f"{M.CAP}/seg-{n:04d}.json") as f:
                out.append(json.load(f))
        except (OSError, ValueError):
            pass
    return out


def contiguous(cap, ref, edge=3):
    """The capture's bursts are one unbroken run of the reference's, from anywhere in it (a stream that started
    mid-track); a few may be cut at either end."""
    if len(cap) < 20 or not ref:
        return {"ok": False, "reason": f"{len(cap)} bursts captured"}
    keys, rkeys = [b[:3] for b in cap], [b[:3] for b in ref]
    for skip in range(0, min(edge, len(keys) - 1) + 1):
        try:
            start = rkeys.index(keys[skip])
        except ValueError:
            continue
        n = 0
        while skip + n < len(keys) and start + n < len(rkeys) and keys[skip + n] == rkeys[start + n]:
            n += 1
        left = len(keys) - skip - n
        return {"ok": left <= edge, "from_ref_burst": start, "matched": n, "unmatched_end": left}
    return {"ok": False, "reason": "no captured burst is in the reference"}


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


def rows(M, app, codecs, which="lab"):
    out = []
    dev = M.hdmi_device()
    ice = Icefin(M, app)
    profiles = []
    for name in M.profile_names(which):
        with open(f"{HERE}/profiles/{name}.json") as f:
            p = json.load(f)
        p["name"] = name
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
        if which == "public":
            return out  # the public sinks: per-sink decisions only; standby and fallback stay on the lab's sinks

        # Standby (the user's choice, 2026-11-12): PCM while the receiver isn't ready, the bitstream once it has been
        # ready for 4 s. A full receiver first, so there is a remembered ELD.
        prof = lambda name: (lambda: M.sh(M.AVSIM + ["profile", name], check=True))
        bursts_of = lambda m: M.iec61937.bursts(open(f"{M.CAP}/{m['raw']}", "rb").read())
        M.sh(M.AVSIM + ["profile", "avr-full"], check=True)
        time.sleep(2)
        ice.play("ac3")
        M.sh(M.AVSIM + ["profile", "standby"], check=True)
        time.sleep(2)
        c = "truehd" if "truehd" in codecs else "ac3"
        ended, line, _, seg = ice.play(c)
        ok_stream, detail = check_stream(M, c, "pcm", seg)
        out.append(M.row("icefin/standby", ended and "stale" in line and decision_of(line) == "pcm" and "until it wakes" in line and ok_stream,
                         codec=c, ended=ended, line=line[-300:], **detail))

        ensure_long(M, c)
        with open(f"{M.SAMPLES}/{c}-long.spdif", "rb") as f:
            ref_long = M.iec61937.bursts(f.read())
        hbr = c in M.HBR

        def first_bitstream(segs):
            bs = [(t, m) for t, m in segs if m["non_pcm"]]
            if not bs:
                return None, {"ok": False, "reason": "no bitstream after the wake"}
            t, m = bs[0]
            cmp = contiguous(bursts_of(m), ref_long)
            cmp["format_ok"] = m["hbr"] == hbr and m["channels"] == (8 if hbr else 2)
            return t, cmp

        def wake_lines(log):
            return [l for l in log.splitlines() if "Icefin audio" in l and ("receiver" in l or " -> " in l)][-5:]

        # Wake 3 s in.
        M.sh(M.AVSIM + ["profile", "standby"], check=True)
        time.sleep(2)
        ended, log, segs, when = ice.play_with_events(f"{c}-long", [(3, prof("avr-full"))])
        t, cmp = first_bitstream(segs)
        delay = round(t - when[3], 2) if t is not None and 3 in when else None
        pcm_first = bool(segs) and not segs[0][1]["non_pcm"]
        out.append(M.row("icefin/standby-wake",
                         ended and pcm_first and cmp["ok"] and cmp.get("format_ok") and delay is not None and 3.9 <= delay <= 7.0,
                         codec=c, ended=ended, pcm_first=pcm_first, wake_to_bitstream_s=delay, bitstream=cmp,
                         segments=[(t, m["seg"], m["non_pcm"], m["rate"], m["channels"]) for t, m in segs], log=wake_lines(log)))

        # Wake, back to standby 2 s later (inside the delay), wake again at 8 s.
        M.sh(M.AVSIM + ["profile", "standby"], check=True)
        time.sleep(2)
        ended, log, segs, when = ice.play_with_events(f"{c}-long", [(2, prof("avr-full")), (4, prof("standby")), (8, prof("avr-full"))])
        t, cmp = first_bitstream(segs)
        delay = round(t - when[8], 2) if t is not None and 8 in when else None
        early = [x for x, mm in segs if mm["non_pcm"] and x < when.get(8, 8) + 3.9]
        out.append(M.row("icefin/standby-flap", ended and cmp["ok"] and not early and delay is not None and 3.9 <= delay <= 7.0,
                         codec=c, ended=ended, wake2_to_bitstream_s=delay, early_bitstream=early, bitstream=cmp,
                         segments=[(t, m["seg"], m["non_pcm"]) for t, m in segs], log=wake_lines(log)))

        # The override: Always PCM; the receiver waking mid-track changes nothing.
        ice.set_standby("pcm")
        M.sh(M.AVSIM + ["profile", "standby"], check=True)
        time.sleep(2)
        ended, log, segs, when = ice.play_with_events(f"{c}-long", [(3, prof("avr-full"))])
        lines = [l for l in log.splitlines() if "Icefin audio:" in l and " -> " in l]
        out.append(M.row("icefin/standby-pcm",
                         ended and bool(segs) and not any(mm["non_pcm"] for _, mm in segs) and bool(lines) and "Always PCM" in lines[-1],
                         codec=c, ended=ended, segments=[(t, m["seg"], m["non_pcm"]) for t, m in segs], line=(lines or [""])[-1][-200:]))

        # The override: Keep Bitstream; the remembered ELD's bitstream straight away.
        ice.set_standby("bitstream")
        M.sh(M.AVSIM + ["profile", "standby"], check=True)
        time.sleep(2)
        ended, line, _, seg = ice.play(c)
        ok_stream, detail = check_stream(M, c, "bitstream", seg, pin_setup=False)
        out.append(M.row("icefin/standby-bitstream", ended and "stale" in line and decision_of(line) == "bitstream" and ok_stream,
                         codec=c, ended=ended, line=line[-300:],
                         note="Linux doesn't set up the HDMI pin while the ELD is invalid: no IEC958 non-audio bit, HBR "
                              "left as the previous stream had it (stock mpv the same); the bursts are intact", **detail))
        ice.set_standby("wake")

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
        # Never silent (3.6) with the HDMI device held by another program.
        def held_play(default_null):
            M.client("rm -f ~/.asoundrc" + ("; printf 'pcm.!default { type null }\\n' > ~/.asoundrc" if default_null else ""))
            M.client(f"nohup setsid timeout 60 aplay -q -D {dev} -f S16_LE -r 48000 -c 2 /dev/zero >/dev/null 2>&1 </dev/null & sleep 1; true")
            try:
                ended, line, new, seg = ice.play("ac3", timeout=45)
            finally:
                M.client("pkill -x aplay; rm -f ~/.asoundrc; true")
                time.sleep(1)
            steps = [l for l in new.splitlines() if "Icefin audio fallback" in l]
            return ended, steps, new
        ended, steps, new = held_play(True)
        has = lambda n: any(f"fallback {n}/3" in l for l in steps)
        out.append(M.row("icefin/fallback-default", ended and has(1) and has(2) and not has(3), ended=ended, steps=[l[-160:] for l in steps]))
        ended, steps, new = held_play(False)
        out.append(M.row("icefin/fallback-silent", ended and has(1) and has(2) and has(3), ended=ended, steps=[l[-160:] for l in steps]))
    finally:
        try:
            os.makedirs(M.RESULTS, exist_ok=True)
            with open(f"{M.RESULTS}/icefin-{time.strftime('%Y%m%d-%H%M%S')}.log", "w") as f:
                f.write(ice.log())
        except Exception:  # noqa: BLE001
            pass
        ice.stop()
    return out
