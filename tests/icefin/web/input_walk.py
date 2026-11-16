#!/usr/bin/env python3
"""input_walk.py — the QA crawler (PLAN 11.7, D40): every element and path on every screen, with three input schemes,
for each theme (stock jellyfin-web included). Generalises controller_walk.py (its WALK_JS, snake walk, denylist,
screen identity by route, required screens) behind one driver interface.

Inputs (--inputs, default pad,keys,mouse), one app session per theme, each input a walk of its own with its own budget:
  pad    a virtual pad (vpads.py, the family chosen per run): D-pad snake, South, East for Back
  keys   DevTools Input.dispatchKeyEvent (ArrowUp/Down/Left/Right, Enter, Escape, Backspace, Tab, Shift+Tab): the
         in-page path real keys take, never an OS-level keyboard
  mouse  DevTools Input.dispatchMouseEvent: hover every element's centre (focus must follow where the theme is
         pointer-first), click it
Per screen: pad and keys collect the controls the input reaches (snake walk; keys also Tab) and activate up to two per
kind; mouse enumerates every visible interactive element inside the theme's root, stock chrome, overlay and
jellyfin-web's page and dialogs, and activates every one (the denylist apart). Each activation is classified (new screen,
dialog/sheet/menu, in-place change, nothing: a dead control), and Back must return to the same screen and the same
focused element (Back is pressed while a dialog, sheet or the on-screen keyboard is still open).
Findings: broken-back, back-focus, dead-control, no-focus-indicator, unreachable-by-input (the mouse can use it, pad or keys
never reach it), focus-lost, obscured, script-error, required-missing. Read-only: nothing destructive is activated, no
text entry, no state control (switch, checkbox, select, range: preferences save on change), no dashboard, playback a few
seconds only, dialogs whose title implies a change or that persist a choice are reached but not confirmed.
Breadth first, required screens first (Home, a library of each kind present, details of each item type present, search,
the preferences menu and each preference page, now playing, player controls); the preferences menu is seeded as an early
target by the theme's own controls (never by hash).
Writes per theme to --out/<theme>/: <input>/trace.log, <input>/report.json, screenshots; report.json and report.md
(merged, with the cross-input findings); --out/summary.md. Report: {theme, input, family, screens:{key:{route, reached_by,
elements:{id:{label, kinds, reached:{pad,keys,mouse}, outcome, back_ok, focus_visible}}}}, findings:[{severity, kind,
screen, element, detail}]}.
Pads (D41): --family all (default) runs the pad input once per family (xbox, dualsense, switchpro, 8bitdo, steam). Steam's own
pad is a separate launch (Steam's virtual pad allowed); on the host, --steam shortcut,gamescope adds two more steam pad runs:
inside Steam through the non-Steam shortcut "IceFin Player (QA)" (scripts/icefin/qa-steam-shortcut.py add|remove|status; needs
Steam running, the shortcut present), and inside a nested 1920x1080 Gamescope. A mode that can't run is skipped with a message.
Control (D41): on the host every theme walk is paired with the same walk on stock jellyfin-web (run first); a finding the stock
walk also has is marked also_in_control. The run ends with IceFin on stock jellyfin-web, not the user's previous theme.
Plugins: a finding in an element a server plugin draws is kind 'plugin', severity info, unless the theme gives it no room, no
focus or no way back. Playback: --play-seconds (5), the player's controls recorded, then Back.
Lab:   python3 input_walk.py --app ~/build-matrix/src/icefin-player --server jf12 --out ~/iwalk [--themes a,b] [--family xbox]
Host:  python3 input_walk.py --host --out <dir> [--themes a,b]   (the installed Flatpak at 1920x1080, your profile, the host lock,
       sleep and screen lock inhibited; theme files from ICEFIN_THEME_PATH when set; pads need /dev/uinput, DualSense/Switch Pro /dev/uhid)
"""
import argparse, base64, datetime, json, os, re, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
import controller_walk as cw  # noqa: E402 (WALK_JS, DANGER, WAYBACK, REQUIRED are reused)
import vpads  # noqa: E402
from cdp import Page  # noqa: E402

try:
    from theme_walk import ERRS  # noqa: E402 (script errors: the same hook the theme walk installs)
except Exception:  # noqa: BLE001
    ERRS = r"""(() => { if (!window.__walkErr) { window.__walkErr = [];
      addEventListener('error', (e) => window.__walkErr.push('error: ' + (e.message || e.type)));
      addEventListener('unhandledrejection', (e) => window.__walkErr.push('rejection: ' + String((e.reason && e.reason.message) || e.reason).slice(0, 200)));
      const ce = console.error.bind(console);
      console.error = (...a) => { try { window.__walkErr.push('console: ' + a.map(String).join(' ').slice(0, 200)); } catch (x) {} ce(...a); }; }
      return window.__walkErr.splice(0); })()"""

REPO_THEMES = os.path.abspath(os.path.join(HERE, "..", "..", "..", "themes"))
FAMILIES = ["xbox", "dualsense", "switchpro", "8bitdo"]
INF = 10 ** 9

# ---------------------------------------------------------------- page side (extends cw.WALK_JS: labWalk)
IW_JS = r"""
(() => {
  if (window.inputWalk) return true;
  const L = window.labWalk;
  const shown = (e) => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const vis = (e) => (e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && e.getClientRects().length > 0 : shown(e));
  const els = new Map(), snaps = {};
  const SEL = 'button, a[href], input, select, textarea, [role=button], [role=tab], [role=switch], [role=menuitem], [role=option], [role=link], [role=checkbox], [tabindex], [data-icefin-focus]';
  const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable=true]';
  const STATEFUL = 'input[type=checkbox], input[type=radio], input[type=range], select, [role=switch], [role=checkbox], [role=radio], [role=slider], [role=combobox], [aria-haspopup=listbox], .emby-select, .emby-checkbox';
  const DLG = '.dialogContainer .dialog, .actionSheet, [role=dialog], .icefin-dd-list, .icefin-d-picker';
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
  const label = (e) => (e.getAttribute('aria-label') || e.title || e.textContent || e.getAttribute('placeholder') || e.value || '').toString().trim().replace(/\s+/g, ' ').slice(0, 60);
  // what a server plugin draws: not IceFin's own roots, not jellyfin-web's own markup
  const OWN = '#icefin-theme-root, #icefin-stock-chrome, #icefin-theme-overlay, #icefin-osk, #icefin-live, .skinHeader, .mainAnimatedPage, .page, .dialogContainer, .actionSheet, #reactRoot, .mainDrawer, .nowPlayingBar, #videoOsdPage, .videoOsdBottom, .osdHeader, .backgroundContainer';
  const info = (e) => ({ plugin: !e.closest(OWN), key: L.key(e), sig: L.sig(e), label: label(e), tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', type: e.getAttribute('type') || '',
    cls: (typeof e.className === 'string' ? e.className : '').slice(0, 120), action: e.getAttribute('data-action') || '', href: e.getAttribute('href') || '',
    field: e.matches(FIELD), stateful: e.matches(STATEFUL), submit: e.matches('[type=submit]'), disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true' });
  const roots = () => {
    const r = ['icefin-theme-root', 'icefin-stock-chrome', 'icefin-theme-overlay', 'icefin-osk'].map((i) => document.getElementById(i)).filter((e) => e && shown(e));
    for (const s of ['.skinHeader', '.page:not(.hide)', '.mainAnimatedPage:not(.hide)', DLG]) document.querySelectorAll(s).forEach((e) => { if (shown(e) && !r.includes(e)) r.push(e); });
    // plugin UI added straight to <body> (a media bar, a banner): enumerated too, flagged plugin
    for (const e of document.body.children) if (shown(e) && !e.matches(OWN) && !e.matches('script, style, link, template, #reactRoot') && !e.querySelector(OWN) && !r.includes(e)) r.push(e);
    return r;
  };
  const dialogOpen = () => [...document.querySelectorAll(DLG)].some(shown) || ['icefin-theme-overlay', 'icefin-osk'].some((i) => { const e = document.getElementById(i); return e && shown(e) && e.childElementCount > 0; });
  const snap = (e) => {
    const cs = getComputedStyle(e), p = e.parentElement, ps = p ? getComputedStyle(p) : cs;
    const cls = [...e.classList].filter((c) => c !== 'icefin-focused').sort().join('.');
    return [cs.outlineStyle + cs.outlineWidth + cs.outlineColor, cs.boxShadow, cs.transform, cs.filter, cs.backgroundColor, cs.borderTopColor, cs.borderTopWidth, cs.color,
            cs.opacity, cs.textDecorationLine, cs.backgroundImage.slice(0, 60), ps.transform, ps.boxShadow, cls, p ? [...p.classList].sort().join('.') : ''].join('|');
  };
  // a floating ring or cursor element (not the control itself) over at least half of it
  const ring = (e) => {
    const r = e.getBoundingClientRect(), area = r.width * r.height || 1;
    for (const c of document.querySelectorAll('[class*="ring" i], [class*="cursor" i], [class*="highlight" i], [class*="focus-box" i], [class*="selector" i]')) {
      if (c === e || e.contains(c) || c.contains(e) || !shown(c)) continue;
      const q = c.getBoundingClientRect(), w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      if (w > 0 && h > 0 && w * h >= 0.5 * area) return true;
    }
    return false;
  };
  window.inputWalk = {
    screen() { const s = L.screen(); s.dialog = s.dialog || dialogOpen(); return s; },
    now() {
      const n = L.now(); if (!n) return null;
      const e = L.cur(); els.set(n.key, e);
      const s = (snaps[n.key] = snaps[n.key] || {}); s.on = snap(e); s.ring = ring(e);
      return Object.assign(info(e), { key: n.key });
    },
    off(key) { const e = els.get(key); if (!e || !e.isConnected || !shown(e) || L.cur() === e) return false; (snaps[key] = snaps[key] || {}).off = snap(e); return true; },
    vis(key) { const s = snaps[key]; if (!s || s.on === undefined || s.off === undefined) return null; return s.on !== s.off || !!s.ring; },
    enumerate(scope) {
      let rs = roots();
      if (scope === 'dialog') rs = rs.filter((r) => r.id === 'icefin-theme-overlay' || r.id === 'icefin-osk' || r.matches(DLG));
      const out = [], seen = new Set();
      for (const r of rs) for (const e of r.querySelectorAll(SEL)) {
        if (seen.has(e) || out.length >= 600) continue;
        const ti = e.getAttribute('tabindex');
        if (!e.matches('button, a[href], input, select, textarea, [role], [data-icefin-focus]') && !(ti !== null && parseInt(ti, 10) >= 0)) continue;
        if (!vis(e)) continue;
        const rc = e.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) continue;
        const par = e.parentElement && e.parentElement.closest('button, a[href], [role=button]');
        if (par && par !== e && !e.matches('button, a[href], input, select, textarea, [role]') && !e.hasAttribute('data-icefin-focus')) continue;
        seen.add(e);
        const i = info(e); els.set(i.key, e); out.push(i);
      }
      return out;
    },
    rect(key) {
      const e = els.get(key); if (!e || !e.isConnected) return null;
      if (!vis(e)) return { ok: false, why: 'hidden' };
      e.scrollIntoView({ block: 'center', inline: 'center' });
      const r = e.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2));
      const t = document.elementFromPoint(x, y);
      return { ok: true, x, y, top: !!t && (t === e || e.contains(t) || t.contains(e)) };
    },
    focusKey(key) {
      const e = els.get(key); if (!e || !e.isConnected || !shown(e)) return false;
      const g = window.icefinTheme && window.icefinTheme._engine;
      if (g && g.hasScreen() && g.root() && g.root().contains(e)) g.focus(e); else e.focus({ preventScroll: false });
      return L.cur() === e;
    },
    focusedKey() { const e = L.cur(); return e ? L.key(e) : ''; },
    digest(key) {
      const e = els.get(key); let t = '';
      for (const r of roots()) t += r.childElementCount + ':' + (r.textContent || '').slice(0, 8000) + ';';
      const at = (n) => n ? [...n.attributes].map((a) => a.name + '=' + a.value).join(' ') + '#' + (n.textContent || '').trim().slice(0, 80) : '';
      const c = L.cur();
      return { dom: hash(t), el: hash(at(e) + '|' + at(e && e.parentElement)), focus: c ? L.key(c) : '' };
    },
    backKey() {
      for (const r of roots()) for (const e of r.querySelectorAll('[data-action=back], .headerBackButton, button, a, [role=button], [data-icefin-focus]')) {
        if (vis(e) && (e.matches('[data-action=back], .headerBackButton') || /^\s*(‹\s*|←\s*)?(back|go back)\s*$/i.test(label(e)))) { const i = info(e); els.set(i.key, e); return i.key; }
      }
      return '';
    },
    title() {
      for (const r of roots().filter((x) => x.id === 'icefin-theme-overlay' || x.matches(DLG))) {
        const t = r.querySelector('.formDialogHeaderTitle, .actionSheetTitle, h1, h2, h3, [class*=title i]');
        if (t && shown(t)) return (t.textContent || '').trim().slice(0, 80);
      }
      return '';
    },
    reset() { els.clear(); for (const k of Object.keys(snaps)) delete snaps[k]; return true; }
  };
  return true;
})()
"""

# ---------------------------------------------------------------- the read-only rules
DANGER = re.compile(cw.DANGER.pattern + r"|\b(save|apply|ok|okay|submit|confirm|create|new playlist|add to|rate|scan|refresh|shut ?down|import|upload|"
                    r"mark|unfavou?rite|empty|stop server|install|update)\b", re.I)
DANGER_CLS = re.compile(r"delete|remove|sign-?out|log-?out|favorit|userrating|playstate|btnuserdata|restart|shut|btn(save|submit|apply)|btnplayed", re.I)
PERSISTS = re.compile(r"\b(sort|filters?|layout|group by|order by|view mode|language|quality|bitrate|speed|subtitle|audio|display|theme|colou?r|version)\b", re.I)
DLG_CHANGE = re.compile(r"create|new |add|edit|rename|delete|remove|identify|restart|shut|sign|password|playlist|collection|confirm|metadata|image", re.I)
DLG_BTN = re.compile(r"^(ok|okay|save|apply|create|add|submit|yes|confirm|done|delete|remove|restart|continue|update)$", re.I)
PREF_LABEL = re.compile(r"preferences|settings|profile|user|account|menu|avatar|cog|gear", re.I)
PRIORITY_ROUTES = [("Home", r"^/home"), ("a library", r"^/(movies|tv|music|list|livetv|books|photos|musicvideos|homevideos)"), ("details", r"^/details"),
                   ("search", r"^/search"), ("the preferences menu", r"^/mypreferencesmenu"), ("video playback", r"^/video"),
                   ("preferences: display", r"^/mypreferencesdisplay"), ("preferences: home", r"^/mypreferenceshome"),
                   ("preferences: playback", r"^/mypreferencesplayback"), ("preferences: subtitles", r"^/mypreferencessubtitles"),
                   ("now playing", r"^/(queue|nowplaying)")]
LIBRARY = {"movies": r"^/movies", "tvshows": r"^/tv", "music": r"^/music", "livetv": r"^/livetv", "homevideos": r"^/homevideos", "books": r"^/books",
           "musicvideos": r"^/musicvideos", "playlists": r"^/list"}
ITEM_TYPES = ["Movie", "Series", "Season", "Episode", "Audio", "MusicAlbum", "MusicArtist", "Person", "Playlist", "BoxSet", "Book", "Photo"]
SEVERITY = {"broken-back": "high", "back-focus": "medium", "dead-control": "medium", "no-focus-indicator": "high", "unreachable-by-input": "medium",
            "focus-lost": "high", "obscured": "low", "script-error": "high", "required-missing": "medium", "hover-no-focus": "low", "shift-tab": "low",
            "unpositioned": "low", "walk-error": "high", "plugin": "info"}


def base(k):
    return k.replace(" (dialog)", "")


def route_href(h):
    """An href as a kind of route: ids and numbers dropped, so the cards of one list share a key."""
    p = h.split("?")[0].lstrip("#")
    q = [x for x in (h.split("?", 1)[1].split("&") if "?" in h else []) if not re.search(r"(^|[^a-z])(id|serverid)=", x, re.I) and not re.search(r"=[0-9a-f]{16,}$", x)]
    return p + ("?" + "&".join(sorted(q)) if q else "")


def skip_reason(c, title=""):
    lab, hr = c.get("label", ""), c.get("href", "")
    if c.get("field"):
        return "text field (reaching it is enough)"
    if c.get("stateful"):
        return "state control (saves on change)"
    if c.get("submit"):
        return "submit"
    if c.get("disabled"):
        return "disabled"
    if DANGER.search(lab) or DANGER_CLS.search((c.get("cls", "") + " " + c.get("action", ""))):
        return "denylist"
    if "dashboard" in hr or "configurationpage" in hr or hr.startswith("http"):
        return "dashboard or external"
    if cw.WAYBACK.match(lab):
        return "a way back"
    if PERSISTS.search(lab) and not hr:
        return "persists a view choice"
    if title and DLG_CHANGE.search(title) and DLG_BTN.match(lab.strip()):
        return "confirms a change"
    if title and PERSISTS.search(title):
        return "persists a choice"
    return ""


# ---------------------------------------------------------------- drivers: one interface (focus, move, activate, back)
class Driver:
    name = ""

    def __init__(self, page, tr):
        self.page, self.tr = page, tr

    def js(self, expr):
        return self.page.eval(expr)

    def key(self, name, shift=False):
        k, code, vk = {"up": ("ArrowUp", "ArrowUp", 38), "down": ("ArrowDown", "ArrowDown", 40), "left": ("ArrowLeft", "ArrowLeft", 37),
                       "right": ("ArrowRight", "ArrowRight", 39), "enter": ("Enter", "Enter", 13), "escape": ("Escape", "Escape", 27),
                       "backspace": ("Backspace", "Backspace", 8), "tab": ("Tab", "Tab", 9)}[name]
        common = dict(modifiers=8 if shift else 0, key=k, code=code, windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)
        self.tr("key", ("shift+" if shift else "") + name)
        if name == "enter":
            self.page.send("Input.dispatchKeyEvent", type="keyDown", text="\r", **common)
        else:
            self.page.send("Input.dispatchKeyEvent", type="rawKeyDown", **common)
        time.sleep(0.06)
        self.page.send("Input.dispatchKeyEvent", type="keyUp", **common)
        time.sleep(0.25)

    def focus(self, key):
        """Position on an element (not an input test): pad and keys set the engine's focus, mouse hovers."""
        return bool(self.js(f"window.inputWalk.focusKey({json.dumps(key)})"))

    def move(self, d):
        raise NotImplementedError

    def activate(self):
        raise NotImplementedError

    def back(self, attempt=0):
        raise NotImplementedError


class PadDriver(Driver):
    name = "pad"

    def __init__(self, page, tr, pad):
        super().__init__(page, tr)
        self.pad = pad

    def _press(self, c):
        self.tr("press", c)
        vpads.press(self.pad, c)
        time.sleep(0.3)

    def move(self, d):
        self._press(d)

    def activate(self):
        self._press("south")

    def back(self, attempt=0):
        self._press("east")


class KeysDriver(Driver):
    name = "keys"

    def move(self, d):
        if d == "tab":
            self.key("tab")
        elif d == "shift-tab":
            self.key("tab", shift=True)
        else:
            self.key(d)

    def activate(self):
        self.key("enter")

    def back(self, attempt=0):
        self.key("escape" if attempt % 2 == 0 else "backspace")


class MouseDriver(Driver):
    name = "mouse"
    x = y = 0
    last = None

    def _mouse(self, typ, **kw):
        self.page.send("Input.dispatchMouseEvent", type=typ, x=self.x, y=self.y, **kw)

    def focus(self, key):
        """Scroll the element in and hover its centre. False when it is gone or hidden; self.last has the geometry."""
        r = self.js(f"window.inputWalk.rect({json.dumps(key)})")
        self.last = r
        if not r or not r.get("ok"):
            return False
        self.x, self.y = r["x"], r["y"]
        self.tr("hover", key[-40:])
        self._mouse("mouseMoved")
        time.sleep(0.4)
        return True

    def activate(self):
        self.tr("click", self.x, self.y)
        self._mouse("mousePressed", button="left", buttons=1, clickCount=1)
        time.sleep(0.06)
        self._mouse("mouseReleased", button="left", buttons=0, clickCount=1)
        time.sleep(0.25)

    def move(self, d):
        raise ValueError("the mouse has no D-pad")

    def back(self, attempt=0):
        """The theme's own Back control when there is one and nothing is open over the page, else Escape (then Backspace)."""
        if attempt == 0 and not self.js("window.inputWalk.screen().dialog"):
            k = self.js("window.inputWalk.backKey()")
            if k and self.focus(k):
                self.tr("back control")
                self.activate()
                return
        self.key("escape" if attempt % 2 == 0 else "backspace")


# ---------------------------------------------------------------- the walker
class Walker:
    def __init__(self, a, page, drv, theme, family, out, deadline, present):
        self.a, self.page, self.drv, self.theme, self.family, self.out, self.deadline = a, page, drv, theme, family, out, deadline
        self.inp = drv.name
        self.mouse = self.inp == "mouse"
        os.makedirs(out, exist_ok=True)
        self.trace = open(os.path.join(out, "trace.log"), "w")
        drv.tr = self.tr
        self.screens, self.ctrls, self.findings, self.queue = {}, {}, [], []
        self.done, self.tried, self.itypes = set(), {}, {}
        self.root = None
        self.shots = 0
        self.hovered = [0, 0]
        self.present = present            # {"libraries": [regex...], "types": [...]}
        self.errs_seen = set()

    # -------------------------------------------------------------- plumbing
    def tr(self, *x):
        self.trace.write(f"{time.strftime('%H:%M:%S')} " + " ".join(str(i) for i in x) + "\n")
        self.trace.flush()

    def late(self):
        return time.time() > self.deadline

    def js(self, expr):
        try:
            return self.page.eval(expr)
        except (ConnectionError, OSError):
            time.sleep(1)
            self.page.reconnect()
            self.ensure()
            return self.page.eval(expr)

    def ensure(self):
        self.page.eval(cw.WALK_JS)
        self.page.eval(IW_JS)
        if self.page.eval("typeof window.__walkErr === 'undefined'"):
            self.page.eval(ERRS)

    def settle(self, prev=None, t=6.0):
        t0, last, same = time.time(), None, 0
        while time.time() - t0 < t:
            time.sleep(0.35)
            try:
                self.ensure()
                s = self.page.eval("JSON.stringify(window.inputWalk.screen())")
            except Exception:  # noqa: BLE001 (the page reloaded)
                time.sleep(1)
                try:
                    self.page.reconnect()
                except Exception:  # noqa: BLE001
                    pass
                continue
            same = same + 1 if s == last else 0
            last = s
            if same >= 2 and (prev is None or time.time() - t0 > 1.2):
                break
        return json.loads(last) if last else {"route": "?", "hash": "", "dialog": False, "item": ""}

    def screen(self):
        self.ensure()
        return json.loads(self.js("JSON.stringify(window.inputWalk.screen())"))

    def item_type(self, item):
        if item not in self.itypes:
            self.itypes[item] = self.js(f"window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), {json.dumps(item)}).then(i => i.Type).catch(() => '')")
        return self.itypes[item]

    def screen_key(self, s):
        k = s["route"]
        if k.startswith("/details") and s.get("item"):
            k += f" [{self.item_type(s['item'])}]"
        return k + (" (dialog)" if s.get("dialog") else "")

    def focus_now(self):
        self.ensure()
        return self.js("window.inputWalk.now()")

    def shot(self, name):
        name = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:70]
        try:
            open(os.path.join(self.out, name + ".png"), "wb").write(base64.b64decode(self.page.send("Page.captureScreenshot", format="png")["data"]))
        except Exception:  # noqa: BLE001 (no frame while the window is covered: the entry stands without a picture)
            try:
                self.page.reconnect()
            except Exception:  # noqa: BLE001
                pass

    def finding(self, kind, screen, element, detail, shot=True, plugin=False):
        """plugin: the element is drawn by a server plugin. Its dead controls and missing focus looks are info (kind
        'plugin'); no room (obscured, off-screen), no focus, no way back stay normal findings (D41)."""
        fp = (kind, screen, element)
        if any((f.get("was") or f["kind"], f["screen"], f["element"]) == fp for f in self.findings):
            return
        sev, was = SEVERITY.get(kind, "medium"), None
        if plugin and kind in ("dead-control", "no-focus-indicator", "hover-no-focus", "script-error"):
            sev, was, kind = "info", kind, "plugin"
        self.findings.append({"severity": sev, "kind": kind, "screen": screen, "element": element,
                              "detail": (f"[{was}] " if was else "") + str(detail)[:300], **({"was": was} if was else {})})
        self.tr("FINDING", kind, screen, element, detail)
        if shot and self.shots < 60:
            self.shots += 1
            self.shot(f"finding-{len(self.findings):03d}-{kind}")

    def errors(self, k, el=""):
        try:
            self.ensure()
            for m in self.js(ERRS) or []:
                if m not in self.errs_seen:
                    self.errs_seen.add(m)
                    self.finding("script-error", k, el, m, shot=False)
        except Exception:  # noqa: BLE001
            pass

    def element(self, k, c):
        e = self.screens[k]["elements"].setdefault(c["key"], {"label": c.get("label", ""), "kinds": c.get("sig", ""), "reached": {},
                                                               "outcome": None, "back_ok": None, "focus_visible": None})
        if c.get("href"):
            e["href"] = c["href"]
        if c.get("plugin"):
            e["plugin"] = True
        return e

    def reach(self, k, c):
        self.element(k, c)["reached"][self.inp] = True

    def add_screen(self, k, s, via, queue=True):
        if k in self.screens:
            return False
        self.screens[k] = {"route": s["route"], "hash": s["hash"], "reached_by": via, "elements": {}, "collected": False}
        self.tr("screen", k, "via", via)
        self.shot(k)
        if queue and not k.endswith("(dialog)"):
            self.queue.append(k)
        return True

    def stop_play(self):
        self.js("window.icefinPlaybackManager && window.icefinPlaybackManager.isPlaying && window.icefinPlaybackManager.isPlaying() && window.icefinPlaybackManager.stop && window.icefinPlaybackManager.stop(); true")

    def dismiss(self):
        for _ in range(3):
            if not self.screen()["dialog"]:
                return
            self.drv.key("escape")
            time.sleep(0.5)

    # -------------------------------------------------------------- positioning
    def go_here(self, k):
        here = self.screens[k]
        if self.screen()["dialog"]:
            self.dismiss()
        s = self.screen()
        if self.screen_key(s) == k:
            return True
        self.js(f"location.hash = {json.dumps(here['hash'])}; true")
        s = self.settle()
        if self.screen_key(s) != k:
            self.tr("could not return to", k, "got", self.screen_key(s))
            return False
        return True

    def replay(self, k, path):
        if self.mouse:
            return
        here = self.screens[k]
        if here.get("first_key"):
            self.drv.focus(here["first_key"])
        for p in path:
            self.drv.move(p)
        self.settle(t=1.0)

    def restore(self, k, path):
        if not self.go_here(k):
            return False
        self.replay(k, path)
        return True

    def position(self, k, c):
        """On the control, ready to act: by the engine's focus when the screen is as it was, else a fresh load and the presses."""
        if self.mouse:
            if self.drv.focus(c["key"]):
                return True
            if not self.go_here(k):
                return False
            self.enum(k)
            return self.drv.focus(c["key"])
        f = self.focus_now()
        if f and f["key"] == c["key"]:
            return True
        if self.drv.focus(c["key"]):
            f = self.focus_now()
            if f and f["key"] == c["key"]:
                return True
        if not self.restore(k, c.get("path", [])):
            return False
        f = self.focus_now()
        return bool(f and f["key"] == c["key"])

    # -------------------------------------------------------------- what is on a screen
    def enum(self, k, scope="base"):
        """Every visible interactive element: the universe the mouse can use. Recorded on the screen; returned."""
        self.ensure()
        items = self.js(f"window.inputWalk.enumerate({json.dumps(scope)})") or []
        for c in items:
            self.element(k, c)
        return items

    def mark_off(self, k, before):
        if not before:
            return
        self.js(f"window.inputWalk.off({json.dumps(before['key'])})")
        v = self.js(f"window.inputWalk.vis({json.dumps(before['key'])})")
        if v is None:
            return
        self.element(k, before)["focus_visible"] = v
        if v is False:
            self.finding("no-focus-indicator", k, before["label"] or before["key"], "focused and unfocused look the same (outline, shadow, transform, colours, classes, no ring)",
                         plugin=before.get("plugin", False))

    def collect(self, k, here):
        here["collected"] = True
        if self.mouse:
            items = self.enum(k)
            for c in items:
                self.element(k, c)["reached"]["mouse"] = True
            self.ctrls[k] = items
            return
        ctrls, seen, path = [], {}, []
        self.ctrls[k] = ctrls

        def take(f, pth):
            if f["key"] in seen:
                return False
            seen[f["key"]] = True
            ctrls.append(dict(f, path=list(pth)))
            self.reach(k, f)
            return True

        def step(d):
            before = self.focus_now()
            self.drv.move(d)
            s = self.settle(t=1.0)
            kk = self.screen_key(s)
            if kk != k:
                self.moved(k, here, kk, s, d, path)
                return None
            f2 = self.focus_now()
            self.mark_off(k, before)
            if f2 and (not before or f2["key"] != before["key"]):
                path.append(d)
            if not f2 or f2["key"] in seen:
                return None
            take(f2, path)
            return f2

        f = self.focus_now()
        if not f:
            self.drv.move("down")
            path.append("down")
            f = self.focus_now()
        else:
            here["first_key"] = f["key"]
        if f:
            take(f, path)
        for _ in range(6):
            if not step("up"):
                break

        def snake(horiz):
            for _ in range(4 * 14):
                if self.late():
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
        path.clear()
        if not self.late() and self.restore(k, []):
            snake("left")
        if self.inp == "keys" and not self.late() and self.restore(k, []):
            self.tab_sweep(k, take)
        self.enum(k)    # after the scrolling: lazy rows are in
        self.tr("screen", k, "controls reached", len(ctrls))

    def tab_sweep(self, k, take):
        n, last, miss = 0, None, 0
        for i in range(40):
            self.drv.move("tab")
            n += 1
            f = self.focus_now()
            if not f or f["key"] == last:
                miss += 1
                if miss >= 2:
                    break
                continue
            last = f["key"]
            take(f, ["tab"] * n)
        if last:
            self.drv.move("shift-tab")
            if n > 1:
                f = self.focus_now()
                if f and f["key"] == last:
                    self.finding("shift-tab", k, last[-40:], "Shift+Tab did not move focus back")

    def moved(self, k, here, kk, s, d, path):
        """A D-pad press changed the page: an overlay (a sidebar) opened, or the route changed (a tab row)."""
        if kk.split(" (dialog)")[0] == k:
            self.tr("moving opened", kk)
            self.add_screen(kk, s, here["reached_by"] + [d], queue=False)
            if not self.screens[kk].get("explored"):
                pth = list(path)
                reopen = lambda: self.restore(k, pth) and (self.drv.move(d), self.settle(t=1.0))[1] and self.screen_key(self.screen()) == kk
                self.dialog_pass(k, kk, reopen, here["reached_by"] + [d])
        else:
            self.tr("moving changed the screen to", kk)
            self.add_screen(kk, s, here["reached_by"] + path + [d])
        self.restore(k, path)

    def enum_universe_note(self):
        pass

    # -------------------------------------------------------------- activation
    def activate(self, k, here, c):
        """Act on one control, classify what happened, come back with Back, check the way back."""
        el = self.element(k, c)
        label = c.get("label") or c["key"]
        if not self.position(k, c):
            el["outcome"] = "unpositioned"
            self.finding("unpositioned", k, label, "could not put the input on it again (screen reloaded or moved)", shot=False)
            return
        pre = self.screen()
        prek = self.screen_key(pre)
        if self.mouse:
            r = self.drv.last or {}
            if not r.get("top"):
                el["outcome"] = "obscured"
                self.finding("obscured", k, label, "another element covers its centre")
                return
            self.hovered[1] += 1
            f = self.focus_now()
            hovered = bool(f and f["key"] == c["key"])
            self.hovered[0] += hovered
            el["hover_focus"] = hovered
            if hovered:
                self.mark_off(k, None)
            pf = f
        else:
            pf = self.focus_now()
        d0 = self.js(f"window.inputWalk.digest({json.dumps(c['key'])})")
        time.sleep(0.5)
        d1 = self.js(f"window.inputWalk.digest({json.dumps(c['key'])})")
        noisy = d0["dom"] != d1["dom"]
        self.drv.activate()
        s = self.settle(prev=k)
        self.errors(k, label)
        pk = self.screen_key(s)
        d2 = self.js(f"window.inputWalk.digest({json.dumps(c['key'])})") if pk == k else None
        if pk != k:
            outcome = "dialog" if pk == k + " (dialog)" else "screen"
        elif (not noisy and d2["dom"] != d1["dom"]) or d2["el"] != d1["el"] or d2["focus"] != d1["focus"]:
            outcome = "in-place"
        else:
            outcome = "nothing"
        el["outcome"] = outcome if outcome in ("dialog", "in-place", "nothing") else f"screen: {pk}"
        self.tr("activated", label, "->", el["outcome"])
        if outcome == "nothing":
            if not self.mouse and not self.js("window.inputWalk.focusedKey()"):
                self.finding("focus-lost", k, label, "nothing focused after the action")
            self.finding("dead-control", k, label, "no screen, dialog or visible change", plugin=c.get("plugin", False))
            return
        if outcome == "in-place":
            if not self.mouse and not self.js("window.inputWalk.focusedKey()"):
                self.finding("focus-lost", k, label, "nothing focused after the action")
            return
        if outcome == "screen":
            route = s["route"]
            if "dashboard" in route or "configurationpage" in route:
                el["outcome"] = "screen: dashboard (not explored)"
                self.restore(k, c.get("path", []))
                return
            self.add_screen(pk, s, here["reached_by"] + [label])
            if route.startswith("/video"):
                self.video(pk)
        else:   # a dialog, sheet, menu or keyboard
            self.add_screen(pk, s, here["reached_by"] + [label], queue=False)
            if not self.screens[pk].get("explored") and not self.late():
                cc = dict(c)
                reopen = lambda: self.position(k, cc) and (self.drv.activate(), self.settle(prev=k))[1] and self.screen_key(self.screen()) == pk
                self.dialog_pass(k, pk, reopen, here["reached_by"] + [label])
        status, kk = self.back_out(k, pk)
        self.errors(k, label)
        if status == "root":
            el["back_ok"] = None
            self.restore(k, c.get("path", []))
            return
        if status == "fail":
            el["back_ok"] = False
            self.finding("broken-back", k, label, f"Back from {pk} ended on {kk} (want {k})")
            self.restore(k, c.get("path", []))
            return
        f = self.focus_now() if not self.mouse or (pf and pf["key"] == c["key"]) else None
        want = pf["key"] if pf else None
        if want is not None:
            if not f:
                el["back_ok"] = False
                self.finding("focus-lost", k, label, f"after Back from {pk} nothing is focused")
            elif f["key"] != want:
                el["back_ok"] = False
                self.finding("back-focus", k, label, f"after Back from {pk} focus is on '{f['label']}', not the control that opened it")
            else:
                el["back_ok"] = True
        else:
            el["back_ok"] = True

    def back_out(self, k, opened):
        """Back until the screen is `k` again with nothing open (a dialog, sheet or the on-screen keyboard on the same
        route counts: keep pressing). 'ok' | 'root' (the home, where Back asks to exit) | 'fail'."""
        kk = opened
        for i in range(6):
            if self.late() and i > 2:
                break
            if opened.split(" ")[0] == self.root.split(" ")[0] and self.screen_key(self.screen()) == base(self.root) + " (dialog)" and k != self.root:
                self.drv.back(i)
                self.settle(t=2.0)
                return "root", kk
            if opened.split(" ")[0].startswith("/video"):
                self.stop_play()
            self.drv.back(i)
            kk = self.screen_key(self.settle(prev=opened, t=3.0))
            self.stop_play()
            if kk == k:
                return "ok", kk
            if base(kk) not in (base(k), base(opened)):
                if base(opened) == base(self.root) and kk == base(self.root) + " (dialog)":
                    self.drv.back(i + 1)
                    self.settle(t=2.0)
                    return "root", kk
                return "fail", kk
        return "fail", kk

    def video(self, pk):
        """The player: about --play-seconds of playback (5), its controls recorded (reached, not pressed), then stop."""
        time.sleep(self.a.play_seconds)
        here = self.screens[pk]
        here["collected"], here["nofollow"] = True, True
        try:
            if self.mouse:
                for c in self.enum(pk):
                    self.element(pk, c)["reached"]["mouse"] = True
            else:
                self.enum(pk)
                seen = set()
                for d in ["right"] * 5 + ["down"] * 3 + ["left"] * 5:
                    before = self.focus_now()
                    self.drv.move(d)
                    f = self.focus_now()
                    self.mark_off(pk, before)
                    if f and f["key"] not in seen:
                        seen.add(f["key"])
                        self.reach(pk, f)
        finally:
            self.stop_play()

    # -------------------------------------------------------------- dialogs (one level)
    def dialog_pass(self, k, dk, reopen, via):
        self.screens[dk]["explored"] = True
        title = self.js("window.inputWalk.title()") or ""
        rows = []
        if self.mouse:
            for c in self.enum(dk, "dialog"):
                self.element(dk, c)["reached"]["mouse"] = True
                rows.append(c)
        else:
            seen = {}
            f = self.focus_now()
            if f:
                seen[f["key"]] = True
                rows.append(dict(f, path=[]))
                self.reach(dk, f)
            for d in ("down", "up"):
                if d == "up" and not (reopen() if rows else False):
                    break
                n = 0
                for _ in range(14):
                    before = self.focus_now()
                    self.drv.move(d)
                    n += 1
                    f = self.focus_now()
                    self.mark_off(dk, before)
                    if not f or f["key"] in seen:
                        break
                    seen[f["key"]] = True
                    rows.append(dict(f, path=[d] * n))
                    self.reach(dk, f)
                self.enum(dk, "dialog")
        self.tr("dialog", dk, title, "rows", len(rows))
        tried = {}
        for c in rows[:24 if self.mouse else 12]:
            if self.late():
                break
            why = skip_reason(c, title)
            el = self.element(dk, c)
            if why:
                el["outcome"] = "skipped: " + why
                continue
            uk = c.get("sig", "")
            if not self.mouse and tried.get(uk, 0) >= 2:
                continue
            tried[uk] = tried.get(uk, 0) + 1
            if self.screen_key(self.screen()) != dk and not reopen():
                break
            if self.mouse:
                if not self.drv.focus(c["key"]) or not (self.drv.last or {}).get("top"):
                    continue
            else:
                for p in c["path"]:
                    self.drv.move(p)
                f = self.focus_now()
                if not f or f["key"] != c["key"]:
                    continue
            d1 = self.js(f"window.inputWalk.digest({json.dumps(c['key'])})")
            self.drv.activate()
            s = self.settle(prev=dk)
            self.errors(dk, c["label"])
            pk = self.screen_key(s)
            if pk == dk:
                d2 = self.js(f"window.inputWalk.digest({json.dumps(c['key'])})")
                el["outcome"] = "in-place" if d2["dom"] != d1["dom"] or d2["el"] != d1["el"] else "nothing"
                if el["outcome"] == "nothing":
                    self.finding("dead-control", dk, c["label"], "no screen, dialog or visible change", plugin=c.get("plugin", False))
            elif pk == k:
                el["outcome"] = "closes"
            else:
                el["outcome"] = f"screen: {pk}"
                self.add_screen(pk, s, via + [c["label"]])
                if s["route"].startswith("/video"):
                    self.video(pk)
                self.go_here(k)
        if self.screen_key(self.screen()) != k:
            status, kk = self.back_out(k, dk)
            if status == "fail":
                self.finding("broken-back", k, dk, f"Back from the dialog '{title}' ended on {kk}")
                self.go_here(k)

    # -------------------------------------------------------------- one screen
    def explore(self, k, limit):
        here = self.screens[k]
        if k.endswith("(dialog)") or here.get("nofollow") or not self.go_here(k):
            return
        if not here["collected"]:
            self.collect(k, here)
        todo = [c for c in self.ctrls.get(k, []) if (k, c["key"]) not in self.done]
        # the seeds first (the preferences menu), then the first of each kind, then the rest
        counts = {}

        def ukey(c):
            return c.get("sig", "") + "|" + (route_href(c["href"]) if c.get("href") else "")
        ranked = []
        for c in todo:
            u = ukey(c)
            counts[u] = counts.get(u, 0) + 1
            ranked.append((0 if PREF_LABEL.search(c.get("label", "") + " " + c.get("cls", "") + " " + c.get("action", "")) else 1, counts[u], c))
        ranked.sort(key=lambda t: (t[0], t[1]))
        tried = self.tried.setdefault(k, {})
        for _, n, c in ranked:
            if self.late():
                break
            u = ukey(c)
            if tried.get(u, 0) >= limit:
                continue
            why = skip_reason(c)
            self.done.add((k, c["key"]))
            if why:
                self.element(k, c)["outcome"] = "skipped: " + why
                continue
            tried[u] = tried.get(u, 0) + 1
            self.activate(k, here, c)
        if not self.mouse:
            # the controls the mouse can use and this input never reached
            here["ctrl_count"] = len(self.ctrls.get(k, []))

    def priority_pop(self):
        got = {n for n, rx in PRIORITY_ROUTES if any(re.search(rx, base(s).split(" ")[0]) for s in self.screens)}
        for i, k in enumerate(self.queue):
            if any(n not in got and re.search(rx, base(k).split(" ")[0]) for n, rx in PRIORITY_ROUTES):
                return self.queue.pop(i)
        return self.queue.pop(0)

    def run(self):
        s0 = self.settle()
        k0 = self.screen_key(s0)
        self.root = k0
        self.screens[k0] = {"route": s0["route"], "hash": s0["hash"], "reached_by": [], "elements": {}, "collected": False}
        self.shot(k0)
        self.queue.append(k0)
        order = []
        while self.queue and not self.late():
            k = self.priority_pop()
            order.append(k)
            try:
                self.explore(k, 2)
            except Exception as ex:  # noqa: BLE001 (a screen that breaks the walk is a finding; the walk goes on)
                self.finding("walk-error", k, "", f"{type(ex).__name__}: {ex}")
                try:
                    self.page.reconnect()
                except Exception:  # noqa: BLE001
                    pass
        if self.mouse:     # round two: EVERY element, in discovery order, as the budget allows
            for k in order:
                if self.late():
                    break
                try:
                    self.explore(k, INF)
                except Exception as ex:  # noqa: BLE001
                    self.finding("walk-error", k, "", f"{type(ex).__name__}: {ex}")
            while self.queue and not self.late():
                k = self.priority_pop()
                try:
                    self.explore(k, INF)
                except Exception as ex:  # noqa: BLE001
                    self.finding("walk-error", k, "", f"{type(ex).__name__}: {ex}")
            if self.hovered[1] >= 6 and self.hovered[0] / self.hovered[1] >= 0.5:
                for k, sc in self.screens.items():
                    for key, e in sc["elements"].items():
                        if e.get("hover_focus") is False:
                            self.finding("hover-no-focus", k, e["label"] or key, "hover moves focus on most controls of this theme, not on this one", shot=False, plugin=e.get("plugin", False))
        routes = [base(k).split(" ")[0] for k in self.screens]
        missing = [n for n, rx in cw.REQUIRED if not any(re.search(rx, r) for r in routes)]
        missing += [f"a {lib} library" for lib, rx in self.present["libraries"] if not any(re.search(rx, r) for r in routes)]
        missing += [f"details of a {t}" for t in self.present["types"] if not any(f"/details" in k and f"[{t}]" in k for k in self.screens)]
        missing += [n for n, rx in PRIORITY_ROUTES[6:] if not any(re.search(rx, r) for r in routes)]
        for m in missing:
            self.finding("required-missing", "", m, "not reached within the budget or not reachable by this input", shot=False)
        self.tr("done", len(self.screens), "screens; missing", missing)
        return {"theme": self.theme, "input": self.inp, "label": getattr(self, "label", self.inp), "family": self.family if self.inp == "pad" else "", "budget_min": self.a.budget_min,
                "screens": self.screens, "findings": self.findings, "required_missing": missing, "queue_left": len(self.queue)}


# ---------------------------------------------------------------- merging the inputs of one theme
def rt(screen):
    return base(screen).split(" ")[0]


def merge(theme, reps):
    """reps: run label ('pad-xbox', 'keys', 'mouse', 'pad-steam-gamescope') -> that run's report. Reached is per input kind
    (any pad run counts for pad); outcome, back_ok and focus_visible are per run."""
    kinds = [i for i in ("pad", "keys", "mouse") if any(r["input"] == i for r in reps.values())]
    out = {"theme": theme, "input": "+".join(reps), "family": ",".join(sorted({r["family"] for r in reps.values() if r.get("family")})), "runs": list(reps),
           "screens": {}, "findings": []}
    for label, r in reps.items():
        inp = r["input"]
        out["findings"] += [dict(f, input=label) for f in r["findings"]]
        for k, sc in r["screens"].items():
            m = out["screens"].setdefault(k, {"route": sc["route"], "hash": sc["hash"], "reached_by": {}, "elements": {}, "collected": {i: False for i in kinds}})
            m["reached_by"][label] = sc["reached_by"]
            m["collected"][inp] = m["collected"][inp] or sc["collected"]
            for key, e in sc["elements"].items():
                me = m["elements"].setdefault(key, {"label": e["label"], "kinds": e["kinds"], "reached": {i: False for i in kinds}, "outcome": {}, "back_ok": {},
                                                    "focus_visible": {}, "usable": False})
                me["reached"][inp] = me["reached"][inp] or bool(e["reached"].get(inp))
                me["outcome"][label], me["back_ok"][label], me["focus_visible"][label] = e["outcome"], e["back_ok"], e["focus_visible"]
                for extra in ("hover_focus", "plugin"):
                    if e.get(extra) is not None:
                        me[extra] = e[extra]
                if e["outcome"] != "obscured" and not str(e["outcome"]).startswith("skipped: disabled"):
                    me["usable"] = True     # enumerated and not covered: something the mouse can use
    # the cross-input findings: what is usable and pad or keys never reach, on screens that input collected
    for k, sc in out["screens"].items():
        for key, e in sc["elements"].items():
            for inp in ("pad", "keys"):
                if e["usable"] and inp in kinds and sc["collected"].get(inp) and not e["reached"][inp]:
                    out["findings"].append({"severity": SEVERITY["unreachable-by-input"], "kind": "unreachable-by-input", "screen": k, "element": e["label"] or key,
                                            "detail": f"an interactive element the mouse can use, never reached by {inp}", "input": inp})
    return out


def mark_control(m, control):
    """D41: a finding the same walk on stock jellyfin-web also has is also_in_control (the theme didn't cause it)."""
    have = {(f["input"], f["kind"], rt(f["screen"]), f["element"]) for f in control["findings"]}
    for f in m["findings"]:
        f["also_in_control"] = (f["input"], f["kind"], rt(f["screen"]), f["element"]) in have


def markdown(m, reps):
    L = [f"# {m['theme']}: runs {', '.join(m['runs'])}" + (f" (pad families {m['family']})" if m["family"] else ""), ""]
    if any("also_in_control" in f for f in m["findings"]):
        new = sum(1 for f in m["findings"] if not f.get("also_in_control"))
        L += [f"Compared with the same walks on stock jellyfin-web: {new} of {len(m['findings'])} findings are not in the control (also_in_control marks the rest).", ""]
    for inp, r in reps.items():
        els = sum(len(s["elements"]) for s in r["screens"].values())
        L.append(f"- {inp}: {len(r['screens'])} screens, {els} elements, {len(r['findings'])} findings; required missing: {', '.join(r['required_missing']) or 'none'}"
                 + (f"; queue left {r['queue_left']}" if r["queue_left"] else ""))
    kinds = {}
    for f in m["findings"]:
        kinds[f["kind"]] = kinds.get(f["kind"], 0) + 1
    L += ["", "Findings by kind: " + (", ".join(f"{k} {n}" for k, n in sorted(kinds.items())) or "none"), ""]
    order = {"high": 0, "medium": 1, "low": 2}
    for f in sorted(m["findings"], key=lambda f: (order.get(f["severity"], 3), f["kind"]))[:80]:
        L.append(f"- [{f['severity']}] {f['kind']} ({f.get('input', '')}) on `{f['screen'] or '-'}`: {f['element']}: {f['detail']}")
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- sessions: the lab's build, or the host's Flatpak
def pad_missing(family):
    """Why this family can't be plugged in here, or ''. DualSense and Switch Pro are uhid devices; the rest uinput."""
    need = ["/dev/uinput"] if family in ("xbox", "8bitdo") else ["/dev/uhid"] if family in ("dualsense", "switchpro") else ["/dev/uinput", "/dev/uhid"]
    bad = [p for p in need if not os.access(p, os.W_OK)]
    if bad:
        return f"{', '.join(bad)} not writable (scripts/lab/70-icefin-lab-pads.rules)"
    if family in ("xbox", "8bitdo", "steam") and vpads.UInput is None:
        return "python3-evdev missing"
    return ""


class App:
    """One running IceFin: a page to drive, themes to switch between, virtual pads to plug."""
    pads = ()

    def plug(self, family):
        self.pads = list(self.pads)
        if family == "steam" and getattr(self, "phys", True):
            self.pads.append(vpads.make("dualsense"))   # the physical pad Steam takes over (hidden by the ignore list)
        p = vpads.make(family)
        self.pads.append(p)
        return p

    def unplug(self):
        for p in self.pads:
            try:
                p.close()
            except Exception:  # noqa: BLE001
                pass
        self.pads = []

    def use_theme(self, theme):
        use_theme(self.page, theme)     # reconnects self.page in place


class LabApp(App):
    def __init__(self, a, steam=False):
        from setup import Server
        from session_play import start_x, JF, LAB_DISPLAY, launch
        self.a, self.launch, self.LAB_DISPLAY = a, launch, LAB_DISPLAY
        cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
        self.cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
        self.srv = Server(cfg)
        self.srv.wait()
        self.xv = start_x()
        self.app = self.log = self.page = None
        self.pads = []
        self.open(steam)

    def open(self, steam=False):
        a = self.a
        cfgdir = tempfile.mkdtemp(prefix="icefin-iwalk-")
        self.log = open(os.path.join(a.out, f"app-{'steam' if steam else 'plain'}.log"), "w")
        env = dict(os.environ, DISPLAY=self.LAB_DISPLAY, QT_QPA_PLATFORM="xcb", LC_ALL="C.UTF-8")
        if steam:
            env.update(SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD="1", SDL_GAMECONTROLLER_IGNORE_DEVICES="0x054c/0x0ce6")
        if a.app.startswith("flatpak:"):
            self.app = self.launch(a.app, a.port, cfgdir, self.log, "xcb")
        else:
            self.app = subprocess.Popen([os.path.expanduser(a.app), f"--config-dir={cfgdir}", "--windowed", f"--{a.mode}", "--disable-gpu",
                                         f"--remote-debugging-port={a.port}", "--log-level=info"], env=env, stdout=self.log, stderr=subprocess.STDOUT,
                                        start_new_session=True)
        page = self.page = Page(a.port, timeout=90)
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{self.srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(self.cred['user'])}, {json.dumps(self.cred['password'])}).then(r => !!r.AccessToken)")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.api.gamepads && !!window.icefinTheme && !!window.icefinTheme._engine && !!window.ApiClient.getCurrentUserId()", timeout=90)
        return page

    def close(self):
        self.unplug()
        if self.app:
            try:
                os.killpg(self.app.pid, signal.SIGTERM)
                self.app.wait(20)
            except Exception:  # noqa: BLE001
                try:
                    os.killpg(self.app.pid, signal.SIGKILL)
                except Exception:  # noqa: BLE001
                    pass
            self.app = None
        if self.xv:
            self.xv.terminate()


class HostRun:
    """What the whole host run holds: the lock (one host run at a time), the player updated, and a sleep and screen-lock
    inhibit (systemd-inhibit around a sleeping child, released at exit, SIGTERM included) so the screen stays on."""
    def __init__(self, a):
        import host
        self.host = host
        self.lock = host.Lock()
        self.lock.__enter__()
        self.inh = None
        try:
            self.info = host.update()
            try:
                self.inh = subprocess.Popen(["systemd-inhibit", "--what=idle:sleep", "--who=icefin-qa", "--why=IceFin QA walk", "sleep", "infinity"],
                                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
                print("input_walk: sleep and screen-lock inhibited for the run", flush=True)
            except OSError as ex:
                print(f"input_walk: NOTE no inhibit ({ex}): the screen may lock during the run", flush=True)
        except Exception:
            self.lock.__exit__()
            raise

    def close(self):
        if self.inh:
            try:
                os.killpg(self.inh.pid, signal.SIGTERM)
            except OSError:
                pass
        self.lock.__exit__()


def steam_shortcut():
    """The shortcut helper's status: {} when the helper can't say."""
    try:
        out = subprocess.run([sys.executable, os.path.join(HERE, "..", "..", "..", "scripts", "icefin", "qa-steam-shortcut.py"), "status", "--json"],
                             capture_output=True, text=True, timeout=30).stdout
        return json.loads(out)
    except Exception:  # noqa: BLE001
        return {}


class _Attached:
    """Stands in for a process IceFin was started through (Steam): there is nothing of ours to wait on or signal."""
    pid = 0

    def poll(self):
        return None

    def wait(self, t=None):
        return 0


class HostApp(App):
    """The user's Flatpak for one scenario: plain, steam-env (Steam's virtual pad allowed, as inside Steam), gamescope (a
    nested 1920x1080 Gamescope session, Steam virtual pad family), shortcut (through the non-Steam shortcut in the user's Steam)."""
    def __init__(self, a, scenario):
        host = a.hostrun.host
        if host.is_running():
            raise RuntimeError("IceFin Player is open. Close it first: a run uses your profile and never takes over a session you are in.")
        themes = os.path.abspath(os.environ.get("ICEFIN_THEME_PATH") or REPO_THEMES)
        self.a, self.host, self.pads, self.scenario = a, host, [], scenario
        flat = ["flatpak", "run", "--user", f"--filesystem={themes}:ro", f"--env=ICEFIN_THEME_PATH={themes}"]
        if scenario in ("steam-env", "gamescope"):
            flat.append("--env=SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=1")
        if scenario == "steam-env":
            flat.append("--env=SDL_GAMECONTROLLER_IGNORE_DEVICES=0x054c/0x0ce6")
        if scenario == "gamescope":
            flat.append("--env=ENABLE_GAMESCOPE_WSI=1")
        tail = [host.APP, f"--remote-debugging-port={a.port}"]
        log = open(os.path.join(a.out, f"app-{scenario}.log"), "w")
        if scenario == "shortcut":
            st = steam_shortcut()
            if not st.get("present"):
                raise Skip("no 'IceFin Player (QA)' shortcut in Steam: close Steam, run scripts/icefin/qa-steam-shortcut.py add --themes <themes dir> --port "
                           f"{a.port}, start Steam")
            if not st.get("steam_running"):
                raise Skip("Steam is not running: start it, then run again")
            if f"ICEFIN_THEME_PATH={themes}" not in st.get("launch_options", "") or f"--remote-debugging-port={a.port}" not in st.get("launch_options", ""):
                raise Skip("the shortcut's launch options don't match this run's themes folder and port: close Steam and run qa-steam-shortcut.py add again")
            subprocess.Popen(["xdg-open", f"steam://rungameid/{st['rungameid']}"], stdout=log, stderr=subprocess.STDOUT)
            self.proc = _Attached()
        else:
            cmd = (["/usr/games/gamescope", "-W", "1920", "-H", "1080", "--"] if scenario == "gamescope" else []) + flat + tail
            if scenario == "gamescope" and not os.path.exists(cmd[0]):
                raise Skip("gamescope not installed at /usr/games/gamescope")
            self.proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        self.log = log
        try:
            self.page = Page(a.port, timeout=180 if scenario == "shortcut" else 120)
            self.page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ctx && !!window.ApiClient && !!window.ApiClient.getCurrentUserId && !!window.ApiClient.getCurrentUserId()", timeout=150)
        except Exception as ex:  # noqa: BLE001
            self.close(leave=False)
            raise Skip(f"IceFin did not come up in the {scenario} scenario: {ex}") from ex
        time.sleep(2)
        self.original = self.page.eval("new Promise(r => window.api.theme.selection(r))") or {}
        print("input_walk: your theme choice (replaced by stock jellyfin-web at the end):", json.dumps(self.original), flush=True)

    def close(self, leave=True):
        """D41: the run ends with IceFin on stock jellyfin-web, not the theme the user had (host.Host.close still restores for other tests)."""
        try:
            if leave:
                self.page.eval("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
                time.sleep(2)
                print("input_walk: IceFin left on stock jellyfin-web (your previous choice was", json.dumps(self.original) + ")", flush=True)
                try:
                    self.page.eval("window.api.system.exit(); true", await_promise=False)
                except Exception:  # noqa: BLE001
                    pass
                for _ in range(20):
                    if not self.host.is_running():
                        break
                    time.sleep(1)
        except Exception as ex:  # noqa: BLE001
            print(f"input_walk: could not leave IceFin on stock: {ex}", flush=True)
        self.unplug()
        if self.proc.pid:
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    self.proc.wait(10)
                    break
                except Exception:  # noqa: BLE001
                    try:
                        os.killpg(self.proc.pid, sig)
                    except OSError:
                        break
        try:
            self.log.close()
        except Exception:  # noqa: BLE001
            pass


class Skip(Exception):
    """A scenario or run that can't happen here: said clearly, never a failure."""


def size_window(page):
    """1920x1080. The app has no window-size option (WindowManager restores saved geometry), so: the window through DevTools
    (Browser.setWindowBounds), and when that isn't there, the page's viewport (Emulation.setDeviceMetricsOverride)."""
    try:
        w = page.send("Browser.getWindowForTarget")["windowId"]
        page.send("Browser.setWindowBounds", windowId=w, bounds={"windowState": "normal", "width": 1920, "height": 1080})
        time.sleep(1)
        if page.eval("innerWidth") >= 1900:
            return "window"
    except Exception:  # noqa: BLE001
        pass
    try:
        page.send("Emulation.setDeviceMetricsOverride", width=1920, height=1080, deviceScaleFactor=1, mobile=False)
        return "viewport emulation"
    except Exception:  # noqa: BLE001
        return "unchanged"


def use_theme(page, theme):
    """The theme for the run; 'stock' is no theme. A theme with a backdrop reloads the page once (8.4)."""
    if theme == "stock":
        page.eval("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(3)
        page.reconnect()
        return
    page.switch_theme_reloading(theme, "!!window.icefinTheme && !!window.icefinTheme.ctx && !!window.icefinPlaybackManager && !!window.ApiClient.getCurrentUserId()")
    page.reconnect()
    time.sleep(2)
    got = page.eval("(window.icefinTheme.active() || {}).id || ''")
    if got != theme:
        raise RuntimeError(f"asked for {theme}, {got or 'no theme'} is active")


def what_is_there(page):
    """What the server has, so 'required' means what it holds: library kinds and item types."""
    libs, types = [], []
    try:
        kinds = page.eval("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.map(v => v.CollectionType || 'mixed'))") or []
        libs = [(t, LIBRARY[t]) for t in dict.fromkeys(kinds) if t in LIBRARY]
        for t in ITEM_TYPES[:7]:
            if page.eval(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {{IncludeItemTypes: '{t}', Recursive: true, Limit: 1}}).then(r => (r.Items || []).length > 0).catch(() => false)"):
                types.append(t)
    except Exception:  # noqa: BLE001
        pass
    return {"libraries": libs, "types": types}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--app", default="~/build-matrix/src/icefin-player", help="lab: the build, or flatpak:<id>")
    ap.add_argument("--host", action="store_true", help="the user's installed Flatpak and profile (read-only on the server)")
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9392)
    ap.add_argument("--themes", default="", help="comma-separated; 'stock' for no theme (default: stock and every bundled theme)")
    ap.add_argument("--inputs", default="pad,keys,mouse")
    ap.add_argument("--family", default="all", choices=["all"] + FAMILIES + ["steam"],
                    help="pad family; all (default) runs the pad input once per family: xbox, dualsense, switchpro, 8bitdo, steam")
    ap.add_argument("--steam", default="shortcut,gamescope", help="host: extra steam-family pad runs: shortcut (through the non-Steam shortcut, "
                    "scripts/icefin/qa-steam-shortcut.py) and/or gamescope (nested 1920x1080 Gamescope); empty for none")
    ap.add_argument("--budget-min", type=float, default=25, help="per theme and input (per pad family)")
    ap.add_argument("--play-seconds", type=float, default=5, help="how long the player plays before Back")
    ap.add_argument("--mode", default="tv", choices=["tv", "desktop"], help="lab: the app's window mode")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    a.out = os.path.abspath(os.path.expanduser(a.out))
    os.makedirs(a.out, exist_ok=True)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    inputs = [i for i in a.inputs.split(",") if i in ("pad", "keys", "mouse")]
    root = os.environ.get("ICEFIN_THEME_PATH") if a.host and os.environ.get("ICEFIN_THEME_PATH") else REPO_THEMES
    themes = ["stock"] + [d for d in sorted(os.listdir(root)) if os.path.exists(os.path.join(root, d, "theme.json"))]
    if a.themes:
        themes = [t for t in themes if t in a.themes.split(",")]
    if a.host and "stock" not in themes:
        themes.insert(0, "stock")        # D41: every host walk on a theme is paired with the same walk on stock jellyfin-web
    families = FAMILIES + ["steam"] if a.family == "all" else [a.family]
    # scenarios: (name, pad families, inputs). One app per scenario; steam families need their own launch.
    scenarios = [("plain", [f for f in families if f != "steam"], inputs)]
    if "steam" in families and "pad" in inputs:
        scenarios.append(("steam-env", ["steam"], ["pad"]))
        if a.host:
            scenarios += [(s, ["steam"], ["pad"]) for s in a.steam.split(",") if s in ("gamescope", "shortcut")]
    summary = [f"# input_walk {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} ({'host' if a.host else 'lab'}, budget {a.budget_min} min per theme and run)", ""]
    fails, all_reps, sized = 0, {}, [False]
    a.hostrun = HostRun(a) if a.host else None

    def write_theme(theme):
        tdir = os.path.join(a.out, theme)
        m = merge(theme, all_reps[theme])
        if theme != "stock" and "stock" in all_reps:
            mark_control(m, merge("stock", all_reps["stock"]))
        json.dump(m, open(os.path.join(tdir, "report.json"), "w"), indent=1)
        open(os.path.join(tdir, "report.md"), "w").write(markdown(m, all_reps[theme]))
        return m

    try:
        for scenario, fams, scen_inputs in scenarios:
            if scenario != "plain" and any(f == "steam" for f in fams) and not any(i == "pad" for i in scen_inputs):
                continue
            try:
                app = HostApp(a, scenario) if a.host else LabApp(a, steam=scenario == "steam-env")
            except Skip as s:
                summary.append(f"- scenario {scenario} skipped: {s}")
                print(f"input_walk: scenario {scenario} skipped: {s}", flush=True)
                continue
            except Exception as ex:  # noqa: BLE001
                fails += 1
                summary.append(f"- scenario {scenario} failed to start: {type(ex).__name__}: {ex}"[:300])
                print("input_walk:", summary[-1], flush=True)
                continue
            try:
                for theme in themes:
                    tdir = os.path.join(a.out, theme)
                    os.makedirs(tdir, exist_ok=True)
                    reps = all_reps.setdefault(theme, {})
                    try:
                        app.use_theme(theme)
                        page = app.page
                        if a.host:
                            how = size_window(page)
                            if not sized[0]:
                                print(f"input_walk: window 1920x1080 by {how}", flush=True)
                                summary.append(f"- window size 1920x1080: {how}")
                                sized[0] = True
                        present = what_is_there(page)
                        runs = []
                        for inp in scen_inputs:
                            if inp != "pad":
                                runs.append((inp, inp, ""))
                            else:
                                for fam in fams:
                                    runs.append((f"pad-{fam}" + ("" if scenario in ("plain", "steam-env") else f"-{scenario}"), "pad", fam))
                        for label, inp, family in runs:
                            pad = None
                            if inp == "pad":
                                plug_as = "dualsense" if scenario == "shortcut" else family
                                why = pad_missing("xbox" if scenario == "gamescope" else plug_as)
                                if why:
                                    msg = f"{theme}: {label} skipped: {why}"
                                    print("input_walk:", msg, flush=True)
                                    summary.append(f"- {msg}")
                                    continue
                                app.phys = scenario != "gamescope"
                                pad = app.plug(plug_as)
                                try:
                                    page.wait_for("new Promise(r => window.api.gamepads.list(l => r(l.length >= 1)))", timeout=20)
                                except Exception:  # noqa: BLE001
                                    msg = f"{theme}: {label}: the app lists no pad (Steam Input off for the shortcut, or no access to the device); skipped"
                                    print("input_walk:", msg, flush=True)
                                    summary.append(f"- {msg}")
                                    app.unplug()
                                    continue
                            idir = os.path.join(tdir, label)
                            page.eval("location.hash = '#/home'; true")
                            time.sleep(4)
                            try:
                                page.send("Emulation.setFocusEmulationEnabled", enabled=True)
                            except Exception:  # noqa: BLE001
                                pass
                            drv = {"pad": lambda: PadDriver(page, None, pad), "keys": lambda: KeysDriver(page, None), "mouse": lambda: MouseDriver(page, None)}[inp]()
                            print(f"input_walk: {theme} / {label} for up to {a.budget_min} min", flush=True)
                            w = Walker(a, page, drv, theme, family, idir, time.time() + a.budget_min * 60, present)
                            w.label = label
                            try:
                                rep = w.run()
                            except Exception as ex:  # noqa: BLE001
                                rep = {"theme": theme, "input": inp, "label": label, "family": family, "screens": w.screens, "findings": w.findings + [
                                    {"severity": "high", "kind": "walk-error", "screen": "", "element": "", "detail": f"{type(ex).__name__}: {ex}"[:300]}],
                                    "required_missing": [], "queue_left": len(w.queue)}
                            reps[label] = rep
                            json.dump(rep, open(os.path.join(idir, "report.json"), "w"), indent=1)
                            app.unplug()
                            try:
                                page.reconnect()
                            except Exception:  # noqa: BLE001
                                pass
                            write_theme(theme)
                    except Exception as ex:  # noqa: BLE001
                        fails += 1
                        summary.append(f"- {theme} ({scenario}): the run failed: {type(ex).__name__}: {ex}"[:300])
                        print("input_walk:", summary[-1], flush=True)
                    if reps:
                        m = write_theme(theme)
                        high = sum(1 for f in m["findings"] if f["severity"] == "high" and not f.get("also_in_control"))
                        summary.append(f"- {theme} ({scenario}): {len(m['findings'])} findings, {high} high not in the control; runs {', '.join(m['runs'])}: {tdir}/report.md")
                    open(os.path.join(a.out, "summary.md"), "w").write("\n".join(summary) + "\n")
            finally:
                app.close()
    finally:
        if a.hostrun:
            a.hostrun.close()
        open(os.path.join(a.out, "summary.md"), "w").write("\n".join(summary) + "\n")
    print("input_walk: done ->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
