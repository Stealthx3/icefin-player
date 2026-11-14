#!/usr/bin/env python3
"""plaza_jingles.py — theme music (PLAN 9.33) on Plaza. Lab only.

  - Plaza's package declares a startup jingle, an ambient loop and a jingle for each kind of channel;
  - the startup jingle plays once when the theme first comes up, and not again after a page reload in the same run;
  - the ambient loop plays at home;
  - opening a channel's card plays its jingle with the ambient loop ducked; the next channel's card plays its own;
    closing the card stops the jingle and the ambient loop comes back up; a favourite's card plays none;
  - playback stops the ambient loop and refuses jingles; the loop comes back a few seconds after playback ends;
  - Client Settings -> Theme: Background Music off stops the loop, Theme Jingles off silences cards, Music Volume
    applies (all restored afterwards).
Usage: python3 plaza_jingles.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rpj
"""
import argparse, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import hostmode  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "..", "..", "themes"))
KINDS = ["resume", "nextup", "movies", "tvshows", "music", "livetv", "homevideos", "photos", "books", "boxsets", "playlists", "folder"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9273)
    ap.add_argument("--out", required=True)
    hostmode.add_args(ap)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    app = xv = stop = None
    if not a.host:
        os.environ["ICEFIN_THEME_PATH"] = THEMES
        cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
        cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
        srv = Server(cfg)
        srv.wait()
        xv = start_x()
        log = open(os.path.join(a.out, "app.log"), "w")
        app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-plaza-jingles-"), log, "xcb")
    fails = []
    saved = None  # the user's own music settings (host), put back at the end

    def check(label, ok, detail=""):
        print(f"plaza_jingles: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    page = None
    try:
        if a.host:
            page, stop = hostmode.start(a, a.out)
            # a fresh start, as in the lab, so the startup jingle plays when the theme comes up
        else:
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
            page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.musicState && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        st = lambda: js("window.icefinTheme.musicState()")
        setv = lambda k, v: js(f"new Promise(r => window.api.settings.setValue('theme', {json.dumps(k)}, {json.dumps(v)}, () => r(true)))")

        def until(cond, sec, step=0.25):
            end = time.time() + sec
            while time.time() < end:
                s = st()
                if cond(s):
                    return s
                time.sleep(step)
            return st()

        if a.host:
            saved = {k: js(f"new Promise(r => window.api.settings.value('theme', {json.dumps(k)}, r))") for k in ("jingles", "ambientMusic", "musicVolume")}
            print("host: your music settings (put back at the end):", json.dumps(saved), flush=True)
        for k, v in (("jingles", True), ("ambientMusic", True), ("musicVolume", "60")):
            setv(k, v)
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-pz=\"home\"][data-pz-ready]')", timeout=40)

        s = until(lambda s: s["startupPlayed"], 10)
        check("the package declares startup, ambient and the 12 channel jingles",
              bool(s["urls"]) and s["urls"]["startup"] and s["urls"]["ambient"] and sorted(s["urls"]["jingles"]) == sorted(KINDS), json.dumps(s["urls"]))
        check("the startup jingle plays when the theme first comes up", s["startupPlayed"] and "startup" in s["played"], json.dumps(s))
        check("the audio context runs", s["context"] == "running", s["context"])
        s = until(lambda s: s["ambient"], 12)
        check("the ambient loop plays at home", s["ambient"], json.dumps(s))

        # ---- channel cards ----
        tile = lambda kind: f"document.querySelector('.pz-tile.pz-k-{kind}[data-pz-channel]')"
        kinds = js("[...new Set([...document.querySelectorAll('.pz-tile[data-pz-channel]')].map(t => (t.className.match(/pz-k-(\\w+)/) || [])[1]))]")
        first = next(k for k in kinds if k != "favourite")
        idle = "!document.querySelector('.pz-card')"

        def open_tile(kind):
            # turn to the tile's page (root's data-pz-page is "n/total", 1-based), then open it
            page.wait_for(idle, timeout=10)
            for _ in range(8):
                d = js(f"+{tile(kind)}.getAttribute('data-pz-page') - (parseInt(document.querySelector('#icefin-theme-root').getAttribute('data-pz-page')) - 1)")
                if not d:
                    break
                js(f"document.querySelector('.pz-arrow.{'pz-next' if d > 0 else 'pz-prev'}').click(); true")
                time.sleep(0.8)
            js(f"{tile(kind)}.click(); true")

        open_tile(first)
        s = until(lambda s: s["jingle"] == first and s["held"], 5)
        check(f"opening the {first} card plays its jingle with the ambient loop held off (the user, 2026-11-13)", s["jingle"] == first and s["held"] and s["ducked"], json.dumps(s))
        # the card swallows actions while it opens: wait until it's shown
        shown = "!!document.querySelector('.pz-card.pz-shown')"
        page.wait_for(shown, timeout=10)
        time.sleep(0.3)
        card_kind = "(document.querySelector('.pz-card').className.match(/pz-k-(\\w+)/) || [])[1]"
        nxt = first
        for _ in range(6):  # right moves across the card's buttons, then steps to the next channel
            js("window.icefinTheme.handleAction('right')")
            time.sleep(0.4)
            nxt = js(card_kind)
            if nxt != first:
                break
        if nxt and nxt != first:
            want = None if nxt == "favourite" else nxt
            s = until(lambda s: s["jingle"] == want, 5)
            check(f"the next channel's card ({nxt}) plays its own", s["jingle"] == want, json.dumps(s))
        page.wait_for(shown, timeout=10)
        time.sleep(0.3)
        js("window.icefinTheme.handleAction('back')")
        s = until(lambda s: s["jingle"] is None and not s["ducked"] and not s["held"], 5)
        check("closing the card stops the jingle and brings the loop back up", s["jingle"] is None and not s["ducked"] and not s["held"] and s["ambient"], json.dumps(s))
        if "favourite" in kinds:
            open_tile("favourite")
            page.wait_for(shown, timeout=10)
            time.sleep(0.5)
            s = st()
            check("a favourite's card plays no jingle", s["jingle"] is None, json.dumps(s))
            check("a favourite's card holds the ambient loop off too", s["held"] and s["ducked"], json.dumps(s))
            js("window.icefinTheme.handleAction('back')")
            page.wait_for(idle, timeout=10)

        # ---- the startup jingle once per run ----
        page.eval("location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        js = page.eval
        page.wait_for("!!window.icefinTheme && !!window.icefinTheme.musicState && !!document.querySelector('#icefin-theme-root[data-pz=\"home\"][data-pz-ready]')", timeout=60)
        s = until(lambda s: s["ambient"], 12)
        check("after a reload the startup jingle doesn't play again; the loop does", not s["startupPlayed"] and "startup" not in s["played"] and s["ambient"], json.dumps(s))

        # ---- playback ----
        # (not on the host: playing reports to the user's server, which keeps their watch data; the lab covers it)
        clip = None if a.host else js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, searchTerm: 'H264 AAC', Limit: 1}).then(r => (r.Items[0] || {}).Id || '')")
        sid = js("window.ApiClient.serverId()")
        if clip:
            js(f"window.icefinTheme.ctx.play({{ids: ['{clip}'], serverId: '{sid}'}}); true")
            page.wait_for("location.hash.startsWith('#/video') && window.icefinPlaybackManager.currentTime() > 300", timeout=40)
            s = until(lambda s: not s["ambient"], 4)
            check("playback stops the ambient loop", not s["ambient"], json.dumps(s))
            refused = js("window.icefinTheme.ctx.music.jingle('movies')")
            check("a jingle is refused while something plays", refused is False, str(refused))
            t0 = time.time()
            js("window.icefinPlaybackManager.stop(); true")
            page.wait_for("!location.hash.startsWith('#/video')", timeout=20)
            early = st()["ambient"]
            s = until(lambda s: s["ambient"], 15)
            # the engine waits 3 s after the last tick (1 s apart) that saw playback, so at least 2 s after stop()
            check("the loop comes back a few seconds after playback ends", s["ambient"] and not early and time.time() - t0 >= 2.0,
                  f"{time.time() - t0:.1f} s after stop(); back at once: {early}")
        elif not a.host:
            check("a test clip exists", False)

        # ---- settings ----
        setv("ambientMusic", False)
        s = until(lambda s: not s["ambient"], 5)
        check("Background Music off stops the loop", not s["ambient"] and s["settings"]["ambient"] is False, json.dumps(s["settings"]))
        setv("jingles", False)
        time.sleep(0.5)
        open_tile(first)
        page.wait_for(shown, timeout=10)
        time.sleep(0.5)
        s = st()
        check("Theme Jingles off: a card plays nothing", s["jingle"] is None and s["settings"]["jingles"] is False, json.dumps(s))
        js("window.icefinTheme.handleAction('back')")
        setv("musicVolume", "40")
        s = until(lambda s: abs(s["settings"]["volume"] - 0.4) < 1e-6, 5)
        check("Music Volume applies", abs(s["settings"]["volume"] - 0.4) < 1e-6, json.dumps(s["settings"]))
    except Exception as e:  # noqa: BLE001
        check("no exception", False, repr(e))
    finally:
        try:
            if page:
                back = saved if a.host and saved else {"jingles": True, "ambientMusic": True, "musicVolume": "60"}
                for k, v in back.items():
                    page.eval(f"new Promise(r => window.api.settings.setValue('theme', {json.dumps(k)}, {json.dumps(v)}, () => r(true)))")
                if a.host:
                    print("host: your music settings are back:", json.dumps({k: page.eval(f"new Promise(r => window.api.settings.value('theme', {json.dumps(k)}, r))") for k in back}), flush=True)
        except Exception as e:  # noqa: BLE001
            print("plaza_jingles: couldn't put the music settings back:", repr(e), flush=True)
        if stop:
            stop()
        else:
            app.terminate()
            try:
                app.wait(15)
            except Exception:  # noqa: BLE001
                app.kill()
            if xv:
                xv.terminate()
    print(f"plaza_jingles: {'PASS' if not fails else 'FAIL ' + str(len(fails))}", flush=True)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
