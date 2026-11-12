#!/usr/bin/env python3
"""edid_profiles.py — Virtual AV tier sinks from public EDIDs (PLAN 11.5 option A, docs/dev/HARDWARE-SIMULATION.md).

The linuxhw EDID collection (https://github.com/linuxhw/EDID, CC BY 4.0) holds EDIDs reported by real TVs, AV
receivers and soundbars. A sink's CEA-861 Audio Data Block (short audio descriptors) and Speaker Allocation are what
the HDMI driver turns into the ELD Icefin reads, so each distinct audio capability set becomes a Virtual AV tier
profile, with the decision the SPEC's rules give for it ("expect").

  edid_profiles.py stats EDID_DIR                    how many sinks, how many distinct audio capability sets
  edid_profiles.py write EDID_DIR [--max N]          profiles into profiles/public/ (+ SOURCES.md attribution)

EDID_DIR is a checkout of the collection (a sparse one is enough: Digital/<vendor>/ for TV, receiver and soundbar
makers; docs/LAB.md). Python 3 stdlib only.

Expected decision per codec (SPEC "HDMI audio passthrough", src/icefin/audio/Passthrough.cpp): bitstream when the
sink lists the codec and its ELD can carry the IEC 61937 stream (AC-3 and DTS 48 kHz stereo, E-AC-3 192 kHz stereo,
TrueHD 192 kHz on 8 channels), else PCM. The ELD's limits are the highest rate and channel count across all its
descriptors, at least 48 kHz and 2 channels, as Linux opens the HDMI PCM.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "profiles", "public")
CODECS = {1: "lpcm", 2: "ac3", 3: "mpeg1", 4: "mp3", 5: "mpeg2", 6: "aac", 7: "dts", 8: "atrac", 9: "dsd", 10: "eac3",
          11: "dtshd", 12: "truehd", 13: "dst", 14: "wma"}
RATES = [32000, 44100, 48000, 88200, 96000, 176400, 192000]
CARRIER = {"ac3": (48000, 2), "dts": (48000, 2), "eac3": (192000, 2), "truehd": (192000, 8)}
RECEIVERS = {"Yamaha", "DENON", "Marantz", "Onkyo", "Pioneer"}
SOUNDBARS = {"Bose"}
HEX = re.compile(r"^(?:[0-9a-f]{2} ){15}[0-9a-f]{2}$")


def edid_bytes(path):
    """The EDID: base block plus its extensions, from the file's leading hex dump."""
    data = bytearray()
    with open(path, errors="replace") as f:
        for line in f:
            line = line.strip()
            if HEX.match(line):
                data += bytes(int(x, 16) for x in line.split())
                if len(data) >= 128 and len(data) >= 128 * (1 + data[126]):
                    break
            elif data and line and not line.startswith("edid-decode"):
                break
    if len(data) < 128 or data[:8] != b"\x00\xff\xff\xff\xff\xff\xff\x00":
        return None
    return bytes(data[:128 * (1 + data[126])])


def parse(edid):
    """{name, sads: [{codec, channels, rates, byte3}], speakers} from the CEA-861 extension, or None without audio."""
    name = ""
    for off in range(54, 126, 18):
        d = edid[off:off + 18]
        if d[:3] == b"\x00\x00\x00" and d[3] == 0xFC:
            name = d[5:18].split(b"\n")[0].decode("ascii", "replace").strip()
    sads, speakers = [], None
    for blk in range(1, len(edid) // 128):
        ext = edid[blk * 128:(blk + 1) * 128]
        if ext[0] != 0x02 or ext[1] < 3:
            continue
        end, i = ext[2], 4
        while 4 <= i < end and i < 127:
            tag, length = ext[i] >> 5, ext[i] & 0x1F
            body = ext[i + 1:i + 1 + length]
            if tag == 1:  # Audio Data Block
                for j in range(0, len(body) - 2, 3):
                    b0, b1, b2 = body[j], body[j + 1], body[j + 2]
                    code = (b0 >> 3) & 0x0F
                    if code not in CODECS:
                        continue
                    sads.append({"codec": CODECS[code], "channels": (b0 & 7) + 1,
                                 "rates": [r for k, r in enumerate(RATES) if b1 & (1 << k)], "byte3": b2})
            elif tag == 4 and body:  # Speaker Allocation
                speakers = body[0]
            i += 1 + length
    if not sads:
        return None
    return {"name": name, "sads": sads, "speakers": speakers}


def expect_for(sads):
    max_rate = max([48000] + [max(s["rates"]) for s in sads if s["rates"]])
    max_ch = max([2] + [s["channels"] for s in sads])
    listed = {s["codec"] for s in sads}
    out = {}
    for codec, (rate, ch) in CARRIER.items():
        out[codec] = "bitstream" if codec in listed and rate <= max_rate and ch <= max_ch else "pcm"
    return out


def signature(p):
    sads = sorted((s["codec"], s["channels"], tuple(s["rates"])) for s in p["sads"])
    return (tuple(sads), p["speakers"])


def scan(root):
    sinks = []
    for vendor in sorted(os.listdir(os.path.join(root, "Digital"))):
        vdir = os.path.join(root, "Digital", vendor)
        for model in sorted(os.listdir(vdir)):
            for fn in sorted(os.listdir(os.path.join(vdir, model))):
                path = os.path.join(vdir, model, fn)
                e = edid_bytes(path)
                p = parse(e) if e else None
                if p:
                    p.update(vendor=vendor, model=model, source=os.path.relpath(path, root))
                    sinks.append(p)
    return sinks


def kind(vendor):
    return "receiver" if vendor in RECEIVERS else "soundbar" if vendor in SOUNDBARS else "tv"


def limits(sads):
    return (max([48000] + [max(x["rates"]) for x in sads if x["rates"]]), max([2] + [x["channels"] for x in sads]))


def pick(sinks, limit):
    """One sink per distinct audio capability set. First every distinct case the decision can meet (expect map and ELD
    limits), each from its most common capability set; then receivers and soundbars; then the TV sets seen most
    often, so the choice covers what people own rather than one-offs."""
    groups = {}
    for p in sinks:
        groups.setdefault(signature(p), []).append(p)
    rep = lambda g: next((p for p in g if kind(p["vendor"]) != "tv"), g[0])
    case = lambda g: (tuple(sorted(expect_for(g[0]["sads"]).items())), limits(g[0]["sads"]))
    by_count = sorted(groups.values(), key=lambda g: (-len(g), g[0]["source"]))
    chosen, seen_cases, used = [], set(), set()
    for g in by_count:
        if case(g) not in seen_cases:
            seen_cases.add(case(g))
            chosen.append(g)
            used.add(id(g))
    rest = sorted((g for g in by_count if id(g) not in used),
                  key=lambda g: (0 if any(kind(p["vendor"]) != "tv" for p in g) else 1, -len(g), g[0]["source"]))
    chosen += rest[:max(0, limit - len(chosen))]
    return [(rep(g), len(g)) for g in chosen[:max(limit, len(seen_cases))]], len(groups)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("stats", "write"):
        print(__doc__)
        return 2
    root = sys.argv[2]
    limit = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 40
    sinks = scan(root)
    chosen, distinct = pick(sinks, limit)
    if sys.argv[1] == "stats":
        by_kind = {}
        for p in sinks:
            by_kind[kind(p["vendor"])] = by_kind.get(kind(p["vendor"]), 0) + 1
        print(f"sinks with audio: {len(sinks)} {by_kind}; distinct audio capability sets: {distinct}")
        codecs = {}
        for p in sinks:
            for c in {s["codec"] for s in p["sads"]}:
                codecs[c] = codecs.get(c, 0) + 1
        print("sinks listing each codec:", dict(sorted(codecs.items(), key=lambda x: -x[1])))
        exp = {}
        for p, n in chosen:
            k = tuple(sorted(expect_for(p["sads"]).items()))
            exp[k] = exp.get(k, 0) + 1
        print(f"chosen {len(chosen)}; distinct expect maps among them: {len(exp)}; distinct limits: {len({limits(p['sads']) for p, _ in chosen})}")
        for k, n in sorted(exp.items(), key=lambda x: -x[1]):
            print(f"  {n:3} {dict(k)}")
        return 0
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if fn.endswith(".json"):
            os.remove(os.path.join(OUT, fn))
    lines = ["# Public sinks (Virtual AV tier, PLAN 11.5 option A)", "",
             "Generated by `tests/icefin/avsim/edid_profiles.py` from the linuxhw EDID collection",
             "(https://github.com/linuxhw/EDID), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
             "Only each sink's audio capabilities are kept (short audio descriptors, speaker allocation, monitor name),",
             "converted to profiles; `sinks` is how many EDIDs in the collection share that exact audio capability set.", "",
             "| Profile | Kind | Source (path in the collection) | Sinks |", "| --- | --- | --- | --- |"]
    for i, (p, n) in enumerate(chosen, 1):
        name = f"pub{i:02d}-{kind(p['vendor'])}-{slug(p['vendor'])}-{slug(p['model'])}"
        prof = {
            "description": f"{p['vendor']} {p['name'] or p['model']} ({kind(p['vendor'])}), from the linuxhw EDID collection: "
                           f"{p['source']} (CC BY 4.0); {n} EDIDs share this audio capability set",
            # Printable ASCII, single spaces (the kernel's eld text is read back word by word), at most 16 characters.
            "monitor_name": " ".join(re.sub(r"[^ -~]", "", p["name"] or p["model"]).split())[:16] or p["model"][:16],
            "speakers": "0x%02x" % (p["speakers"] if p["speakers"] is not None else 0x01),
            "sads": [{k: v for k, v in s.items() if k != "byte3" or s["codec"] not in ("lpcm", "ac3", "dts")} for s in p["sads"]],
            "expect": expect_for(p["sads"]),
            "source": p["source"],
        }
        for s in prof["sads"]:
            if s["codec"] in ("ac3", "dts", "mpeg1", "mp3", "mpeg2", "aac", "atrac"):
                b3 = next(x["byte3"] for x in p["sads"] if x["codec"] == s["codec"])
                s["max_kbps"] = b3 * 8
        with open(os.path.join(OUT, name + ".json"), "w") as f:
            json.dump(prof, f, indent=2)
            f.write("\n")
        lines.append(f"| {name} | {kind(p['vendor'])} | {p['source']} | {n} |")
    with open(os.path.join(OUT, "SOURCES.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"wrote {len(chosen)} profiles to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
