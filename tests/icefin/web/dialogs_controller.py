#!/usr/bin/env python3
"""dialogs_controller.py — jellyfin-web's dialogs and menus with a controller, in every theme (PLAN 9.38). Lab only.

Actions go down the controller path (inputPlugin.js: the theme engine first, then jellyfin-web's inputManager), as a
pad or remote sends them. In every theme:
  - the item menu ("More options" on the details screen, an action sheet) opens over the themed screen;
  - Down moves focus inside the menu, not on the screen behind it; the focused item is filled with the theme's focus
    colour; Back closes the menu;
  - the menu sits on the theme's raised surface with its corner radius.
Then once over video: the audio-track menu takes Down and Back the same way. A themed details screen's More options
opens jellyfin-web's item menu over its own details page; the first press puts focus in a menu that has none.
Usage: python3 dialogs_controller.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rdlg
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

PAD = r"""(a => { const remap = {enter: 'select'}; if (window.icefinTheme && window.icefinTheme.handleAction(a)) return 'theme';
  window.icefinInputManager.handleCommand(remap[a] || a, {}); return 'jellyfin-web'; })"""
SHEET = r"""(() => { const d = [...document.querySelectorAll('.dialogContainer .dialog')].find(x => x.getClientRects().length && !x.closest('#icefin-theme-root'));
  if (!d) return null; const a = document.activeElement; const cs = getComputedStyle(d); const fs = a && d.contains(a) ? getComputedStyle(a) : null;
  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const n = [...document.querySelectorAll('.dialogContainer .dialog')].filter(x => x.getClientRects().length).length;
  return JSON.stringify({n, active: a ? a.tagName + '.' + (a.className || '').toString().split(' ').slice(0, 2).join('.') : '', inside: !!(a && d.contains(a)), text: a ? (a.textContent || '').trim().slice(0, 30) : '', focusBg: fs ? fs.backgroundColor : '',
    surface: cs.backgroundColor, radius: cs.borderTopLeftRadius, tokFocus: tok('--icefin-color-focus'), tokRadius: tok('--icefin-shape-cardRadius')}); })()"""


def rgb(hexstr):
    h = hexstr.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) if len(h) >= 6 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9261)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-dlg-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"dialogs_controller: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinInputManager", timeout=90)
        js = page.eval
        pad = lambda x: js(f"{PAD}({json.dumps(x)})")
        sheet = lambda: (lambda r: json.loads(r) if r else None)(js(SHEET))
        movie = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Movie', Recursive: true, Limit: 1}).then(r => r.Items[0].Id)")
        themes = [t["id"] for t in js("new Promise(r => window.api.theme.themes(r))") if t.get("ok") and t.get("source") == "bundled"]
        for tid in themes:
            js(f"new Promise(r => window.api.theme.setActiveTheme('{tid}', '', r))")
            time.sleep(2)
            js(f"location.hash = '#/details?id={movie}&serverId=' + window.ApiClient.serverId(); true")
            themed = tid != "baseline"
            try:
                page.wait_for("!!document.querySelector('#icefin-theme-root[data-icefin-details-ready]')" if themed
                              else "!!document.querySelector('.detailPagePrimaryContainer .btnMoreCommands, .btnMoreCommands')", timeout=30)
            except Exception:  # noqa: BLE001
                check(f"{tid}: details screen", False, js("location.hash"))
                continue
            time.sleep(1.2)
            opened = js("(() => { const b = [...document.querySelectorAll('#icefin-theme-root .icefin-d-btn')].find(b => /More options/i.test(b.textContent)) "
                        "|| [...document.querySelectorAll('.btnMoreCommands')].find(b => b.getClientRects().length); if (!b) return false; b.click(); return true; })()")
            try:
                page.wait_for("[...document.querySelectorAll('.dialogContainer .dialog')].some(x => x.getClientRects().length && !x.closest('#icefin-theme-root'))", timeout=25)
            except Exception:  # noqa: BLE001
                check(f"{tid}: More options opens the item menu", False, f"button={opened}")
                continue
            time.sleep(0.8)
            s0 = sheet()
            r1 = pad("down")
            time.sleep(0.25)
            s1 = sheet()
            pad("down")
            time.sleep(0.25)
            s2 = sheet()
            moved = s1 and s2 and s1["inside"] and s2["inside"] and s1["text"] != s2["text"]
            check(f"{tid}: More options opens jellyfin-web's item menu, and Down moves focus inside it", bool(moved), f"{r1}; {s0 and s0['text']} -> {s1 and s1['text']} -> {s2 and s2['text']}; dialogs {s1 and s1['n']}, active {s1 and s1['active']}")
            tf = rgb(s2["tokFocus"]) if s2 else None
            fb = s2["focusBg"] if s2 else ""
            filled = bool(tf) and fb.replace(" ", "").startswith(f"rgb({tf[0]},{tf[1]},{tf[2]}")
            check(f"{tid}: the focused item is filled with the theme's focus colour", filled, f"{fb} vs {s2 and s2['tokFocus']}")
            check(f"{tid}: the menu sits on the theme's surface with its radius", bool(s2) and s2["radius"] not in ("", "0px") and "0, 0, 0, 0" not in s2["surface"],
                  f"{s2 and s2['surface']} radius {s2 and s2['radius']}")
            open(os.path.join(a.out, f"{tid}-menu.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
            pad("back")
            time.sleep(0.8)
            check(f"{tid}: Back closes the item menu", sheet() is None and "details" in js("location.hash"), js("location.hash"))
        # Over video: the audio track menu.
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        time.sleep(1.5)
        js(f"window.icefinPlaybackManager.play({{ids: ['{movie}'], serverId: window.ApiClient.serverId()}}); true")
        page.wait_for("location.hash.startsWith('#/video') && window.icefinPlaybackManager.currentTime() > 1000", timeout=45)
        js("window.icefinPlaybackManager.pause(); true")
        for i in range(3):
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=400 + i * 50, y=300)
            time.sleep(0.15)
        time.sleep(0.6)
        has = js("(() => { const b = [...document.querySelectorAll('#videoOsdPage .btnAudio, #videoOsdPage .btnVideoOsdSettings')].find(b => b.getClientRects().length); if (!b) return false; b.click(); return true; })()")
        time.sleep(1.0)
        s1 = sheet()
        pad("down")
        time.sleep(0.25)
        s2 = sheet()
        check("over video: a player menu opens and Down moves inside it", bool(has and s1 and s2 and s2["inside"]), f"{s1 and s1['text']} -> {s2 and s2['text']}")
        pad("back")
        time.sleep(0.6)
        check("over video: Back closes the menu and leaves the video playing", sheet() is None and js("location.hash").startswith("#/video"), js("location.hash"))
        js("window.icefinPlaybackManager.stop(); true")
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
    print("dialogs_controller:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
