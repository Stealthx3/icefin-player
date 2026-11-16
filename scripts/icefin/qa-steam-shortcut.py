#!/usr/bin/env python3
"""qa-steam-shortcut.py: the non-Steam shortcut "IceFin Player (QA)" the QA walk (tests/icefin/web/input_walk.py
--steam shortcut) launches IceFin through, so the walk runs inside Steam with Steam's Virtual Gamepad (D41).

  add [--themes DIR] [--port N]   add the shortcut (replaces ours when present) to the most recent account's shortcuts.vdf only
                                  (loginusers.vdf MostRecent "1"; SteamID64 - 76561197960265728 = the userdata folder)
  remove                          take ours out again (what `add` recorded), when the QA ends
  status [--json]                 present or absent, its appid and rungameid, whether Steam is running

Edits shortcuts.vdf only while Steam is NOT running (Steam rewrites the file on exit and would drop the change), and keeps a
backup next to it (shortcuts.vdf.icefin-qa.bak, first one only) plus a record of what was done in
~/.local/share/icefin-walk/steam-shortcut.json. Only the entry named "IceFin Player (QA)" is ever touched.
The shortcut runs: flatpak run --user [--filesystem=DIR:ro --env=ICEFIN_THEME_PATH=DIR] io.github.stealthx3.IcefinPlayer
--remote-debugging-port=N. Start it with steam://rungameid/<rungameid> (Steam must be running then).
"""
import argparse, json, os, re, shutil, struct, subprocess, sys, zlib

NAME = "IceFin Player (QA)"
APP = "io.github.stealthx3.IcefinPlayer"
STATE = os.path.expanduser("~/.local/share/icefin-walk/steam-shortcut.json")
EXE = '"flatpak"'


def parse(b, i=0):
    """Binary VDF: 0x00 map, 0x01 string, 0x02 int32, 0x08 end of map. Returns (ordered dict, index after it)."""
    out = {}
    while i < len(b):
        t = b[i]
        i += 1
        if t == 8:
            return out, i
        j = b.index(b"\0", i)
        key = b[i:j].decode("utf-8", "replace")
        i = j + 1
        if t == 0:
            out[key], i = parse(b, i)
        elif t == 1:
            j = b.index(b"\0", i)
            out[key] = b[i:j].decode("utf-8", "replace")
            i = j + 1
        elif t == 2:
            out[key] = struct.unpack_from("<I", b, i)[0]
            i += 4
        else:
            raise ValueError(f"unknown VDF type {t}")
    return out, i


def dump(d):
    out = b""
    for k, v in d.items():
        kb = k.encode() + b"\0"
        if isinstance(v, dict):
            out += b"\0" + kb + dump(v) + b"\x08"
        elif isinstance(v, int):
            out += b"\x02" + kb + struct.pack("<I", v & 0xFFFFFFFF)
        else:
            out += b"\x01" + kb + str(v).encode() + b"\0"
    return out


def load(path):
    if not os.path.exists(path):
        return {"shortcuts": {}}
    data = open(path, "rb").read()
    # the file is: 0x00 "shortcuts" 0x00 {entries} 0x08 0x08
    d, _ = parse(data)
    return d if "shortcuts" in d else {"shortcuts": {}}


def save(path, d):
    open(path, "wb").write(dump(d) + b"\x08")


def appid(exe, name):
    return (zlib.crc32((exe + name).encode()) & 0xFFFFFFFF) | 0x80000000


def steam_running():
    return any(subprocess.run(["pgrep", "-x", n], capture_output=True).returncode == 0 for n in ("steam", "steamwebhelper"))


def recent_account():
    """The account id (SteamID64 - 76561197960265728) whose loginusers.vdf entry has MostRecent "1", or None."""
    try:
        txt = open(os.path.expanduser("~/.steam/steam/config/loginusers.vdf"), errors="replace").read()
    except OSError:
        return None
    users = list(re.finditer(r'"(\d{17})"\s*\{(.*?)\n\s*\}', txt, re.S))
    for m in users:
        if re.search(r'"MostRecent"\s+"1"', m.group(2)):
            return str(int(m.group(1)) - 76561197960265728)
    # one signed-in account and no MostRecent flag (Steam leaves it out then): that account
    if len(users) == 1:
        return str(int(users[0].group(1)) - 76561197960265728)
    return None


def files():
    """Only the most recent account's shortcuts.vdf (the user has three accounts; the others stay untouched)."""
    acc = recent_account()
    if not acc:
        return []
    return [os.path.expanduser(f"~/.steam/steam/userdata/{acc}/config/shortcuts.vdf")] if os.path.isdir(os.path.expanduser(f"~/.steam/steam/userdata/{acc}/config")) else []


def ours(d):
    return [k for k, v in d["shortcuts"].items() if isinstance(v, dict) and v.get("AppName") == NAME]


def launch_options(themes, port):
    o = "run --user "
    if themes:
        themes = os.path.abspath(os.path.expanduser(themes))
        o += f"--filesystem={themes}:ro --env=ICEFIN_THEME_PATH={themes} "
    return o + f"{APP} --remote-debugging-port={port}"


def status():
    res = {"steam_running": steam_running(), "present": False, "files": files()}
    for f in res["files"]:
        d = load(f)
        for k in ours(d):
            e = d["shortcuts"][k]
            aid = appid(e.get("Exe", EXE), NAME)
            res.update(present=True, appid=aid, rungameid=str((aid << 32) | 0x02000000), launch_options=e.get("LaunchOptions", ""))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["add", "remove", "status"])
    ap.add_argument("--themes", default=os.environ.get("ICEFIN_THEME_PATH", ""))
    ap.add_argument("--port", type=int, default=9392)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.cmd == "status":
        s = status()
        print(json.dumps(s) if a.json else "\n".join(f"{k}: {v}" for k, v in s.items()))
        return 0
    if steam_running():
        print("Steam is running: close it first (it rewrites shortcuts.vdf when it exits), then run this again.", file=sys.stderr)
        return 2
    fs = files()
    if not fs:
        print("no most-recent Steam account found (loginusers.vdf) or it has no userdata/<id>/config", file=sys.stderr)
        return 1
    rec = json.load(open(STATE)) if os.path.exists(STATE) else {"files": {}}
    for f in fs:
        bak = f + ".icefin-qa.bak"
        if os.path.exists(f) and not os.path.exists(bak):
            shutil.copyfile(f, bak)
        d = load(f)
        for k in ours(d):
            del d["shortcuts"][k]
        if a.cmd == "add":
            idx = str(max([int(k) for k in d["shortcuts"] if k.isdigit()] + [-1]) + 1)
            d["shortcuts"][idx] = {"appid": appid(EXE, NAME), "AppName": NAME, "Exe": EXE, "StartDir": '"/usr/bin/"', "icon": "", "ShortcutPath": "",
                                   "LaunchOptions": launch_options(a.themes, a.port), "IsHidden": 0, "AllowDesktopConfig": 1, "AllowOverlay": 1,
                                   "OpenVR": 0, "Devkit": 0, "DevkitGameID": "", "DevkitOverrideAppID": 0, "LastPlayTime": 0, "FlatpakAppID": "", "tags": {}}
            rec["files"][f] = {"added": True, "backup": bak, "appid": appid(EXE, NAME)}
        else:
            rec["files"].pop(f, None)
        save(f, d)
        print(("added to " if a.cmd == "add" else "removed from ") + f)
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    json.dump(rec, open(STATE, "w"), indent=1)
    print("record:", STATE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
