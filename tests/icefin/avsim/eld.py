#!/usr/bin/env python3
"""eld.py — ELD (EDID-Like Data) for the virtual receiver (docs/LAB.md, "Virtual AV tier").

  eld.py build PROFILE.json OUT.eld     binary ELD (HDA spec ELD v2 / CEA-861) from a sink profile
  eld.py compare KERNEL.txt FIXTURE.txt every line of the fixture must appear in the kernel's /proc eld text
                                        (the kernel prints more lines, e.g. codec_pin_nid, sad*_bits)
  eld.py profiles                       list the profiles

A profile names the sink the guest should see: monitor name, speakers and short audio descriptors (SADs).
Its "fixture" is the /proc text Icefin's unit tests parse; the Virtual AV tier proves the kernel produces
that text from this ELD, so the unit-test fixtures are what a real driver reports.
Python 3 stdlib only.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILES = os.path.join(HERE, "profiles")

# CEA-861 audio format codes
CODING = {"lpcm": 1, "ac3": 2, "mpeg1": 3, "mp3": 4, "mpeg2": 5, "aac": 6, "dts": 7, "atrac": 8,
          "dsd": 9, "eac3": 10, "dtshd": 11, "truehd": 12, "dst": 13, "wma": 14}
RATES = {32000: 0, 44100: 1, 48000: 2, 88200: 3, 96000: 4, 176400: 5, 192000: 6}


def load(name_or_path):
    path = name_or_path
    if not os.path.exists(path):
        path = os.path.join(PROFILES, name_or_path + ".json")
    with open(path) as f:
        p = json.load(f)
    p.setdefault("name", os.path.splitext(os.path.basename(path))[0])
    return p


def sad_bytes(sad):
    code = CODING[sad["codec"]]
    ch = int(sad["channels"])
    if not 1 <= ch <= 8:
        raise ValueError(f"{sad}: channels must be 1-8")
    rates = 0
    for r in sad["rates"]:
        rates |= 1 << RATES[int(r)]
    if code == CODING["lpcm"]:
        bits = {16: 1, 20: 2, 24: 4}
        b2 = sum(bits[b] for b in sad.get("bits", [16, 20, 24]))
    elif 2 <= code <= 8:
        b2 = int(sad.get("max_kbps", 640)) // 8     # max bit rate / 8 kbit/s
    else:
        b2 = int(sad.get("byte3", 0))               # format-dependent (e.g. bit 0 = Atmos/JOC for E-AC-3)
    return bytes([(code << 3) | (ch - 1), rates, b2 & 0xff])


def build(p):
    """Binary ELD, or b'' for a sink without one (standby: presence without ELD valid)."""
    if not p.get("eld_valid", True):
        return b""
    name = p["monitor_name"].encode("ascii")
    if len(name) > 16:
        raise ValueError("monitor_name: at most 16 characters")
    sads = b"".join(sad_bytes(s) for s in p["sads"])
    if len(p["sads"]) > 15:
        raise ValueError("at most 15 SADs")
    conn = {"HDMI": 0, "DisplayPort": 1}[p.get("connection", "HDMI")]
    baseline = bytearray(16)
    baseline[0] = (3 << 5) | len(name)                       # CEA_EDID_Ver 3 (861-B/C/D), MNL
    baseline[1] = (len(p["sads"]) << 4) | (conn << 2) | (int(p.get("support_ai", True)) << 1) | int(p.get("support_hdcp", False))
    baseline[2] = int(p.get("audio_sync_delay_ms", 0)) // 2
    baseline[3] = int(str(p.get("speakers", "0x7f")), 0) & 0x7f
    baseline[4:12] = int(str(p.get("port_id", "0")), 0).to_bytes(8, "little")
    baseline[12:14] = int(str(p.get("manufacture_id", "0x4d10")), 0).to_bytes(2, "little")
    baseline[14:16] = int(str(p.get("product_id", "0x1")), 0).to_bytes(2, "little")
    body = bytes(baseline) + name + sads
    body += b"\0" * (-len(body) % 4)                         # baseline length is in dwords
    header = bytes([2 << 3, 0, len(body) // 4, 0])           # ELD_Ver 2
    return header + body


def parse_text(text):
    out = {}
    for line in text.splitlines():
        parts = line.split(None, 1)
        if parts:
            out[parts[0]] = " ".join(parts[1].split()) if len(parts) > 1 else ""
    return out


def compare(kernel_text, fixture_text):
    k, f = parse_text(kernel_text), parse_text(fixture_text)
    return [f"{key}: kernel {k.get(key)!r}, fixture {val!r}" for key, val in f.items() if k.get(key) != val]


def main(argv):
    if len(argv) >= 3 and argv[0] == "build":
        data = build(load(argv[1]))
        with open(argv[2], "wb") as f:
            f.write(data)
        print(f"eld: {argv[2]} ({len(data)} bytes)")
        return 0
    if len(argv) == 3 and argv[0] == "compare":
        diffs = compare(open(argv[1]).read(), open(argv[2]).read())
        for d in diffs:
            print("eld: differs:", d)
        print("eld: match" if not diffs else f"eld: {len(diffs)} differences")
        return 1 if diffs else 0
    if argv[:1] == ["profiles"]:
        for fn in sorted(os.listdir(PROFILES)):
            if fn.endswith(".json"):
                p = load(os.path.join(PROFILES, fn))
                print(f"{p['name']:<16} {p.get('description', '')}")
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
