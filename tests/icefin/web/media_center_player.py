#!/usr/bin/env python3
"""media_center_player.py — Media Center's own player controls through ui.player (PLAN 9.46, D30). Lab guests only.

With Media Center active, while a clip plays:
  - the theme's controls are up over the video (.mc-player), jellyfin-web's own hidden;
  - the title, the seek bar's position and the transport show; Enter on play/pause pauses;
  - the track menu opens as the side panel with audio, subtitles and playback; Right on Speed changes the speed;
  - Back closes the panel, then hides the controls while playing;
  - Playback info opens with the method and the video's codec;
  - "Use the web player controls" sends the session to jellyfin-web's controls (the web fallback), with the notice.
Screenshots go to --out.
Usage: python3 media_center_player.py --app ~/build/src/icefin-player --server jf12 --out ~/rmcp
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9265)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-mcp-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"media_center_player: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        js("new Promise(r => window.api.theme.setActiveTheme('media-center', '', r))")
        page.wait_for("window.icefinTheme.ui.player.status().themed", timeout=30)
        clip = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, searchTerm: 'H264 AAC', Limit: 1}).then(r => (r.Items[0] || {}).Id || '')")
        sid = js("window.ApiClient.serverId()")
        js(f"window.icefinTheme.ctx.play({{ids: ['{clip}'], serverId: '{sid}'}}); true")
        page.wait_for("location.hash.startsWith('#/video') && !!document.querySelector('#icefin-theme-root.mc-player.mc-p-up')", timeout=60)
        time.sleep(2.5)
        shot("controls.png")
        check("Media Center's controls are up over the video", js("window.icefinTheme.active().route") == "#/video")
        check("the title shows", len(js("document.querySelector('.mc-p-title').textContent || (document.querySelector('.mc-p-logo') || {}).alt || ''") or "") > 0)
        check("the seek bar moves", float(js("parseFloat(document.querySelector('.mc-p-fill').style.width) || 0")) > 0)
        check("the Home button shows the server's icon", js("(() => { const i = document.querySelector('.mc-player .mc-round-home img'); return !!i && new URL(i.src).host === new URL(window.ApiClient.serverAddress()).host; })()") is True)
        check("Home is larger than Back", js("document.querySelector('.mc-player .mc-round-home').offsetWidth > document.querySelector('.mc-player .mc-round-back').offsetWidth") is True)
        js("window.icefinTheme.ctx.focus(document.querySelector('.mc-tb-big')); true")
        act("enter")
        page.wait_for("document.querySelector('#icefin-theme-root').classList.contains('mc-p-paused')", timeout=10)
        check("Enter on play/pause pauses", True)
        # the side panel
        js("document.querySelector('.mc-tb[aria-label^=\"Audio, subtitles\"]').click(); true")
        page.wait_for("!!document.querySelector('.mc-p-panel')", timeout=5)
        tabs = js("JSON.stringify([...document.querySelectorAll('.mc-p-panel .mc-pivot-item')].map(t => t.dataset.tab))")
        check("the track menu opens as the side panel", tabs == '["audio","subtitles","playback"]', tabs)
        js("document.querySelector('.mc-p-panel [data-tab=playback]').click(); true")
        time.sleep(0.4)
        shot("panel.png")
        rate0 = js("window.icefinPlaybackManager.getPlaybackRate()")
        js("window.icefinTheme.ctx.focus([...document.querySelectorAll('.mc-p-panel .mc-li')].find(r => /Speed/.test(r.textContent))); true")
        act("right")
        time.sleep(0.8)
        rate1 = js("window.icefinPlaybackManager.getPlaybackRate()")
        check("Right on Speed changes the speed", rate1 != rate0, f"{rate0} -> {rate1}")
        js("window.icefinPlaybackManager.setPlaybackRate(1); true")
        act("back")
        time.sleep(0.4)
        check("Back closes the panel", js("!document.querySelector('.mc-p-panel')") is True)
        # playback info
        js("document.querySelector('.mc-tb[aria-label=\"Playback info\"]').click(); true")
        page.wait_for("!!document.querySelector('.mc-p-info')", timeout=5)
        info = js("document.querySelector('.mc-p-info').textContent")
        check("Playback info: method and codec", ("Direct" in info or "Transcode" in info) and "H264" in info.upper(), info[:160])
        shot("info.png")
        act("back")
        time.sleep(0.3)
        # hide while playing
        js("window.icefinPlaybackManager.unpause(); true")
        time.sleep(1)
        act("back")
        time.sleep(0.6)
        check("Back hides the controls while playing", js("!document.querySelector('#icefin-theme-root').classList.contains('mc-p-up')") is True)
        act("down")
        time.sleep(0.5)
        check("a press brings them back", js("document.querySelector('#icefin-theme-root').classList.contains('mc-p-up')") is True)
        # the web fallback on request
        js("document.querySelector('.mc-tb[aria-label^=\"Audio, subtitles\"]').click(); true")
        page.wait_for("!!document.querySelector('.mc-p-panel')", timeout=5)
        js("document.querySelector('.mc-p-panel [data-tab=playback]').click(); true")
        time.sleep(0.4)
        js("[...document.querySelectorAll('.mc-p-panel .mc-li')].find(r => /web player/.test(r.textContent)).click(); true")
        page.wait_for("!!window.icefinTheme.ui.player.status().fallback", timeout=5)
        time.sleep(0.8)
        check("web controls on request: jellyfin-web's controls for this session", js("window.icefinTheme.active().route") is None)
        check("web controls on request: the notice", "web player controls" in (js("(document.getElementById('icefin-player-notice') || {}).textContent || ''") or ""))
        diag = js("JSON.stringify({hash: location.hash, rootHidden: (document.getElementById('icefin-theme-root') || {}).hidden, rootKids: (document.getElementById('icefin-theme-root') || {childElementCount: -1}).childElementCount, osd: !!document.querySelector('#videoOsdPage:not(.hide)')})")
        print("media_center_player: fallback state", diag, flush=True)
        check("web controls on request: no themed screen left over the video", json.loads(diag)["rootHidden"] is True, diag)
        shot("fallback.png")
        js("window.icefinPlaybackManager.stop(); true")
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
    print("media_center_player:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
