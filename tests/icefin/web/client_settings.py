#!/usr/bin/env python3
"""client_settings.py — the Client Settings dialog's arrangement and drop-downs (PLAN 9.22). Lab guests only.

Signed in with a theme on and its themed home up (as in the user's report), Client Settings shows:
  - sections in order: Main, Theme, Controllers, Subtitles, [Video tests | Video], [Audio test | Audio], Other,
    (Saved Server), then the Close button; the two rows side by side;
  - Web GPU Buffers, Renderer and HDR Output leading Video, Nintendo Button Layout in Controllers, none left in Main,
    and no duplicates after nativeshell re-renders a section;
  - Icefin's Hardware section titled "Video tests";
  - every select as an in-page drop-down whose list is on top of the dialog and visible (user report: it rendered
    behind the dialog), and a pick saves the setting.
Usage: python3 client_settings.py --app ~/build-mpv/src/icefin-player --server jf12
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

ORDER = ["main", "theme", "controllers", "subtitles", "row:video tests|video", "row:audio test|audio", "other"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9277)
    ap.add_argument("--out", help="also save screenshots of the dialog")
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-cs-")
    app = launch(a.app, a.port, cfgdir, open(os.path.join(cfgdir, "app.log"), "w"), "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"client_settings: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.NativeShell && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        # A theme without a backdrop (no reload), its themed home up.
        js("new Promise(r => window.api.theme.select('mosaic', '', '', r))")
        page.wait_for("!!window.icefinTheme.active() && window.icefinTheme.active().id === 'mosaic'", timeout=20)
        js("location.hash = '#/home'; true")
        page.wait_for("(() => { const r = document.querySelector('#icefin-theme-root'); return !!r && !r.hidden; })()", timeout=30)
        time.sleep(1.5)
        js("window.NativeShell.openClientSettings(); true")
        page.wait_for("!!document.querySelector('.formDialog.icefin-cs') && !!document.querySelector('#icefin-cs-video')", timeout=20)
        time.sleep(1)
        C = "document.querySelector('.formDialog.icefin-cs .formDialogContent')"
        order = js(f"""JSON.stringify([...{C}.children].map(c => c.classList.contains('icefin-cs-row') ? 'row:' + [...c.children].map(f => f.querySelector(':scope > legend h2').textContent.trim().toLowerCase()).join('|')
            : c.tagName === 'FIELDSET' ? (c.querySelector(':scope > legend h2') || {{}}).textContent.trim().toLowerCase() : 'close'))""")
        order = json.loads(order)
        check("sections in the new order, Close last", [x for x in order if x not in ("saved server",)] == ORDER + ["close"], json.dumps(order))
        side = json.loads(js("JSON.stringify([...document.querySelectorAll('.icefin-cs-row')].map(r => { const [a, b] = [...r.children].map(x => x.getBoundingClientRect()); return [Math.round(a.left), Math.round(b.left), Math.round(a.top - b.top)]; }))"))
        if a.out:
            import base64  # noqa: E402
            os.makedirs(a.out, exist_ok=True)
            for n, sel in (("top", ".formDialogContent"), ("rows", "#icefin-cs-video")):
                js(f"document.querySelector('{sel}').scrollIntoView({{block: 'start'}}); true")
                time.sleep(0.6)
                open(os.path.join(a.out, f"client-settings-{n}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        check("the two rows sit side by side (tests on the left)", len(side) == 2 and all(l < r and abs(dt) < 2 for l, r, dt in side), json.dumps(side))
        sec = lambda name: f"[...{C}.querySelectorAll('fieldset')].find(f => (f.querySelector(':scope > legend h2') || {{}}).textContent.trim().toLowerCase() === '{name}')"
        labels = lambda name: f"[...{sec(name)}.querySelectorAll(':scope > label.inputContainer')].map(l => l.textContent.trim().slice(0, 22))"
        video = js(labels("video"))
        check("Web GPU Buffers, Renderer and HDR Output lead Video", [v[:10] for v in video[:3]] == ["Web GPU Bu", "Renderer: ", "HDR Output"], json.dumps(video[:4]))
        mainl = js(labels("main"))
        check("Main no longer holds them", not any(x.startswith(("Web GPU", "Renderer", "HDR Output", "Nintendo")) for x in mainl), json.dumps(mainl))
        check("Nintendo Button Layout is in Controllers", js(f"[...{sec('controllers')}.querySelectorAll('label.inputContainer')].some(l => l.textContent.trim().startsWith('Nintendo Button Layout'))") is True)
        # nativeshell re-renders a section when one of its values changes: the moved settings stay single.
        before = js("new Promise(r => window.api.settings.value('main', 'alwaysOnTop', r))")
        js("new Promise(r => window.api.settings.setValue('main', 'alwaysOnTop', %s, () => r(true)))" % json.dumps(not before))
        time.sleep(1)
        js("new Promise(r => window.api.settings.setValue('main', 'alwaysOnTop', %s, () => r(true)))" % json.dumps(before))
        time.sleep(1)
        dup = js(f"['Web GPU Buffers', 'Renderer', 'HDR Output', 'Nintendo Button Layout'].map(p => [...{C}.querySelectorAll('label.inputContainer')].filter(l => l.textContent.trim().startsWith(p)).length)")
        check("after a section re-renders, each moved setting is there once", dup == [1, 1, 1, 1], json.dumps(dup))
        check("the Hardware section is titled Video tests", js(f"{sec('video tests')} !== undefined") is True)
        # Drop-downs everywhere, on top and visible.
        wrapped = js(f"[...{C}.querySelectorAll('select')].filter(s => s.offsetParent !== null).every(s => s.parentElement.classList.contains('icefin-dd'))")
        check("every select in Client Settings is an in-page drop-down", wrapped is True)
        aspect = f"[...{C}.querySelectorAll('select')].find(s => ((s.closest('label') || {{}}).textContent || '').trim().startsWith('Aspect Ratio'))"
        js(f"{aspect}.scrollIntoView({{block: 'center'}}); true")
        time.sleep(0.5)
        r = json.loads(js(f"JSON.stringify({aspect}.getBoundingClientRect())"))
        cx, cy = r["left"] + r["width"] / 2, r["top"] + r["height"] / 2
        for t in ("mousePressed", "mouseReleased"):
            page.send("Input.dispatchMouseEvent", type=t, x=cx, y=cy, button="left", clickCount=1)
        time.sleep(0.4)
        top = json.loads(js("JSON.stringify((() => { const l = document.querySelector('.icefin-dd-list'); if (!l) return null; const o = l.children[1] || l.firstChild; const b = o.getBoundingClientRect(); const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return {visible: getComputedStyle(l).visibility, onTop: l.contains(at), n: l.children.length}; })())"))
        check("with a themed screen up, the list opens on top of the dialog and is visible", bool(top) and top["visible"] == "visible" and top["onTop"], json.dumps(top))
        was = js("new Promise(r => window.api.settings.value('video', 'aspect', r))")
        for k in ("ArrowDown", "Enter"):
            for t in ("keyDown", "keyUp"):
                page.send("Input.dispatchKeyEvent", type=t, key=k, code=k, windowsVirtualKeyCode={"ArrowDown": 40, "Enter": 13}[k])
        time.sleep(1)
        now = js("new Promise(r => window.api.settings.value('video', 'aspect', r))")
        check("a pick in a drop-down saves the setting", now != was, f"{was!r} -> {now!r}")
        js("new Promise(r => window.api.settings.setValue('video', 'aspect', %s, () => r(true)))" % json.dumps(was))
        js("new Promise(r => window.api.theme.select('', '', '', r))")
        time.sleep(1.5)
        js("window.icefinThemeSync.idle().then(() => true)")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            try:
                os.killpg(app.pid, signal.SIGKILL)
            except Exception:  # noqa: BLE001
                pass
        if xv:
            xv.terminate()
    print("client_settings:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
