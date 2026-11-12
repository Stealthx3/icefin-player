#!/usr/bin/env python3
"""media_center_nav.py — Media Center's navigation, from the host walk (PLAN 9.46). Lab only. Real keys (CDP), desktop mode.

With Media Center active:
  - Backspace on a themed screen that leaves Back to the engine (details, search, the wall) goes back;
  - the poster wall (#/list) has Back, Home and its title, and Up from the top row reaches Back or Home;
  - a framed jellyfin-web page (Playback): Down focuses its first control, the arrows move between controls and reach the
    frame's Back, Backspace goes back to the settings;
  - details: from Play, Up and Left reach Back or Home;
  - More options: jellyfin-web's details page stays hidden under the item menu, and closing the menu returns to Media
    Center's details;
  - leaving that page, it never shows under the settings again (it lingered a few frames);
  - the player: Up from the transport row goes to Back (with no Skip showing); the panel leaves the times clear.
Usage: python3 media_center_nav.py --app ~/build/src/icefin-player --server jf12 --out ~/rmcn
"""
import argparse, base64, json, os, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

KEYS = {"up": ("ArrowUp", 38), "down": ("ArrowDown", 40), "left": ("ArrowLeft", 37), "right": ("ArrowRight", 39), "back": ("Backspace", 8), "esc": ("Escape", 27), "enter": ("Enter", 13)}
FOCUSED = r"""(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused') || document.activeElement; if (!f || f === document.body) return '';
  return (typeof f.className === 'string' ? f.className.split(' ').slice(0, 3).join('.') : f.tagName) + ' ' + (f.textContent || f.getAttribute('aria-label') || '').trim().slice(0, 20); })()"""
ON_NAV = r"""(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused') || document.activeElement; return !!f && !!f.closest && !!f.closest('.mc-round-back, .mc-round-home'); })()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9273)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-mcn-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"media_center_nav: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shot(name):
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1920x1080", "-i", ":99", "-frames:v", "1",
                        os.path.join(a.out, "x-" + name)], timeout=20)

    def key(k, wait=0.35):
        name, code = KEYS[k]
        for t in ("rawKeyDown", "keyUp"):
            page.send("Input.dispatchKeyEvent", type=t, key=name, code=name, windowsVirtualKeyCode=code, nativeVirtualKeyCode=code)
        time.sleep(wait)

    def reach_nav(dirs=("up", "left"), tries=10):
        trail = []
        for _ in range(tries):
            if js(ON_NAV):
                return True, trail
            for d in dirs:
                key(d)
                trail.append(f"{d}:{js(FOCUSED)}")
                if js(ON_NAV):
                    return True, trail
        return False, trail

    def go(h, ready=None, wait=2.0):
        js(f"location.hash = {json.dumps(h)}; true")
        if ready:
            page.wait_for(ready, timeout=25)
        time.sleep(wait)

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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        js("new Promise(r => window.api.theme.setActiveTheme('media-center', '', r))")
        time.sleep(2)
        sid = js("window.ApiClient.serverId()")
        uid = js("window.ApiClient.getCurrentUserId()")
        movie = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, Limit: 1, SortBy: 'SortName'}).then(r => r.Items[0].Id)")
        mv = js("window.icefinTheme.ui.userViews().then(v => (v.find(x => x.CollectionType === 'movies') || v[0]).Id)")
        go("#/home", "+(document.querySelector('#icefin-theme-root').getAttribute('data-mc-ready') || 0) > 0", 1.5)

        # ---- the wall: chrome, Up to Back, Backspace back ----
        go(f"#/list?parentId={mv}&serverId={sid}", "document.querySelector('#icefin-theme-root').getAttribute('data-mc-ready') === '1'", 1)
        w = js("(() => { const r = document.querySelector('#icefin-theme-root'); return [!!r.querySelector('.mc-round-back'), !!r.querySelector('.mc-round-home'), (r.querySelector('.mc-title') || {}).textContent || '']; })()")
        check("wall: Back, Home and the title", w[0] and w[1] and bool(w[2]), json.dumps(w))
        ok, trail = reach_nav(("up",), 3)
        check("wall: Up from the top row reaches Back or Home", ok, " > ".join(trail))
        shot("wall.png")
        key("back", 1.5)
        check("wall: Backspace goes back to the start", js("location.hash").startswith("#/home"), js("location.hash"))

        # ---- details: from Play, up and left reach Back or Home; Backspace back ----
        go(f"#/details?id={movie}&serverId={sid}", "!!document.querySelector('#icefin-theme-root [data-action=\"play\"], #icefin-theme-root .icefin-d-btn')", 1.5)
        js("(() => { const p = document.querySelector('#icefin-theme-root [data-action=\"play\"]'); if (p) window.icefinTheme.ctx.focus(p); return true; })()")
        ok, trail = reach_nav(("up", "left"), 6)
        check("details: from Play, the arrows reach Back or Home", ok, " > ".join(trail))
        key("back", 1.5)
        check("details: Backspace goes back", js("location.hash").startswith("#/home"), js("location.hash"))

        # ---- More options ----
        go(f"#/details?id={movie}&serverId={sid}", "!!document.querySelector('#icefin-theme-root [data-action=\"more\"]')", 1.5)
        js("document.querySelector('#icefin-theme-root [data-action=\"more\"]').click(); true")
        page.wait_for("[...document.querySelectorAll('.dialogContainer .dialog')].some(d => d.getClientRects().length)", timeout=20)
        time.sleep(1)
        hidden = js("(() => { const p = [...document.querySelectorAll('.mainAnimatedPage, .page')].find(x => x.getClientRects().length && x.getBoundingClientRect().height > 100); return [document.documentElement.hasAttribute('data-mc-more'), !p || getComputedStyle(p).visibility === 'hidden']; })()")
        check("more options: jellyfin-web's details page hidden under the menu", all(hidden), json.dumps(hidden))
        shot("more.png")
        key("esc", 0.5)
        try:
            page.wait_for("!location.hash.includes('icefinmore') && !!document.querySelector('#icefin-theme-root [data-action=\"play\"]')", timeout=10)
        except Exception:  # noqa: BLE001
            print("media_center_nav: (more)", js("JSON.stringify({hash: location.hash.slice(0, 90), more: document.documentElement.hasAttribute('data-mc-more'), stock: document.documentElement.getAttribute('data-icefin-stock'), dialogs: [...document.querySelectorAll('.dialogContainer .dialog')].filter(d => d.getClientRects().length).map(d => d.className.slice(0, 60)), len: history.length})"))
            raise
        check("more options: closing the menu returns to Media Center's details", js("document.documentElement.hasAttribute('data-icefin-stock')") is False)

        # ---- a framed jellyfin-web page ----
        go("#/mypreferencesmenu", "+(document.querySelector('#icefin-theme-root').getAttribute('data-icefin-settings-ready') || 0) > 0", 1)
        go(f"#/mypreferencesplayback?userId={uid}", "!!document.querySelector('.page[data-mc-form]:not(.hide) .mc-form-col')", 1.5)
        key("down")
        f1 = js(FOCUSED)
        check("playback: Down focuses the page's first control", bool(f1) and "mc-round" not in f1, f1)
        key("down")
        f2 = js(FOCUSED)
        check("playback: the arrows move between controls", bool(f2) and f2 != f1, f2)
        ok, trail = reach_nav(("up", "left"), 12)
        check("playback: the arrows reach the frame's Back or Home", ok, " > ".join(trail[-4:]))
        shot("playback.png")
        key("down", 0.5)
        # every frame while it goes back: once the route has left the page, the page is never on top again
        js("""(() => { window.__mcLeave = []; const t0 = performance.now(); const tick = () => {
            const p = document.querySelector('.page[data-mc-form]'); const e = document.elementFromPoint(innerWidth * 0.6, innerHeight * 0.5);
            window.__mcLeave.push([Math.round(performance.now() - t0), location.hash.split('?')[0], !!(p && e && p.contains(e))]);
            if (performance.now() - t0 < 1500) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()""")
        key("back", 1.6)
        check("playback: Backspace goes back to the settings", js("location.hash").startswith("#/mypreferencesmenu"), js("location.hash"))
        late = js("window.__mcLeave.filter(f => f[1] === '#/mypreferencesmenu' && f[2]).length")
        check("playback: leaving it, the page doesn't show under the settings", late == 0, f"{late} frame(s)")

        # ---- the player ----
        clip = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, searchTerm: 'H264 AAC', Limit: 1}).then(r => (r.Items[0] || {}).Id || '')")
        js(f"window.icefinTheme.ctx.play({{ids: ['{clip}'], serverId: '{sid}'}}); true")
        page.wait_for("location.hash.startsWith('#/video') && !!document.querySelector('#icefin-theme-root.mc-player.mc-p-up')", timeout=60)
        time.sleep(3)
        key("enter", 0.6)  # shows the controls (and pauses)
        js("window.icefinTheme.ctx.focus(document.querySelector('#icefin-theme-root .mc-tb-big')); true")
        key("up")
        f = js(FOCUSED)
        state = js("JSON.stringify({up: document.querySelector('#icefin-theme-root').classList.contains('mc-p-up'), status: window.icefinTheme.ui.player.status()})")
        check("player: Up from the transport row goes to Back", "mc-round-back" in f, f + ("" if "mc-round-back" in f else " " + state))
        js("document.querySelector('#icefin-theme-root [aria-label=\"Audio, subtitles and settings\"]').click(); true")
        time.sleep(1)
        gap = js("(() => { const p = document.querySelector('#icefin-theme-root .mc-p-panel'); const t = document.querySelector('#icefin-theme-root .mc-p-times'); if (!p || !t) return null; return Math.round(p.getBoundingClientRect().left - t.getBoundingClientRect().right); })()")
        check("player: with the panel open, the times end before it", gap is not None and gap > 0, f"{gap}px")
        shot("player-panel.png")
        key("back", 0.6)
        shot("player.png")
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
    print("media_center_nav:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
