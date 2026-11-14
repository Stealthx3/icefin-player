#!/usr/bin/env python3
"""media_center_pass.py — Media Center's refinement pass (PLAN 9.60), on the host (the user's choice for this pass).

Read-only on the user's server: menus and dialogs open and close, nothing is saved, approved, favourited or played.
  - the item menu (More options on details): a side panel from the right edge (260 ms in, ease-out), the item's name
    at the top, sections, the first action focused; a dialog (media info) swaps its content; Back closes it
    (200 ms out) and the focus is back on More options;
  - ≡ on a library poster opens that item's menu;
  - sort and filter: the panel from the pivot row; ▶ steps the order stepper (the overlay's onAction, #164);
  - a pivot: the grid travels the pivot's way (mc-pivot-in);
  - the caption holds while the D-pad repeats, then shows the focused item;
  - an item into its details: a flier flies, Back brings the focus home to the same poster;
  - a genre list: the library screen with Play all and Shuffle and a title;
  - program info for a Live TV channel (when the server has Live TV);
  - profile (the picture, its buttons) and Quick Connect (six boxes, ▲ steps a digit; nothing approved);
  - Play on: the panel with this device;
  - hints: a pad's action shows them (≡ more on a poster), the mouse hides them;
  - low motion: the panel has no animation.
Usage: python3 media_center_pass.py --host --out ~/rmcp
"""
import argparse, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hostmode  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9266)
    ap.add_argument("--out", required=True)
    hostmode.add_args(ap)
    a = ap.parse_args()
    if not a.host:
        print("media_center_pass: runs on the host (--host); the lab keeps media_center_*.py")
        return 2
    os.makedirs(a.out, exist_ok=True)
    fails = []

    def check(label, ok, detail=""):
        print(f"media_center_pass: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    page, stop = hostmode.start(a, a.out, theme="media-center")
    try:
        js = page.eval
        act = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        api = "window.icefinTheme.ctx.apiClient()"
        first = lambda types, extra="": js(f"new Promise(r => {api}.getItems({api}.getCurrentUserId(), {{IncludeItemTypes: '{types}', Recursive: true, Limit: 1{extra}}}).then(x => r((x.Items || [])[0] || null)))")
        sid = js(f"{api}.serverId()")
        go = lambda h, ready, t=30: (js(f"location.hash = {json.dumps(h)}; true"), page.wait_for(ready, timeout=t), time.sleep(1.2))
        P = "#icefin-theme-overlay .mc-sp-panel"
        panel = lambda: json.loads(js(f"JSON.stringify((() => {{ const p = document.querySelector('{P}'); if (!p) return null; const cs = getComputedStyle(p); const f = p.querySelector('.icefin-focused'); return {{title: (p.querySelector('.mc-sp-title') || {{}}).textContent || '', secs: p.querySelectorAll('.mc-sec').length, rows: p.querySelectorAll('.mc-sp-row').length, focused: f ? (f.textContent || '').trim().slice(0, 40) : '', anim: cs.animationName, ms: cs.animationDuration}}; }})())"))
        gone = lambda: page.wait_for("!document.getElementById('icefin-theme-overlay')", timeout=5)
        movie = first("Movie")
        check("the library has a movie", bool(movie), (movie or {}).get("Name", ""))

        # ---- the item menu ----
        go(f"#/details?id={movie['Id']}&serverId={sid}", "!!document.querySelector('#icefin-theme-root[data-icefin-details-ready]')")
        js("window.icefinTheme.ctx.focus(document.querySelector('#icefin-theme-root .icefin-d-btn[data-action=\"more\"]')); true")
        act("enter")
        page.wait_for(f"!!document.querySelector('{P} .mc-sp-row')", timeout=10)
        time.sleep(0.4)
        m = panel()
        check("More options: the side panel, the item's name at the top, sections, the first action focused",
              m and m["title"] == movie["Name"] and m["secs"] >= 2 and m["focused"] != "", json.dumps(m))
        check("it slides in from the edge (mc-sp-in, 260 ms)", m and m["anim"] == "mc-sp-in" and m["ms"] == "0.26s", f"{m and m['anim']} {m and m['ms']}")
        js(f"[...document.querySelectorAll('{P} .mc-sp-row')].find(r => /media info/i.test(r.textContent)).click(); true")
        time.sleep(0.6)
        d = panel()
        check("a dialog (media info) swaps the panel's content in place", d and d["title"] == "media info" and d["rows"] >= 1
              and js(f"!!document.querySelector('{P} .mc-sp-body.mc-sp-swap')") and js("document.querySelectorAll('#icefin-theme-overlay .mc-sp-panel').length") == 1, json.dumps(d))
        act("back")
        out = js("!!document.querySelector('#icefin-theme-overlay.mc-sp-out')")
        gone()
        check("Back slides it out (mc-sp-out) and the focus is back on More options",
              out and js("(window.icefinTheme.ctx.focused() || {dataset: {}}).dataset.action") == "more", js("(window.icefinTheme.ctx.focused() || {}).textContent"))

        # ---- the library: ≡, sort and filter, a pivot, the caption, the flight ----
        go("#/movies", "!!document.querySelector('#icefin-theme-root[data-mc-ready] .mc-lib-tile')")
        name0 = js("window.icefinTheme.ctx.focused().mcItem.Name")
        act("menu")
        page.wait_for(f"!!document.querySelector('{P} .mc-sp-row')", timeout=10)
        check("≡ on a poster opens that item's menu", (panel() or {}).get("title") == name0, name0)
        act("back")
        gone()
        js("document.querySelector('.mc-lib-sort').click(); true")
        page.wait_for(f"!!document.querySelector('{P} .mc-sp-row')", timeout=10)
        time.sleep(0.4)
        before = js(f"(document.querySelector('{P} .mc-sp-on .mc-li-value') || {{}}).textContent || ''")
        js(f"window.icefinTheme.ctx.focus(document.querySelector('{P} .mc-sp-on')); true")
        act("right")
        after = js(f"(document.querySelector('{P} .mc-sp-on .mc-li-value') || {{}}).textContent || ''")
        check("sort and filter: the panel, and ▶ steps the order stepper", (panel() or {}).get("title") == "sort and filter" and before and after and before != after, f"{before} -> {after}")
        act("back")
        gone()
        js("[...document.querySelectorAll('.mc-lib-pivot .mc-pivot-item')].find(p => p.textContent === 'year').click(); true")
        time.sleep(0.3)
        check("a pivot: the grid travels the pivot's way, a column at a time", js("document.querySelector('.mc-lib-grid').classList.contains('mc-pivot-in')") is True
              and js("getComputedStyle(document.querySelector('.mc-lib-grid')).getPropertyValue('--mc-dir').trim()") == "1")
        time.sleep(1.2)
        js("window.icefinTheme.ctx.focus(document.querySelector('.mc-lib-tile')); true")
        time.sleep(0.6)
        cap0 = js("(document.querySelector('.mc-lib-info-name') || {}).textContent || ''")
        for _ in range(5):
            act("right")
            time.sleep(0.06)
        held = js("(document.querySelector('.mc-lib-info-name') || {}).textContent || ''")
        time.sleep(0.6)
        settled = js("(document.querySelector('.mc-lib-info-name') || {}).textContent || ''")
        focused = js("(() => { const f = window.icefinTheme.ctx.focused(); return f ? (f.mcItem ? f.mcItem.Name : 'not a tile: ' + f.className) : 'nothing'; })()")
        check("the caption holds while the D-pad repeats, then shows the focused item", held == cap0 and settled == focused and settled != cap0, f"{cap0} | {held} | {settled} ({focused})")
        fid = js("(window.icefinTheme.ctx.focused() || {}).mcItem ? window.icefinTheme.ctx.focused().mcItem.Id : ''")
        js("window.__fly = 0; new MutationObserver((l) => { for (const r of l) for (const n of r.addedNodes) if (n.classList && n.classList.contains('mc-flier')) window.__fly++; }).observe(document.body, {childList: true}); true")
        act("enter")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-icefin-details-ready]')", timeout=20)
        time.sleep(1)
        flew = js("window.__fly || 0")
        act("back")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-mc-ready] .mc-lib-tile')", timeout=20)
        time.sleep(1.2)
        check("an item into its details: a flier flies; Back brings the focus home to the same poster", flew >= 1 and js("(window.icefinTheme.ctx.focused() || {}).mcItem ? window.icefinTheme.ctx.focused().mcItem.Id : ''") == fid, f"fliers={flew}")

        # ---- a genre list ----
        genre = js(f"new Promise(r => {api}.getGenres({api}.getCurrentUserId(), {{IncludeItemTypes: 'Movie', Recursive: true, Limit: 1}}).then(x => r((x.Items || [])[0] || null)))")
        if genre:
            go(f"#/list?genreId={genre['Id']}&serverId={sid}", "!!document.querySelector('#icefin-theme-root[data-mc=\"list\"][data-mc-ready]')")
            lst = json.loads(js("JSON.stringify({title: document.querySelector('#icefin-theme-root .mc-title').textContent, buttons: [...document.querySelectorAll('.mc-lib-side .mc-btn')].map(b => b.textContent), tiles: document.querySelectorAll('.mc-lib-tile').length})"))
            check("a genre list: Play all, Shuffle, its name, its items", lst["buttons"][:2] == ["Play all", "Shuffle"] and lst["title"] == genre["Name"].lower() and lst["tiles"] >= 1, json.dumps(lst))

        # ---- program info ----
        chan = js(f"new Promise(r => {api}.getLiveTvChannels({{UserId: {api}.getCurrentUserId(), Limit: 1}}).then(x => r((x.Items || [])[0] || null), () => r(null)))")
        if chan:
            go(f"#/details?id={chan['Id']}&serverId={sid}", "!!document.querySelector('#icefin-theme-root[data-mc=\"programme\"][data-mc-ready]')")
            pi = json.loads(js("JSON.stringify({buttons: [...document.querySelectorAll('.mc-pi-side .mc-btn')].map(b => b.textContent), title: (document.querySelector('.mc-pi-title') || {}).textContent || ''})"))
            check("program info for a channel: Watch now, Back to guide, a title", "Watch now" in pi["buttons"] and "Back to guide" in pi["buttons"] and bool(pi["title"]), json.dumps(pi))
        else:
            print("media_center_pass: skip program info (no Live TV on this server)", flush=True)

        # ---- profile, Quick Connect ----
        go("#/userprofile", "!!document.querySelector('#icefin-theme-root[data-mc=\"you\"][data-mc-ready]')")
        pf = js("[...document.querySelectorAll('.mc-you-side .mc-btn')].map(b => b.textContent)")
        check("profile: the picture and its buttons, the password", bool(js("!!document.querySelector('.mc-you-pic')")) and "Change picture" in pf and "Save password" in pf, json.dumps(pf))
        go("#/quickconnect", "!!document.querySelector('#icefin-theme-root[data-mc=\"you\"][data-mc-ready]')")
        boxes = js("document.querySelectorAll('.mc-qc-box').length")
        if boxes:
            act("up")
            digit = js("document.querySelector('.mc-qc-box').textContent")
            check("Quick Connect: six boxes; ▲ steps the focused digit (nothing approved)", boxes == 6 and digit == "0", f"{boxes} '{digit}'")
        else:
            print("media_center_pass: Quick Connect is off on this server:", js("(document.querySelector('.mc-lib-empty') || {}).textContent"), flush=True)

        # ---- Play on; hints; low motion ----
        go("#/home", "!!document.querySelector('#icefin-theme-root[data-mc=\"start\"]')")
        js("window.icefinMediaCenter.playOn('play'); true")
        page.wait_for(f"!!document.querySelector('{P} .mc-sp-row')", timeout=15)
        po = panel()
        check("Play on: the panel with this device", po and po["title"] == "play on" and po["rows"] >= 1, json.dumps(po))
        act("back")
        gone()
        go("#/movies", "!!document.querySelector('#icefin-theme-root[data-mc-ready] .mc-lib-tile')")
        act("right")
        time.sleep(0.3)
        hints = js("[...document.querySelectorAll('.mc-hints:not([hidden]) .mc-hint')].map(h => h.textContent)")
        js("window.dispatchEvent(new MouseEvent('mousemove', {movementX: 3, movementY: 2})); true")
        time.sleep(0.2)
        check("hints: a pad shows them (≡ more on a poster), the mouse hides them", "≡more" in hints and "Bback" in hints and js("!document.querySelector('.mc-hints') || document.querySelector('.mc-hints').hidden") is True, json.dumps(hints))
        js("window.icefinTheme.ui.motion.cap('low'); true")
        time.sleep(0.3)
        act("menu")
        page.wait_for(f"!!document.querySelector('{P}')", timeout=10)
        check("low motion: the panel has no animation", (panel() or {}).get("anim") == "none", (panel() or {}).get("anim"))
        act("back")
        js("window.icefinTheme.ui.motion.cap('normal'); true")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        stop()
    print("media_center_pass:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
