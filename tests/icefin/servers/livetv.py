#!/usr/bin/env python3
"""livetv.py — Live TV data on the lab Jellyfin servers (PLAN 9.15: the guide-grid theme needs channels and a guide).
Python 3 stdlib only; run inside a lab guest after setup.py.

Usage: python3 livetv.py servers.json [--channels 24]
Writes ~/jf/media/livetv/channels.m3u (channels that stream the lab's own test clips) and guide.xml (XMLTV:
programmes from 6 hours ago to 2 days ahead, 30 to 120 minutes long, with categories and descriptions; invented
titles), registers an M3U tuner and an XMLTV listing provider on each server once, refreshes the guide and waits until
the server lists current programmes. Idempotent: run it again before a test to move the guide window to now.
"""
import argparse, datetime, json, os, sys, time, urllib.parse
from xml.sax.saxutils import escape, quoteattr

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from setup import Server, creds  # noqa: E402

MEDIA = os.path.expanduser("~/jf/media")
DIR = os.path.join(MEDIA, "livetv")
CLIPS = ["movies/SDR H264 AAC (2026)/SDR H264 AAC (2026).mkv", "movies/SDR AV1 Opus (2026)/SDR AV1 Opus (2026).mkv"]
CHANNEL_NAMES = ["Icefin One", "Harbour News", "Northwind Sports", "Lantern Movies", "Tidewater Kids", "Copper Docs", "Meridian Music",
                 "Glacier Weather", "Ember Drama", "Quartz Comedy", "Atlas Travel", "Fjord Food", "Summit Science", "Delta History",
                 "Aurora Nature", "Pebble Cartoons", "Beacon Talk", "Cobalt Classics", "Riverbank Local", "Solstice Arts", "Tundra Reality",
                 "Orchard Home", "Vector Tech", "Harvest Lifestyle"]
SHOWS = [("Evening Report", "News", 30), ("Morning Brief", "News", 60), ("Match Night", "Sports", 120), ("The Long Field", "Sports", 90),
         ("Feature Presentation", "Movie", 120), ("Matinee", "Movie", 90), ("Paper Boats", "Kids", 30), ("Tin Robots", "Kids", 30),
         ("Deep Water", "Documentary", 60), ("Small Worlds", "Documentary", 60), ("Studio Sessions", "Music", 60), ("Forecast", "News", 30),
         ("Harbour Lights", "Drama", 60), ("Stand-Up Hour", "Comedy", 60), ("Open Roads", "Travel", 30), ("Kitchen Table", "Food", 30),
         ("Lab Notes", "Science", 60), ("Old Maps", "History", 60)]


def write_files(n):
    os.makedirs(DIR, exist_ok=True)
    m3u = ["#EXTM3U"]
    for i in range(n):
        name = CHANNEL_NAMES[i % len(CHANNEL_NAMES)]
        m3u.append(f'#EXTINF:-1 tvg-id="icefin.ch{i + 1}" tvg-name="{name}" tvg-chno="{i + 1}",{name}')
        m3u.append("/media/" + CLIPS[i % len(CLIPS)])
    open(os.path.join(DIR, "channels.m3u"), "w").write("\n".join(m3u) + "\n")
    now = datetime.datetime.now(datetime.timezone.utc).replace(minute=0, second=0, microsecond=0)
    start0 = now - datetime.timedelta(hours=6)
    fmt = lambda t: t.strftime("%Y%m%d%H%M%S +0000")
    x = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="icefin-lab">']
    for i in range(n):
        x.append(f'  <channel id="icefin.ch{i + 1}"><display-name>{escape(CHANNEL_NAMES[i % len(CHANNEL_NAMES)])}</display-name></channel>')
    for i in range(n):
        t, k = start0, 0
        while t < now + datetime.timedelta(days=2):
            title, cat, length = SHOWS[(i * 7 + k * 3) % len(SHOWS)]
            end = t + datetime.timedelta(minutes=length)
            x.append(f'  <programme start="{fmt(t)}" stop="{fmt(end)}" channel="icefin.ch{i + 1}">'
                     f'<title>{escape(title)}</title><desc>{escape(f"{title} on {CHANNEL_NAMES[i % len(CHANNEL_NAMES)]}: an invented lab programme.")}</desc>'
                     f'<category>{escape(cat)}</category></programme>')
            t, k = end, k + 1
    x.append("</tv>")
    open(os.path.join(DIR, "guide.xml"), "w").write("\n".join(x) + "\n")


def ensure(s):
    cfg = s.call("GET", "/System/Configuration/livetv")
    if not any(h.get("Type") == "m3u" and h.get("Url", "").endswith("livetv/channels.m3u") for h in cfg.get("TunerHosts") or []):
        s.call("POST", "/LiveTv/TunerHosts", {"Type": "m3u", "Url": "/media/livetv/channels.m3u", "FriendlyName": "Icefin lab", "ImportFavoritesOnly": False,
                                              "AllowHWTranscoding": False, "EnableStreamLooping": True, "TunerCount": 0})
    if not any(p.get("Type") == "xmltv" for p in cfg.get("ListingProviders") or []):
        s.call("POST", "/LiveTv/ListingProviders?validateListings=false&validateLogin=false",
               {"Type": "xmltv", "Path": "/media/livetv/guide.xml", "EnableAllTuners": True, "EnabledTuners": []})


def refresh(s, uid, secs=240):
    task = next((t for t in s.call("GET", "/ScheduledTasks") if t.get("Key") == "RefreshGuide"), None)
    if task:
        s.call("POST", f"/ScheduledTasks/Running/{task['Id']}")
    end = time.time() + secs
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    while time.time() < end:
        time.sleep(5)
        q = urllib.parse.urlencode({"UserId": uid, "MinEndDate": now, "MaxStartDate": now, "Limit": 100})
        got = s.call("GET", f"/LiveTv/Programs?{q}")
        if got and got.get("TotalRecordCount", 0) > 0:
            return got["TotalRecordCount"]
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("servers")
    ap.add_argument("--channels", type=int, default=24)
    a = ap.parse_args()
    write_files(a.channels)
    c = creds()
    bad = 0
    for sc in json.load(open(a.servers))["servers"]:
        s = Server(sc)
        s.wait()
        s.token = s.call("POST", "/Users/AuthenticateByName", {"Username": c[sc["name"]]["user"], "Pw": c[sc["name"]]["password"]})["AccessToken"]
        uid = s.call("GET", "/Users/Me")["Id"]
        ensure(s)
        n = refresh(s, uid)
        chans = s.call("GET", f"/LiveTv/Channels?UserId={uid}&Limit=1").get("TotalRecordCount", 0)
        print(f"livetv: {sc['name']}: {chans} channels, {n} programmes on now")
        bad += 0 if n else 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
