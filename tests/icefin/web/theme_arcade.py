#!/usr/bin/env python3
"""theme_arcade.py — the Arcade benchmark theme in the running app (PLAN 9.16; target Steam Big Picture). Lab guests only.

  - Arcade is a built-in theme, offered in Client Settings → Theme;
  - home: a top bar (Home, each library, Search, quick access, clock), a first shelf led by a large hero capsule, more
    shelves of portrait capsules, and button hints drawn with the engine's glyphs;
  - library (#/list): a grid of capsules, seven wide; a sort dialog and a filter dialog (modal, Back closes) that
    change what the grid shows;
  - quick access: the top bar's button and a long press on View open a panel from the right over any screen, stock
    pages too; its Reduce motion entry caps motion; Back closes it;
  - on-screen keyboard: jellyfin-web's own search field opens it from the remote and types into it;
  - turning the theme off restores the stock UI.
Layout positions and motion timings against reference captures stay with 9.1. Screenshots go to --out.
Usage: python3 theme_arcade.py --app ~/build/src/icefin-player --server jf12 --out ~/r916/jf12
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
    ap.add_argument("--port", type=int, default=9256)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-arcade-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_arcade: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        themes = lambda: {t["id"]: t for t in js("new Promise(r => window.api.theme.themes(r))")}
        setv = lambda key, val: js("new Promise(r => window.api.settings.setValue('theme', %s, %s, () => r(true)))" % (json.dumps(key), json.dumps(val)))

        ar = themes().get("arcade", {})
        check("Arcade offered as a built-in theme, usable", ar.get("ok") is True and ar.get("source") == "bundled", json.dumps(ar)[:160])
        js("new Promise(r => window.api.theme.setActiveTheme('arcade', '', r))")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-ar-ready]')", timeout=40)
        time.sleep(1)
        foc = lambda: js("(() => { const f = document.querySelector('#icefin-theme-root .icefin-focused'); if (!f) return ''; if (f.arcadeItem) { const s = f.closest('.ar-shelf'); return (s ? 'shelf/' + [...document.querySelectorAll('.ar-shelf')].indexOf(s) : 'grid') + '/' + f.arcadeItem.Name; } return 'ui/' + f.textContent; })()")
        tabs = json.loads(js("JSON.stringify([...document.querySelectorAll('.ar-top [data-icefin-focus]')].map(e => e.textContent))"))
        check("top bar: Home, the libraries, Search, quick access", tabs[0] == "Home" and tabs[-2:] == ["Search", "•••"] and len(tabs) >= 4, json.dumps(tabs))
        hero = json.loads(js("JSON.stringify((() => { const h = document.querySelector('.ar-cap.hero'), p = document.querySelector('.ar-shelf:nth-child(2) .ar-cap') || document.querySelectorAll('.ar-cap:not(.hero)')[0]; return {h: h && h.getBoundingClientRect().width / innerWidth, p: p && p.getBoundingClientRect().width / innerWidth, first: !!h && h === document.querySelector('.ar-shelf .ar-cap')}; })())"))
        check("the first shelf leads with a large hero capsule", hero["first"] and hero["h"] > 0.35 and 0.09 < hero["p"] < 0.13, json.dumps(hero))
        check("focus starts on the hero capsule", foc().startswith("shelf/0/"), foc())
        check("button hints drawn with the engine's glyphs", js("document.querySelectorAll('.ar-hints .ar-hint svg').length") == 3)
        shot("home.png")
        n0 = js("document.querySelectorAll('.ar-shelf')[0].querySelectorAll('.ar-cap').length")
        if n0 >= 2:
            act("right")
            check("right moves along the shelf", foc().startswith("shelf/0/") and js("document.querySelectorAll('.ar-shelf')[0].querySelectorAll('.ar-cap')[1].classList.contains('icefin-focused')"), foc())
        if js("document.querySelectorAll('.ar-pill').length") >= 1:
            act("down")
            check("down moves to the feed pills", js("!!document.querySelector('.ar-pill.icefin-focused.current')") is True, foc())
            if js("document.querySelectorAll('.ar-pill').length") >= 2:
                first_card = js("(document.querySelector('.ar-cap.card') || {arcadeItem: {}}).arcadeItem.Id")
                act("right")
                check("a pill chooses its feed", js("document.querySelectorAll('.ar-pill')[1].classList.contains('current')") is True
                      and js("(document.querySelector('.ar-cap.card') || {arcadeItem: {}}).arcadeItem.Id") != first_card)
                act("left")
            act("down")
            check("down from the pills moves to the cards", foc().startswith("shelf/1/"), foc())
            act("up")
            act("up")
            check("up returns to the recent row's capsule", foc().startswith("shelf/0/"), foc())
        act("up")
        check("up from the first shelf reaches the top bar", foc() == "ui/Home", foc())
        # quick access from the top bar
        for _ in range(len(tabs)):
            act("right")
        check("the top bar ends at quick access", foc() == "ui/•••", foc())
        act("enter")
        time.sleep(0.4)
        qa = json.loads(js("JSON.stringify((() => { const p = document.querySelector('#icefin-theme-overlay .ar-qa'); if (!p) return null; const r = p.getBoundingClientRect(); return {right: r.right / innerWidth, w: r.width / innerWidth}; })())"))
        check("quick access slides in on the right", qa is not None and qa["right"] > 0.99 and 0.2 < qa["w"] < 0.32, json.dumps(qa))
        ov = lambda: js("(document.querySelector('#icefin-theme-overlay .icefin-focused') || {}).textContent || ''")
        check("quick access takes focus", ov().startswith("Search"), ov())
        act("down")
        act("enter")
        check("Reduce motion caps motion", js("window.icefinTheme.ui.motion.level()") == "low" and "On" in ov(), ov())
        act("enter")
        act("back")
        check("Back closes quick access", js("!document.getElementById('icefin-theme-overlay')") and js("window.icefinTheme.ui.motion.level()") == "normal")
        # library
        lib = "Movies" if "Movies" in tabs else tabs[1]
        for _ in range(len(tabs)):
            act("left")
        for _ in range(tabs.index(lib)):
            act("right")
        check(f"the top bar reaches {lib}", foc() == f"ui/{lib}", foc())
        act("enter")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-ar=library]') && document.querySelector('#icefin-theme-root').dataset.arCount !== undefined", timeout=30)
        time.sleep(1)
        cnt = int(js("document.querySelector('#icefin-theme-root').dataset.arCount"))
        cols = js("getComputedStyle(document.querySelector('.ar-grid')).gridTemplateColumns.split(' ').length")
        check(f"library ({lib}): a grid of capsules seven wide", cnt >= 1 and cols == 7 and foc().startswith("grid/"), f"count={cnt} cols={cols} {foc()}")
        shot("library.png")
        act("up")
        check("up from the grid reaches Sort", foc().startswith("ui/Sort"), foc())
        act("enter")
        time.sleep(0.3)
        check("Sort opens a modal dialog", js("!!document.querySelector('[data-ar-dialog=sort]')") and foc() == "ui/Name", foc())
        for _ in range(5):
            act("up")
        check("the dialog keeps focus inside it", js("!!document.querySelector('[data-ar-dialog=sort]').querySelector('.icefin-focused')"), foc())
        act("down")
        act("enter")
        page.wait_for("document.querySelector('#icefin-theme-root').dataset.arSort === 'DateCreated'", timeout=10)
        check("choosing a sort reloads the grid in that order", js("!document.querySelector('.ar-dialog-scrim')") and js("document.querySelector('.ar-lib-bar .ar-btn').textContent") == "Sort: Recently added",
              js("document.querySelector('.ar-lib-bar .ar-btn').textContent"))
        time.sleep(0.5)
        act("up")
        act("right")
        act("enter")
        act("enter")
        page.wait_for("document.querySelector('#icefin-theme-root').dataset.arFilters === 'IsUnplayed'", timeout=10)
        check("a filter changes what the grid shows", "Unwatched" in js("document.querySelector('[data-ar-dialog=filter]').textContent")
              and js("document.querySelector('[data-ar-dialog=filter] .ar-opt.on').textContent") == "Unwatched", js("document.querySelector('#icefin-theme-root').dataset.arCount"))
        shot("filter.png")
        act("back")
        check("Back closes the dialog", js("!document.querySelector('.ar-dialog-scrim')") and foc().startswith("ui/Filter (1)"), foc())
        # quick access over a stock page (long press on View)
        js("location.hash = '#/mypreferencesmenu'; true")
        time.sleep(3)
        act("icefin_overlay")
        check("quick access opens over a stock page", js("!!document.querySelector('#icefin-theme-overlay .ar-qa')") and js("window.icefinTheme.active().route") is None)
        act("back")
        # on-screen keyboard on jellyfin-web's own search page
        js("location.hash = '#/search'; true")
        time.sleep(4)
        sinput = "document.querySelector('.searchfields-txtSearch, input[type=search], #searchTextInput')"
        js(f"{sinput} && {sinput}.blur(); window.icefinTheme.handleAction('down'); {sinput} && {sinput}.focus(); true")
        time.sleep(0.4)
        opened = js("!!document.getElementById('icefin-osk')")
        if opened:
            act("enter"); act("right"); act("enter")
        time.sleep(0.5)
        check("the on-screen keyboard opens on the search page and types", opened and js(f"{sinput}.value") == "qw", f"opened={opened} value={js(f'({sinput} || {{}}).value')!r}")
        shot("keyboard.png")
        act("back")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(1.5)
        check("turning the theme off restores the stock UI, keyboard off", js("new Promise(r => window.api.theme.activeTheme(r))") == "" and js("document.documentElement.hasAttribute('data-icefin-theme')") is False
              and js("document.documentElement.hasAttribute('data-icefin-osk-enabled')") is False)
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
    print("theme_arcade:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
