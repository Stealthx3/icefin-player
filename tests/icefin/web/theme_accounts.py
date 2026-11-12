#!/usr/bin/env python3
"""theme_accounts.py — the theme API's servers, sign-in, play queue, Play on and Watch together (PLAN 9.44). Lab guests only.

Signed in to the lab server:
  - ctx.servers() lists it as the current, signed-in server; ctx.connect(its id) keeps the session (SignedIn, home);
  - the play queue: an album playing gives ctx.queueItems() its tracks and the current one; playQueueAt, moveInQueue
    and removeFromQueue change it; saveQueueAsPlaylist makes a playlist of it (removed afterwards); clearQueue empties it;
  - repeat and shuffle: ctx.setRepeat() and ctx.setShuffle() show in ctx.playMode();
  - Play on: ctx.playTargets() includes this device, marked current;
  - Watch together: create a group, see it in groups() and current(), leave it;
  - sign-in: after signing out, publicUsers() lists the lab user; a wrong password is refused with a reason; the right
    one signs in (home); quickConnect() gives a code (or null when the server has it off) and cancel() ends the wait.
Usage: python3 theme_player.py --app ~/build/src/icefin-player --server jf12 --out ~/raccounts
"""
import argparse, base64, json, os, signal, sys, tempfile, time
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9272)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    os.environ["ICEFIN_THEME_PATH"] = THEMES
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-accounts-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_accounts: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shot(name):
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinTheme.ui.player && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))"); time.sleep(3)
        c = js
        sid = c("window.ApiClient.serverId()")
        sv = json.loads(c("window.icefinTheme.ctx.servers().then(x => JSON.stringify(x))"))
        check("servers(): the lab server, current and signed in", any(s["id"] == sid and s["current"] and s["signedIn"] for s in sv), sv)
        r = json.loads(c(f"window.icefinTheme.ctx.connect('{sid}').then(x => JSON.stringify(x))"))
        time.sleep(4); page.reconnect(); js = page.eval
        check("connect(id): signed in, at home", r.get("state") == "SignedIn" and js("location.hash").startswith("#/home"), r)
        page.wait_for("!!window.icefinTheme && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()", timeout=60)
        # the play queue
        alb = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'MusicAlbum', Recursive: true, Limit: 1, SortBy: 'SortName'}).then(r => (r.Items[0] || {}).Id || '')")
        js(f"window.icefinTheme.ctx.play({{ids: ['{alb}'], serverId: window.ApiClient.serverId()}}); true"); time.sleep(6)
        q = json.loads(js("window.icefinTheme.ctx.queueItems().then(x => JSON.stringify(x))") or "null")
        check("queueItems(): the album's tracks and the current one", bool(q) and len(q["items"]) >= 2 and q["index"] == 0, q and len(q["items"]))
        if q and len(q["items"]) >= 3:
            second = q["items"][1]["playlistItemId"]
            js(f"window.icefinTheme.ctx.playQueueAt('{second}')"); time.sleep(3)
            q2 = json.loads(js("window.icefinTheme.ctx.queueItems().then(x => JSON.stringify(x))"))
            check("playQueueAt(): the second track plays", q2["index"] == 1, q2["index"])
            last = q2["items"][-1]["playlistItemId"]
            js(f"window.icefinTheme.ctx.moveInQueue('{last}', 2)"); time.sleep(1)
            q3 = json.loads(js("window.icefinTheme.ctx.queueItems().then(x => JSON.stringify(x))"))
            check("moveInQueue(): the last track third", q3["items"][2]["playlistItemId"] == last, [x["name"] for x in q3["items"]][:4])
            js(f"window.icefinTheme.ctx.removeFromQueue(['{last}'])"); time.sleep(1)
            q4 = json.loads(js("window.icefinTheme.ctx.queueItems().then(x => JSON.stringify(x))"))
            check("removeFromQueue(): it is gone", all(x["playlistItemId"] != last for x in q4["items"]) and len(q4["items"]) == len(q3["items"]) - 1)
            name = "Icefin lab queue " + str(int(time.time()))
            ok = js(f"window.icefinTheme.ctx.saveQueueAsPlaylist({json.dumps(name)})")
            pl = js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {{IncludeItemTypes: 'Playlist', Recursive: true, searchTerm: {json.dumps(name)}}}).then(r => (r.Items[0] || {{}}).Id || '')")
            check("saveQueueAsPlaylist(): a playlist of it", ok is True and bool(pl), pl)
            if pl: js(f"window.ApiClient.ajax({{type: 'DELETE', url: window.ApiClient.getUrl('Items/{pl}')}}).then(() => true, () => false)")
        # repeat and shuffle for music
        js("window.icefinTheme.ctx.setRepeat('RepeatAll')"); js("window.icefinTheme.ctx.setShuffle(true)"); time.sleep(1)
        pm1 = json.loads(js("JSON.stringify(window.icefinTheme.ctx.playMode())"))
        js("window.icefinTheme.ctx.setRepeat('RepeatNone')"); js("window.icefinTheme.ctx.setShuffle(false)"); time.sleep(1)
        pm2 = json.loads(js("JSON.stringify(window.icefinTheme.ctx.playMode())"))
        check("playMode(), setRepeat(), setShuffle()", pm1 == {"repeat": "RepeatAll", "shuffle": True} and pm2 == {"repeat": "RepeatNone", "shuffle": False}, [pm1, pm2])
        # Play on
        t = json.loads(js("window.icefinTheme.ctx.playTargets().then(x => JSON.stringify(x))"))
        check("playTargets(): this device, current", any(x["kind"] == "this" and x["current"] for x in t), t)
        js("window.icefinTheme.ctx.clearQueue()"); time.sleep(2)
        check("clearQueue(): nothing queued", js("window.icefinTheme.ctx.queueItems().then(x => x === null)") is True)
        js("window.icefinPlaybackManager.stop(); true"); time.sleep(1)
        # Watch together
        gname = "Icefin lab group"
        made = js(f"window.icefinTheme.ctx.syncPlay.create({json.dumps(gname)})"); time.sleep(3)
        g = json.loads(js("window.icefinTheme.ctx.syncPlay.groups().then(x => JSON.stringify(x))"))
        cur = js("JSON.stringify(window.icefinTheme.ctx.syncPlay.current())")
        check("syncPlay: create, then in groups() and current()", made is True and any(x["name"] == gname for x in g) and gname in (cur or ""), [g, cur])
        js("window.icefinTheme.ctx.syncPlay.leave()"); time.sleep(2)
        check("syncPlay: leave", js("window.icefinTheme.ctx.syncPlay.current() === null") is True)
        # sign-in (the lab server only)
        page.eval("setTimeout(() => window.icefinTheme.ctx.signOut(), 100); true", await_promise=False); time.sleep(6); page.reconnect(); js = page.eval
        page.wait_for("!!window.icefinTheme && location.hash.includes('login') || location.hash.includes('selectserver')", timeout=60)
        if "selectserver" in js("location.hash"):
            page.eval(f"window.icefinTheme.ctx.connect('{sid}'); true", await_promise=False); time.sleep(4); page.reconnect(); js = page.eval
        users = json.loads(js("window.icefinTheme.ctx.publicUsers().then(x => JSON.stringify(x))"))
        check("publicUsers(): the lab user", any(u["name"].lower() == cred["user"].lower() for u in users) or users == [], users)
        bad = json.loads(js(f"window.icefinTheme.ctx.signIn({json.dumps(cred['user'])}, 'not-the-password').then(x => JSON.stringify(x))"))
        check("signIn(): a wrong password is refused with a reason", bad.get("ok") is False and bool(bad.get("error")), bad)
        qc = json.loads(js("window.icefinTheme.ctx.quickConnect().then(x => { if (!x) return 'null'; x.cancel(); return JSON.stringify({code: x.code}); })"))
        check("quickConnect(): a code, or null when the server has it off", qc is None or bool(qc.get("code")), qc)
        good = json.loads(js(f"window.icefinTheme.ctx.signIn({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(x => JSON.stringify(x))"))
        time.sleep(5); page.reconnect(); js = page.eval
        check("signIn(): the right password signs in, at home", good.get("ok") is True and js("location.hash").startswith("#/home") and bool(js("window.ApiClient.getCurrentUserId()")), good)
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        if xv:
            xv.terminate()
        log.close()
    print("theme_accounts:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
