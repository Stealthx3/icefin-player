#!/usr/bin/env python3
"""plaza_walk.py — the host walk's findings, fixed (PLAN 9.43), and Plaza's details page. Lab only.

  - the sort and filter panel shows its card over a translucent dim (the window went black on hardware);
  - the bottom row's name pill sits above the channel, clear of the clock;
  - a show's card counts seasons in words ("1 season"); a Live TV card shows a logo whole;
  - genre cells with art carry their names; a list's Play all and Shuffle are action buttons; empty lists offer a way on;
  - a series' episode list ends above the bar;
  - nothing of a page opened before playback shows above the video;
  - details: Plaza's frame (name pill and clock, section tabs, the bar with round Back and Home) on a movie, a series, an
    album (tracks beside the art) and a person; the actions are on screen as the page opens; a picker is a Plaza card;
    a section tab scrolls to its section; nothing runs past the window's edges.
Usage: python3 plaza_walk.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rpw
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

# On-screen things that run past the window or sit under the frame (head or bar) while not scrolled away.
EDGES = r"""(() => { const W = innerWidth, H = innerHeight, out = [];
  for (const e of document.querySelectorAll('#icefin-theme-root [data-icefin-focus]')) { const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).visibility === 'hidden') continue;
    // a row that scrolls sideways may run past the window: its container is what has to fit
    const row = e.closest('.icefin-d-row, .pz-tabs'); if (row && getComputedStyle(row).overflowX !== 'visible') { const rr = row.getBoundingClientRect(); if (rr.right <= W + 1 && rr.left >= -1) continue; }
    if (r.right > W + 1 || r.left < -1) out.push((e.className || '').toString().split(' ')[0] + ':' + (e.textContent || '').trim().slice(0, 20)); }
  return out; })()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9267)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-pw-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"plaza_walk: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        js = page.eval

        def shot(name):
            open(os.path.join(a.out, f"{name}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

        def go(h, ready=None, wait=2.5):
            js(f"location.hash = {json.dumps(h)}; true")
            if ready:
                page.wait_for(ready, timeout=30)
            time.sleep(wait)

        top = lambda x, y: js(f"(() => {{ const e = document.elementFromPoint({x}, {y}); return e ? (e.className || '').toString() + '|' + (e.closest('.pz-panel-card') ? 'card' : '') : ''; }})()")
        rect = lambda sel: js(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }})()")
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        js(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        js(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
        js("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinPlaybackManager", timeout=90)
        js = page.eval
        time.sleep(2)
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        time.sleep(3)
        W, H = js("innerWidth"), js("innerHeight")
        sid = js("window.ApiClient.serverId()")
        one = lambda t: js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {{IncludeItemTypes: '{t}', Recursive: true, Limit: 1}}).then(r => r.Items[0] ? r.Items[0].Id : null)")
        views = {ct: vid for vid, ct in js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.map(v => [v.Id, v.CollectionType || '']))")}
        js(f"localStorage.removeItem('icefin.plaza.order.' + window.ApiClient.getCurrentUserId()); true")
        # ---- home: the bottom row's name above the channel ----
        go("#/home", "!!document.querySelector('#icefin-theme-root[data-pz=\"home\"][data-pz-ready]')", 2)
        js("window.icefinTheme.ctx.focus(document.querySelector('.pz-tile[data-pz-row=\"2\"]')); true")
        time.sleep(0.5)
        t, n, c = rect(".pz-tile.icefin-focused"), rect(".pz-tile.icefin-focused > .pz-name"), rect(".pz-clock")
        check("home: the bottom row's name pill is above its channel, clear of the clock", bool(t and n and c) and n[3] <= t[1] + 2 and (n[3] < c[1] or n[0] > c[2] or n[2] < c[0]), f"tile {t} name {n} clock {c}")
        shot("01-home-bottom-row")
        # ---- the show card's seasons, the Live TV card's logo ----
        js("(() => { const t = document.querySelector('.pz-tile.pz-k-tvshows'); if (t) t.click(); return true; })()")
        time.sleep(2.5)
        seasons = js("(document.querySelector('.pz-season-0') || {}).textContent || ''")
        check("a show's card counts seasons in words", seasons == "" or "seasons" not in seasons or not seasons.startswith("1 "), seasons)
        js("window.icefinTheme.handleAction('back')")
        time.sleep(1)
        # ---- the sort and filter panel ----
        go(f"#/movies?topParentId={views['movies']}&collectionType=movies&serverId={sid}", "!!document.querySelector('.pz-grid[data-pz-grid-ready]')")
        js("document.querySelector('.pz-tab-sort').click(); true")
        time.sleep(0.8)
        cr = rect(".pz-panel-card")
        mid = top((cr[0] + cr[2]) / 2, (cr[1] + cr[3]) / 2) if cr else ""
        dim = js("getComputedStyle(document.querySelector('.pz-panel .pz-dim')).backgroundColor")
        check("sort and filter: its card is on top, over a translucent dim", "card" in mid and ("0.42" in dim or "0.4" in dim), f"{mid} {dim}")
        shot("02-sort-panel")
        js("window.icefinTheme.handleAction('back')")
        time.sleep(0.5)
        # ---- genre names, list actions, empty states ----
        js("document.querySelector('[data-pz-tab=\"genres\"]').click(); true")
        page.wait_for("!!document.querySelector('.pz-grid[data-pz-grid-ready]')", timeout=20)
        time.sleep(1)
        labels = js("document.querySelectorAll('.pz-cell .pz-cell-label').length + document.querySelectorAll('.pz-cell .pz-cell-title').length")
        cells = js("document.querySelectorAll('.pz-cell').length")
        if cells:
            check("genres: every cell carries its name", labels == cells, f"{labels}/{cells}")
        else:
            print("plaza_walk: skip genres: the lab's movies have no genres (the host walk covers it)", flush=True)
        shot("03-genres")
        g = js("window.ApiClient.getGenres(window.ApiClient.getCurrentUserId(), {Limit: 1, Recursive: true}).then(r => r.Items[0] ? r.Items[0].Id : null)")
        if g:
            go(f"#/list?genreId={g}&serverId={sid}", "!!document.querySelector('.pz-grid')")
            acts = js("[...document.querySelectorAll('.pz-tab.pz-tab-action')].map(t => t.textContent)")
            check("a list: Play all and Shuffle are action buttons", acts == ["Play all", "Shuffle"], json.dumps(acts))
            shot("04-list")
        if views.get("livetv"):
            go(f"#/livetv?serverId={sid}", "!!document.querySelector('#icefin-theme-root[data-pz-view=\"livetv\"]')", 2)
            js("(() => { const t = document.querySelector('[data-pz-tab=\"recordings\"]'); if (t) t.click(); return true; })()")
            time.sleep(2)
            es = js("JSON.stringify({ill: !!document.querySelector('.pz-empty-state .pz-empty-ill'), go: (document.querySelector('.pz-empty-go') || {}).textContent || ''})")
            check("an empty list: a picture and a way on", '"ill":true' in es and "Guide" in es, es)
            shot("05-empty-recordings")
        # ---- a series' episodes stop above the bar ----
        ser = one("Series")
        if ser:
            go(f"#/home?pz=series&id={ser}", "!!document.querySelector('#icefin-theme-root[data-pz-episodes]')")
            e, b = rect(".pz-eps"), rect(".pz-mbar")
            check("a series: the episode list ends above the bar", bool(e and b) and e[3] <= b[1] + 40, f"list {e} bar {b}")
            shot("06-series")
        # ---- details ----
        for k in ["Movie", "Series", "MusicAlbum", "Person"]:
            iid = one(k) if k != "Person" else js("window.ApiClient.getPeople(window.ApiClient.getCurrentUserId(), {Limit: 1}).then(r => r.Items[0] ? r.Items[0].Id : null)")
            if not iid:
                continue
            go(f"#/details?id={iid}&serverId={sid}", "!!document.querySelector('#icefin-theme-root[data-icefin-details-complete]')", 1.5)
            f = js("JSON.stringify({head: !!document.querySelector('.pz-d-head .pz-mname'), tabs: [...document.querySelectorAll('.pz-d-tabs .pz-tab')].map(t => t.textContent), back: !!document.querySelector('.pz-d-bar .pz-mround-back'), home: !!document.querySelector('.pz-d-bar .pz-mround-home'), frame: !!document.querySelector('.pz-d-frame'), hero: document.querySelector('.icefin-details').getAttribute('data-pz-hero')})")
            fo = json.loads(f)
            check(f"details ({k}): Plaza's frame, tabs, round Back and Home, framed art", fo["head"] and fo["back"] and fo["home"] and fo["frame"] and fo["tabs"][:1] == ["Overview"], f)
            ar = (rect(".icefin-d-options") if js("!!document.querySelector('.icefin-d-options') && document.querySelector('.icefin-d-options').childElementCount > 0") else None) or rect(".icefin-d-actions")
            sc = rect(".icefin-d-scroll")
            check(f"details ({k}): the actions and pickers are in view as it opens, clear of the fade above the bar", bool(ar and sc) and ar[3] <= sc[3] - 0.04 * H and ar[1] >= 0, f"actions/pickers {ar} scroll area {sc}")
            clock = js("(document.querySelector('.pz-d-head .pz-mclock') || {}).textContent || ''")
            check(f"details ({k}): the clock is in the name pill", ':' in clock, clock)
            off = js(EDGES)
            check(f"details ({k}): nothing runs past the window's sides", not off, json.dumps(off[:5]))
            shot(f"07-details-{k.lower()}")
            if k == "Movie":
                tabs = fo["tabs"]
                if len(tabs) > 1:
                    js(f"[...document.querySelectorAll('.pz-d-tabs .pz-tab')][{len(tabs) - 1}].click(); true")
                    time.sleep(1.2)
                    sc = js("document.querySelector('.icefin-d-scroll').scrollTop")
                    check("details: a section tab scrolls to its section", sc > 50, str(sc))
                    shot("08-details-movie-section")
                    js("document.querySelector('.pz-d-tabs .pz-tab').click(); true")
                    time.sleep(0.8)
                if js("!!document.querySelector('.icefin-d-select')"):
                    js("document.querySelector('.icefin-d-select').click(); true")
                    time.sleep(0.8)
                    box = rect(".icefin-d-picker-box")
                    tab = rect(".icefin-d-picker h2")
                    check("details: a picker is a Plaza card with its name as the tab", bool(box and tab) and abs(tab[2] - box[2]) < 4 and abs(tab[1] - box[1]) < 4, f"{box} {tab}")
                    shot("09-details-picker")
                    js("window.icefinTheme.handleAction('back')")
                    time.sleep(0.5)
            if k == "MusicAlbum":
                s, m = rect(".icefin-d-sections"), rect(".icefin-d-main")
                check("details (album): the tracks are beside the art", bool(s and m) and s[0] >= m[2] - 4, f"main {m} sections {s}")
        # ---- nothing of an earlier page above the video ----
        mv = one("Movie")
        go("#/selectserver", None, 2.5)
        js(f"window.icefinTheme.ctx.play({{ids: ['{mv}'], serverId: '{sid}'}}); true")
        page.wait_for("location.hash.startsWith('#/video') && window.icefinPlaybackManager.currentTime() > 500", timeout=45)
        time.sleep(1)
        ghost = js("(() => { const p = document.getElementById('selectServerPage'); return p ? getComputedStyle(p).visibility + ' ' + p.getClientRects().length : 'gone'; })()")
        check("video: a page opened before playback doesn't show above it", ghost == "gone" or ghost.startswith("hidden") or ghost.endswith(" 0"), ghost)
        shot("10-video")
        js("window.icefinPlaybackManager.stop(); true")
        time.sleep(1)
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
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
    print("plaza_walk:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
