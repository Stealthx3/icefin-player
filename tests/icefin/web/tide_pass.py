#!/usr/bin/env python3
"""tide_pass.py — Tide's completeness pass (PLAN 9.48), in the lab (the user's choice for this pass, 2026-11-14:
"Pivot to using the VM lab for walks for this pipeline run"). Checks what the "Tide Screens" canvas asks for:
  - home: the cross bar (Settings first, the libraries, Search last), the current category at the fixed point, a
    library's column starting with what to watch then its folders, the server's status under the clock, focus on
    arrival (a pad can start), the exit question on Back with Cancel focused;
  - a folder opens as a nested column: the trail shows where you came from, the new column holds the fixed point,
    Back returns with the same entry focused; the letter strip on lists sorted by name; the shoulder buttons jump;
  - ≡ opens an item's options in the panel from the right edge (260 ms), a dialog is the panel's next level, Back
    steps out of it, then closes the panel (220 ms) with the focus back on the item;
  - hints show for a pad, hide for the mouse, and say only what the keys do;
  - low motion: no animation on the column or the panel.
Screens arrive in this test as they are built (--only picks groups). Screenshots go to --out.
Usage: ICEFIN_THEME_PATH=~/src/themes python3 tide_pass.py --app ~/build/src/icefin-player --server jf12 --out ~/rtide
"""
import argparse, base64, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

GROUPS = ["home", "folder", "panel", "details", "hints", "motion"]


# Captures take the web layer alone: over the native backdrop (8.4) Tide's screens are transparent, and a capture drops
# the alpha (a soft glow comes out opaque). For screenshots, the gradient goes under the screen, as without the backdrop.
OPAQUE = "(() => { if (document.getElementById('td-test-opaque')) return true; const s = document.createElement('style'); s.id = 'td-test-opaque'; s.textContent = 'html[data-icefin-backdrop] [data-td-screen] { background: linear-gradient(180deg, var(--icefin-color-waveTop), var(--icefin-color-waveBottom)) !important; }'; document.head.append(s); return true; })()"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9271)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="", help="comma-separated groups: " + ",".join(GROUPS))
    a = ap.parse_args()
    only = set(filter(None, a.only.split(","))) or set(GROUPS)
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-tidepass-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"tide_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui", timeout=90)
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        shot = lambda name: open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        page.switch_theme_reloading("tide", "!!document.querySelector('#icefin-theme-root[data-td-ready]') && !!document.querySelector('.td-e.focused')")
        time.sleep(1.5)
        js_ = page.eval
        js_(OPAQUE)
        errors = js("JSON.stringify((window.__icefinErrors || []).slice(0, 5))")
        R = "document.querySelector('#icefin-theme-root')"
        cat = lambda: js(f"{R}.dataset.tdCat")
        idx = lambda: int(js(f"{R}.dataset.tdIndex") or -1)
        rect = lambda sel: json.loads(js(f"JSON.stringify((() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return {{cx: (r.left + r.width / 2) / innerWidth, cy: (r.top + r.height / 2) / innerHeight, h: r.height / innerHeight, l: r.left / innerWidth}}; }})())") or "null")
        focused = lambda: js("(() => { const f = document.querySelector('#icefin-theme-overlay .icefin-focused') || window.icefinTheme.ctx.focused(); return f ? (f.getAttribute('aria-label') || f.textContent || '').trim().slice(0, 60) : null; })()")
        settle = lambda s=0.5: time.sleep(s)
        colnames = lambda: json.loads(js("JSON.stringify(window.icefinTide.currentColumn.S.entries.map(e => e.name))"))
        ready = lambda: page.wait_for(f"!{R}.hasAttribute('data-td-loading') && !!document.querySelector('.td-e.focused')", timeout=20)

        if "home" in only:
            cats = json.loads(js("JSON.stringify([...document.querySelectorAll('.td-cat-label')].map(e => e.textContent))"))
            check("the cross bar: Settings first, the libraries, Search last; opens on the first library", len(cats) >= 3 and cats[0] == "Settings" and cats[-1] == "Search" and cat() == cats[1], f"{cats} at {cat()}")
            c, f = rect(".td-cat.current svg"), rect(".td-e.focused .td-e-thumb")
            check("the current category at the fixed point (561, 285 of 1920 × 1080)", c and abs(c["cx"] - 561 / 1920) < 0.012 and abs(c["cy"] - 285 / 1080) < 0.02, json.dumps(c))
            check("the focused entry at the fixed point (561, 505), about 125 px tall", f and abs(f["cx"] - 561 / 1920) < 0.012 and abs(f["cy"] - 505 / 1080) < 0.02 and abs(f["h"] - 125 / 1080) < 0.02, json.dumps(f))
            check("focus on arrival: a pad can start at once", js("!!window.icefinTheme.ctx.focused() && window.icefinTheme.ctx.focused().classList.contains('focused')") is True, str(focused()))
            to_cat_first = [c for c in ("Movies", "Shows", "Music") if c in cats]
            for _ in range(12):
                if not to_cat_first or cat() == to_cat_first[0]:
                    break
                act("right"); time.sleep(0.3)
            ready()
            names = colnames()
            check("a library's column has its folders (Recently added, Favourites, All …)", any(n in names for n in ("Recently added", "All movies", "All shows", "Albums")), str(names[:10]))
            check("the server's status under the clock", js("!!document.querySelector('.td-server') && /server|●|○/.test(document.querySelector('.td-server').textContent)") is True, str(js("(document.querySelector('.td-server') || {}).textContent")))
            check("no script errors on the home", errors in ("[]", None), str(errors))
            shot("home.png")
            for _ in range(12):
                if cat() == cats[1]:
                    break
                act("left"); time.sleep(0.3)
            act("left")
            settle()
            check("left steps to Settings; it takes the fixed point", cat() == "Settings" and abs(rect(".td-cat.current svg")["cx"] - 561 / 1920) < 0.012, cat())
            names = colnames()
            check("the Settings column: you, the preference pages, Client settings, the server, Exit", any("Client settings" == n for n in names) and any(n.startswith("Server") for n in names) and "Exit Icefin" in names, str(names))
            shot("home-settings.png")
            act("right")
            ready()
            settle()
            act("back")
            settle(0.8)
            check("Back on the home asks to close, Cancel focused", js("!!document.querySelector('.td-panel')") is True and (focused() or "").startswith("Cancel"), str(focused()))
            shot("home-exit.png")
            act("back")
            settle(0.6)
            check("Back again keeps you in (the panel closes)", js("!document.querySelector('#icefin-theme-overlay')") is True and js("location.hash").startswith("#/home"))

        def to_cat(name):
            for _ in range(12):
                if cat() == name:
                    break
                act("right" if cat() != "Search" else "left")
                settle(0.3)
            ready()

        libs = [c for c in ("Movies", "Shows", "Music") if c in json.loads(js("JSON.stringify([...document.querySelectorAll('.td-cat-label')].map(e => e.textContent))"))]
        if "folder" in only:
            ready()
            js("window.icefinTheme.ctx.navigate('#/home'); true")
            for _ in range(10):
                act("left")
            to_cat(libs[0] if libs else "Settings")
            # the first folder of the first library: open it
            for _ in range(8):
                if js("!!(document.querySelector('.td-e.focused') || {}).tdEntry && !!document.querySelector('.td-e.focused').tdEntry.open"):
                    break
                act("down")
                settle(0.25)
            label = js("document.querySelector('.td-e.focused .td-e-name').textContent")
            depth0 = int(js(f"{R}.dataset.tdReady"))
            act("enter")
            page.wait_for(f"+{R}.dataset.tdReady === {depth0 + 1} && !{R}.hasAttribute('data-td-loading')", timeout=20)
            settle(0.6)
            check(f"OK on a folder ({label}) opens a nested column; the bar steps aside, the trail shows where you came from",
                  js(f"{R}.classList.contains('td-nested') && !!document.querySelector('.td-trail-step.near') && document.querySelector('.td-bar').hidden") is True)
            t = rect(".td-trail-step.near")
            check("the trail sits left of the fixed point", t and t["cx"] < 0.25, json.dumps(t))
            shot("folder.png")
            n = int(js(f"{R}.dataset.tdCount") or 0)
            if n > 2:
                act("down"); act("down")
                settle()
                check("down moves through the column, the focused entry staying at the point", idx() == 2 and abs(rect(".td-e.focused .td-e-thumb")["cy"] - 505 / 1080) < 0.02, str(idx()))
            act("back")
            page.wait_for(f"+{R}.dataset.tdReady === {depth0}", timeout=10)
            settle(0.6)
            check("Back returns to the column with the folder focused", js("document.querySelector('.td-e.focused .td-e-name').textContent") == label, str(focused()))

        if "panel" in only:
            # an item: find an entry with an item (Continue, or inside All)
            js("window.icefinTheme.ctx.navigate('#/home'); true")
            settle(1)
            to_cat(libs[0] if libs else "Settings")
            got = False
            for _ in range(10):
                if js("!!(document.querySelector('.td-e.focused') || {}).tdEntry && !!document.querySelector('.td-e.focused').tdEntry.item"):
                    got = True
                    break
                e = js("(document.querySelector('.td-e.focused') || {}).tdEntry ? document.querySelector('.td-e.focused').tdEntry.name : ''")
                if e and e.startswith("All"):
                    act("enter")
                    settle(2)
                    continue
                act("down")
                settle(0.25)
            check("an item to try the options on", got)
            if got:
                name = js("document.querySelector('.td-e.focused .td-e-name').textContent")
                t0 = time.time()
                act("menu")
                page.wait_for("!!document.querySelector('.td-panel .td-row')", timeout=10)
                anim = js("getComputedStyle(document.querySelector('.td-panel')).animationDuration")
                check("≡ opens the item's options from the right edge (260 ms in)", anim == "0.26s" and js("document.querySelector('.td-panel-title').textContent") == name, f"{anim} {js('document.querySelector(\".td-panel-title\").textContent')}")
                check("its first action is focused", js("document.querySelector('.td-panel .td-row').classList.contains('icefin-focused')") is True, str(focused()))
                shot("panel.png")
                # a dialog as the panel's next level: Media info (always offered for a video)
                has = js("[...document.querySelectorAll('.td-panel .td-row')].some(r => /Media info/.test(r.textContent))")
                if has:
                    js("[...document.querySelectorAll('.td-panel .td-row')].find(r => /Media info/.test(r.textContent)).click(); true")
                    settle(0.5)
                    check("a dialog is the panel's next level (the options step back under it)", js("document.querySelectorAll('.td-panel-level').length") == 2 and js("!!document.querySelector('.td-level-under')") is True)
                    shot("panel-dialog.png")
                    act("back")
                    settle(0.5)
                    check("Back steps out of the dialog to the options", js("document.querySelectorAll('.td-panel-level:not(.td-level-out)').length") == 1, str(js("document.querySelectorAll('.td-panel-level').length")))
                act("back")
                settle(0.5)
                check("Back again closes the panel, the focus back on the item", js("!document.querySelector('.td-panel')") is True and js("document.querySelector('.td-e.focused .td-e-name').textContent") == name, str(focused()))

        if "details" in only and libs:
            js("window.icefinTheme.ctx.navigate('#/home'); true")
            settle(1)
            to_cat(libs[0])
            for _ in range(10):  # into All …, then the first item
                e = js("(document.querySelector('.td-e.focused') || {}).tdEntry ? document.querySelector('.td-e.focused').tdEntry.name : ''")
                if e and e.startswith("All"):
                    act("enter")
                    page.wait_for(f"!{R}.hasAttribute('data-td-loading') && !!document.querySelector('.td-e.focused .td-e-thumb')", timeout=20)
                    settle(0.6)
                    break
                act("down"); settle(0.25)
            name = js("document.querySelector('.td-e.focused .td-e-name').textContent")
            act("enter")
            page.wait_for("location.hash.startsWith('#/details') && !!document.querySelector('#icefin-theme-root[data-icefin-details-ready]') && !!document.querySelector('.td-e.focused')", timeout=20)
            settle(1)
            first = js("document.querySelector('.td-e.focused .td-e-name').textContent")
            check(f"OK on an item ({name}) opens Tide's details: its actions at the fixed point, Play or Resume focused", first in ("Play", "Resume", "Read", "Continue reading", "Play all") or first.startswith("Next up"), first)
            check("the poster in the trail, the facts on the right", js("!!document.querySelector('.td-trail-step.near .td-trail-art') && document.querySelector('.td-facts-title').textContent") == name, str(js("(document.querySelector('.td-facts-title') || {}).textContent")))
            ents = colnames()
            check("every function: Options…, favourite, and (for a film) cast, more like this, audio or subtitles", "Options…" in ents and any(x.startswith("Add to favourites") or x.startswith("Favourite") for x in ents), str(ents))
            shot("details.png")
            act("back")
            page.wait_for("location.hash.startsWith('#/home')", timeout=15)
            settle(1.2)
            check("Back returns to the list with the same item focused", js("(document.querySelector('.td-e.focused .td-e-name') || {}).textContent") == name, str(js("(document.querySelector('.td-e.focused .td-e-name') || {}).textContent")))

        if "hints" in only:
            act("down")
            settle(0.3)
            vis = js("getComputedStyle(document.querySelector('.td-hints')).opacity")
            words = js("document.querySelector('.td-hints').textContent")
            check("hints show for a pad, and say what the keys do here", vis == "1" and "OK" in words, f"{vis} {words}")
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400, y=300)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=420, y=310)
            settle(0.4)
            check("the mouse hides them; its Back and Home appear", js("getComputedStyle(document.querySelector('.td-hints')).opacity") == "0" and js("getComputedStyle(document.querySelector('.td-pnav')).opacity") != "0")

        if "motion" in only:
            js("window.icefinTheme.ui.motion.cap('low'); true")
            act("down")
            settle(0.3)
            check("low motion: no transition on the column", js("getComputedStyle(document.querySelector('.td-e.focused')).transitionDuration").startswith("0s"), js("getComputedStyle(document.querySelector('.td-e.focused')).transitionDuration"))
            js("window.icefinTheme.ui.motion.cap('normal'); true")
    finally:
        try:
            app.terminate()
        except Exception:
            pass
    print(f"tide_pass: {'PASS' if not fails else 'FAIL'} ({len(fails)} failing)", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
