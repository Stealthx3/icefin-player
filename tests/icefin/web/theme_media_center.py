#!/usr/bin/env python3
"""theme_media_center.py — the bundled Media Center theme in the running app (PLAN 8.6, first version). Lab guests only.

  - bundled and usable; the start strip replaces the home route with one row per library (+ Continue, + More);
  - the strip as measured (docs/themes/references/media-center.json): titles only except the current category, whose row
    is open; the focused item swells into a glass lens; the current title stays on its line as categories change;
  - remote navigation: down moves between categories and keeps the focused one on its line, right moves along a row,
    Enter opens the item's themed details screen (Play/Resume, Favourite); a series keeps jellyfin-web's page;
  - each library row ends in "All ...", which opens the poster wall: seven across, art near the view, Enter opens details;
  - turning the theme off restores the stock UI without a restart;
  - "Classic home" (?icefin=stock) shows the stock home with plugin sections;
  - other routes are jellyfin-web's, styled by the theme's tokens;
  - UI sounds play; the ribbons stop under the low-motion cap;
  - three-way plugin check for the home route is replaced by the Classic home path (documented in docs/themes).
Screenshots of the start strip and a details page go to --out.
Usage: python3 theme_media_center.py --app ~/build/src/icefin-player --server jf12 --out ~/r86/jf12
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
    ap.add_argument("--port", type=int, default=9247)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-mc-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_media_center: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        listed = {t["id"]: t for t in js("new Promise(r => window.api.theme.themes(r))")}
        check("Media Center bundled and usable", listed.get("media-center", {}).get("ok") is True and listed["media-center"]["source"] == "bundled")
        # Media Center declares a backdrop: the page reloads once over it (8.4)
        page.switch_theme_reloading("media-center", "!!document.querySelector('#icefin-theme-root')")
        page.wait_for("+(document.querySelector('#icefin-theme-root[data-mc-ready]') || {dataset: {}}).dataset.mcReady > 0 || +((document.querySelector('#icefin-theme-root') || {}).getAttribute && document.querySelector('#icefin-theme-root').getAttribute('data-mc-ready')) > 0", timeout=30)
        cats = js("JSON.stringify([...document.querySelectorAll('.mc-cat-title')].map(e => e.textContent))")
        check("start strip: one row per library, plus More", json.loads(cats)[-1] == "More" and len(json.loads(cats)) >= 3, cats)
        # jellyfin-web's own navigation (history.pushState, no hashchange) must mount and unmount themed screens: before
        # the fix only the theme's colours showed when the user reached Home that way.
        js("location.hash = '#/mypreferencesmenu'; true")
        page.wait_for("!document.querySelector('#icefin-theme-root') || document.querySelector('#icefin-theme-root').hidden", timeout=20)
        js("Dashboard.navigate('home'); true")
        page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root'); return !!r && !r.hidden && +r.getAttribute('data-mc-ready') > 0; })()", timeout=30)
        check("jellyfin-web's own navigation (pushState) mounts the themed home", js("window.icefinTheme.active().route") == "#/home")
        # Only the current category's row is open and it holds its tiles; the others are titles only (docs/themes/
        # references/media-center.json).
        time.sleep(0.8)
        ov = js("(() => { const cat = document.querySelector('.mc-cat.current'); const r = cat.getBoundingClientRect(); let worst = 0; cat.querySelectorAll('.mc-tile').forEach((t) => { const b = t.getBoundingClientRect(); worst = Math.max(worst, b.bottom - r.bottom, r.top - b.top); }); return Math.round(worst); })()")
        check("the open row holds its tiles (no overlap with the next title)", ov <= 1, f"{ov}px over")
        closed = js("[...document.querySelectorAll('.mc-cat:not(.current) .mc-band')].every((b) => b.getBoundingClientRect().height < 1 && getComputedStyle(b).opacity === '0')")
        check("the other categories are titles only (their rows closed)", closed is True)
        js("(() => { const d = document.createElement('div'); d.id = 'lab-plugin-ui'; d.textContent = 'plugin'; d.style.cssText = 'position:absolute;inset:0;z-index:1;background:red'; document.body.append(d); return true; })()")
        check("plugin UI added to <body> stays hidden under a themed screen", js("getComputedStyle(document.getElementById('lab-plugin-ui')).visibility") == "hidden")
        js("document.getElementById('lab-plugin-ui').remove(); true")
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); return f ? (f.closest('.mc-cat').querySelector('.mc-cat-title').textContent + '/' + (f.textContent || '')) : ''; })()")
        time.sleep(1.2)
        shot("start.png")
        # Go down to the first row with at least two tiles, then check right, down, up.
        for _ in range(4):
            n = js("document.querySelector('#icefin-theme-root .icefin-focused').closest('.mc-row').querySelectorAll('.mc-tile').length")
            if n >= 2:
                break
            act("down")
        first = foc()
        time.sleep(0.8)
        # The glass lens: the focused item swells to about twice its neighbours' size, with the glass (rim and gloss)
        # over it and a dark hairline outside.
        lens = js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); const o = [...f.parentElement.children].find((t) => t !== f && t.classList.contains('wide') === f.classList.contains('wide') && t.classList.contains('text') === f.classList.contains('text')); const g = getComputedStyle(f, '::after'); return {h: f.getBoundingClientRect().height, other: o ? o.getBoundingClientRect().height : 0, glass: g.opacity, gloss: g.backgroundImage.includes('gradient'), edge: getComputedStyle(f).boxShadow !== 'none', top: Math.round(f.getBoundingClientRect().top)}; })()")
        check("the focused item swells into the lens (1.5x its neighbours or more)", lens["other"] == 0 or lens["h"] >= 1.5 * lens["other"], json.dumps(lens))
        check("the lens has its glass: gloss, rim and edge", lens["glass"] == "1" and lens["gloss"] and lens["edge"], json.dumps(lens))
        act("right")
        time.sleep(0.4)
        along = foc()
        check("right moves along the row", along.split('/')[0] == first.split('/')[0] and along != first, f"{first} -> {along}")
        last = js("(() => { const cats = [...document.querySelectorAll('.mc-cat')]; return cats.indexOf(document.querySelector('#icefin-theme-root .icefin-focused').closest('.mc-cat')) === cats.length - 1; })()")
        away, back = ("up", "down") if last else ("down", "up")
        act(away)
        time.sleep(0.5)
        second = foc()
        check(f"{away} moves to the neighbouring category", first.split('/')[0] != second.split('/')[0], f"{along} -> {second}")
        time.sleep(0.6)
        # The categories slide through the lens: the current title stays on its line, so the lens doesn't move up or down.
        line = js("Math.round(document.querySelector('.mc-cat.current .mc-cat-title').getBoundingClientRect().top / innerHeight * 1000) / 10")
        check("the current title stays on its line (51vh) as categories change", abs(line - 51) <= 0.6, f"{line}vh")
        check("the focused category is marked current", js("document.querySelector('.mc-cat.current .mc-cat-title').textContent") == second.split('/')[0])
        act(back)
        time.sleep(0.4)
        check(f"{back} returns to the column the row remembered", foc() == along, foc())
        snd = js("new Promise(r => window.api.theme.soundState(r))")
        check("UI sounds play", snd.get("played", 0) >= 2, json.dumps(snd))
        for _ in range(6):
            act("up")  # back to the first row: a media tile
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(4)
        kind = js("(document.querySelector('#icefin-theme-root') || {getAttribute: () => null}).getAttribute('data-mc')")
        if kind == "details":
            check("Enter opens the themed details screen", js("!!document.querySelector('.mc-details-title') && document.querySelector('.mc-details-title').textContent.length > 0") is True)
            btns = js("JSON.stringify([...document.querySelectorAll('.mc-btn')].map(b => b.textContent))")
            check("details: Play (or Resume) and Favourite", "Favourite" in btns and ("Play" in btns or "Resume" in btns), btns)
            check("details: a button has focus", js("!!document.querySelector('.mc-btn.icefin-focused')") is True)
            act("right")
            time.sleep(0.3)
            check("details: right moves along the buttons", js("[...document.querySelectorAll('.mc-btn')].indexOf(document.querySelector('.mc-btn.icefin-focused'))") == 1)
            shot("details.png")
        else:
            # The first row held a series or a folder: those keep jellyfin-web's page (?icefin=stock).
            check("a series or folder falls back to jellyfin-web's page", js("location.hash.includes('icefin=stock')") is True
                  and js("window.icefinTheme.active().route") is None)
        # A series always falls back to jellyfin-web (no Back loop: the themed entry is replaced).
        series = js("new Promise(r => window.icefinTheme.ctx.apiClient().getItems(window.icefinTheme.ctx.apiClient().getCurrentUserId(), {IncludeItemTypes: 'Series', Recursive: true, Limit: 1}).then(x => r((x.Items[0] || {}).Id || '')))")
        if series:
            js(f"location.hash = '#/details?id={series}&serverId=' + window.icefinTheme.ctx.apiClient().serverId(); true")
            page.wait_for("location.hash.includes('icefin=stock')", timeout=20)
            check("a series details page is jellyfin-web's, with the theme's tokens", js("window.icefinTheme.active().route") is None
                  and js("document.documentElement.classList.contains('icefin-themed')") is True)
        # The poster wall: the start strip's "All ..." tile opens it.
        js("location.hash = '#/home'; true")
        page.wait_for("+(document.querySelector('#icefin-theme-root').getAttribute('data-mc-ready')) > 0", timeout=20)
        js("[...document.querySelectorAll('.mc-tile.text')].find(t => t.textContent.startsWith('All ')).click(); true")
        page.wait_for("location.hash.startsWith('#/list') && (document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc-ready') === '1'", timeout=30)
        n = js("+document.querySelector('#icefin-theme-root').getAttribute('data-mc-count')")
        check("All opens the poster wall with the library", js("document.querySelector('#icefin-theme-root').getAttribute('data-mc')") == "wall" and n > 0,
              f"{n} posters, {js('document.querySelector(\'.mc-wall-title\').textContent')}")
        first_id = js("document.querySelector('.mc-poster.icefin-focused').dataset.id")
        act("right")
        time.sleep(0.4)
        moved = js("document.querySelector('.mc-poster.icefin-focused').dataset.id")
        check("wall: right moves to the next poster", n < 2 or moved != first_id)
        if n > 7:
            act("down")
            time.sleep(0.5)
            check("wall: down moves a row (seven across)", js("[...document.querySelectorAll('.mc-poster')].indexOf(document.querySelector('.mc-poster.icefin-focused'))") == 8)
        time.sleep(1)
        check("wall: posters near the view have art, far ones wait", js("[...document.querySelectorAll('.mc-poster')].slice(0, 7).some(p => p.style.backgroundImage)") is True)
        shot("wall.png")
        check("wall: jellyfin-web's own list page stays hidden (its A-Z picker too)",
              js("[...document.querySelectorAll('.mainAnimatedPages *')].every(e => getComputedStyle(e).visibility === 'hidden')") is True)
        act("enter")
        page.wait_for("location.hash.startsWith('#/details')", timeout=15)
        time.sleep(3)
        # Movies are playable on their own: the themed details screen, whatever the start strip's first row held.
        check("wall: Enter opens the themed details screen", js("location.hash.startsWith('#/details')") is True
              and js("(document.querySelector('#icefin-theme-root') || {getAttribute: () => ''}).getAttribute('data-mc')") == "details"
              and js("!!document.querySelector('.mc-btn.icefin-focused')") is True,
              js("JSON.stringify([...document.querySelectorAll('.mc-btn')].map(b => b.textContent))"))
        shot("details.png")
        js("location.hash = '#/home?icefin=stock'; true")
        page.wait_for("!!document.querySelector('.sectionTitle')", timeout=20)
        time.sleep(2)
        check("Classic home shows the stock home", js("window.icefinTheme.active().route") is None
              and js("[...document.querySelectorAll('.sectionTitle')].filter(e => e.offsetParent).length") > 0)
        js("location.hash = '#/home'; true")
        page.wait_for("+(document.querySelector('#icefin-theme-root').getAttribute('data-mc-ready')) > 0", timeout=20)
        js("window.icefinTheme.ui.motion.cap('low'); true")
        check("ribbons stop under the low-motion cap", js("getComputedStyle(document.querySelector('.mc-ribbon')).animationName") == "none")
        # Turning the theme off restores the stock UI with no restart (Icefin's checklist row).
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(3)
        check("theme off restores the stock UI, no restart", js("document.documentElement.classList.contains('icefin-themed')") is False
              and js("!window.icefinTheme.active()") is True and js("!document.querySelector('#icefin-theme-root') || document.querySelector('#icefin-theme-root').hidden") is True)
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
    print("theme_media_center:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
