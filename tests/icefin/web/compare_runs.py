#!/usr/bin/env python3
"""compare_runs.py — compare session_play.py results (e.g. upstream vs Icefin) and print only what differs.
Usage: python3 compare_runs.py REFERENCE.json CANDIDATE.json [--allow identity.Client,identity.ApplicationVersion]
Exit 1 if anything outside --allow differs. Playback Reporting rows are compared without client name/duration
jitter (duration within 3 s); Activity Log entries by type sequence."""
import json, sys

def load(p):
    d = json.load(open(p))
    pr = d.get("playback_reporting") or []
    return {
        "ok": d.get("ok"),
        "identity.Client": d.get("identity", {}).get("Client"),
        "identity.ApplicationVersion": d.get("identity", {}).get("ApplicationVersion"),
        "identity.SupportsMediaControl": d.get("identity", {}).get("SupportsMediaControl"),
        "identity.PlayableMediaTypes": d.get("identity", {}).get("PlayableMediaTypes"),
        "identity.SupportedCommands": sorted(d.get("identity", {}).get("SupportedCommands") or []),
        "play_method": sorted({t.get("method") for t in d.get("timeline", [])}),
        "activity_types": [a["type"] for a in d.get("activity", []) if a["type"].startswith(("VideoPlayback", "AudioPlayback"))],
        "reporting.rows": len(pr),
        "reporting.item_method": [(r[0], r[1], r[2]) for r in pr] if pr and isinstance(pr[0], list) else pr,
        "reporting.client": [r[3] for r in pr] if pr and isinstance(pr[0], list) else None,
        "reporting.duration": [int(r[5]) for r in pr] if pr and isinstance(pr[0], list) else None,
        "app_log_errors": len(d.get("app_log_errors", [])),
    }

a, b = load(sys.argv[1]), load(sys.argv[2])
allow = set(sys.argv[sys.argv.index("--allow") + 1].split(",")) if "--allow" in sys.argv else set()
diffs = []
for k in a:
    va, vb = a[k], b[k]
    if k == "reporting.duration" and va and vb and len(va) == len(vb) and all(abs(x - y) <= 3 for x, y in zip(va, vb)):
        continue
    if va != vb:
        diffs.append((k, va, vb, k in allow))
for k, va, vb, ok in diffs:
    print(f"  {'allowed' if ok else 'DIFF   '} {k}: {va!r} -> {vb!r}")
bad = [d for d in diffs if not d[3]]
print(f"compare: {len(diffs)} differences, {len(bad)} unexpected")
sys.exit(1 if bad else 0)
