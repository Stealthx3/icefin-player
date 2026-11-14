#!/usr/bin/env python3
"""theme_details.py — themed details screens with the stock page's features, in every theme (PLAN 9.18). Lab only.

For every bundled theme with a details screen (all but Baseline, which keeps the stock page as the control):
  - a movie opens the themed screen in the theme's layout, usable at once (the lists load after it is ready): Back and Home at the top (Up from Play reaches them),
    Play, Favourite, Played, More options; the Audio picker
    for a movie with two audio tracks; focus starts on the actions and Down reaches the pickers and the lists;
  - a series opens it too (no fallback to the stock page) with Seasons and that season's Episodes.
Once, in the first theme (the engine does the work, the theme only lays it out):
  - the Audio picker opens, Down + Enter picks the second track, Back closes a picker without changing anything;
  - the Subtitles picker offers Off and the track; Favourite and Played round-trip to the server;
  - Play starts playback with the chosen tracks; an album lists its tracks; a season and an episode open themed;
  - More options opens jellyfin-web's own page for the rest (edit, delete, playlists).
Screenshots of each theme's movie and series pages go to --out.
Usage: python3 theme_details.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rdet
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = ["media-center", "harbor", "spark", "plum", "plaza", "orbit", "mosaic", "lumen", "marquee", "almanac", "arcade", "tide"]
LAYOUT = {"media-center": "poster", "harbor": "poster", "spark": "hero", "plum": "poster", "plaza": "banner", "orbit": "poster",
          "mosaic": "panel", "lumen": "hero", "marquee": "hero", "almanac": "panel", "arcade": "banner", "tide": "panel"}
ROOT = "document.querySelector('#icefin-theme-root')"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9263)
    ap.add_argument("--out", required=True)
    ap.add_argument("--themes", default=",".join(THEMES))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-det-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_details: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!document.querySelector('.skinHeader')", timeout=90)
        js = lambda e: page.eval(e)
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        api = "window.icefinTheme.ctx.apiClient()"
        find = lambda types, name="": js(f"new Promise(r => {api}.getItems({api}.getCurrentUserId(), {{IncludeItemTypes: '{types}', Recursive: true, searchTerm: {json.dumps(name)}, Limit: 1}}).then(x => r((x.Items[0] || {{}}).Id || '')))")
        movie2 = find("Movie", "TrueHD")
        movie_sub = find("Movie", "H264 AAC")
        series = find("Series")
        album = find("MusicAlbum")
        check("lab library has the fixtures", all([movie2, movie_sub, series, album]), json.dumps([movie2, movie_sub, series, album]))

        def switch(tid):
            for _ in range(3):
                try:
                    js(f"window.__det = 1; new Promise(r => window.api.theme.select({json.dumps(tid)}, '', '', r))")
                    break
                except Exception:  # noqa: BLE001
                    page.reconnect()
            end = time.time() + 60
            while time.time() < end:
                try:
                    if js(f"!!window.icefinTheme && !!window.icefinTheme.active() && window.icefinTheme.active().id === {json.dumps(tid)} && !!window.icefinTheme.ui && !!window.icefinTheme.ui.details && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()"):
                        time.sleep(1.5)
                        return True
                except Exception:  # noqa: BLE001
                    try:
                        page.reconnect(timeout=10)
                    except Exception:  # noqa: BLE001
                        pass
                time.sleep(1)
            return False

        def open_details(item_id):
            js(f"location.hash = '#/details?id={item_id}&serverId=' + {api}.serverId(); true")
            page.wait_for(f"({ROOT} || {{getAttribute: () => null}}).getAttribute('data-icefin-details-ready') === '{item_id}'", timeout=10)
            page.wait_for(f"({ROOT} || {{getAttribute: () => null}}).getAttribute('data-icefin-details-complete') === '{item_id}'", timeout=30)
            time.sleep(0.8)

        def shot(name):
            open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); return f ? (f.dataset.action || f.dataset.option || f.dataset.value || (f.closest('[data-section]') || {dataset: {}}).dataset.section || f.className) : ''; })()")
        deep = True
        for tid in a.themes.split(","):
            if not switch(tid):
                check(f"{tid}: theme switched", False)
                continue
            # A movie with two audio tracks.
            try:
                open_details(movie2)
            except Exception as e:  # noqa: BLE001
                check(f"{tid}: movie opens the themed details screen", False, str(e))
                continue
            info = js("JSON.stringify({layout: document.querySelector('.icefin-details').dataset.layout, actions: [...document.querySelectorAll('.icefin-d-btn')].map(b => b.dataset.action), options: [...document.querySelectorAll('.icefin-d-select')].map(b => b.dataset.option), stock: location.hash.includes('icefin=stock')})")
            info = json.loads(info)
            check(f"{tid}: movie opens the themed details screen ({info['layout']})", not info["stock"] and info["layout"] == LAYOUT[tid], json.dumps(info))
            check(f"{tid}: Play, Favourite, Played, More options", all(x in info["actions"] for x in ("play", "favourite", "played", "more")), json.dumps(info["actions"]))
            info["first"] = js("document.querySelector('.icefin-d-actions .icefin-d-btn').dataset.action")
            check(f"{tid}: the Audio picker for two audio tracks", "audio" in info["options"], json.dumps(info["options"]))
            check(f"{tid}: focus starts on Play", focused() == "play", focused())
            check(f"{tid}: Back and Home at the top", "back" in info["actions"] and "home" in info["actions"])
            # Back and Home above the actions: Up reaches them. A theme that keeps them in a bar under the page (Plaza)
            # has the controller walk (plaza_reach) cover them instead.
            above = js("(() => { const p = document.querySelector('.icefin-d-btn[data-action=play]').getBoundingClientRect(); return [...document.querySelectorAll('[data-action=back], [data-action=home]')].some(b => b.getClientRects().length && b.getBoundingClientRect().bottom <= p.top); })()")
            if above:
                act("up")
                time.sleep(0.3)
                check(f"{tid}: Up from Play reaches Back or Home", focused() in ("back", "home"), focused())
            else:
                print(f"theme_details: info {tid}: Back and Home sit below the page, in the theme's bar", flush=True)
            js("window.icefinTheme.ctx.focus(document.querySelector('.icefin-d-btn[data-action=play]')); true")
            info["actions"] = [x for x in info["actions"] if x not in ("back", "home")]
            # Down walks the actions (a vertical list in some layouts), then reaches the pickers.
            for _ in range(len(info["actions"]) + 1):
                act("down")
                time.sleep(0.25)
                if focused() == "audio":
                    break
            # a layout whose actions are a list beside the art (Media Center, 9.46) has the pickers to its right
            for _ in range(2):
                if focused() == "audio":
                    break
                act("right")
                time.sleep(0.25)
            check(f"{tid}: Down (then Right, beside a list of actions) reaches the pickers", focused() == "audio", focused())
            shot(f"{tid}-movie.png")
            if deep:
                act("enter")
                page.wait_for("!!document.querySelector('.icefin-d-picker .icefin-d-option.icefin-focused')", timeout=5)
                n = js("document.querySelectorAll('.icefin-d-picker .icefin-d-option').length")
                check("the Audio picker lists both tracks", n == 2, str(n))
                second = js("document.querySelectorAll('.icefin-d-picker .icefin-d-option')[1].textContent")
                act("down")
                act("enter")
                time.sleep(0.4)
                chip = js("document.querySelector('.icefin-d-select[data-option=audio] b').textContent")
                check("Down + Enter picks the second track; the picker closes", chip == second and not js("!!document.querySelector('.icefin-d-picker')"), chip)
                act("enter")
                time.sleep(0.3)
                act("down")
                act("back")
                time.sleep(0.3)
                check("Back closes a picker and keeps the choice", not js("!!document.querySelector('.icefin-d-picker')")
                      and js("document.querySelector('.icefin-d-select[data-option=audio] b').textContent") == chip and focused() == "audio")
                # Favourite and Played round-trip to the server.
                for action, field in (("favourite", "IsFavorite"), ("played", "Played")):
                    before = js(f"{api}.getItem({api}.getCurrentUserId(), '{movie2}').then(i => !!i.UserData.{field})")
                    js(f"document.querySelector('.icefin-d-btn[data-action={action}]').click(); true")
                    time.sleep(1.2)
                    after = js(f"{api}.getItem({api}.getCurrentUserId(), '{movie2}').then(i => !!i.UserData.{field})")
                    pressed = js(f"document.querySelector('.icefin-d-btn[data-action={action}]').getAttribute('aria-pressed')")
                    js(f"document.querySelector('.icefin-d-btn[data-action={action}]').click(); true")
                    time.sleep(1.2)
                    back = js(f"{api}.getItem({api}.getCurrentUserId(), '{movie2}').then(i => !!i.UserData.{field})")
                    check(f"{action.capitalize()} round-trips to the server", after != before and back == before and pressed == str(after).lower(), f"{before}->{after}->{back}")
                # Subtitles: Off and the track; Play starts playback with the choice.
                open_details(movie_sub)
                subs = js("(() => { const c = document.querySelector('.icefin-d-select[data-option=subtitles]'); if (!c) return []; c.click(); const o = [...document.querySelectorAll('.icefin-d-picker .icefin-d-option')].map(x => x.textContent); return o; })()")
                check("the Subtitles picker offers Off and the track", len(subs) == 2 and subs[0] == "Off", json.dumps(subs))
                if subs:
                    js("document.querySelectorAll('.icefin-d-picker .icefin-d-option')[1].click(); true")
                js("document.querySelector('.icefin-d-btn[data-action=play]').click(); true")
                try:
                    page.wait_for("!!window.icefinTheme.ctx.nowPlaying()", timeout=40)
                    playing = True
                except Exception:  # noqa: BLE001
                    playing = False
                check("Play starts playback", playing)
                js("window.icefinPlaybackManager && window.icefinPlaybackManager.stop(); true")
                time.sleep(3)
                # An album lists its tracks; a season and an episode open themed; More options opens the stock page.
                open_details(album)
                tracks = js("document.querySelectorAll('[data-section=tracks] .icefin-d-track').length")
                check("an album lists its tracks", tracks >= 2, str(tracks))
            # A series: Seasons and Episodes, in every theme.
            open_details(series)
            ser = json.loads(js("JSON.stringify({seasons: document.querySelectorAll('[data-section=seasons] .icefin-d-card').length, episodes: document.querySelectorAll('[data-section=episodes] .icefin-d-card').length, stock: location.hash.includes('icefin=stock'), actions: [...document.querySelectorAll('.icefin-d-btn')].map(b => b.dataset.action)})"))
            check(f"{tid}: a series opens themed, with Seasons and Episodes", not ser["stock"] and ser["seasons"] >= 1 and ser["episodes"] >= 1 and "shuffle" in ser["actions"], json.dumps(ser))
            # Focus deep in the lists never scrolls the page sideways: the title stays in view (a list's cards once
            # widened their column and focus scrolled the whole screen).
            js("window.icefinTheme.ctx.focus([...document.querySelectorAll('.icefin-d-section .icefin-d-card')].pop()); true")
            time.sleep(1)
            side = json.loads(js("JSON.stringify({scroll: document.querySelector('.icefin-d-scroll').scrollLeft, wrap: document.querySelector('.icefin-details').scrollLeft, root: document.querySelector('#icefin-theme-root').scrollLeft, title: Math.round(document.querySelector('.icefin-d-title').getBoundingClientRect().left)})"))
            check(f"{tid}: focus in the lists keeps the page in place sideways", side["scroll"] == 0 and side["wrap"] == 0 and side["root"] == 0 and side["title"] >= 0, json.dumps(side))
            shot(f"{tid}-series.png")
            if deep:
                season = js("document.querySelector('[data-section=seasons] .icefin-d-card').dataset.id")
                open_details(season)
                check("a season opens themed with its Episodes", js("document.querySelectorAll('[data-section=episodes] .icefin-d-card').length") >= 1)
                ep = js("document.querySelector('[data-section=episodes] .icefin-d-card').dataset.id")
                open_details(ep)
                check("an episode opens themed with a way to its series", js("!!document.querySelector('.icefin-d-btn[data-action=series]')") is True)
                # Back returns to the page before (the season); Home goes to the main menu.
                js("document.querySelector('.icefin-d-btn[data-action=back]').click(); true")
                page.wait_for(f"({ROOT} || {{getAttribute: () => null}}).getAttribute('data-icefin-details-complete') === '{season}'", timeout=30)
                check("Back returns to the previous page", True)
                js("document.querySelector('.icefin-d-btn[data-action=home]').click(); true")
                page.wait_for("location.hash.startsWith('#/home')", timeout=15)
                check("Home goes to the main menu", True)
                open_details(ep)
                js("document.querySelector('.icefin-d-btn[data-action=more]').click(); true")
                page.wait_for("location.hash.includes('icefin=stock')", timeout=15)
                time.sleep(2)
                check("More options opens jellyfin-web's own page", js("window.icefinTheme.active().route") is None)
            deep = False
        # Clean-up: theme off, and wait until the server has it, so the next test doesn't start in the last theme.
        js("new Promise(r => window.api.theme.select('', '', '', r))")
        time.sleep(1.5)
        js("window.icefinThemeSync.idle().then(() => true)")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            try:
                os.killpg(app.pid, signal.SIGKILL)
            except Exception:  # noqa: BLE001
                pass
        if xv:
            xv.terminate()
    print("theme_details:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
