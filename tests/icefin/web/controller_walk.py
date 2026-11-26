"""controller_walk.py — the "walk" part of controller_run.py (PLAN 7.6): every screen opened with a pad alone.

For stock jellyfin-web and each bundled theme, one app run with one pad family (the families take turns), plus one walk
inside Steam. From Home, breadth first over screens:
  - on a screen, a snake walk with the D-pad (right along a row until focus stops moving, down, left back, down, ...)
    collects the controls the pad reaches;
  - South on up to two controls of each kind (tag and classes) opens what they open; a new screen is recorded with
    the presses that reached it; East must return to the screen it came from;
  - never South on anything destructive (sign out, delete, remove, mark played, favourite, restart, ...) or into the
    server dashboard, and no text entry (a field opens the on-screen keyboard: reaching it is enough).
Screens are told apart by their route (#/path and the parameters that aren't ids), and a details page by its item type.
Required on every walk: Home, a library, details, search, the preferences menu and video playback.
"""
import json, os, re, time

import vpads

WALK_JS = r"""
(() => {
  if (window.labWalk) return true;
  const eng = () => window.icefinTheme && window.icefinTheme._engine;
  const shown = (e) => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const reg = new Map();
  const STATE = /(^|-)(focus|focused|hover|active|selected|current|show|open|opened|ready|visible|hidden|lazy|loaded|animated?)(-|$)/i;
  window.labWalk = {
    cur() {
      const g = eng();
      let e = g && g.hasScreen() ? g.focused() : null;
      if (!e) e = document.activeElement;
      if (!e || e === document.body || e === document.documentElement || !shown(e)) return null;
      return e;
    },
    key(e) {
      const path = [];
      for (let n = e; n && n !== document.body && path.length < 7; n = n.parentElement) {
        let i = 0, s = n; while ((s = s.previousElementSibling)) i++;
        path.unshift(n.tagName.toLowerCase() + ':' + i);
      }
      return path.join('>') + '|' + (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    },
    sig(e) {
      const cls = (n) => [...(n && n.classList || [])].filter((c) => !STATE.test(c)).sort().join('.');
      return e.tagName.toLowerCase() + '.' + cls(e) + '<' + cls(e.parentElement);
    },
    now() {
      const e = this.cur();
      if (!e) return null;
      const k = this.key(e);
      reg.set(k, e);
      const label = (e.getAttribute('aria-label') || e.title || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      return { key: k, sig: this.sig(e), label, field: e.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable=true]'),
               href: e.getAttribute('href') || '' };
    },
    jump(k) {
      const e = reg.get(k);
      if (!e || !e.isConnected || !shown(e)) return false;
      const g = eng();
      if (g && g.hasScreen() && g.root() && g.root().contains(e)) g.focus(e); else e.focus({ preventScroll: false });
      return this.cur() === e;
    },
    screen() {
      const h = location.hash || '#/home';
      const [path, q] = h.slice(1).split('?');
      const keep = [...new URLSearchParams(q || '').entries()]
        .filter(([k, v]) => v && !/^[0-9a-f]{32}$/i.test(v) && !/^[0-9a-f-]{36}$/i.test(v) && !/^\d+$/.test(v) && !/id$/i.test(k) && k !== 'serverId' && v.length < 30)
        .map(([k, v]) => k + '=' + v).sort();
      const dlg = [...document.querySelectorAll('.dialogContainer .dialog, [role=dialog], #icefin-theme-overlay .icefin-overlay-open')].some(shown);
      return { route: path + (keep.length ? '?' + keep.join('&') : ''), hash: h, dialog: dlg,
               item: (new URLSearchParams(q || '').get('id')) || '' };
    },
    reset() { reg.clear(); return true; }
  };
  return true;
})()
"""

DANGER = re.compile(r"sign ?out|log ?out|delete|remove|erase|clear|forget|reset|restart|shut ?down|uninstall|disconnect|"
                    r"mark (as )?(un)?played|mark (as )?(un)?watched|favou?rite|like|dislike|rating|cancel|record|rename|"
                    r"edit (metadata|images|subtitles)|identify|refresh metadata|switch user|change server|select server|"
                    r"add server|quick connect|password|pin|download|sync|delete", re.I)
REQUIRED = [("Home", r"^/home$"), ("a library", r"^/(movies|tv|music|list|livetv|books|photos|musicvideos|homevideos)"),
            ("details", r"^/details"), ("search", r"^/search"), ("the preferences menu", r"^/mypreferencesmenu"),
            ("video playback", r"^/video")]
WAYBACK = re.compile(r"^\s*(‹\s*)?(back|home|go back)\s*$", re.I)
FAMILIES = ["xbox", "dualsense", "switchpro", "8bitdo"]


def run(a, start, stop, plug, check, report, save, base_env):
    page = start("walk-list", base_env)
    themes = ["stock"] + [t["id"] for t in page.eval("new Promise(r => window.api.theme.themes(r))")
                          if t.get("ok") and t.get("source") == "bundled"]
    stop()
    if a.themes:
        themes = [t for t in themes if t in a.themes.split(",")]
    walks = [(th, FAMILIES[i % len(FAMILIES)], False) for i, th in enumerate(themes)]
    if not a.themes or "steam" in a.themes.split(","):
        walks.append(("stock", "dualsense", True))   # inside Steam: the virtual pad drives, the DualSense behind it
    for theme, kind, steam in walks:
        name = f"{theme}-{'steam' if steam else kind}"
        env = dict(base_env, SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD="1", SDL_GAMECONTROLLER_IGNORE_DEVICES="0x054c/0x0ce6") if steam else base_env
        try:
            res = walk(a, start, plug, name, theme, kind, steam, env)
        except Exception as ex:  # noqa: BLE001
            res = {"error": f"{type(ex).__name__}: {ex}"[:300], "screens": {}, "back_fails": [], "required_missing": [r for r, _ in REQUIRED]}
        stop()
        report["walks"][name] = res
        save()
        reached = sorted(res["screens"])
        check(f"walk {name}: every required screen opened with the pad", not res["required_missing"] and not res.get("error"),
              (res.get("error") or "") + f" missing {res['required_missing']}; reached {len(reached)}: {', '.join(reached)[:250]}")
        check(f"walk {name}: Back returns from every screen it opened", not res["back_fails"], "; ".join(res["back_fails"])[:300])


def walk(a, start, plug, name, theme, kind, steam, env):
    out = os.path.join(a.out, name)
    os.makedirs(out, exist_ok=True)
    trace = open(os.path.join(out, "trace.log"), "w")

    def tr(*x):
        trace.write(" ".join(str(i) for i in x) + "\n")
        trace.flush()
    page = start(f"walk-{name}", env)
    js = page.eval
    js(f"new Promise(r => window.api.theme.setActiveTheme({json.dumps('' if theme == 'stock' else theme)}, '', r))")
    time.sleep(3)
    pad = plug(kind)
    if steam:
        pad = plug("steam")
    page.wait_for("new Promise(r => window.api.gamepads.list(l => r(l.length === 1)))", timeout=20)
    js("location.hash = '#/home'; true")
    time.sleep(4)
    deadline = time.time() + a.minutes * 60

    def ensure():
        js(WALK_JS)

    def settle(prev=None, t=6.0):
        """Wait for the screen to stop changing after a press."""
        t0, last, same = time.time(), None, 0
        while time.time() - t0 < t:
            time.sleep(0.35)
            try:
                ensure()
                s = js("JSON.stringify(window.labWalk.screen())")
            except Exception:  # noqa: BLE001 (the page reloaded)
                time.sleep(1)
                page.reconnect()
                continue
            same = same + 1 if s == last else 0
            last = s
            if same >= 2 and (prev is None or time.time() - t0 > 1.2):
                break
        return json.loads(last) if last else {"route": "?", "hash": "", "dialog": False, "item": ""}

    def screen_key(s):
        k = s["route"]
        if k.startswith("/details") and s.get("item"):
            t = js(f"window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), {json.dumps(s['item'])}).then(i => i.Type).catch(() => '')")
            k += f" [{t}]"
        return k + (" (dialog)" if s.get("dialog") else "")

    def press(c):
        tr("press", c)
        vpads.press(pad, c)
        time.sleep(0.3)

    def focus_now():
        ensure()
        return js("window.labWalk.now()")

    screens, back_fails, queue = {}, [], []
    s0 = settle()
    k0 = screen_key(s0)
    screens[k0] = {"hash": s0["hash"], "via": []}
    queue.append(k0)
    shot = lambda k: open(os.path.join(out, re.sub(r"[^a-z0-9]+", "_", k.lower()).strip("_")[:60] + ".png"), "wb").write(
        __import__("base64").b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
    shot(k0)
    root = k0  # the home: reached from a button it's the root, where Back asks to exit (not a way back)
    while queue and time.time() < deadline:
        k = queue.pop(0)
        here = screens[k]
        if k.endswith("(dialog)"):
            continue
        tried, seen, path = {}, {}, []
        overlays_done = set()

        def go_here():
            """Back on this screen with focus where the presses so far left it: open its hash, replay the path."""
            js(f"location.hash = {json.dumps(here['hash'])}; true")
            s = settle()
            if screen_key(s) != k:
                tr("could not return to", k, "got", screen_key(s))
                return False
            for c in path:
                press(c)
            settle(t=1.0)
            return True

        def close_extra(want):
            """Close a dialog or overlay a press opened (East, up to three times) until the screen is `want` again."""
            for _ in range(3):
                press("east")
                s = settle(t=2.0)
                if screen_key(s) == want:
                    return True
            return False

        if not go_here():
            continue
        ensure()

        def visit(f):
            """South on a control (two of each kind), record what opens, come back; True if focus is where it was."""
            if f["field"] or DANGER.search(f["label"]) or "dashboard" in f["href"] or "configurationpage" in f["href"]:
                return True
            if WAYBACK.match(f["label"]):   # an on-screen Back or Home: a way back, not a screen this one opens
                return True
            if tried.get(f["sig"], 0) >= 2:
                return True
            tried[f["sig"]] = tried.get(f["sig"], 0) + 1
            press("south")
            s2 = settle(prev=k)
            k2 = screen_key(s2)
            if k2 == k:
                return True
            tr("opened", k2, "from", k, "via", f["label"])
            if k2 not in screens:
                screens[k2] = {"hash": s2["hash"], "via": here["via"] + [f["label"] or f["sig"]]}
                queue.append(k2)
                shot(k2)
            if "dashboard" in s2["route"] or "configurationpage" in s2["route"]:
                return go_here()
            if k2 == k + " (dialog)":
                # South opened something on this page (a channel's preview, a menu, a prompt): one level into it, South
                # on what it focuses (its Open, unless that's destructive), then Back out until the page is plain again
                f3 = focus_now()
                if f3 and not f3["field"] and not DANGER.search(f3["label"]):
                    press("south")
                    s4 = settle(prev=k2)
                    k4 = screen_key(s4)
                    if k4 not in (k, k2):
                        tr("opened", k4, "from", k2, "via", f3["label"])
                        if k4 not in screens:
                            screens[k4] = {"hash": s4["hash"], "via": here["via"] + [f["label"] or f["sig"], f3["label"] or f3["sig"]]}
                            queue.append(k4)
                            shot(k4)
                        if s4["route"].startswith("/video"):
                            time.sleep(2)
                for _ in range(5):
                    if screen_key(settle(t=1.5)) == k:
                        break
                    press("east")
                js("window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying() && window.icefinPlaybackManager.stop(); true")
                k5 = screen_key(settle(t=2.0))
                if k5 == k:
                    return True
                if k5 == root + " (dialog)" and k == root:
                    close_extra(root)
                else:
                    back_fails.append(f"{k2} … -> {k5} (want {k})")
                    tr("back did not return through", k2, k5)
                return go_here()
            if s2["route"].startswith("/video"):
                time.sleep(2)
            # Back, innermost first: up to three presses (a video's first shows its controls; a themed screen's may
            # leave its tabs or a level first) until the screen changes
            k3 = k2
            for _ in range(3):
                press("east")
                k3 = screen_key(settle(prev=k2))
                if k3 != k2:
                    break
            js("window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying() && window.icefinPlaybackManager.stop(); true")
            if k3 == k:
                return True
            if k2.split(" ")[0] == root and k3 == root + " (dialog)":
                tr("opened the home (the root): Back asks to exit, as it should")   # not a way back; close the ask
                close_extra(root)
            else:
                back_fails.append(f"{k2} -> {k3} (want {k})")
                tr("back did not return", k2, k3)
            js("window.icefinPlaybackManager && window.icefinPlaybackManager.stop && window.icefinPlaybackManager.stop(); true")
            return go_here()

        def explore_overlay(c):
            """An overlay a press opens (Lumen's sidebar): its rows, up and down from where it opens, South on each (not
            the destructive ones); what they open is recorded. A row's screen is a jump, not a child: no Back check."""
            overlays_done.add(k)
            ov = k + " (dialog)"
            rows = []                                  # (presses from where it opens, control)
            for d in ("down", "up"):
                if d == "up":
                    close_extra(k) or go_here()
                    press(c)
                    settle(t=1.0)
                n, keys = 0, {r[1]["key"] for r in rows}
                f0 = focus_now()
                if d == "down" and f0:
                    rows.append(([], f0)); keys.add(f0["key"])
                for _ in range(20):
                    press(d); n += 1
                    f = focus_now()
                    if not f or f["key"] in keys:
                        break
                    keys.add(f["key"]); rows.append(([d] * n, f))
            close_extra(k) or go_here()
            tr("overlay", ov, "rows", len(rows))
            for presses, f in rows[:24]:
                if time.time() > deadline:
                    break
                if f["field"] or DANGER.search(f["label"]) or WAYBACK.match(f["label"]):
                    continue
                press(c)
                if screen_key(settle(t=1.0)) != ov:
                    go_here()
                    continue
                for d in presses:
                    press(d)
                g = focus_now()
                if not g or g["key"] != f["key"]:
                    close_extra(k) or go_here()
                    continue
                press("south")
                s2 = settle(prev=ov)
                k2 = screen_key(s2)
                if k2 not in (k, ov):
                    tr("opened", k2, "from the overlay on", k, "via", f["label"])
                    if k2 not in screens:
                        screens[k2] = {"hash": s2["hash"], "via": here["via"] + [c, f["label"] or f["sig"]]}
                        queue.append(k2)
                        shot(k2)
                    js("window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying() && window.icefinPlaybackManager.stop(); true")
                    go_here()
                elif k2 == ov:
                    close_extra(k) or go_here()

        def step(c):
            """A D-pad press in the snake. Returns the newly reached control, or None (no move, a blocked edge)."""
            before = focus_now()
            press(c)
            s = settle(t=1.0)
            kk = screen_key(s)
            if kk != k:
                if kk.split(" (dialog)")[0] == k:   # an overlay (a sidebar, a menu): reached; try its rows, close it
                    if kk not in screens:
                        screens[kk] = {"hash": s["hash"], "via": here["via"] + [c]}
                        shot(kk)
                    tr("moving opened", kk)
                    if k not in overlays_done:
                        explore_overlay(c)
                    elif not close_extra(k):
                        go_here()
                else:                                # moving changed the page (a tab row): record it, come back
                    tr("moving changed the screen to", kk)
                    if kk not in screens:
                        screens[kk] = {"hash": s["hash"], "via": here["via"] + path + [c]}
                        queue.append(kk)
                        shot(kk)
                    go_here()
                return None
            f2 = focus_now()
            if f2 and (not before or f2["key"] != before["key"]):
                path.append(c)   # every press that moved focus, so go_here() can replay the way back
            if not f2 or f2["key"] in seen:
                return None
            seen[f2["key"]] = f2
            if not visit(f2):
                return None
            return f2

        # the snake: right along a row until focus stops, down, left back, down, ...; South on each new control.
        # First up to the top (a bar over the content: Settings, Search), trying what's on the way.
        f = focus_now()
        if not f:
            press("down")
            path.append("down")
            f = focus_now()
        if f:
            seen[f["key"]] = f
            visit(f)
        for _ in range(6):
            if not step("up"):
                break
        def snake(horiz):
            for _ in range(4 * 14):
                if time.time() > deadline:
                    break
                moved = False
                for _ in range(14):
                    if not step(horiz):
                        break
                    moved = True
                if not step("down") and not moved:
                    break
                horiz = "left" if horiz == "right" else "right"
        snake("right")
        # again from the screen's start, left first: what only a press down from the left reaches (Plaza's Settings
        # at the left of its bar, under the first channels)
        path.clear()
        if time.time() < deadline and go_here():
            snake("left")
        tr("screen", k, "controls reached", len(seen))
        here["controls"] = len(seen)
    routes = [k.split(" ")[0] for k in screens]
    missing = [r for r, rx in REQUIRED if not any(re.search(rx, x) for x in routes)]
    tr("done", len(screens), "screens; missing", missing)
    return {"screens": screens, "back_fails": back_fails, "required_missing": missing, "pad": "steam" if steam else kind,
            "queue_left": len(queue)}
