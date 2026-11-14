#!/usr/bin/env python3
"""theme_walk.py — the theme pipeline's walk (PLAN 9.45, docs/themes/PIPELINE.md). Host only (host.py).

On the user's workstation (their installed Icefin Player, updated from the test repository first, their profile and
server; their theme choice put back at the end), with one theme on, visits every screen, dialog and player state in screens.json and records what draws each one:
  theme      the theme itself (a registered screen, its overlay, its own player controls);
  framed     jellyfin-web's page inside the theme's frame (ui.stockChrome);
  restyled   jellyfin-web's own dialog or player controls, in the theme's tokens only (9.38, ui.osd);
  stock      jellyfin-web as it is;
  dashboard  the server dashboard, the one place a theme stays out of (D30);
  missing    the walk couldn't open it (a selector or label not found: a finding too).
Every entry whose target is 'theme' and whose state isn't is a gap. Each drawn entry also runs the checks every theme
owes everywhere: something has focus, nothing focusable runs past the window's sides, no script errors.
Writes coverage.json, one screenshot per entry (the page, through DevTools; with --screen also what the screen shows,
Icefin's window only) and index.html (a contact sheet) to --out. Usually run by scripts/icefin/theme-pass.sh walk.
Usage: python3 theme_walk.py --theme tide --themes <worktree>/themes --out <worktree>/build-walk/tide/<stamp>
"""
import argparse, datetime, html, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from host import Host, Lock, update  # noqa: E402

ERRS = r"""(() => { if (!window.__walkErr) { window.__walkErr = [];
  addEventListener('error', (e) => window.__walkErr.push('error: ' + (e.message || e.type)));
  addEventListener('unhandledrejection', (e) => window.__walkErr.push('rejection: ' + String((e.reason && e.reason.message) || e.reason).slice(0, 200)));
  const ce = console.error.bind(console);
  console.error = (...a) => { try { window.__walkErr.push('console: ' + a.map(String).join(' ').slice(0, 200)); } catch (x) {} ce(...a); }; }
  return window.__walkErr.splice(0); })()"""

CLASSIFY = r"""(() => {
  const vis = (e) => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const h = document.documentElement, T = window.icefinTheme;
  const root = document.getElementById('icefin-theme-root'), chrome = document.getElementById('icefin-stock-chrome');
  const dialogs = [...document.querySelectorAll('.dialogContainer .dialog, .actionSheet, .MuiDialog-root, .MuiPopover-root, .MuiMenu-root')].filter(vis);
  const f = T && T.ctx && T.ctx.focused ? T.ctx.focused() : null;
  const a = document.activeElement;
  return JSON.stringify({
    hash: location.hash,
    screen: vis(root) && root.childElementCount > 0,
    // the engine's overlay, or the details screen's own pickers (version, audio, subtitles), which open in the screen
    overlay: !!document.getElementById('icefin-theme-overlay') || (!!root && [...root.querySelectorAll('.icefin-d-picker')].some(vis)),
    dialogs: dialogs.map((d) => (d.className || '').toString().trim().split(/\s+/).slice(0, 2).join('.')),
    framed: vis(chrome) && chrome.childElementCount > 0,
    stock: h.getAttribute('data-icefin-stock'),
    dash: h.hasAttribute('data-icefin-dashboard'),
    video: /^#\/video\b/.test(location.hash),
    osd: h.getAttribute('data-icefin-osd'),
    nowBar: vis(document.querySelector('.nowPlayingBar')),
    playerNative: !!(root && root.hasAttribute('data-icefin-player') && vis(root)),
    fellBack: vis(document.getElementById('icefin-player-notice')),
    focus: !!f || !!(a && a !== document.body && a !== h),
    title: ((document.querySelector('.pageTitle') || {}).textContent || '').trim().slice(0, 60),
    theme: T && T.active && T.active() ? T.active().id : null
  }); })()"""

EDGES = r"""(() => { const W = innerWidth, out = [];
  const boxes = ['icefin-theme-root', 'icefin-stock-chrome', 'icefin-theme-overlay'].map((i) => document.getElementById(i)).filter(Boolean);
  for (const b of boxes) for (const e of b.querySelectorAll('[data-icefin-focus], button, a[href], input, select')) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') continue;
    if (r.right <= W + 1 && r.left >= -1) continue;
    let p = e.parentElement, ok = false;  // a row that scrolls sideways may run past: its scroller is what has to fit
    while (p && p !== b.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') { const q = p.getBoundingClientRect(); if (q.right <= W + 1 && q.left >= -1) { ok = true; break; } } p = p.parentElement; }
    if (!ok) out.push(((e.className || '').toString().split(' ')[0] || e.tagName) + ':' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24));
  }
  return out.slice(0, 8); })()"""

# Opens something on the current page: the theme's own control by its text first (theme root, frame, overlay), then
# jellyfin-web's by selector. Returns how it opened, or ''.
FIND = r"""((re, sel, eng) => {
  const rx = re ? new RegExp(re, 'i') : null;
  const shown = (x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden';
  const text = (e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.textContent || '')).replace(/\s+/g, ' ').trim();
  const areas = ['icefin-theme-overlay', 'icefin-theme-root', 'icefin-stock-chrome'].map((i) => document.getElementById(i)).filter(Boolean);
  if (eng) for (const b of areas) { const e = [...b.querySelectorAll(eng)].find(shown); if (e) { e.click(); return 'theme:' + eng; } }
  if (rx) for (const b of areas) {
    const e = [...b.querySelectorAll('[data-icefin-focus], button, a')].find((x) => shown(x) && rx.test(text(x)));
    if (e) { e.click(); return 'theme:' + text(e).slice(0, 30); }
  }
  if (sel) { const e = [...document.querySelectorAll(sel)].find((x) => !x.closest('#icefin-theme-root')) || document.querySelector(sel); if (e) { e.click(); return 'jellyfin-web:' + sel; } }
  return ''; })"""

MORE_TEXT, MORE_ENGINE = r"^(more|more options|⋯|…)$|\bmore options\b", '[data-action="more"]'

# A screen is ready when the theme's screen has something to focus, or jellyfin-web's page is up.
READY = r"""(() => { const r = document.getElementById('icefin-theme-root');
  if (r && !r.hidden && r.querySelector('[data-icefin-focus]')) return !r.querySelector('[aria-busy="true"], .icefin-loading') || r.hasAttribute('data-icefin-details-complete');
  return !!document.querySelector('.page:not(.hide), .mainAnimatedPage:not(.hide)') || document.documentElement.hasAttribute('data-icefin-dashboard'); })()"""

# The item menu's entry: jellyfin-web's action sheet by data-id, or the theme's overlay by its label.
MENU_ENTRY = r"""((id, re) => {
  const s = [...document.querySelectorAll('.actionSheet')].find((x) => x.getClientRects().length);
  if (s) { const e = s.querySelector(`[data-id="${id}"]`); if (e) { e.click(); return 'jellyfin-web:' + id; } return ''; }
  const o = document.getElementById('icefin-theme-overlay');
  if (o && re) { const rx = new RegExp(re, 'i'); const e = [...o.querySelectorAll('[data-icefin-focus], button, a')].find((x) => rx.test(x.textContent || x.getAttribute('aria-label') || '')); if (e) { e.click(); return 'theme:' + (e.textContent || '').trim().slice(0, 30); } }
  return ''; })"""

MENU_ENTRIES = r"""(() => { const s = [...document.querySelectorAll('.actionSheet')].find((x) => x.getClientRects().length);
  if (s) return [...s.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id'));
  const o = document.getElementById('icefin-theme-overlay');
  return o ? [...o.querySelectorAll('[data-icefin-focus], button')].map((e) => (e.textContent || '').trim().slice(0, 30)).filter(Boolean) : []; })()"""


def state_of(c, kind):
    """What draws it, from CLASSIFY's facts."""
    if kind == "dialog":
        if c["overlay"]:
            return "theme"
        if c["dialogs"]:
            return "restyled" if c["theme"] else "stock"
        return None  # nothing opened
    if kind == "player":
        if c["fellBack"]:
            return "restyled"  # the theme's controls fell back to jellyfin-web's for this session (9.45)
        if c["playerNative"] or c["screen"] or c["overlay"]:
            return "theme"
        if c["dialogs"]:
            return "restyled"
        return "restyled" if c["osd"] else "stock"
    if c["dash"]:
        return "dashboard"
    if c["screen"]:
        return "theme"
    if c["framed"]:
        return "framed"
    return "stock"


def main():
    ap = argparse.ArgumentParser()
    tree = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
    ap.add_argument("--theme", required=True)
    ap.add_argument("--themes", default=os.path.join(tree, "themes"), help="the theme folder to run (a worktree's themes/)")
    ap.add_argument("--port", type=int, default=9391)
    ap.add_argument("--only", default="", help="comma-separated entry ids or groups (default: all)")
    ap.add_argument("--screen", action="store_true", help="also capture what the screen shows (Icefin's window only)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    inv = json.load(open(os.path.join(HERE, "screens.json")))
    only = {x.strip() for x in a.only.split(",") if x.strip()}
    want = lambda e: not only or e["id"] in only or e["group"] in only
    entries, n = [], [0]
    run = {"theme": a.theme, "where": "host", "started": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "commit": subprocess.run(["git", "-C", os.path.dirname(os.path.abspath(a.themes)), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip(),
           "branch": subprocess.run(["git", "-C", os.path.dirname(os.path.abspath(a.themes)), "branch", "--show-current"], capture_output=True, text=True).stdout.strip()}
    lock = Lock()
    lock.__enter__()
    host = None
    try:
        run["player"] = update()  # the user: check for updates to the player before each walk
        host = Host(a.themes, a.port, os.path.join(a.out, "app.log"))
        page, js = host.page, host.page.eval
        t = host.use_theme(a.theme)
        run["version"] = t["version"]
        run["window"] = [js("innerWidth"), js("innerHeight"), js("devicePixelRatio")]
        js(ERRS)

        # ---- placeholders from the lab server's library ----
        v = {"sid": js("window.ApiClient.serverId()"), "user": js("window.ApiClient.getCurrentUserId()")}
        for vid, ct in js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.map(v => [v.Id, v.CollectionType || 'mixed']))"):
            v.setdefault("view:" + ct, vid)
        types = sorted({m for e in inv["screens"] for m in re.findall(r"\{item:(\w+)\}", e["hash"])} | {"Movie", "Audio"})
        for t in types:
            v["item:" + t] = js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {{IncludeItemTypes: '{t}', Recursive: true, Limit: 1}}).then(r => r.Items[0] ? r.Items[0].Id : null)")
        uid = "window.ApiClient.getCurrentUserId()"
        for k, expr in {"person": f"window.ApiClient.getPeople({uid}, {{Limit: 1}})", "genre": f"window.ApiClient.getGenres({uid}, {{Limit: 1, Recursive: true}})",
                        "musicgenre": f"window.ApiClient.getMusicGenres({uid}, {{Limit: 1, Recursive: true}})", "studio": f"window.ApiClient.getStudios({uid}, {{Limit: 1, Recursive: true}})",
                        "artist": f"window.ApiClient.getAlbumArtists({uid}, {{Limit: 1, Recursive: true}})", "channel": f"window.ApiClient.getLiveTvChannels({{userId: {uid}, Limit: 1}})"}.items():
            try:
                v[k] = js(f"{expr}.then(r => r.Items && r.Items[0] ? r.Items[0].Id : null).catch(() => null)")
            except Exception:  # noqa: BLE001
                v[k] = None

        def fill(s):
            missing = [m for m in re.findall(r"\{([\w:]+)\}", s) if not v.get(m)]
            return (None, missing) if missing else (re.sub(r"\{([\w:]+)\}", lambda m: str(v[m.group(1)]), s), [])

        def shot(name):
            if not host.capture_page(os.path.join(a.out, f"{name}.png")):
                print(f"theme_walk: note {name}: no picture (no frame came: is Icefin's window covered or minimised?)", flush=True)
            if a.screen:
                host.capture_screen(os.path.join(a.out, f"{name}-screen.png"))

        def back():
            try:
                js("window.icefinTheme.handleAction('back'); true")
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.8)

        def close_all():
            for _ in range(3):
                if not js("!!document.getElementById('icefin-theme-overlay') || [...document.querySelectorAll('.dialogContainer .dialog, .actionSheet')].some(x => x.getClientRects().length)"):
                    return
                back()

        def go(h):
            close_all()
            js(f"location.hash = {json.dumps(h)}; true")
            time.sleep(0.8)
            try:
                page.wait_for(READY, timeout=12, interval=0.4)
            except TimeoutError:
                pass
            time.sleep(1.2)

        def record(e, kind, opened=None, note=""):
            n[0] += 1
            c = json.loads(js(CLASSIFY))
            st = state_of(c, kind)
            if st is None:
                st, note = "missing", note or "nothing opened"
            if opened == "":
                st, note = "missing", note or "no control found to open it"
            if kind == "player" and c["fellBack"]:
                note = note or "the theme's player controls fell back to jellyfin-web's"
            target = e.get("target", "theme")
            checks = []
            if st not in ("dashboard", "missing"):
                checks.append({"name": "focus", "ok": bool(c["focus"]), "detail": "" if c["focus"] else "nothing has focus: a controller can't start"})
                off = js(EDGES)
                checks.append({"name": "edges", "ok": not off, "detail": ", ".join(off)})
            errs = js(ERRS)  # may come from the server or its plugins, not the theme: a warning to read, not a failure
            warnings = [" | ".join(errs[:4])] if errs else []
            name = f"{n[0]:02d}-{e['id']}"
            if st != "missing" or kind != "screen":
                shot(name)
            gap = target == "theme" and st != "theme" or target == "dashboard" and st != "dashboard"
            ent = {"id": e["id"], "group": e["group"], "name": e["name"], "kind": kind, "target": target, "state": st, "gap": gap,
                   "opened": opened or "", "hash": c["hash"], "title": c["title"], "dialogs": c["dialogs"], "osd": c["osd"],
                   "checks": checks, "warnings": warnings, "shot": f"{name}.png", "note": note}
            entries.append(ent)
            bad = [x["name"] for x in checks if not x["ok"]]
            print(f"theme_walk: {st:9} {'GAP ' if gap else 'ok  '} {e['id']}{'  checks: ' + ','.join(bad) if bad else ''}{'  (' + note + ')' if note else ''}", flush=True)
            return ent

        def skip(e, kind, why):
            entries.append({"id": e["id"], "group": e["group"], "name": e["name"], "kind": kind, "target": e.get("target", "theme"), "state": "skipped",
                            "gap": False, "note": why, "checks": [], "shot": ""})
            print(f"theme_walk: skipped        {e['id']}  ({why})", flush=True)

        screens = {e["id"]: e for e in inv["screens"]}
        # ---- screens (music ones after something plays) ----
        for e in inv["screens"]:
            if e.get("needs") or not want(e):
                continue
            h, miss = fill(e["hash"])
            if not h:
                skip(e, "screen", "nothing in your library for " + ", ".join(miss))
                continue
            go(h)
            record(e, "screen")

        # ---- dialogs ----
        for e in inv["dialogs"]:
            if not want(e):
                continue
            h, miss = fill(screens[e["from"]]["hash"])
            if not h:
                skip(e, "dialog", "nothing in your library for " + ", ".join(miss))
                continue
            go(h)
            if e["open"] in ("more", "menu"):
                how = js(f"{FIND}({json.dumps(MORE_TEXT)}, '', {json.dumps(MORE_ENGINE)})")
                if not how:  # what the engine's details screen does for More options
                    js(f"location.hash = {json.dumps(h + '&icefin=stock&icefinmore=1')}; true")
                    how = "jellyfin-web:icefinmore"
                time.sleep(2.2)
                if e["open"] == "more":
                    ent = record(e, "dialog", how)
                    ent["entries"] = js(MENU_ENTRIES)
                    continue
                how = js(f"{MENU_ENTRY}({json.dumps(e['menuId'])}, {json.dumps(e.get('label', ''))})")
                time.sleep(2.2)
                record(e, "dialog", how, "" if how else f"the item menu has no '{e['menuId']}' entry")
            else:
                how = js(f"{FIND}({json.dumps(e.get('text', ''))}, {json.dumps(e.get('selector', ''))}, {json.dumps(e.get('engine', ''))})")
                time.sleep(1.8)
                record(e, "dialog", how)
            close_all()

        # ---- music: the bar on the home, now playing, lyrics ----
        music = [e for e in inv["screens"] if e.get("needs") == "music" and want(e)]
        if music:
            if v.get("item:Audio"):
                js(f"window.icefinTheme.ctx.play({{ids: ['{v['item:Audio']}'], serverId: '{v['sid']}'}}); true")
                try:
                    page.wait_for("window.icefinPlaybackManager.currentTime() > 500", timeout=30)
                except TimeoutError:
                    pass
                for e in music:
                    go(fill(e["hash"])[0])
                    ent = record(e, "screen")
                    if e["id"] == "music-capsule" and ent["state"] == "theme" and json.loads(js(CLASSIFY))["nowBar"]:
                        ent.update(state="stock", gap=True, note="jellyfin-web's now playing bar shows over the theme's home")
                js("window.icefinPlaybackManager.stop(); true")
                time.sleep(1.5)
            else:
                for e in music:
                    skip(e, "screen", "nothing in your library for item:Audio")

        # ---- player ----
        player = [e for e in inv["player"] if want(e)]
        if player and v.get("item:Movie"):
            js(f"window.icefinTheme.ctx.play({{ids: ['{v['item:Movie']}'], serverId: '{v['sid']}'}}); true")
            page.wait_for("location.hash.startsWith('#/video') && window.icefinPlaybackManager.currentTime() > 500", timeout=45)
            time.sleep(1)
            W, H = run["window"][:2]
            for e in player:
                for x in (W // 2, W // 2 + 40):  # a pointer move brings the controls up
                    page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=H // 2)
                    time.sleep(0.3)
                time.sleep(0.8)
                if e["open"] == "osd":
                    record(e, "player", "pointer")
                else:
                    how = js(f"{FIND}({json.dumps(e.get('text', ''))}, {json.dumps(e.get('selector', ''))}, {json.dumps(e.get('engine', ''))})")
                    time.sleep(1.5)
                    record(e, "player", how)
                    close_all()
            js("window.icefinPlaybackManager.stop(); true")
            time.sleep(1)
        elif player:
            for e in player:
                skip(e, "player", "nothing in your library for item:Movie")
    except Exception as ex:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        run["error"] = f"{type(ex).__name__}: {ex}"
        if host and host.crashed() is not None:
            # Icefin itself went away: a finding about the app, not the theme; what was walked so far is kept
            run["error"] = f"Icefin exited mid-walk (code {host.crashed()}) after '{entries[-1]['id'] if entries else 'start'}'; see app.log"
            run["crash"] = True
    finally:
        if host:
            host.close()
        lock.__exit__()

    run["finished"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    gaps = [e for e in entries if e["gap"]]
    failing = [e for e in entries if any(not c["ok"] for c in e["checks"])]
    run["summary"] = {"entries": len(entries), "theme": sum(e["state"] == "theme" for e in entries), "gaps": len(gaps),
                      "checksFailing": len(failing), "skipped": sum(e["state"] == "skipped" for e in entries)}
    json.dump({"run": run, "entries": entries}, open(os.path.join(a.out, "coverage.json"), "w"), indent=1)
    write_sheet(a.out, run, entries)
    print(f"theme_walk: {a.theme}: {run['summary']['theme']}/{len(entries)} drawn by the theme, {len(gaps)} gaps, "
          f"{len(failing)} with failing checks{', ERROR ' + run['error'] if run.get('error') else ''} -> {a.out}")
    return 1 if run.get("error") else 0


def write_sheet(out, run, entries):
    """index.html: every screenshot with its state, gaps first, for the mock-up stage and the user's review."""
    colour = {"theme": "#1f7a44", "framed": "#9a6b00", "restyled": "#a3501c", "stock": "#b3261e", "dashboard": "#555", "missing": "#6b3fa0", "skipped": "#777"}
    cards = []
    for e in sorted(entries, key=lambda e: (not e["gap"], e["group"], e["id"])):
        bad = [f"{c['name']}: {html.escape(c['detail'])}" for c in e["checks"] if not c["ok"]]
        img = f'<img loading="lazy" src="{html.escape(e["shot"])}" alt="{html.escape(e["name"])}">' if e.get("shot") else '<div class="none">no screenshot</div>'
        cards.append(f'<figure class="{"gap" if e["gap"] else ""}">{img}<figcaption><b style="background:{colour.get(e["state"], "#333")}">{e["state"]}</b> '
                     f'{html.escape(e["group"])} · {html.escape(e["name"])}<br><code>{html.escape(e["id"])}</code>'
                     f'{"<br>" + html.escape(e["note"]) if e.get("note") else ""}{"".join("<br><i>" + b + "</i>" for b in bad)}</figcaption></figure>')
    s = run.get("summary", {})
    open(os.path.join(out, "index.html"), "w").write(f"""<!doctype html><meta charset="utf-8"><title>{html.escape(run['theme'])} walk</title>
<style>body{{margin:16px;font:14px system-ui,sans-serif;background:#111;color:#eee}}main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}}
figure{{margin:0;background:#1c1c1c;border:2px solid #2a2a2a;border-radius:8px;overflow:hidden}}figure.gap{{border-color:#b3261e}}img{{width:100%;display:block}}
figcaption{{padding:8px 10px;line-height:1.5}}b{{color:#fff;padding:1px 6px;border-radius:4px}}code{{color:#9ab}}i{{color:#f99}}.none{{padding:40px;text-align:center;color:#888}}</style>
<h1>{html.escape(run['theme'])} {html.escape(run.get('version', ''))} · walk {html.escape(run.get('started', ''))} · {html.escape(run.get('commit', ''))}</h1>
<p>{s.get('theme', 0)}/{s.get('entries', 0)} drawn by the theme · {s.get('gaps', 0)} gaps · {s.get('checksFailing', 0)} with failing checks · {s.get('skipped', 0)} skipped</p>
<main>{''.join(cards)}</main>""")


if __name__ == "__main__":
    sys.exit(main())
