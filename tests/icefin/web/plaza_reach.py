#!/usr/bin/env python3
"""plaza_reach.py — every control on every Plaza screen is reachable with a controller, and shows that it has focus
(the user, 2026-11-12). Lab only.

A virtual Xbox 360 pad (uinput) drives the app through the real path (SDL3 -> GamepadService -> InputComponent ->
inputPlugin.js -> the focus engine; on jellyfin-web's own pages in Plaza's frame, the engine's spatial navigation over
the page and the frame). On each screen:
  - the walk: from the first focus, every focused control is tried in the four directions with the D-pad (the walk
    jumps back to a control it has seen to try its next direction), until nothing new is reached; moving onto a text
    field opens the on-screen keyboard (by design), which counts as reaching the field;
  - reach: every visible control on the screen (buttons, links, fields, switches, anything a pointer can click) is
    reached, or sits inside or around one that is; controls on another page of a paged row don't count;
  - highlight: every control reached looks different on screen with focus than without it (screenshots of its area);
  - the settings hub: every tile shows the pad's focus and the pointer over it;
  - the on-screen keyboard: every key, row by row with the pad.
Writes reach.json (per screen: reached, unreachable, no highlight) and a screenshot per screen to --out.
Needs a build with -DENABLE_SDL2=OFF -DICEFIN_SDL3=ON, /dev/uinput writable and python3-evdev. Waits while another
test's pad is plugged in (the app would take its presses); ICEFIN_LAB_DISPLAY=:97 keeps it off the shared display.
Usage: ICEFIN_LAB_DISPLAY=:97 python3 plaza_reach.py --app ~/build-sdl3/src/icefin-player --server jf12 --out ~/rreach [--only home,settings-hub]
"""
import argparse, base64, json, os, re, signal, sys, tempfile, time

try:
    from evdev import UInput, AbsInfo, ecodes as e
except ImportError:  # the host (--host): no virtual pad there, presses go through the engine's actions
    UInput = AbsInfo = None

    class e:  # noqa: N801 (the evdev names the walk uses, as the actions they stand for)
        BTN_SOUTH, BTN_EAST, BTN_NORTH = "enter", "back", "menu"

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import hostmode  # noqa: E402

CAPS = None if UInput is None else {e.EV_KEY: [e.BTN_SOUTH, e.BTN_EAST, e.BTN_NORTH, e.BTN_WEST, e.BTN_TL, e.BTN_TR, e.BTN_SELECT, e.BTN_START,
                   e.BTN_MODE, e.BTN_THUMBL, e.BTN_THUMBR],
        e.EV_ABS: [(a, AbsInfo(0, -32768, 32767, 16, 128, 0)) for a in (e.ABS_X, e.ABS_Y, e.ABS_RX, e.ABS_RY)]
                  + [(a, AbsInfo(0, 0, 255, 0, 0, 0)) for a in (e.ABS_Z, e.ABS_RZ)]
                  + [(a, AbsInfo(0, -1, 1, 0, 0, 0)) for a in (e.ABS_HAT0X, e.ABS_HAT0Y)]}
DIRS = None if UInput is None else {"up": (e.ABS_HAT0Y, -1), "down": (e.ABS_HAT0Y, 1), "left": (e.ABS_HAT0X, -1), "right": (e.ABS_HAT0X, 1)}
# --host: an action through the engine first, then jellyfin-web's input layer (as the app's input manager does)
PAD = r"""(a => { if (window.icefinTheme && window.icefinTheme.handleAction(a)) return 'theme'; window.icefinInputManager.handleCommand({enter: 'select'}[a] || a, {}); return 'jellyfin-web'; })"""

# The page's helpers: what counts as a control, a stable key for one, the focused one, and its look.
LIB = r"""
window.__reach = (() => {
  const CTL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=option], [tabindex]:not([tabindex="-1"]), [data-icefin-focus], .pz-tile, .listItem-button, .card a, .cardBox';
  const shown = (el) => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.pointerEvents === 'none') return false;
    for (let p = el; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (+c.opacity === 0 || c.display === 'none') return false; }
    const r = el.getBoundingClientRect(); return r.width >= 4 && r.height >= 4; };
  // the screen's own area: a themed screen's root, else jellyfin-web's visible page and Plaza's frame around it; an open dialog wins
  const dialog = () => [...document.querySelectorAll('.dialogContainer .dialog, .pz-sheet, .pz-card-layer, [role=dialog]')].filter(shown).pop() || null;
  const areas = (under) => { const d = under ? null : dialog(); if (d) return [d];
    const root = document.getElementById('icefin-theme-root'); if (root && shown(root) && root.childElementCount) return [root];
    return [...document.querySelectorAll('.page:not(.hide), #icefin-stock-chrome')].filter((x) => x.getClientRects().length); };
  const pointerish = (el) => getComputedStyle(el).cursor === 'pointer';
  const controls = (under) => { const out = [];
    for (const a of areas(under)) for (const el of a.querySelectorAll('*')) {
      if (!(el.matches(CTL) || pointerish(el))) continue;
      if (el.disabled || el.closest('[aria-hidden="true"], .hide, [hidden]')) continue;
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect(); if (r.right <= 0 || r.left >= innerWidth) continue;  // another page of a paged row
      out.push(el); }
    // keep the outermost of nested controls (a label inside a button is the button)
    return out.filter((el) => !out.some((o) => o !== el && o.contains(el))); };
  // one counter for the whole page: the helpers are injected again after every reset, and old elements keep their keys
  const keyOf = (el) => { if (!el.__rk) { window.__rkn = (window.__rkn || 0) + 1; el.__rk = 'k' + window.__rkn; }
    return el.__rk; };
  const label = (el) => { const t = (el.getAttribute('aria-label') || el.title || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const c = typeof el.className === 'string' ? el.className.split(/\s+/).filter((x) => x && x !== 'icefin-focused' && x !== 'icefin-cs-here' && !/-on$/.test(x)).slice(0, 2).join('.') : '';
    // (a state class is not part of the name either: a tab that is on, pz-tab-on, follows the page's scroll)
    // ids jellyfin-web and Material UI generate per page load (embyselect484, :r6q:, mui-…) are not part of a control's name
    const id = el.id && !/^(embyselect\d+|:r|mui-component-select-.*\d|.*\d{3,})/.test(el.id) ? '#' + el.id : '';
    return `${el.tagName.toLowerCase()}${id}${c ? '.' + c : ''} "${t}"`; };
  const focusedEl = () => { const dl = dialog(); const fd = dl && dl.querySelector('.icefin-focused'); if (fd) return fd;
    const f = document.querySelector('.icefin-focused');
    // a control on a page jellyfin-web has since hidden can keep document focus: that is no focus
    const a = document.activeElement && document.activeElement !== document.body && document.activeElement.getClientRects().length ? document.activeElement : null;
    // a dialog or a jellyfin-web page takes document focus; a themed screen marks its own
    if (a && (!f || !f.contains(a)) && (dialog() ? dialog().contains(a) : !(document.getElementById('icefin-theme-root') || {contains: () => false}).contains(a))) return a;
    return f || a; };
  const PROPS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'transform', 'scale', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'color', 'filter', 'animationName', 'fontWeight', 'textDecorationLine', 'opacity'];
  const look = (el) => { const pick = (cs) => PROPS.map((p) => cs[p]).join('|');
    const parts = [el, el.firstElementChild, el.parentElement].filter(Boolean);
    return parts.map((p) => pick(getComputedStyle(p)) + '/' + pick(getComputedStyle(p, '::before')) + '/' + pick(getComputedStyle(p, '::after'))).join('#')
      + '#ring:' + [...document.querySelectorAll('.pz-ring, .icefin-focus-ring, [data-icefin-ring]')].filter(shown).map((r) => JSON.stringify(r.getBoundingClientRect())).join(); };
  const noTransitions = () => { if (document.getElementById('reach-nt')) return; const s = document.createElement('style'); s.id = 'reach-nt';
    s.textContent = '*, *::before, *::after { transition: none !important; }'; document.head.append(s); };
  // focused vs not: the focused control's look, then the same control with its focus taken away (class and DOM focus)
  const highlight = (el) => { noTransitions(); const on = look(el);
    const had = el.classList.contains('icefin-focused'); const act = document.activeElement === el;
    el.classList.remove('icefin-focused'); if (act) el.blur();
    const off = look(el);
    if (had) el.classList.add('icefin-focused'); if (act) el.focus({preventScroll: true});
    return on !== off; };
  const hoverLook = (el) => look(el);
  // A control's name that survives the screen being drawn again: its label and its place among controls of that label.
  const ident = (el, cons) => { cons = cons || controls();
    const c = cons.find((x) => x === el || x.contains(el) || el.contains(x)) || el;
    const lab = label(c), same = cons.filter((x) => label(x) === lab);
    return lab + '#' + Math.max(0, same.indexOf(c)); };
  return { controls, keyOf, label, focusedEl, highlight, look, hoverLook, shown, areas, dialog, ident,
    snapshot() { const f = focusedEl(); const cons = controls(); return { id: f ? ident(f, cons) : null, ids: cons.map((c) => ident(c, cons)), focus: f ? keyOf(f) : null, label: f ? label(f) : null,
      controls: controls().map((c) => [keyOf(c), label(c)]), hash: location.hash.slice(0, 60), dialog: !!dialog(), what: dialog() ? label(dialog()).slice(0, 60) : '' }; },
    teleport(k) { const el = [...document.querySelectorAll('*')].find((x) => x.__rk === k); if (!el || !el.isConnected) return false;
      const root = document.getElementById('icefin-theme-root');
      if (el.matches('[data-icefin-focus]') && window.icefinTheme && window.icefinTheme._engine && root && root.contains(el)) window.icefinTheme._engine.focus(el);
      else el.focus({preventScroll: false});
      return true; },
    covers(k, reached) { const el = [...document.querySelectorAll('*')].find((x) => x.__rk === k); if (!el) return true;
      return reached.some((r) => { const o = [...document.querySelectorAll('*')].find((x) => x.__rk === r); return o && (o === el || o.contains(el) || el.contains(o)); }); }
  };
})(); true
"""


def other_pads():
    """Other gamepads in the guest (another test's virtual pad): the app would take their presses too."""
    try:
        blocks = open("/proc/bus/input/devices").read().split("\n\n")
    except OSError:
        return 0
    return sum(1 for b in blocks if ("X-Box" in b or "Gamepad" in b or "Controller" in b) and "reach-pad" not in b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9333)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--max", type=int, default=90, help="controls tried per screen")
    hostmode.add_args(ap)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    app = xv = ui = stop = None
    if a.host:
        page, stop = hostmode.start(a, a.out)
    else:
        cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
        cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
        srv = Server(cfg)
        srv.wait()
        xv = start_x()
        ui = UInput(CAPS, name="Microsoft X-Box 360 pad reach-pad", vendor=0x045E, product=0x028E, version=0x110, bustype=e.BUS_USB)
        time.sleep(1)
        log = open(os.path.join(a.out, "app.log"), "w")
        app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-reach-"), log, "xcb")
    report, fails = {}, []
    trace = open(os.path.join(a.out, "trace.log"), "w")

    def tr(*x):
        trace.write(" ".join(str(i) for i in x) + "\n"); trace.flush()
    only = set(x for x in a.only.split(",") if x)

    def check(label, ok, detail=""):
        print(f"plaza_reach: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def btn(code, hold=0.08):
        tr("btn", code)
        if a.host:
            page.eval(f"{PAD}({json.dumps(code)})"); time.sleep(0.35 + hold)
            return
        ui.write(e.EV_KEY, code, 1); ui.syn(); time.sleep(hold)
        ui.write(e.EV_KEY, code, 0); ui.syn(); time.sleep(0.35)

    def dpad(d):
        tr("dpad", d)
        if a.host:
            page.eval(f"{PAD}({json.dumps(d)})"); time.sleep(0.37)
            return
        axis, v = DIRS[d]
        ui.write(e.EV_ABS, axis, v); ui.syn(); time.sleep(0.07)
        ui.write(e.EV_ABS, axis, 0); ui.syn(); time.sleep(0.3)

    try:
        if not a.host:
            page = Page(a.port, timeout=90)
        js = page.eval

        def shot(name):
            open(os.path.join(a.out, f"{name}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

        if not a.host:
            page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
            js(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(5)
            page.reconnect()
            page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
            js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
            time.sleep(3)

        def lib():
            js(LIB)

        actions = []

        def hook():
            js("(() => { if (window.__reachHooked) return true; window.__reachHooked = true; window.__reachActions = [];"
               " window.icefinTheme._engine.addActionHook((a) => { window.__reachActions.push(a); return false; }); return true; })()")

        FIND = "[...document.querySelectorAll('*')].find(x => x.__rk === %s)"

        def area(k):
            """The control's box (a switch's label), with a margin for a glow, inside the window; None when it is gone."""
            r = js(f"(() => {{ const el = {FIND % json.dumps(k)}; if (!el || !el.isConnected) return null; const b = (el.closest('.MuiFormControl-root, .MuiFormControlLabel-root, .selectContainer, .checkboxContainer, .inputContainer') || (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) || el).getBoundingClientRect();"
                   " const x = Math.max(0, b.left - 24), y = Math.max(0, b.top - 24); return JSON.stringify({x, y, width: Math.min(innerWidth, b.right + 24) - x, height: Math.min(innerHeight, b.bottom + 24) - y}); })()")
            r = json.loads(r) if r else None
            return r if r and r["width"] > 4 and r["height"] > 4 else None

        def grab(r):
            return page.send("Page.captureScreenshot", format="png", clip=dict(r, scale=1))["data"]

        def visual_highlight(k, again=True):
            """True when the focused control looks different on screen than without focus; None when it can't be told.
            A control that looks the same both ways gets a second look half a second later before it counts (on the host's
            real library a cell's picture may still be arriving, or the grid drew the cell again under the walk)."""
            js("window.__reach.look(document.body) && (() => { if (!document.getElementById('reach-nt')) { const s = document.createElement('style'); s.id = 'reach-nt';"
               " s.textContent = '*, *::before, *::after { transition: none !important; }'; document.head.append(s); } return true; })()")
            r, last, still = None, None, 0
            # on jellyfin-web's framed pages the pad's move centres the control (the engine's scrollIntoView); do the same,
            # at once, so the picture is of the control and not of the page halfway through its smooth scroll
            js(f"(() => {{ if (!document.documentElement.hasAttribute('data-icefin-stock')) return true; const el = {FIND % json.dumps(k)}; if (!el) return true; const b = el.closest('.MuiFormControl-root, .MuiFormControlLabel-root, .selectContainer, .checkboxContainer, .inputContainer') || el; b.scrollIntoView({{block: 'center', behavior: 'instant'}}); return true; }})()")
            time.sleep(0.3)  # a smooth scroll to the control may not have started yet
            for _ in range(30):  # then wait until it stands still (three reads alike)
                r = area(k)
                still = still + 1 if r == last else 0
                if still >= 2:
                    break
                last = r
                time.sleep(0.1)
            if not r:
                return None
            on = grab(r)
            # the screen may have drawn the control again meanwhile (a home that refreshes its tiles): then no verdict
            if not js(f"(() => {{ const el = {FIND % json.dumps(k)}; if (!el) return false; el.__had = el.classList.contains('icefin-focused'); el.__act = document.activeElement === el; el.classList.remove('icefin-focused'); if (el.__act) el.blur(); return true; }})()"):
                tr("  redrawn before its picture:", k)
                return None
            time.sleep(0.05)
            off = grab(r)
            js(f"(() => {{ const el = {FIND % json.dumps(k)}; if (!el) return true; if (el.__had) el.classList.add('icefin-focused'); if (el.__act) el.focus({{preventScroll: true}}); return true; }})()")
            if on == off and again:
                time.sleep(0.5)
                return visual_highlight(k, again=False)
            if on == off and visual_highlight.saved < 8:
                visual_highlight.saved += 1
                for tag, img in (("on", on), ("off", off)):
                    open(os.path.join(a.out, f"nohl-{visual_highlight.saved}-{tag}.png"), "wb").write(base64.b64decode(img))
                tr("  no highlight saved as", visual_highlight.saved, k)
            return on != off

        visual_highlight.saved = 0

        def same_screen(h, start):
            """The same screen: the same route and item; a query that only remembers a tab or sort is not a new screen."""
            from urllib.parse import parse_qs
            ph, qh = (h.split("?", 1) + [""])[:2]
            ps, qs = (start.split("?", 1) + [""])[:2]
            return ph == ps and parse_qs(qh).get("id") == parse_qs(qs).get("id")

        OPP = {"up": "down", "down": "up", "left": "right", "right": "left"}

        def snap():
            return json.loads(js("JSON.stringify(window.__reach.snapshot())"))

        def focus_highlight():
            """True when the focused control looks different on screen than without focus; None when it can't be told."""
            js("window.__reach.focusedEl() && (window.__reach.focusedEl().__rk = window.__reach.keyOf(window.__reach.focusedEl())) && true")
            k = js("(() => { const f = window.__reach.focusedEl(); return f ? window.__reach.keyOf(f) : null; })()")
            if k and not js(f"!!{FIND % json.dumps(k)}"):
                # focus on something the page's own tree doesn't hold (a plugin's frame or shadow root on the host's server)
                tr("  focus outside the page's tree:", js("(() => { const a = document.activeElement; return a ? a.tagName + '.' + String(a.className).slice(0, 60) + ' ' + (a.id || '') : null; })()"))
                return None
            return visual_highlight(k) if k else None

        CLICKY = {"click", "pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "contextmenu"}

        def mouse_only(reached):
            """What the mouse can use and the pad can't: every shown element on the screen with a click, pointer or mouse
            listener of its own (asked of DevTools, not guessed from looks), or a pointer cursor, that no control the pad
            reached contains or sits inside. Also: things that look like buttons (a pointer cursor) but do nothing."""
            n = js("(() => { const R = window.__reach; const all = []; for (const a of R.areas()) for (const el of a.querySelectorAll('*')) if (R.shown(el)) all.push(el); window.__reachAll = all; return all.length; })()")
            hits = []
            for i in range(min(n or 0, 1500)):
                obj = page.send("Runtime.evaluate", expression=f"window.__reachAll[{i}]").get("result", {}).get("objectId")
                if not obj:
                    continue
                ls = page.send("DOMDebugger.getEventListeners", objectId=obj).get("listeners", [])
                if any(l.get("type") in CLICKY for l in ls):
                    hits.append(i)
            out = js(f"""(() => {{ const R = window.__reach, all = window.__reachAll, cons = R.controls(), reached = new Set({json.dumps(list(reached))});
              const got = cons.filter((c) => reached.has(R.ident(c, cons)));
              const hit = {json.dumps(hits)}.map((i) => all[i]).filter((el) => el && el.isConnected);
              // the outermost of nested listeners (an icon inside a button is the button)
              const outer = hit.filter((el) => !hit.some((o) => o !== el && o.contains(el)));
              // a label stands for its control: clicking it does what the control does
              const named = (el) => el.tagName === 'LABEL' ? [el.control, ...cons.filter((c) => (c.getAttribute('aria-labelledby') || '').split(/\\s+/).includes(el.id))].filter(Boolean) : [];
              const covered = (el) => got.some((c) => c === el || c.contains(el) || el.contains(c) || named(el).some((n) => n === c || c.contains(n) || n.contains(c)))
                // a disabled control is no use to the mouse either; a page arrow's job is ◀▶ at the row's edge
                || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.matches('.pz-arrow');
              const mouseOnly = outer.filter((el) => !covered(el)).map((el) => R.label(el));
              const dead = cons.filter((c) => getComputedStyle(c).cursor === 'pointer' && !hit.some((h) => h === c || h.contains(c) || c.contains(h))).map((c) => R.label(c));
              return JSON.stringify({{listeners: outer.length, mouseOnly, dead}}); }})()""")
            return json.loads(out)

        def walk(name, reset=None, cap=None, modal=False, sweep=False):
            """Every control the D-pad reaches from the screen's first focus, by presses only: a control is reached by its
            own path of presses from the start; after a try the walk steps back (the opposite press) or, when that doesn't
            return, sets the screen up again (reset) and replays the path.

            sweep: jellyfin-web's own long pages (the preference pages) keep their scroll and focus when set up again, so
            replayed paths start somewhere else. There the walk goes as a person does: Down through the page (closing the
            keyboard a text field opens), Right along the bar, Up to the tabs, then Left and Right along them."""
            if only and name not in only:
                return
            for _ in range(0 if a.host else 120):  # wait (up to 20 min) until no other test's pad is plugged in (lab)
                if not other_pads():
                    break
                time.sleep(10)
            else:
                if not a.host:
                    check(f"{name}: no other pad in the guest", False)
            start_hash = js("location.hash")

            def setup():
                if reset:
                    reset()
                else:
                    # the same address again doesn't draw the screen again: a changing parameter does
                    setup.n = getattr(setup, "n", 0) + 1
                    h = re.sub(r"[?&]reach=\d+", "", start_hash)
                    # jellyfin-web's own pages rebuild for longer than Plaza's screens
                    stock = js("document.documentElement.hasAttribute('data-icefin-stock')")
                    go(h + ("&" if "?" in h else "?") + f"reach={setup.n}", 4.5 if stock else 3)
                    if stock:
                        # jellyfin-web keeps its page (and the focus in it) for the same address: start from nothing
                        # focused, as a fresh visit does
                        js("(() => { const a = document.activeElement; if (a && a !== document.body) a.blur(); return true; })()")
                lib()
                s = snap()
                if not s["id"]:
                    dpad("down")  # a screen that waits for the first press
                    s = snap()
                return s

            s0 = setup()
            for _ in range(15):  # something passing over the screen as it opens
                if s0["dialog"] == modal:
                    break
                time.sleep(0.2)
                s0 = snap()
            start_dialog = modal
            if not s0["id"]:
                check(f"{name}: the pad gives the screen a focus", False)
                report[name] = {"reached": [], "unreachable": s0["ids"], "no_highlight": [], "controls": len(s0["ids"])}
                return
            paths, order, nohl, edges, queue = {s0["id"]: []}, [s0["id"]], [], {}, [s0["id"]]
            if focus_highlight() is False:
                nohl.append(s0["id"])
            cur, budget = s0["id"], (cap or a.max)

            moves = {}  # (control, direction) -> control, as seen

            def route(a_, b_):
                """Presses from a_ to b_ over moves already seen (breadth first), or None."""
                from collections import deque
                prev, q = {a_: None}, deque([a_])
                while q:
                    x = q.popleft()
                    if x == b_:
                        out = []
                        while prev[x]:
                            x, d = prev[x]
                            out.append(d)
                        return out[::-1]
                    for (u, d), v in moves.items():
                        if u == x and v not in prev:
                            prev[v] = (x, d); q.append(v)
                return None

            def goto(n, at):
                r = route(at, n) if at else None
                for _ in range(6):
                    if r is not None or not at:
                        break
                    # undo a move that brought focus here (most moves can be), then look for a route from there
                    back = [(u, d) for (u, d), v in moves.items() if v == at and u != at]
                    if not back:
                        break
                    u, d = back[0]
                    dpad(OPP[d])
                    got = snap()["id"]
                    if got == n:
                        return got
                    if got != u:
                        moves[(at, OPP[d])] = got
                    at = got
                    r = route(at, n) if at else None
                if r is not None:
                    for d in r:
                        dpad(d)
                    got = snap()["id"]
                    if got == n:
                        return got
                setup()
                for d in paths[n]:
                    dpad(d)
                    if a.host:
                        # a page turn on the host's grids loads the next page from a real server: a replayed path's next
                        # press must not land on the page being left
                        time.sleep(0.5)
                return snap()["id"]

            if sweep:
                queue = []
                at = s0["id"]

                def run(d, limit):
                    nonlocal at
                    same = 0
                    for _ in range(limit):
                        tr("sweep", d, "from", at)
                        dpad(d)
                        s = snap()
                        if s["dialog"] and "icefin-osk" in s["what"]:
                            fid = js("(() => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA)$/.test(a.tagName) ? window.__reach.ident(a, window.__reach.controls(true)) : null; })()")
                            btn(e.BTN_EAST)  # B with the keyboard up closes the keyboard only
                            time.sleep(0.6)
                            if fid and fid not in paths:
                                paths[fid] = [d]; order.append(fid)
                            s = snap()
                        m = s["id"]
                        tr("  ->", m)
                        if m == at:
                            same += 1
                            if same >= 2:
                                return
                            continue
                        same = 0
                        at = m
                        if m and m not in paths:
                            paths[m] = [d]; order.append(m)
                            if focus_highlight() is False:
                                nohl.append(m)
                for d in ("down", "right", "up", "right", "up", "left"):
                    run(d, budget)
            while queue and len(order) <= budget:
                n = queue.pop(0)
                for d in ("up", "down", "left", "right"):
                    if cur != n:
                        cur = goto(n, cur)
                        if cur != n:
                            tr("  can't get back to", n)
                            break
                    tr("from", n, d)
                    dpad(d)
                    s = snap()
                    if not same_screen(s["hash"], start_hash) or s["dialog"] != start_dialog:
                        what = s["hash"] + (" " + s["what"] if s["dialog"] else "")
                        if s["dialog"] and "icefin-osk" in s["what"]:
                            # moving onto a text field opens the keyboard (by design): the field was reached
                            fid = js("(() => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA)$/.test(a.tagName) ? window.__reach.ident(a, window.__reach.controls(true)) : null; })()")
                            btn(e.BTN_EAST)  # B with the keyboard up closes the keyboard only
                            time.sleep(0.6)
                            if fid and fid not in paths:
                                paths[fid] = paths[n] + [d]; order.append(fid); queue.append(fid)
                            cur = snap()["id"]
                            continue
                        edges[f"{n} {d}"] = what
                        tr("  left the screen:", what)
                        cur = None  # set the screen up again before the next try
                        continue
                    m = s["id"]
                    tr("  ->", m)
                    if m:
                        moves[(n, d)] = m
                    if m and m not in paths:
                        paths[m] = paths[n] + [d]; order.append(m); queue.append(m)
                        if focus_highlight() is False:
                            nohl.append(m)
                    cur = m
            ids = snap()["ids"] if same_screen(js("location.hash"), start_hash) else s0["ids"]
            missing = [i for i in dict.fromkeys(s0["ids"] + ids) if i not in paths and not i.startswith(("div.icefin-osk", "div.pz-arrow"))]  # a page arrow: ◀▶ at the edge pages
            mo = mouse_only(paths.keys()) if same_screen(js("location.hash"), start_hash) else {"listeners": 0, "mouseOnly": [], "dead": []}
            shot(f"reach-{name}")
            report[name] = {"reached": order, "paths": {k: v for k, v in paths.items()}, "unreachable": missing, "no_highlight": nohl,
                            "left_screen": edges, "controls": len(set(s0["ids"] + ids)), "complete": not queue,
                            "mouse_only": mo["mouseOnly"], "looks_clickable_does_nothing": mo["dead"], "mouse_listeners": mo["listeners"]}
            # a walk that stopped at its budget (a real library is bigger than the lab's) hasn't tried every control: what
            # it didn't get to is reported, not failed; the lab's small libraries walk to the end
            short = f" (stopped at the budget of {budget} with {len(queue)} still to try: not a failure)" if queue else ""
            check(f"{name}: everything the mouse can use, the pad reaches", not mo["mouseOnly"] or bool(queue), f"{mo['listeners']} with listeners, mouse only {mo['mouseOnly'][:12]}{short}")
            check(f"{name}: every control reachable with the pad", not missing or bool(queue), f"{len(order)} reached, missing {missing[:12]}{short}")
            check(f"{name}: every focused control shows it", not nohl, f"{nohl[:12]}")

        def go(h, wait=3.5):
            js(f"location.hash = {json.dumps(h)}; true")
            time.sleep(wait)

        # ---- the pad works at all ----
        page.wait_for("!!window.icefinTheme && !!window.icefinTheme._engine", timeout=60)
        hook()
        # ---- sign-in (Plaza's own; the lab only: the host's user stays signed in) ----
        if not a.host:
            walk("signin")
            js(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
            js("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(8)
            page.reconnect()
            page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinPlaybackManager && !!window.icefinInputManager", timeout=90)
            js = page.eval
            time.sleep(2)
            js("window.icefinThemeSync ? window.icefinThemeSync.idle().then(() => true) : true")
            js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
            time.sleep(4)
        hook()
        gl = js("JSON.stringify(window.api.gamepads ? window.api.gamepads : null)")
        dpad("right")
        acts = js("JSON.stringify(window.__reachActions)")
        check("the virtual pad reaches the focus engine" if not a.host else "the engine's actions reach the focus engine (host)", "right" in (acts or ""), f"{acts} pads={gl}")
        uid = js("window.ApiClient.getCurrentUserId()")
        sid = js("window.ApiClient.serverId()")
        one = lambda q: js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {json.dumps(dict({'Recursive': True, 'Limit': 1}, **q))}).then(r => r.Items[0] ? r.Items[0].Id : null)")
        views = {ct: vid for vid, ct in js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.map(v => [v.Id, v.CollectionType || '']))")}
        ids = {k: one({"IncludeItemTypes": k}) for k in ["Movie", "Series", "Season", "Episode", "MusicAlbum", "MusicArtist", "Playlist", "BoxSet", "Person"]}
        person = js("window.ApiClient.getPeople(window.ApiClient.getCurrentUserId(), {Limit: 1}).then(r => r.Items[0] ? r.Items[0].Id : null)")

        go("#/home"); walk("home")
        for ct, h in (("movies", "#/movies"), ("tvshows", "#/tv"), ("music", "#/music"), ("livetv", "#/livetv"), ("homevideos", "#/homevideos"), ("books", "#/books")):
            if ct in views:
                go(f"{h}?topParentId={views[ct]}&collectionType={ct}&serverId={sid}"); walk(f"lib-{ct}", cap=260 if ct == "livetv" and not a.host else None)  # the host: the run's --max (its guide is far bigger than the lab's)
        go(f"#/search?serverId={sid}"); walk("search")
        # the on-screen keyboard, opened from the search field with the pad (OK on the field)
        go(f"#/search?serverId={sid}")
        lib()
        js("(() => { const i = [...document.querySelectorAll('#icefin-theme-root input, .page:not(.hide) input')].find(x => window.__reach.shown(x)); if (i) window.__reach.teleport(window.__reach.keyOf(i)); return !!i; })()")
        btn(e.BTN_SOUTH)
        time.sleep(1)
        if only and "keyboard" not in only:
            pass
        elif js("!!document.getElementById('icefin-osk')"):
            lib()
            keys = set()
            cur = lambda: js("(() => { const k = document.querySelector('#icefin-osk .icefin-focused'); return k ? k.getAttribute('data-icefin-key') || k.textContent : null; })()")
            for _ in range(8):  # to the top-left key
                dpad("up")
            for _ in range(14):
                dpad("left")
            for row in range(7):
                for _ in range(14):
                    keys.add(cur()); dpad("right" if row % 2 == 0 else "left")
                keys.add(cur()); dpad("down")
            allk = set(js("[...document.querySelectorAll('#icefin-osk .icefin-osk-key')].map(k => k.getAttribute('data-icefin-key') || k.textContent)"))
            miss = sorted(allk - keys)
            nohl = js("(() => { const k = document.querySelector('#icefin-osk .icefin-focused'); return k ? (window.__reach.highlight(k) ? [] : [k.textContent]) : ['no focused key']; })()")
            report["keyboard"] = {"reached": sorted(k for k in keys if k), "unreachable": miss, "no_highlight": nohl, "controls": len(allk)}
            check("keyboard: every key reachable with the pad", not miss, str(miss[:12]))
            check("keyboard: the focused key shows it", not nohl, str(nohl))
            js("(() => { const d = document.querySelector('#icefin-osk .icefin-osk-done'); if (d) d.click(); return true; })()")
        else:
            check("keyboard: OK on the search field opens the on-screen keyboard", False)
        go(f"#/playlists?serverId={sid}"); walk("playlists")
        for t, k in (("movie", "Movie"), ("series", "Series"), ("season", "Season"), ("episode", "Episode"), ("album", "MusicAlbum"),
                     ("artist", "MusicArtist"), ("playlist", "Playlist"), ("collection", "BoxSet")):
            if ids.get(k):
                go(f"#/details?id={ids[k]}&serverId={sid}"); walk(f"details-{t}")
        if person:
            go(f"#/details?id={person}&serverId={sid}"); walk("details-person")
        # the item menu (Menu on a movie's details)
        if ids.get("Movie"):
            go(f"#/details?id={ids['Movie']}&serverId={sid}")
            def menu():
                if js("!!document.querySelector('.pz-sheet, .pz-card-layer')"):
                    btn(e.BTN_EAST)  # close the sheet that is up
                    time.sleep(1)
                menu.n = getattr(menu, "n", 0) + 1
                go(f"#/details?id={ids['Movie']}&serverId={sid}&reach={menu.n}", 3)
                btn(e.BTN_NORTH)  # SDL's west on an Xbox 360 pad (X): Menu
                time.sleep(3)  # the sheet's opening animation
            menu()
            walk("item-menu", reset=menu, modal=True)
            btn(e.BTN_EAST)
        go(f"#/mypreferencesmenu?userId={uid}"); walk("settings-hub")
        for p in ("mypreferencesdisplay", "mypreferenceshome", "mypreferencesplayback", "mypreferencessubtitles", "mypreferencescontrols"):
            # Home is Plaza's own screen (prefs.js); the other four are jellyfin-web's pages in Plaza's frame
            go(f"#/{p}?userId={uid}"); walk(p.replace("mypreferences", "prefs-"), sweep=p != "mypreferenceshome")
        go(f"#/mypreferencesmenu?userId={uid}")
        lib()
        def client_settings():
            client_settings.n = getattr(client_settings, "n", 0) + 1
            go(f"#/mypreferencesmenu?userId={uid}&reach={client_settings.n}", 3)
            lib()
            if js("(() => { const t = [...document.querySelectorAll('.icefin-s-entry')].find(x => /Client settings/.test(x.textContent)); if (!t) return false; window.__reach.teleport(window.__reach.keyOf(t)); return true; })()"):
                btn(e.BTN_SOUTH)
                time.sleep(3)
        client_settings()
        walk("client-settings", reset=client_settings)
        go(f"#/userprofile?userId={uid}"); walk("profile")
        go("#/quickconnect"); walk("quickconnect")
        # ---- the settings hub: the three input methods side by side ----
        go(f"#/mypreferencesmenu?userId={uid}")
        time.sleep(1)
        lib()
        hub = json.loads(js(r"""JSON.stringify((() => { const R = window.__reach; const out = [];
          for (const el of R.controls()) { const r = el.getBoundingClientRect(); out.push({label: R.label(el), x: r.left + r.width / 2, y: r.top + r.height / 2, key: R.keyOf(el)}); }
          return out; })())"""))
        rows = []
        js("document.activeElement && document.activeElement.blur(); document.querySelectorAll('.icefin-focused').forEach(x => x.classList.remove('icefin-focused')); true")
        for h in hub[:16]:
            r = area(h["key"])
            if not r:
                continue
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=2, y=2); time.sleep(0.25)
            base = grab(r)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=h["x"], y=h["y"]); time.sleep(0.4)
            hov = grab(r)
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=2, y=2); time.sleep(0.25)
            js(f"window.__reach.teleport({json.dumps(h['key'])})"); time.sleep(0.4)
            foc = grab(r)
            js(f"(() => {{ const el = {FIND % json.dumps(h['key'])}; if (el) {{ el.classList.remove('icefin-focused'); el.blur(); }} return true; }})()")
            rows.append({"label": h["label"], "pointer": hov != base, "focus": foc != base})
        page.send("Input.dispatchMouseEvent", type="mouseMoved", x=2, y=2)
        report["settings-hub-inputs"] = rows
        check("settings hub: every tile shows the pad's focus", bool(rows) and all(r["focus"] for r in rows), json.dumps([r["label"] for r in rows if not r["focus"]])[:400])
        check("settings hub: every tile shows the pointer over it", bool(rows) and all(r["pointer"] for r in rows), json.dumps([r["label"] for r in rows if not r["pointer"]])[:400])
        # ---- the player (Plaza's controls) ----
        # (the lab only: playing reports to the server, which keeps the user's watch data)
        clip = None if a.host else one({"IncludeItemTypes": "Movie,Episode,Video"})
        if clip:
            js(f"window.icefinTheme.ctx.play({{ids: ['{clip}'], serverId: '{sid}'}}); true")
            page.wait_for("location.hash.startsWith('#/video') && !!document.querySelector('.pz-pl')", timeout=60)
            time.sleep(3)
            js("window.icefinPlaybackManager.pause(); true")  # paused: Plaza keeps its controls up
            time.sleep(1)
            def controls_up():
                js("window.icefinPlaybackManager.pause(); true")
                time.sleep(0.5)
                js("(() => { const p = document.querySelector('.pz-pl-pp'); if (p) window.icefinTheme._engine.focus(p); return true; })()")
                time.sleep(0.5)
            dpad("up")
            controls_up()
            walk("player", reset=controls_up)
            js("window.icefinPlaybackManager.stop(); true")
            time.sleep(2)
        json.dump(report, open(os.path.join(a.out, "reach.json"), "w"), indent=1)
    except Exception as ex:  # noqa: BLE001
        check("run", False, f"{type(ex).__name__}: {ex}" + ("" if a.host else f" (app exit code {app.poll()})"))
        json.dump(report, open(os.path.join(a.out, "reach.json"), "w"), indent=1)
    finally:
        if stop:
            stop()  # the host: the user's theme choice goes back
        else:
            try:
                page.eval("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
            except Exception:  # noqa: BLE001
                pass
            app.send_signal(signal.SIGTERM)
            try:
                app.wait(10)
            except Exception:  # noqa: BLE001
                app.kill()
            ui.close()
            if xv:
                xv.terminate()
    print(f"plaza_reach: {'OK' if not fails else 'FAIL ' + str(len(fails))} -> {a.out}", flush=True)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
