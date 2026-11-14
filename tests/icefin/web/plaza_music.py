#!/usr/bin/env python3
"""plaza_music.py — Plaza's own Now playing, Queue and Lyrics (PLAN 9.44), on the engine's queue and play mode calls.
Lab guests only. While an album plays with Plaza active (the repository's themes):
  - #/queue opens Plaza's Now playing: the song's title, NOW PLAYING, the record, the time line moving;
  - Shuffle and Repeat follow the engine's play mode;
  - the Queue tab lists the album's songs with the one playing marked; OK on another plays it;
  - the Lyrics tab shows the song's lines, or says there are none;
  - nothing playing: an empty state that offers Music.
Usage: python3 theme_player.py --app ~/build/src/icefin-player --server jf12 --out ~/rplaza-music
"""
import argparse, base64, json, os, signal, sys, tempfile, time
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "..", "..", "themes"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9273)
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
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-plaza-music-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"plaza_music: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        alb = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'MusicAlbum', Recursive: true, Limit: 1, SortBy: 'SortName'}).then(r => (r.Items[0] || {}).Id || '')")
        js("location.hash = '#/queue'; true"); time.sleep(3)
        check("nothing playing: an empty state that offers Music", js("!!document.querySelector('#icefin-theme-root[data-pz-music] .pz-empty-state')") is True)
        js(f"window.icefinTheme.ctx.play({{ids: ['{alb}'], serverId: window.ApiClient.serverId()}}); true"); time.sleep(5)
        js("location.hash = '#/home'; true"); time.sleep(2); js("location.hash = '#/queue'; true"); time.sleep(3)
        t = js("(document.querySelector('.pz-mu-title') || {}).textContent || ''")
        song = js("(window.icefinTheme.ctx.nowPlaying() || {item: {}}).item.Name || ''")
        check("Now playing: the song, NOW PLAYING, the record", bool(t) and t == song and js("!!document.querySelector('.pz-mu-now .pz-kicker') && !!document.querySelector('.pz-mu-disc')") is True, [t, song])
        p0 = js("document.querySelector('.pz-mu-fill').style.width"); time.sleep(2); p1 = js("document.querySelector('.pz-mu-fill').style.width")
        check("the time line moves", p0 != p1, [p0, p1])
        shot("now.png")
        js("[...document.querySelectorAll('.pz-mu-row .pz-pl-pill')].find(b => b.textContent.startsWith('Shuffle')).click(); true"); time.sleep(1.5)
        sh = js("[...document.querySelectorAll('.pz-mu-row .pz-pl-pill')].find(b => b.textContent.startsWith('Shuffle')).textContent")
        check("Shuffle follows the play mode", sh == 'Shuffle: on' and js("window.icefinTheme.ctx.playMode().shuffle") is True, sh)
        js("[...document.querySelectorAll('.pz-mu-row .pz-pl-pill')].find(b => b.textContent.startsWith('Shuffle')).click(); true"); time.sleep(1)
        js("[...document.querySelectorAll('.pz-mu-row .pz-pl-pill')].find(b => b.textContent.startsWith('Repeat')).click(); true"); time.sleep(1.5)
        rp = js("[...document.querySelectorAll('.pz-mu-row .pz-pl-pill')].find(b => b.textContent.startsWith('Repeat')).textContent")
        check("Repeat follows the play mode", rp == 'Repeat: all' and js("window.icefinTheme.ctx.playMode().repeat") == 'RepeatAll', rp)
        js("window.icefinTheme.ctx.setRepeat('RepeatNone')")
        js("document.querySelector('[data-pz-tab=\"queue\"]').click(); true"); time.sleep(3)
        rows = js("[...document.querySelectorAll('.pz-mu-entry')].map(r => [r.querySelector('.pz-mu-entry-name').textContent, r.classList.contains('pz-mu-current')])")
        check("Queue: the album's songs, the one playing marked", len(rows) >= 2 and sum(1 for r in rows if r[1]) == 1, rows)
        shot("queue.png")
        if len(rows) >= 2:
            other = 0 if rows[1][1] else 1
            js(f"document.querySelectorAll('.pz-mu-entry')[{other}].click(); true"); time.sleep(4)
            cur = js("[...document.querySelectorAll('.pz-mu-entry')].findIndex(r => r.classList.contains('pz-mu-current'))")
            check("OK on another song plays it", cur == other, [cur, other])
        js("document.querySelector('[data-pz-tab=\"lyrics\"]').click(); true"); time.sleep(3)
        ly = js("[document.querySelectorAll('.pz-mu-lyric').length, !!document.querySelector('.pz-mu-lyrics .pz-empty-state')]")
        check("Lyrics: the song's lines, or none", ly[0] > 0 or ly[1] is True, ly)
        shot("lyrics.png")
        js("window.icefinPlaybackManager.stop(); true")
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
    print("plaza_music:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
