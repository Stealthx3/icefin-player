#!/usr/bin/env python3
"""iec61937.py — check what reached the virtual receiver (docs/LAB.md, "Virtual AV tier").

  iec61937.py scan CAPTURE.raw                 list the IEC 61937 bursts in a capture (codec, count, sizes)
  iec61937.py compare CAPTURE.raw REFERENCE.raw
        REFERENCE is the same track run through `ffmpeg -c:a copy -f spdif`. Passes when the capture holds
        the reference's bursts, in order and bit for bit (a few bursts may be missing at the very start or
        end, where players open and close the device).
  iec61937.py segment CAPTURE_DIR [SEG]        summary of one captured stream (default: the longest one)

Bursts are found by their preamble (Pa=0xF872, Pb=0x4E1F as little-endian 16-bit words), so the check does
not depend on the player's buffering or on silence around the stream. Prints one JSON object; exit 1 on a
failed compare. Python 3 stdlib only.
"""
import hashlib, json, os, struct, sys

SYNC = b"\x72\xf8\x1f\x4e"
TYPES = {1: "ac3", 3: "mpeg1-l1", 4: "mpeg1-l23", 5: "mpeg2-ext", 7: "aac", 11: "dts", 12: "dts", 13: "dts",
         17: "dtshd", 21: "eac3", 22: "truehd"}
HBR = {"dtshd", "truehd"}


def bursts(data):
    """[(type, pd, payload_hash, payload_len)] for every burst; the payload runs to the next preamble with
    trailing zero stuffing removed."""
    out, i = [], data.find(SYNC)
    while i >= 0 and i + 8 <= len(data):
        pc, pd = struct.unpack_from("<HH", data, i + 4)
        nxt = data.find(SYNC, i + 8)
        end = nxt if nxt >= 0 else len(data)
        payload = data[i + 8:end].rstrip(b"\0")
        out.append((pc & 0x7f, pd, hashlib.sha1(payload).hexdigest()[:16], len(payload)))
        i = nxt
    return out


def summary(bs):
    types = {}
    for t, *_ in bs:
        name = TYPES.get(t, f"type{t}")
        types[name] = types.get(name, 0) + 1
    return {"bursts": len(bs), "types": types}


def compare(cap, ref, edge=3):
    """Find the reference's burst sequence inside the capture. Allows up to `edge` reference bursts to be
    missing at either end (device open/close), but nothing in between."""
    if not ref:
        return {"ok": False, "reason": "reference has no IEC 61937 bursts"}
    if not cap:
        return {"ok": False, "reason": "capture has no IEC 61937 bursts (sent as PCM?)"}
    keys = [b[:3] for b in cap]
    rkeys = [b[:3] for b in ref]
    best = None
    for skip in range(0, min(edge, len(rkeys) - 1) + 1):        # reference bursts lost at the start
        try:
            start = keys.index(rkeys[skip])
        except ValueError:
            continue
        n = 0
        while skip + n < len(rkeys) and start + n < len(keys) and keys[start + n] == rkeys[skip + n]:
            n += 1
        missing_end = len(rkeys) - skip - n
        cand = {"skip_start": skip, "matched": n, "missing_end": missing_end, "at": start}
        if best is None or n > best["matched"]:
            best = cand
    if best is None:
        return {"ok": False, "reason": "no reference burst found in the capture (stream altered or re-encoded)"}
    best["ok"] = best["missing_end"] <= edge
    if not best["ok"]:
        i = best["skip_start"] + best["matched"]
        best["reason"] = f"capture diverges from the reference at burst {i} of {len(rkeys)}"
    return best


def load_segment(d, seg=None):
    metas = []
    for fn in sorted(os.listdir(d)):
        if fn.startswith("seg-") and fn.endswith(".json"):
            with open(os.path.join(d, fn)) as f:
                metas.append(json.load(f))
    if not metas:
        raise SystemExit(f"iec61937: no segments in {d}")
    if seg is None:
        return max(metas, key=lambda m: m.get("bytes", 0))
    return next(m for m in metas if m["seg"] == int(seg))


def main(argv):
    if len(argv) == 2 and argv[0] == "scan":
        with open(argv[1], "rb") as f:
            print(json.dumps(summary(bursts(f.read()))))
        return 0
    if len(argv) == 3 and argv[0] == "compare":
        with open(argv[1], "rb") as f:
            cap = bursts(f.read())
        with open(argv[2], "rb") as f:
            ref = bursts(f.read())
        res = compare(cap, ref)
        res.update({"capture": summary(cap), "reference": summary(ref)})
        print(json.dumps(res))
        return 0 if res["ok"] else 1
    if len(argv) in (2, 3) and argv[0] == "segment":
        m = load_segment(argv[1], argv[2] if len(argv) == 3 else None)
        with open(os.path.join(argv[1], m["raw"]), "rb") as f:
            m["iec61937"] = summary(bursts(f.read()))
        print(json.dumps(m))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
