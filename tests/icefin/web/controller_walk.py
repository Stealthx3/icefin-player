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
    while queue and time.time() < deadline:
        k = queue.pop(0)
        here = screens[k]
        if k.endswith("(dialog)"):
            continue
        js(f"location.hash = {json.dumps(here['hash'])}; true")
        s = settle()
        if screen_key(s) != k:
            tr("could not return to", k, "got", screen_key(s))
            continue
        ensure()
        js("window.labWalk.reset()")
        # the snake: collect what the D-pad reaches
        seen, order = {}, []
        f = focus_now()
        if not f:
            press("down")
            f = focus_now()
        if f:
            seen[f["key"]] = f
            order.append(f)
        horiz = "right"
        for _ in range(4 * 14):
            if time.time() > deadline:
                break
            moved = False
            for _ in range(14):
                press(horiz)
                f2 = focus_now()
                if not f2 or f2["key"] in seen:
                    break
                seen[f2["key"]] = f2
                order.append(f2)
                moved = True
            press("down")
            f2 = focus_now()
            if screen_key(settle(t=1.0)) != k:   # moving changed the screen (a tab row, a guide)
                tr("moving changed the screen")
                break
            if not f2 or (f2["key"] in seen and not moved):
                break
            if f2["key"] not in seen:
                seen[f2["key"]] = f2
                order.append(f2)
            horiz = "left" if horiz == "right" else "right"
        tr("screen", k, "controls reached", len(order))
        here["controls"] = len(order)
        # South on two of each kind of control
        tried = {}
        for c in order:
            if time.time() > deadline:
                break
            if c["field"] or DANGER.search(c["label"]) or "dashboard" in c["href"] or "configurationpage" in c["href"]:
                continue
            if tried.get(c["sig"], 0) >= 2:
                continue
            tried[c["sig"]] = tried.get(c["sig"], 0) + 1
            if not js(f"window.labWalk.jump({json.dumps(c['key'])})"):
                continue
            press("south")
            s2 = settle(prev=k)
            k2 = screen_key(s2)
            if k2 == k:
                continue
            tr("opened", k2, "from", k, "via", c["label"])
            if "dashboard" in s2["route"] or "configurationpage" in s2["route"]:
                js(f"location.hash = {json.dumps(here['hash'])}; true")
                settle()
                continue
            if k2 not in screens:
                screens[k2] = {"hash": s2["hash"], "via": here["via"] + [c["label"] or c["sig"]]}
                queue.append(k2)
                shot(k2)
            if s2["route"].startswith("/video"):
                time.sleep(2)
            press("east")
            s3 = settle(prev=k2)
            if s2["route"].startswith("/video") and screen_key(s3) == k2:   # the first Back shows the controls
                press("east")
                s3 = settle(prev=k2)
            k3 = screen_key(s3)
            if k3 != k:
                back_fails.append(f"{k2} -> {k3} (want {k})")
                tr("back did not return", k2, k3)
                js("window.icefinPlaybackManager && window.icefinPlaybackManager.stop && window.icefinPlaybackManager.stop(); true")
                js(f"location.hash = {json.dumps(here['hash'])}; true")
                settle()
                ensure()
            js("window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying() && window.icefinPlaybackManager.stop(); true")
    routes = [k.split(" ")[0] for k in screens]
    missing = [r for r, rx in REQUIRED if not any(re.search(rx, x) for x in routes)]
    tr("done", len(screens), "screens; missing", missing)
    return {"screens": screens, "back_fails": back_fails, "required_missing": missing, "pad": "steam" if steam else kind,
            "queue_left": len(queue)}
