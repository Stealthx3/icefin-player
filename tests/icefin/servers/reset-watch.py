#!/usr/bin/env python3
"""reset-watch.py — put the lab servers' watch state back to the fixture's (PLAN 11.1). Lab guests only.

Playback tests report progress like any client, so over a matrix run the test user's items pile up as played or
part-played (the test show's first episode played, so Next Up holds one episode; books part-read). Home rows built
from that state then hold one item where the theme tests expect several, and a theme's results depend on the order
the tests ran in. This clears it: every item the test user has played or started is marked unplayed with no position,
and its last-played date goes back to 2000-01-01 (the API can't clear one), outside Next Up's cutoff (the user's "Max
days in Next Up", which themes apply through ui.nextUpQuery as jellyfin-web does). Continue Watching and Next Up then
start empty and themes fall back to their newest items. It also puts the test user's library order back
(setup.library_order: Movies, Music, Shows first), so a theme's first row is films, as the theme tests expect.

Usage: python3 reset-watch.py [servers.json] [--server jf12]
Only the test user's watch state and library order change: no item, library or server setting is touched.
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from setup import Server, creds, library_order  # noqa: E402

OLD = "2000-01-01T00:00:00.0000000Z"


def reset(s, c):
    auth = s.call("POST", "/Users/AuthenticateByName", {"Username": c["user"], "Pw": c["password"]})
    s.token, uid = auth["AccessToken"], auth["User"]["Id"]
    # Folders' played state is their contents' (an empty "collections" folder reads as played): items only
    items = lambda: [it for it in s.call("GET", f"/Items?userId={uid}&Recursive=true&IsFolder=false&Fields=UserData&Limit=5000")["Items"] if not it.get("IsFolder")]
    marked = lambda d: bool(d.get("Played") or d.get("PlaybackPositionTicks") or d.get("PlayCount"))
    recent = lambda d: (d.get("LastPlayedDate") or OLD) > "2000-01-02"
    todo = [it for it in items() if marked(it.get("UserData") or {}) or recent(it.get("UserData") or {})]
    for it in todo:
        # JF 10.9+ (both lab servers are 10.11 or newer): one call for all of it
        s.call("POST", f"/UserItems/{it['Id']}/UserData?userId={uid}",
               {"Played": False, "PlaybackPositionTicks": 0, "PlayCount": 0, "LastPlayedDate": OLD})
    left = [it["Name"] for it in items() if marked(it.get("UserData") or {}) or recent(it.get("UserData") or {})]
    return len(todo), left, library_order(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("config", nargs="?", default=os.path.join(HERE, "servers.json"))
    ap.add_argument("--server", help="only this server (default: all)")
    a = ap.parse_args()
    c, bad = creds(), 0
    for sc in json.load(open(a.config))["servers"]:
        if a.server and sc["name"] != a.server:
            continue
        if sc["name"] not in c:
            print(f"reset-watch: {sc['name']}: no credentials (run setup.py first)")
            bad += 1
            continue
        try:
            n, left, order = reset(Server(sc), c[sc["name"]])
            print(f"reset-watch: {sc['name']}: {n} item(s) back to unwatched" + (f"; still marked: {', '.join(left)}" if left else "")
                  + f"; libraries: {', '.join(order)}")
            bad += bool(left)
        except Exception as e:  # noqa: BLE001
            print(f"reset-watch: {sc['name']}: {type(e).__name__}: {e}")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
