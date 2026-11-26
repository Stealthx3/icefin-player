#!/usr/bin/env python3
"""QA walks in parallel in one lab guest (D44): every input and pad family at once, each in an IceFin of its own.

input_walk.py walks the keyboard, the mouse and the five pad families one after another: about 3 hours per theme
with its stock control. Here each of the seven runs is a shard, a separate input_walk.py with its own X display,
DevTools port, config dir, Jellyfin user (so one walk's playback or Played toggle doesn't redraw another's home)
and SDL device filter (SDL_GAMECONTROLLER_IGNORE_DEVICES_EXCEPT: an app sees only its own pad model, keys and mouse
see none). The shards then merge into the same per-theme reports input_walk.py writes, compared with stock.

The stock control is walked once per build: --control auto (the default) reuses the newest earlier run beside --out
that walked stock on the same app binary. With --theme-path the themes come from a folder (ICEFIN_THEME_PATH, read
before the bundled ones), so a theme fix needs no rebuild and the binary, and its control, stay the same (D47).
Findings judged in earlier passes (qa-judged.json) are marked; each theme's triage.md lists only the rest.

  python3 tests/icefin/web/walk_parallel.py --app ~/build-qa76/src/icefin-player --themes plaza --theme-path ~/qa-themes --out ~/walks/x
  python3 tests/icefin/web/walk_parallel.py --app ... --themes media-center --theme-path ~/qa-themes --out ~/walks/y   # reuses x's stock
"""
import argparse, hashlib, json, os, re, secrets, signal, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
import input_walk as iw  # noqa: E402

# shard: (label, input, family, the pad model the app may see). The Steam shard's own DualSense (the pad Steam takes
# over, hidden from that app by Steam's ignore list) is also seen by the DualSense shard's app: an idle second pad.
SHARDS = [
    ("keys", "keys", "", "0x0000/0x0000"),
    ("mouse", "mouse", "", "0x0000/0x0000"),
    ("pad-xbox", "pad", "xbox", "0x045e/0x0b12"),
    ("pad-dualsense", "pad", "dualsense", "0x054c/0x0ce6"),
    ("pad-switchpro", "pad", "switchpro", "0x057e/0x2009"),
    ("pad-8bitdo", "pad", "8bitdo", "0x2dc8/0x3106"),
    ("pad-steam", "pad", "steam", "0x28de/0x11ff"),
]


def build_id(app):
    h = hashlib.sha256()
    with open(os.path.expanduser(app), "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()[:16]


def ensure_users(server, names):
    """One walker user per shard on the lab server (admins like the lab's own `icefin`, so the same screens exist).
    Passwords are random, kept in the guest's ~/jf/creds-qa.json, never printed."""
    from setup import Server
    from session_play import JF
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[server]
    admin = json.load(open(os.path.join(JF, "creds.json")))[server]
    path = os.path.join(JF, "creds-qa.json")
    try:
        store = json.load(open(path))
    except FileNotFoundError:
        store = {}
    have = store.setdefault(server, {})
    s = Server(cfg)
    s.wait()
    s.token = s.call("POST", "/Users/AuthenticateByName", {"Username": admin["user"], "Pw": admin["password"]})["AccessToken"]
    existing = {u["Name"]: u for u in s.call("GET", "/Users")}
    for n in names:
        if n in have and n in existing:
            continue
        pw = secrets.token_urlsafe(18)
        if n in existing:
            uid = existing[n]["Id"]
            s.call("POST", f"/Users/{uid}/Password", {"NewPw": pw, "ResetPassword": False})
        else:
            uid = s.call("POST", "/Users/New", {"Name": n, "Password": pw})["Id"]
        pol = s.call("GET", f"/Users/{uid}")["Policy"]
        pol.update(IsAdministrator=True, EnableAllFolders=True, IsHidden=True)
        s.call("POST", f"/Users/{uid}/Policy", pol)
        have[n] = {"user": n, "password": pw}
        existing[n] = {"Id": uid, "Name": n}
        print(f"walk_parallel: walker user {n} ready on {server}", flush=True)
    sync_users(s, [u for u in existing.values() if u["Name"] == admin["user"]][0]["Id"], [existing[n]["Id"] for n in names])
    old = os.umask(0o077)
    try:
        json.dump(store, open(path, "w"), indent=1)
    finally:
        os.umask(old)


USERDATA = ("Played", "PlaybackPositionTicks", "IsFavorite", "PlayCount", "LastPlayedDate", "Likes")


def sync_users(s, admin_id, uids):
    """Each walker user starts as a copy of the lab's admin, the user the serial walks used: its user settings,
    jellyfin-web's display preferences, and every item's played state, resume point and favourite. A fresh user
    has none of it (no Continue Watching or Next Up, default layout), so its walks see other screens; and a walk's
    own playback drifts it, so this runs before every parallel walk."""
    conf = s.call("GET", f"/Users/{admin_id}")["Configuration"]
    prefs = {}
    for pid in ("usersettings",):
        try:
            prefs[pid] = s.call("GET", f"/DisplayPreferences/{pid}?userId={admin_id}&client=emby")
        except Exception:  # noqa: BLE001
            pass
    q = "Recursive=true&Fields=UserData&EnableUserData=true&Limit=100000"
    want = {i["Id"]: i.get("UserData") or {} for i in s.call("GET", f"/Items?userId={admin_id}&{q}")["Items"]}
    for uid in uids:
        try:
            s.call("POST", f"/Users/Configuration?userId={uid}", conf)
        except Exception:  # noqa: BLE001
            s.call("POST", f"/Users/{uid}/Configuration", conf)
        for pid, body in prefs.items():
            s.call("POST", f"/DisplayPreferences/{pid}?userId={uid}&client=emby", body)
        have = {i["Id"]: i.get("UserData") or {} for i in s.call("GET", f"/Items?userId={uid}&{q}")["Items"]}
        n = 0
        for iid, ud in want.items():
            cur = have.get(iid, {})
            if all(cur.get(k) == ud.get(k) for k in USERDATA):
                continue
            body = {k: ud.get(k) for k in USERDATA if k != "LastPlayedDate" or ud.get(k)}
            body.setdefault("Played", False)
            body.setdefault("PlaybackPositionTicks", 0)
            body.setdefault("IsFavorite", False)
            s.call("POST", f"/UserItems/{iid}/UserData?userId={uid}", body)
            n += 1
        print(f"walk_parallel: user {uid[:8]} synced with the admin ({n} items' user data)", flush=True)


def load_run(d):
    p = os.path.join(d, "report.json")
    return json.load(open(p)) if os.path.exists(p) else None


JUDGED = os.path.join(HERE, "qa-judged.json")


def load_judged(path):
    """Findings already judged in a pass doc (D47): {"*" or theme id: [{kind, screen, element, input, detail, why, doc}]},
    each field but why/doc a regex (absent: any). A walk marks them so the triage list holds only what is new."""
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return {}


def mark_judged(m, theme, rules):
    rs = list(rules.get("*", [])) + list(rules.get(theme, []))
    for f in m["findings"]:
        for r in rs:
            if all(re.search(r[k], str(f.get(k) or ""), re.I) for k in ("kind", "screen", "element", "input", "detail") if k in r):
                f["judged"] = r.get("why", "judged")
                break


def find_control(out, bid):
    """The newest earlier run beside this one that walked stock on the same app binary (D47: theme fixes come from a
    folder, so the binary and its stock control stay the same across a theme's walks)."""
    best = None
    root = os.path.dirname(out)
    for d in os.listdir(root):
        mp = os.path.join(root, d, "meta.json")
        if os.path.join(root, d) == out or not os.path.exists(mp) or not os.path.exists(os.path.join(root, d, "stock", "report.json")):
            continue
        try:
            meta = json.load(open(mp))
        except ValueError:
            continue
        if meta.get("build") == bid and "stock" in meta.get("themes", []) and (best is None or meta.get("started", "") > best[0]):
            best = (meta.get("started", ""), os.path.join(root, d))
    return best[1] if best else ""


def theme_hash(path, theme):
    """A short hash of a theme folder's files (what the walk loaded), for meta.json."""
    h = hashlib.sha256()
    d = os.path.join(path, theme)
    for base, _dirs, files in sorted(os.walk(d)):
        for fn in sorted(files):
            fp = os.path.join(base, fn)
            h.update(os.path.relpath(fp, d).encode())
            with open(fp, "rb") as f:
                h.update(f.read())
    return h.hexdigest()[:12]


def merge_theme(out, theme, control_root, rules=None):
    """The shards' runs of one theme as input_walk.py's report: <theme>/report.json (plain) and <theme>/steam-env/."""
    groups = {"plain": {}, "steam-env": {}}
    for label, _inp, fam, _ in SHARDS:
        rep = load_run(os.path.join(out, "shards", label, theme, label))
        if rep is None:
            continue
        g = "steam-env" if fam == "steam" else "plain"
        groups[g][label] = rep
        tdir = os.path.join(out, theme) if g == "plain" else os.path.join(out, theme, g)
        os.makedirs(tdir, exist_ok=True)
        link = os.path.join(tdir, label)       # the run's folder where the report's relative shot paths expect it
        if not os.path.lexists(link):
            os.symlink(os.path.relpath(os.path.join(out, "shards", label, theme, label), tdir), link)
    lines = []
    for g, reps in groups.items():
        if not reps:
            continue
        sdir = os.path.join(out, theme) if g == "plain" else os.path.join(out, theme, g)
        m = iw.merge(theme, reps)
        m["scenario"] = g
        if theme != "stock":
            cp = os.path.join(control_root, "stock", "report.json" if g == "plain" else os.path.join(g, "report.json"))
            if os.path.exists(cp):
                iw.mark_control(m, json.load(open(cp)))
            mark_judged(m, theme, rules or {})
            todo = [f for f in m["findings"] if not f.get("also_in_control") and not f.get("judged")]
            open(os.path.join(sdir, "triage.md"), "w").write(
                f"# {theme} ({g}): {len(todo)} to triage (not in the control, not judged before)\n\n"
                + "".join(f"- [{f['severity']}] {f['kind']} · {f['input']} ({f['run']}) · `{f['screen']}` · {f['element']}: {f.get('detail', '')}\n" for f in todo))
        json.dump(m, open(os.path.join(sdir, "report.json"), "w"), indent=1)
        open(os.path.join(sdir, "report.md"), "w").write(iw.markdown(m, reps, "" if g == "plain" else "../"))
        new = sum(1 for f in m["findings"] if not f.get("also_in_control"))
        high = sum(1 for f in m["findings"] if f["severity"] == "high" and not f.get("also_in_control"))
        judged = sum(1 for f in m["findings"] if f.get("judged") and not f.get("also_in_control"))
        if theme == "stock":
            lines.append(f"- {theme} ({g}): {len(m['findings'])} findings; runs {', '.join(m['runs'])}")
            continue
        lines.append(f"- {theme} ({g}): {len(m['findings'])} findings, {new} not in the control ({high} high), {judged} of those judged before"
                     f" ({new - judged} to triage: {os.path.relpath(os.path.join(sdir, 'triage.md'), out)}); runs {', '.join(m['runs'])}")
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app", default="~/build-qa76/src/icefin-player")
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--themes", required=True, help="comma-separated theme ids (stock is added unless --control)")
    ap.add_argument("--control", default="auto", help="an earlier walk_parallel run on the same build whose stock is the control; "
                    "auto (default): the newest such run beside --out, else stock is walked here; none: walk stock here")
    ap.add_argument("--theme-path", default="", help="a folder of theme packages loaded before the bundled ones (ICEFIN_THEME_PATH): "
                    "theme fixes then need no rebuild, so the binary and its stock control stay the same (D47)")
    ap.add_argument("--judged", default=JUDGED, help="findings judged in earlier passes (marked, left out of triage.md)")
    ap.add_argument("--shards", default=",".join(s[0] for s in SHARDS), help="which shards to run (default: all seven)")
    ap.add_argument("--budget-min", type=float, default=60, help="minutes per run (default 60: at 40 the keys and pad runs left Live TV, "
                    "a song, an artist and Now playing unreached; the reused control pays for the rest, D47)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = os.path.abspath(os.path.expanduser(a.out))
    os.makedirs(os.path.join(out, "shards"), exist_ok=True)
    bid = build_id(a.app)
    themes = [t for t in a.themes.split(",") if t and t != "stock"]
    if a.control == "auto":
        a.control = find_control(out, bid)
        if a.control:
            print(f"walk_parallel: stock control reused from {a.control} (same build {bid})", flush=True)
    elif a.control == "none":
        a.control = ""
    tpath = os.path.abspath(os.path.expanduser(a.theme_path)) if a.theme_path else ""
    if tpath:
        missing = [t for t in themes if not os.path.isdir(os.path.join(tpath, t))]
        if missing:
            sys.exit(f"walk_parallel: no {', '.join(missing)} in {tpath}")
    control = os.path.abspath(os.path.expanduser(a.control)) if a.control else out
    if a.control:
        meta = json.load(open(os.path.join(control, "meta.json")))
        if meta.get("build") != bid:
            sys.exit(f"walk_parallel: {control} walked build {meta.get('build')}, this is {bid}: walk stock again (no --control)")
    else:
        themes = ["stock"] + themes
    shards = [s for s in SHARDS if s[0] in a.shards.split(",")]
    json.dump({"build": bid, "app": a.app, "themes": themes, "control": control, "shards": [s[0] for s in shards],
               "theme_path": tpath, "theme_files": {t: theme_hash(tpath, t) for t in themes if tpath and t != "stock"},
               "walker": build_id(os.path.join(HERE, "input_walk.py")),
               "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, open(os.path.join(out, "meta.json"), "w"), indent=1)
    ensure_users(a.server, [f"qa-{s[0]}" for s in shards])

    procs = []
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    try:
        for i, (label, inp, fam, only) in enumerate(shards):
            sdir = os.path.join(out, "shards", label)
            os.makedirs(sdir, exist_ok=True)
            cmd = [sys.executable, os.path.join(HERE, "input_walk.py"), "--app", a.app, "--server", a.server,
                   "--themes", ",".join(themes), "--budget-min", str(a.budget_min), "--out", sdir,
                   "--display", f":{110 + i}", "--port", str(9410 + i), "--user", f"qa-{label}", "--sdl-only", only,
                   "--inputs", inp, "--family", fam or "xbox", "--steam-inputs", "pad" if fam == "steam" else ""]
            log = open(os.path.join(sdir, "walk.log"), "w")
            env = dict(os.environ, ICEFIN_LAB_DISPLAY=f":{110 + i}")    # session_play's own launches too
            if tpath:
                env["ICEFIN_THEME_PATH"] = tpath                          # the app reads it before its bundled themes
            procs.append((label, subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True, env=env)))
            print(f"walk_parallel: {label} started ({', '.join(themes)}, display :{110 + i})", flush=True)
            time.sleep(20)      # staggered: seven WebEngines starting at once time out on the guest's CPUs
        for label, p in procs:
            rc = p.wait()
            print(f"walk_parallel: {label} finished (exit {rc})", flush=True)
    finally:
        for _label, p in procs:
            if p.poll() is None:
                try:
                    os.killpg(p.pid, signal.SIGTERM)
                except Exception:  # noqa: BLE001
                    pass
    summary = [f"# walk_parallel {time.strftime('%Y-%m-%d %H:%M')} (build {bid}, budget {a.budget_min} min per run, shards {', '.join(s[0] for s in shards)})",
               f"Control: {'stock in this run' if control == out else control}", ""]
    rules = load_judged(a.judged)
    for t in themes:
        summary += merge_theme(out, t, control, rules)
    for label, _p in procs:
        w = os.path.join(out, "shards", label, "summary.md")
        if os.path.exists(w):
            summary += ["", f"## shard {label}", ""] + [ln for ln in open(w).read().splitlines() if ln.startswith("- ")]
    open(os.path.join(out, "summary.md"), "w").write("\n".join(summary) + "\n")
    print("walk_parallel: done ->", out, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
