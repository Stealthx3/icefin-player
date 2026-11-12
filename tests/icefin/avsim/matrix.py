#!/usr/bin/env python3
"""matrix.py — Virtual AV tier rows (docs/LAB.md). Runs inside lab-icefin-main with the client up
(`avsim.sh up`); drives the client over SSH and reads the sink's captures directly.

  matrix.py [--rows eld,hotplug,transport,pcm] [--player mpv] [--only CODEC,...]
  matrix.py --player icefin --app ~/build/src/icefin-player [--only CODEC,...]   (PLAN 3.9, icefin.py)

Rows:
  eld/<profile>        switch the sink to the profile; the client's /proc/asound eld text must contain the
                       profile's fixture (tests/icefin/unit/fixtures/eld) line for line, so the fixtures Icefin's
                       unit tests parse are what the kernel really reports for that ELD
  hotplug              unplug: monitor_present 0; plug: back to 1 with the same ELD
  transport/<codec>    play the codec as a bitstream (sink: avr-full); the capture must hold the reference
                       `ffmpeg -c:a copy -f spdif` bursts bit for bit, with the IEC958 non-audio bit set, and
                       TrueHD / DTS-HD on an 8-channel 192 kHz HBR stream
  limit/eac3-on-48k-sink  E-AC-3 to a sink whose ELD stops at 48 kHz: no bitstream gets through (Linux limit)
  pcm/ac3              the same AC-3 track decoded: non-audio bit clear, no bursts, 6 channels of PCM
With --player icefin the rows are Icefin's own (icefin.py): its per-track decision against every profile's expect
map, the ELD read again on hotplug, the stale result in standby, and unplugging without a stall.
Prints one JSON line per row and a summary; results also go to ~/avsim/results/. Exit 1 if a row fails.
"""
import argparse, json, os, shlex, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../.."))
AV = os.path.expanduser("~/avsim")
CAP, SAMPLES, RESULTS = f"{AV}/capture", f"{AV}/samples", f"{AV}/results"
AVSIM = ["bash", f"{HERE}/avsim.sh"]
sys.path.insert(0, HERE)
import eld as eldmod, iec61937  # noqa: E402

# Samples: codec -> (ffmpeg encode args, channels). DTS-HD MA has no free encoder; supply a file as
# ~/avsim/samples/dtshd.mka to add that row (Kodi's free samples, see SPEC "Testing, CI and hardware lab").
SAMPLE_SPEC = {
    "ac3":    (["-c:a", "ac3", "-b:a", "448k"], 6),
    "eac3":   (["-c:a", "eac3", "-b:a", "640k"], 6),
    "dts":    (["-c:a", "dca", "-strict", "-2", "-b:a", "1509k"], 6),
    "truehd": (["-c:a", "truehd", "-strict", "-2"], 2),
}
HBR = {"truehd", "dtshd"}


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def client(cmd, timeout=120):
    try:
        r = sh(AVSIM + ["ssh", cmd], timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {timeout}s: {cmd}"
    return r.returncode, r.stdout + r.stderr


def ensure_samples(codecs):
    os.makedirs(SAMPLES, exist_ok=True)
    for c in codecs:
        mka, ref = f"{SAMPLES}/{c}.mka", f"{SAMPLES}/{c}.spdif"
        if not os.path.exists(mka):
            if c not in SAMPLE_SPEC:
                raise SystemExit(f"matrix: no sample for {c}; put one at {mka}")
            args, ch = SAMPLE_SPEC[c]
            layout = "5.1" if ch == 6 else "stereo"
            sh(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                f"sine=frequency=440:duration=8,aformat=channel_layouts={layout}", "-ar", "48000", *args, mka], check=True)
        if not os.path.exists(ref):
            sh(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", mka, "-c:a", "copy", "-f", "spdif", ref], check=True)
        rc, out = client(f"test -f /tmp/{c}.mka && echo have")
        if "have" not in out:
            with open(mka, "rb") as f:
                subprocess.run(AVSIM + ["ssh", f"cat > /tmp/{c}.mka"], stdin=f, check=True, capture_output=True)


def hdmi_device():
    rc, out = client("aplay -l")
    for line in out.splitlines():
        if line.startswith("card ") and "HDMI" in line:
            card = line.split()[2]               # "card 0: Intel [HDA Intel], device 3: HDMI 0 [HDMI 0]"
            return f"hdmi:CARD={card},DEV=0"
    raise SystemExit("matrix: the client has no HDMI PCM (did snd-hda-codec-hdmi bind the sink?)\n" + out)


def client_eld():
    rc, out = client("for f in /proc/asound/card*/eld#*; do echo \"== $f\"; cat \"$f\"; done")
    blocks = [b.split("\n", 1)[1] if "\n" in b else "" for b in out.split("== ")[1:]]
    return blocks[0] if blocks else ""


def segments():
    return sorted(int(f[4:8]) for f in os.listdir(CAP) if f.startswith("seg-") and f.endswith(".json"))


def newest_segment_since(before):
    new = [s for s in segments() if s not in before]
    if not new:
        return None
    metas = []
    for s in new:
        with open(f"{CAP}/seg-{s:04d}.json") as f:
            metas.append(json.load(f))
    return max(metas, key=lambda m: m.get("bytes", 0))


def row(name, ok, **detail):
    r = {"row": name, "ok": bool(ok), **detail}
    print(json.dumps(r), flush=True)
    return r


def rows_eld():
    out = []
    for fn in sorted(os.listdir(f"{HERE}/profiles")):
        p = eldmod.load(f"{HERE}/profiles/{fn}")
        sh(AVSIM + ["profile", p["name"]], check=True)
        time.sleep(2)
        text = client_eld()
        if p.get("fixture"):
            diffs = eldmod.compare(text, open(os.path.join(ROOT, p["fixture"])).read())
            out.append(row(f"eld/{p['name']}", not diffs, fixture=p["fixture"], diffs=diffs))
        else:
            got = eldmod.parse_text(text)
            want = len(p["sads"])
            ok = got.get("eld_valid") == "1" and got.get("sad_count") == str(want) and got.get("monitor_name") == p["monitor_name"]
            out.append(row(f"eld/{p['name']}", ok, sad_count=got.get("sad_count"), monitor_name=got.get("monitor_name")))
    sh(AVSIM + ["profile", "avr-full"], check=True)
    return out


def rows_hotplug():
    sh(AVSIM + ["unplug"], check=True); time.sleep(2)
    off = eldmod.parse_text(client_eld())
    sh(AVSIM + ["plug"], check=True); time.sleep(2)
    on = eldmod.parse_text(client_eld())
    ok = off.get("monitor_present") == "0" and on.get("monitor_present") == "1" and on.get("eld_valid") == "1"
    return [row("hotplug", ok, unplugged=off.get("monitor_present"), plugged=on.get("monitor_present"),
                eld_valid=on.get("eld_valid"))]


def play(dev, codec, spdif, extra=""):
    flags = (f"--audio-spdif={spdif}" if spdif else "--audio-spdif=") + (" " + extra if extra else "")
    cmd = (f"timeout 60 mpv --no-config --really-quiet --vo=null --no-video --ao=alsa "
           f"--audio-device=alsa/{dev} --audio-exclusive=yes {flags} /tmp/{codec}.mka")
    before = set(segments())
    rc, out = client(cmd, timeout=120)
    time.sleep(1)
    return rc, out, newest_segment_since(before)


def rows_transport(dev, codecs):
    out = []
    for c in codecs:
        sh(AVSIM + ["profile", "avr-full"], check=True)
        rc, log, seg = play(dev, c, "ac3,eac3,dts,dts-hd,truehd")
        if not seg:
            out.append(row(f"transport/{c}", False, reason="no stream reached the sink", mpv_rc=rc, log=log[-400:]))
            continue
        with open(f"{CAP}/{seg['raw']}", "rb") as f:
            cap = iec61937.bursts(f.read())
        with open(f"{SAMPLES}/{c}.spdif", "rb") as f:
            ref = iec61937.bursts(f.read())
        cmp = iec61937.compare(cap, ref)
        want_hbr = c in HBR
        fmt_ok = seg["non_pcm"] and (seg["hbr"] == want_hbr) and (seg["channels"] == (8 if want_hbr else 2))
        out.append(row(f"transport/{c}", cmp["ok"] and fmt_ok, seg=seg["seg"], rate=seg["rate"],
                       channels=seg["channels"], non_pcm=seg["non_pcm"], hbr=seg["hbr"], bursts=cmp,
                       mpv_rc=rc))
    return out


def rows_limit(dev):
    """A sink whose ELD tops out at 48 kHz (soundbar-eac3) cannot take E-AC-3's 192 kHz IEC 61937 stream:
    the kernel limits the HDMI PCM rates to the ELD's. The player must not get a bitstream through."""
    sh(AVSIM + ["profile", "soundbar-eac3"], check=True)
    time.sleep(2)
    rc, log, seg = play(dev, "eac3", "eac3")
    sh(AVSIM + ["profile", "avr-full"], check=True)
    leaked = bool(seg and seg["non_pcm"] and seg["rate"] == 192000)
    return [row("limit/eac3-on-48k-sink", not leaked, mpv_rc=rc, seg=seg and seg["seg"],
                note="the kernel refuses 192 kHz on this ELD and mpv 0.40 then stalls (rc 124 = killed after 60 s) "
                     "instead of failing over, so Icefin must pick PCM from the ELD up front (PLAN 3.9)")]


def rows_pcm(dev):
    rc, log, seg = play(dev, "ac3", "", "--audio-channels=5.1")   # mpv's default (auto-safe) downmixes to stereo
    if not seg:
        return [row("pcm/ac3", False, reason="no stream reached the sink", mpv_rc=rc, log=log[-400:])]
    with open(f"{CAP}/{seg['raw']}", "rb") as f:
        bs = iec61937.bursts(f.read())
    ok = not seg["non_pcm"] and not bs and seg["channels"] == 6
    return [row("pcm/ac3", ok, seg=seg["seg"], channels=seg["channels"], non_pcm=seg["non_pcm"], bursts=len(bs))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", default="eld,hotplug,transport,limit,pcm")
    ap.add_argument("--only", default=",".join(SAMPLE_SPEC))
    ap.add_argument("--player", default="mpv", choices=["mpv", "icefin"])
    ap.add_argument("--app", help="--player icefin: the native Icefin build to run in the client")
    a = ap.parse_args()
    if a.player == "icefin" and not a.app:
        raise SystemExit("matrix: --player icefin needs --app")
    rows = a.rows.split(",")
    codecs = [c for c in a.only.split(",") if c]
    if os.path.exists(f"{SAMPLES}/dtshd.mka") and "dtshd" not in codecs:
        codecs.append("dtshd")
    st = sh(AVSIM + ["status"]).stdout
    if "running" not in st:
        raise SystemExit("matrix: client not running (avsim.sh up)")
    results = []
    if a.player == "icefin":
        import icefin  # noqa: E402
        ensure_samples(sorted(set(codecs) | {"ac3", "eac3"}))
        results += icefin.rows(sys.modules[__name__], a.app, codecs)
        rows = []
    if "eld" in rows:
        results += rows_eld()
    if "hotplug" in rows:
        results += rows_hotplug()
    if {"transport", "limit", "pcm"} & set(rows):
        ensure_samples(sorted(set(codecs) | {"ac3", "eac3"}))
        dev = hdmi_device()
        if "transport" in rows:
            results += rows_transport(dev, codecs)
        if "limit" in rows:
            results += rows_limit(dev)
        if "pcm" in rows:
            results += rows_pcm(dev)
    passed = sum(r["ok"] for r in results)
    summary = {"summary": f"{passed}/{len(results)} rows pass", "failed": [r["row"] for r in results if not r["ok"]]}
    print(json.dumps(summary))
    os.makedirs(RESULTS, exist_ok=True)
    with open(f"{RESULTS}/matrix-{time.strftime('%Y%m%d-%H%M%S')}.json", "w") as f:
        json.dump({"rows": results, **summary}, f, indent=1)
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
