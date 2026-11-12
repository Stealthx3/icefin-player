#!/usr/bin/env python3
"""theme_player.py — theme-native player controls, the compatibility archive and the web fallback (D30, PLAN 9.45),
and the server's branding for themes (9.27). Lab guests only.

With the lab-player fixture (tests/icefin/themes) active, while a clip plays:
  - the theme's controls mount over the video (#icefin-theme-root[data-icefin-player]) and jellyfin-web's own controls
    are hidden under them;
  - the state the theme gets moves: title, duration, a position that advances, tracks and speeds;
  - commands work: play/pause from the theme's own button (Enter through the engine), a relative seek;
  - the archive: jellyfin-web's MediaSegment skip button, when up, shows in the state as 'media-segment', and its
    activate() presses it;
  - the web fallback: a plugin adding its own button to jellyfin-web's player makes this session fall back to
    jellyfin-web's controls, with a notice saying why;
  - the next play session gets the theme's controls again;
  - a slow start (a live channel tuning, the position 0 for seconds): a plugin's button added just after the first frame
    is part of the player, not an injection; one added later still falls back;
  - ui.brand(): the server's name, and every image it returns comes from the server.
Usage: python3 theme_player.py --app ~/build/src/icefin-player --server jf12 --out ~/rplayer
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
    ap.add_argument("--port", type=int, default=9263)
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
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-player-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_player: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        js("new Promise(r => window.api.theme.setActiveTheme('lab-player', '', r))")
        page.wait_for("!!window.labPlayer && window.icefinTheme.ui.player.status().themed", timeout=30)
        check("the fixture's controls are registered", js("window.icefinTheme.screens().includes('#/video')") is True)

        # ---- the server's brand ----
        brand = js("window.icefinTheme.ui.brand().then(b => JSON.stringify(b))")
        b = json.loads(brand)
        server = urlparse(srv.base)
        imgs = [u for u in (b.get("icon"), b.get("banner"), b.get("splash")) if u]
        check("brand: the server's name", bool(b.get("name")), brand)
        check("brand: an icon or banner from the server", bool(imgs), brand)
        check("brand: every image comes from the server", all(urlparse(u).netloc == server.netloc for u in imgs), brand)

        clip = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, searchTerm: 'H264 AAC', Limit: 1}).then(r => (r.Items[0] || {}).Id || '')")
        sid = js("window.ApiClient.serverId()")

        def play():
            js(f"window.icefinTheme.ctx.play({{ids: ['{clip}'], serverId: '{sid}'}}); true")
            page.wait_for("location.hash.startsWith('#/video')", timeout=60)

        # ---- themed controls ----
        play()
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-icefin-player]') && window.labPlayer.last && window.labPlayer.last.duration > 0", timeout=45)
        time.sleep(2)
        st = js("JSON.stringify(window.labPlayer.last)")
        s = json.loads(st)
        check("themed controls mount over the video", js("window.icefinTheme.active().route") == "#/video")
        check("jellyfin-web's own controls are hidden under them",
              js("(() => { const p = [...document.querySelectorAll('#videoOsdPage')].pop(); return !p || getComputedStyle(p).visibility === 'hidden'; })()") is True)
        bg = js("JSON.stringify([getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor])")
        check("nothing of the page paints over the video", all(c in ("rgba(0, 0, 0, 0)", "transparent") for c in json.loads(bg)), bg)
        check("state: title, duration, tracks and speeds", bool(s["title"]) and s["duration"] > 1000 and s["audio"] >= 1 and s["speeds"] >= 2, st)
        p0 = s["position"]
        time.sleep(2)
        p1 = json.loads(js("JSON.stringify(window.labPlayer.last)"))["position"]
        check("state: the position advances", p1 > p0, f"{p0} -> {p1}")
        shot("themed.png")
        js("window.icefinTheme.ctx.focus(document.getElementById('lab-pp')); window.icefinTheme.handleAction('enter')")
        page.wait_for("window.labPlayer.last.paused === true", timeout=10)
        check("play/pause from the theme's own button", True)
        before = json.loads(js("JSON.stringify(window.labPlayer.last)"))["position"]
        js("window.labPlayer.api.seekBy(-1000); true")
        time.sleep(1.2)
        after = json.loads(js("JSON.stringify(window.labPlayer.last)"))["position"]
        check("a relative seek", after < before, f"{before} -> {after}")

        check("ui.player.controls(): the same player outside the screen", js("window.icefinTheme.ui.player.controls().state().active === true && window.icefinTheme.ui.player.controls().state().duration > 1000") is True)
        # ---- the archive: jellyfin-web's skip button ----
        js("(() => { const c = document.createElement('div'); c.className = 'skip-button-container'; c.innerHTML = '<button class=\"skip-button\">Skip Intro</button>';"
           " document.body.append(c); c.querySelector('button').addEventListener('click', () => { window.labSkipped = true; }); return true; })()")
        page.wait_for("window.labPlayer.last.archive.includes('media-segment')", timeout=5)
        check("archive: the skip prompt shows in the theme's state", True)
        js("window.labPlayer.api.state().archive.find(x => x.id === 'media-segment').activate(); true")
        check("archive: activate() presses it", js("window.labSkipped === true") is True)
        check("archive: no fallback for a known overlay", js("window.icefinTheme.ui.player.status().fallback") is None)
        js("document.querySelector('.skip-button-container').remove(); true")

        # ---- the web fallback ----
        js("(() => { const p = [...document.querySelectorAll('#videoOsdPage')].pop(); const row = p.querySelector('.videoOsdBottom .buttons') || p;"
           " const b = document.createElement('button'); b.className = 'labPluginButton'; b.textContent = 'Plugin'; row.append(b); return true; })()")
        page.wait_for("!!window.icefinTheme.ui.player.status().fallback", timeout=5)
        reason = js("window.icefinTheme.ui.player.status().fallback")
        check("fallback: a plugin's button in the player", "labPluginButton" in (reason or ""), reason)
        time.sleep(0.6)
        check("fallback: jellyfin-web's controls are back for this session", js("window.icefinTheme.active().route") is None)
        check("fallback: a notice says why", "labPluginButton" in (js("(document.getElementById('icefin-player-notice') || {}).textContent || ''") or ""))
        shot("fallback.png")

        # ---- the next session ----
        js("window.icefinPlaybackManager.stop(); true")
        page.wait_for("!location.hash.startsWith('#/video')", timeout=20)
        time.sleep(2)
        mounts = js("window.labPlayer.mounts")
        play()
        page.wait_for(f"window.labPlayer.mounts > {mounts} && !!document.querySelector('#icefin-theme-root[data-icefin-player]')", timeout=45)
        check("the next session gets the theme's controls again", js("window.icefinTheme.ui.player.status().fallback") is None)
        js("window.icefinPlaybackManager.stop(); true")
        page.wait_for("!location.hash.startsWith('#/video')", timeout=20)
        time.sleep(2)

        # ---- a slow start (a live channel tuning): the grace window counts from the first frame ----
        # The position stays 0 for 4 s, as while a tuner locks on; then a plugin adds its button to every video just after
        # the picture moves (as the in-player episode preview does). That is the player page, not an injection.
        js("(() => { const m = window.icefinPlaybackManager; window.labHold = true; window.labCt = m.currentTime;"
           " m.currentTime = function (p) { return window.labHold ? 0 : window.labCt.call(m, p); }; return true; })()")
        mounts = js("window.labPlayer.mounts")
        play()
        page.wait_for(f"window.labPlayer.mounts > {mounts}", timeout=45)
        time.sleep(4)
        js("window.labHold = false; true")
        time.sleep(0.8)
        js("(() => { const p = [...document.querySelectorAll('#videoOsdPage')].pop(); const row = p.querySelector('.videoOsdBottom .buttons') || p;"
           " const b = document.createElement('button'); b.id = 'labPreviewButton'; b.textContent = 'Preview'; row.append(b); return true; })()")
        time.sleep(2)
        check("slow start: a plugin's button just after the first frame is part of the player", js("window.icefinTheme.ui.player.status().fallback") is None,
              js("window.icefinTheme.ui.player.status().fallback"))
        check("slow start: the theme's controls stay", js("window.icefinTheme.active().route") == "#/video")
        time.sleep(1.5)
        js("(() => { const p = [...document.querySelectorAll('#videoOsdPage')].pop(); const row = p.querySelector('.videoOsdBottom .buttons') || p;"
           " const b = document.createElement('button'); b.className = 'labLateButton'; b.textContent = 'Late'; row.append(b); return true; })()")
        page.wait_for("!!window.icefinTheme.ui.player.status().fallback", timeout=5)
        check("slow start: a button added later still falls back", "labLateButton" in (js("window.icefinTheme.ui.player.status().fallback") or ""))
        js("window.icefinPlaybackManager.currentTime = window.labCt; window.icefinPlaybackManager.stop(); true")
        time.sleep(2)
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
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
    print("theme_player:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
