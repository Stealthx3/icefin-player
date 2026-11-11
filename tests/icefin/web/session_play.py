#!/usr/bin/env python3
"""session_play.py — connect a client build to a lab Jellyfin server, play an item by remote command, and
record what the server saw (PLAN 1.8 baseline; reused by the 8.2 plugin suite). Lab guests only.

Usage:
  python3 session_play.py --app ~/build-upstream/src/jellyfin-desktop --server jf1011 --item "SDR H264 AAC" \
      --seconds 20 --out ~/baseline/upstream-jf1011.json
  --app may be a binary path or flatpak:<app-id>.
  --qpa session runs in the graphical session already on screen (the HTPC tier, scripts/icefin/htpc.sh play):
  no Xvfb/Weston, no --disable-gpu, the real session bus.

Writes JSON with: the session identity the server recorded (client name, version, capabilities), the
playback timeline (position/play method samples), Activity Log entries and Playback Reporting rows for the
run, plus app log errors. Exit 0 if playback started and stopped cleanly.
"""
import argparse, datetime, json, os, shutil, signal, subprocess, sys, tempfile, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

JF = os.path.expanduser(os.environ.get("ICEFIN_JF_DIR", "~/jf"))


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def start_weston(sock="wl-icefin"):
    """Headless Weston with the GL renderer (llvmpipe in a VM) for Wayland runs."""
    rt = os.environ.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    if os.path.exists(os.path.join(rt, sock)):
        return None
    p = subprocess.Popen(["weston", "--backend=headless", "--renderer=gl", f"--socket={sock}", "--width=1920", "--height=1080"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    return p


def start_x(display=":99"):
    if subprocess.run(["xdpyinfo", "-display", display], capture_output=True).returncode == 0:
        return None
    p = subprocess.Popen(["Xvfb", display, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    return p


def launch(app, port, cfgdir, logf, qpa="xcb", extra=(), gpu=False):
    if qpa == "session":
        # Whatever the session gives us (Plasma, GNOME or Gamescope); htpc.sh imports its environment.
        env = dict(os.environ, LC_ALL="C.UTF-8")
        args = [f"--remote-debugging-port={port}", "--log-level=info"] + list(extra)
        if app.startswith("flatpak:"):
            # ICEFIN_FLATPAK_ENV="K=V,K=V": environment for inside the sandbox (a VA-API driver choice, for example)
            fenv = [f"--env={kv}" for kv in os.environ.get("ICEFIN_FLATPAK_ENV", "").split(",") if "=" in kv]
            cmd = ["flatpak", "run", "--user"] + fenv + [app.split(":", 1)[1], f"--config-dir=/var/tmp/{os.path.basename(cfgdir)}"] + args
        else:
            cmd = [os.path.expanduser(app), f"--config-dir={cfgdir}"] + args
        return subprocess.Popen(cmd, env=env, stdout=logf, stderr=subprocess.STDOUT, start_new_session=True)
    env = dict(os.environ, DISPLAY=":99", QT_QPA_PLATFORM=qpa, LC_ALL="C.UTF-8")
    if qpa == "wayland":
        env.pop("DISPLAY", None)
        env["WAYLAND_DISPLAY"] = "wl-icefin"
    # --disable-gpu by default: steady in Xvfb. gpu=True keeps Chromium's GPU compositing (llvmpipe here), which a
    # transparent page needs to show the native layers under it (the 8.4 backdrop).
    args = ["--windowed", "--desktop"] + ([] if gpu else ["--disable-gpu"]) + [f"--remote-debugging-port={port}", "--log-level=info"] + list(extra)
    if app.startswith("flatpak:"):
        # Chromium's sandbox inside a Flatpak spawns via the Flatpak portal, which needs a session bus.
        # Fresh state per run: /var/tmp inside the sandbox is the app's private, writable cache.
        cmd = ["dbus-run-session", "--", "flatpak", "run", "--user", f"--env=QT_QPA_PLATFORM={qpa}", app.split(":", 1)[1],
               f"--config-dir=/var/tmp/{os.path.basename(cfgdir)}"] + args
    else:
        cmd = [os.path.expanduser(app), f"--config-dir={cfgdir}"] + args
    return subprocess.Popen(cmd, env=env, stdout=logf, stderr=subprocess.STDOUT, start_new_session=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf1011")
    ap.add_argument("--item", default="SDR H264 AAC")
    ap.add_argument("--seconds", type=int, default=40)  # Playback Reporting only records plays still running ~20 s after start
    ap.add_argument("--port", type=int, default=9222)
    ap.add_argument("--out", required=True)
    ap.add_argument("--qpa", choices=["xcb", "wayland", "session"], default="xcb",
                    help="xcb = Xvfb, wayland = headless Weston, session = the graphical session on screen (HTPC)")
    ap.add_argument("--app-arg", action="append", default=[], help="extra argument for the app (repeatable)")
    a = ap.parse_args()

    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cfg["port"] = int(os.environ.get(f"ICEFIN_PORT_{a.server.upper()}", cfg["port"]))  # HTPC tier: tunnelled, shifted ports
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    admin = Server(cfg)
    admin.wait()
    admin.token = admin.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    user_id = admin.call("GET", "/Users/Me")["Id"]
    q = urllib.parse.urlencode({"Recursive": "true", "searchTerm": a.item, "userId": user_id, "IncludeItemTypes": "Movie,Episode,Audio"})
    items = admin.call("GET", f"/Items?{q}")["Items"]
    if not items:
        raise SystemExit(f"session_play: no item matching {a.item!r} on {a.server} (library scanned?)")
    item = items[0]

    out = {"app": a.app, "server": a.server, "server_version": admin.call("GET", "/System/Info")["Version"],
           "item": {"name": item["Name"], "id": item["Id"]}, "started": now_iso(), "steps": [], "ok": False}
    step = lambda s: (out["steps"].append(s), print("session_play:", s, flush=True))
    cfgdir = tempfile.mkdtemp(prefix="icefin-run-")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    logpath = a.out.rsplit(".", 1)[0] + ".app.log"
    xv = {"wayland": start_weston, "xcb": start_x}.get(a.qpa, lambda: None)()
    out["qpa"] = a.qpa
    with open(logpath, "w") as logf:
        app = launch(a.app, a.port, cfgdir, logf, a.qpa, a.app_arg)
    try:
        page = Page(a.port, timeout=90)
        step("devtools attached")
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{admin.base}'; "
                  "document.getElementById('connect-form').requestSubmit(); true")
        step("server address submitted")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress()", timeout=90)
        step("jellyfin-web loaded")
        out["first_load_shell"] = page.eval("typeof window.NativeShell !== 'undefined' && typeof window.jmpInfo !== 'undefined'")
        step(f"native shell on first load: {out['first_load_shell']}")
        ok = page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])})"
                       ".then(r => !!r.AccessToken)")
        if not ok:
            raise RuntimeError("login failed")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        step("logged in")
        time.sleep(8)
        page.reconnect()
        out["shell"] = page.eval("JSON.stringify({icefin: (window.jmpInfo || {}).icefin || null, version: (window.jmpInfo || {}).version,"
                                 " appName: window.NativeShell && window.NativeShell.AppHost.appName(),"
                                 " appVersion: window.NativeShell && window.NativeShell.AppHost.appVersion()})")
        step(f"shell: {out['shell']}")

        # Find the app's session as the server sees it.
        sess, end = None, time.time() + 60
        while time.time() < end and not sess:
            cands = [s for s in admin.call("GET", "/Sessions?activeWithinSeconds=120")
                     if s.get("UserName") == cred["user"] and s.get("Client") != "icefin-lab-setup" and s.get("SupportsRemoteControl")]
            sess = cands[0] if cands else None
            time.sleep(2)
        if not sess:
            raise RuntimeError("app session not visible on server")
        out["identity"] = {k: sess.get(k) for k in ("Client", "ApplicationVersion", "DeviceName", "SupportsMediaControl",
                                                   "SupportsRemoteControl", "PlayableMediaTypes", "SupportedCommands")}
        step(f"session: {sess.get('Client')} {sess.get('ApplicationVersion')}")

        admin.call("POST", f"/Sessions/{sess['Id']}/Playing?playCommand=PlayNow&itemIds={item['Id']}")
        step("PlayNow sent")
        timeline, t0, playing_seen = [], time.time(), False
        while time.time() - t0 < a.seconds + 30:
            s = next((x for x in admin.call("GET", "/Sessions") if x["Id"] == sess["Id"]), {})
            npi, ps = s.get("NowPlayingItem"), s.get("PlayState", {})
            if npi:
                playing_seen = True
                timeline.append({"t": round(time.time() - t0, 1), "pos_s": round((ps.get("PositionTicks") or 0) / 1e7, 1),
                                 "paused": ps.get("IsPaused"), "method": ps.get("PlayMethod")})
                if len([x for x in timeline]) and timeline[-1]["pos_s"] >= a.seconds:
                    break
            time.sleep(2)
        out["timeline"] = timeline
        if not playing_seen:
            raise RuntimeError("server never saw playback start")
        admin.call("POST", f"/Sessions/{sess['Id']}/Playing/Stop")
        step("Stop sent")
        time.sleep(8)
        out["ok"] = True
    except Exception as e:  # noqa: BLE001 — record and fall through to collection
        out["error"] = f"{type(e).__name__}: {e}"
        step(f"ERROR {out['error']}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:
            try:
                os.killpg(app.pid, signal.SIGKILL)
            except Exception:
                pass
        if xv:
            xv.terminate()
        shutil.rmtree(cfgdir, ignore_errors=True)

    # What the server recorded for this run.
    try:
        acts = admin.call("GET", "/System/ActivityLog/Entries?" + urllib.parse.urlencode({"minDate": out["started"], "limit": 50}))
        out["activity"] = [{"type": e.get("Type"), "name": e.get("Name")} for e in acts.get("Items", [])]
    except Exception as e:  # noqa: BLE001
        out["activity_error"] = str(e)
    try:
        rows = admin.call("POST", "/user_usage_stats/submit_custom_query", {
            "CustomQueryString": "SELECT ItemName, ItemType, PlaybackMethod, ClientName, DeviceName, PlayDuration "
                                 f"FROM PlaybackActivity WHERE DateCreated >= '{out['started'][:19].replace('T', ' ')}'",
            "ReplaceUserId": False})
        out["playback_reporting"] = rows.get("results", rows)
    except Exception as e:  # noqa: BLE001
        out["playback_reporting_error"] = str(e)
    with open(logpath, errors="replace") as f:
        out["app_log_errors"] = [l.strip()[:200] for l in f if " [error] " in l or "[critical]" in l][:20]
    json.dump(out, open(a.out, "w"), indent=1)
    print(f"session_play: {'OK' if out['ok'] else 'FAILED'} -> {a.out}")
    sys.exit(0 if out["ok"] else 1)


if __name__ == "__main__":
    main()
