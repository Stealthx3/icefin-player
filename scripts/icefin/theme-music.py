#!/usr/bin/env python3
"""theme-music.py — the bundled themes' music, synthesised from recipes (PLAN 9.33; the user's approval of Plaza's
mock-ups, 2026-11-12).

A theme's recipes live in scripts/icefin/theme_music/<id>.py (startup jingle, ambient loop, named jingles) over the
primitives in theme_music/synth.py: oscillators, FM, Karplus-Strong plucks, additive pads, filtered noise and a reverb.
No recorded or sampled audio, and no target's music (CLAUDE.md clone rules).

  python3 scripts/icefin/theme-music.py [id ...]   render, encode Ogg Vorbis (ffmpeg, libvorbis q5) into
                                                    themes/<id>/music/, write the "music" map in theme.json and
                                                    theme_music/<id>.lock.json (hashes of the recipes and the files).
                                                    Needs numpy, scipy and ffmpeg.
  python3 scripts/icefin/theme-music.py --check    CI, standard library only: the recipes still hash to the lock (so a
                                                    changed recipe needs a new render), every file is the one rendered,
                                                    Ogg Vorbis 48 kHz stereo of a sensible length, and theme.json
                                                    declares exactly these files.

Ogg encoders aren't byte-stable across versions, so --check compares against the lock rather than re-rendering.
"""
import hashlib, importlib, json, os, struct, subprocess, sys, tempfile, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PKG = os.path.join(HERE, "theme_music")
LIMITS = {"startup": (2.0, 8.0), "ambient": (20.0, 180.0), "jingle": (1.5, 8.0)}  # seconds


def themes():
    return sorted(f[:-3] for f in os.listdir(PKG) if f.endswith(".py") and f not in ("__init__.py", "synth.py"))


def recipe_hash(tid):
    h = hashlib.sha256()
    for f in ("synth.py", f"{tid}.py"):
        h.update(f.encode() + b"\0" + open(os.path.join(PKG, f), "rb").read() + b"\0")
    return h.hexdigest()


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def lock_path(tid):
    return os.path.join(PKG, f"{tid}.lock.json")


# ---- Ogg Vorbis, read with the standard library ----
def ogg_info(path):
    """(channels, rate, seconds) of an Ogg Vorbis file, or raises ValueError."""
    data = open(path, "rb").read()
    if data[:4] != b"OggS":
        raise ValueError("not an Ogg file")
    nseg = data[26]
    body = 27 + nseg
    pkt = data[body:body + sum(data[27:27 + nseg])]
    if pkt[:7] != b"\x01vorbis":
        raise ValueError("first packet is not a Vorbis identification header")
    channels, rate = pkt[11], struct.unpack("<I", pkt[12:16])[0]
    last = data.rfind(b"OggS")
    granule = struct.unpack("<q", data[last + 6:last + 14])[0]
    if rate <= 0 or granule <= 0:
        raise ValueError("no length")
    return channels, rate, granule / rate


def music_map(names):
    m = {}
    if "startup" in names:
        m["startup"] = "music/startup.ogg"
    if "ambient" in names:
        m["ambient"] = "music/ambient.ogg"
    j = {n: f"music/{n}.ogg" for n in names if n not in ("startup", "ambient")}
    if j:
        m["jingles"] = j
    return m


def write_theme_json(tid, want):
    p = os.path.join(ROOT, "themes", tid, "theme.json")
    s = open(p).read()
    meta = json.loads(s)
    if meta.get("music") == want:
        return
    if "music" in meta:
        meta["music"] = want
        open(p, "w").write(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
        return
    # Insert after "sounds" (or before "presets"/"schemes"/"backdrop"), keeping the file's own formatting.
    block = '  "music": ' + json.dumps(want, indent=2).replace("\n", "\n  ") + ",\n"
    for key in ('"presets"', '"schemes"', '"backdrop"'):
        i = s.find("\n  " + key)
        if i >= 0:
            s = s[:i + 1] + block + s[i + 1:]
            break
    else:
        s = s.rstrip()[:-1].rstrip() + ",\n" + block.rstrip(",\n") + "\n}\n"
    json.loads(s)
    open(p, "w").write(s)


def render(tid):
    import numpy as np  # noqa: F401  (render only)
    sys.path.insert(0, HERE)
    synth = importlib.import_module("theme_music.synth")
    mod = importlib.import_module(f"theme_music.{tid}")
    out = os.path.join(ROOT, "themes", tid, "music")
    os.makedirs(out, exist_ok=True)
    files = {}
    with tempfile.TemporaryDirectory() as tmp:
        for name, fn in mod.PIECES.items():
            synth.reseed(zlib.crc32(f"{tid}/{name}".encode()))
            st = fn()
            if name != mod.AMBIENT:
                st = synth.master(st)
            wav = os.path.join(tmp, name + ".wav")
            synth.save(wav, st)
            ogg = os.path.join(out, name + ".ogg")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-map_metadata", "-1", "-fflags", "+bitexact",
                            "-c:a", "libvorbis", "-q:a", "5", ogg], check=True)
            files[name] = sha(ogg)
            print(f"theme-music: {tid}/{name}: {st.shape[1] / synth.SR:.1f} s, {os.path.getsize(ogg) // 1024} KiB", flush=True)
    for f in os.listdir(out):
        if f.endswith(".ogg") and f[:-4] not in files:
            os.remove(os.path.join(out, f))
    want = music_map(list(mod.PIECES))
    write_theme_json(tid, want)
    json.dump({"recipes": recipe_hash(tid), "music": want, "files": files}, open(lock_path(tid), "w"), indent=1, sort_keys=True)
    open(lock_path(tid), "a").write("\n")


def check():
    bad, n = [], 0
    for tid in themes():
        lp = lock_path(tid)
        if not os.path.exists(lp):
            bad.append(f"{tid}: no lock (run scripts/icefin/theme-music.py {tid})")
            continue
        lock = json.load(open(lp))
        if lock.get("recipes") != recipe_hash(tid):
            bad.append(f"{tid}: the recipes changed since the files were rendered (run scripts/icefin/theme-music.py {tid})")
        meta = json.load(open(os.path.join(ROOT, "themes", tid, "theme.json")))
        if meta.get("music") != lock.get("music"):
            bad.append(f"{tid}: theme.json \"music\" doesn't match the rendered files")
        for name, digest in sorted(lock.get("files", {}).items()):
            n += 1
            path = os.path.join(ROOT, "themes", tid, "music", name + ".ogg")
            if not os.path.exists(path):
                bad.append(f"{tid}/{name}: missing")
                continue
            if sha(path) != digest:
                bad.append(f"{tid}/{name}: not the rendered file (run scripts/icefin/theme-music.py {tid})")
            try:
                ch, rate, sec = ogg_info(path)
            except ValueError as e:
                bad.append(f"{tid}/{name}: {e}")
                continue
            lo, hi = LIMITS.get(name, LIMITS["jingle"])
            if (ch, rate) != (2, 48000) or not lo <= sec <= hi:
                bad.append(f"{tid}/{name}: {ch} ch, {rate} Hz, {sec:.1f} s (want stereo 48 kHz, {lo:.0f}-{hi:.0f} s)")
        extra = [f for f in os.listdir(os.path.join(ROOT, "themes", tid, "music")) if f.endswith(".ogg") and f[:-4] not in lock.get("files", {})]
        bad += [f"{tid}/{f}: not rendered by a recipe" for f in extra]
    for b in bad:
        print("theme-music: FAIL " + b)
    print(f"theme-music: {'OK' if not bad else 'FAILED'} ({len(themes())} themes, {n} pieces)")
    return 1 if bad else 0


def main():
    if "--check" in sys.argv:
        return check()
    for tid in [a for a in sys.argv[1:] if not a.startswith("-")] or themes():
        render(tid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
