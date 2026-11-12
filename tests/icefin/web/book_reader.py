#!/usr/bin/env python3
"""book_reader.py — jellyfin-web's book reader in Icefin (EPUB and PDF): opens, shows its pages, closes cleanly. Lab only.

For each book in the lab's Books library (make-media.sh's generated EPUB and PDF):
  - Plaza's Books screen opens it (A on the cover) and the reader shows page 1, then turns to the next page;
  - the reader's own full-screen button takes the window full screen and back;
  - closing the reader leaves no error (jellyfin-web 12 calls NativeShell.enableFullscreen/disableFullscreen, which
    the shell must provide) and leaves the window as it was;
and, with no theme, jellyfin-web's own details page opens the same books (the PDF with the window already full screen,
which it must stay).
Usage: python3 book_reader.py --app ~/build/src/icefin-player --server jf12 --out ~/rbr
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

READER = "#bookPlayer, #pdfPlayer, #comicsPlayer"
# Errors the page throws (and promises it rejects) while a book is open or closing.
COLLECT = r"""(() => { if (window.__brErrs) return true; window.__brErrs = [];
  addEventListener('error', (e) => window.__brErrs.push('error: ' + (e.message || e.error)));
  addEventListener('unhandledrejection', (e) => window.__brErrs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
  return true; })()"""
# What the open reader shows: for EPUB the text in epub.js's frame, for PDF whether the canvas has ink on it; sig changes
# when the page turns (EPUB: the paginated container's scroll; PDF: the canvas pixels).
SHOWS = r"""(() => { const d = document.querySelector('#bookPlayer, #pdfPlayer, #comicsPlayer'); if (!d || !d.getClientRects().length) return JSON.stringify({open: false});
  const out = {open: true, id: d.id, spinner: [...document.querySelectorAll('.docspinner, .mdlSpinner, .MuiCircularProgress-root')].some(s => s.getClientRects().length)};
  const f = d.querySelector('iframe'); if (f) { try { out.text = (f.contentDocument.body.innerText || '').trim().slice(0, 80); } catch (e) { out.text = 'x-origin'; } }
  const ec = d.querySelector('.epub-container'); if (ec) { out.opacity = ec.style.opacity; out.sig = ec.scrollLeft + ':' + ec.scrollTop + ':' + (out.text || '').slice(0, 30); }
  const c = d.querySelector('canvas'); if (c && c.width) { const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0, sum = 0;
    for (let i = 0; i < px.length; i += 16) { if (px[i + 3] > 0 && px[i] < 128) ink++; sum = (sum * 31 + px[i]) % 1000000007; }
    out.canvas = [c.width, c.height]; out.ink = ink; out.sig = String(sum); }
  out.buttons = [...d.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => (b.getAttribute('title') || b.getAttribute('aria-label') || b.className.split(' ')[0])).slice(0, 12);
  return JSON.stringify(out); })()"""
# The reader's own buttons (jellyfin-web 12's BookOsd): by title or aria-label.
PRESS = r"""((names) => { const d = document.querySelector('#bookPlayer, #pdfPlayer, #comicsPlayer'); if (!d) return null;
  document.dispatchEvent(new PointerEvent('pointermove', {bubbles: true}));
  const b = [...d.querySelectorAll('button')].find(x => names.includes(x.getAttribute('title')) || names.includes(x.getAttribute('aria-label')));
  if (!b) return null; b.click(); return b.getAttribute('title') || b.getAttribute('aria-label'); })"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9266)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    logp = os.path.join(a.out, "app.log")
    log = open(logp, "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-br-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"book_reader: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        js = page.eval

        def shot(name):
            open(os.path.join(a.out, f"{name}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

        def shows():
            return json.loads(js(SHOWS))

        def gesture(expr):
            # as a user's press: requestFullscreen needs user activation, which a plain evaluate does not give
            return page.send("Runtime.evaluate", expression=expr, userGesture=True, returnByValue=True).get("result", {}).get("value")

        def fullscreen():
            # the window itself (jmpInfo's main.fullscreen setting is not reliable: it does not go back to false)
            return bool(js("new Promise(r => window.api.window.isFullScreen(r))"))

        def log_since(pos):
            log.flush()
            with open(logp, errors="replace") as f:
                f.seek(pos)
                return [ln.strip() for ln in f.read().splitlines()
                        if any(k in ln for k in ("TypeError", "Invalid page request", "failed to display", "Uncaught", "is not a function"))]

        def log_pos():
            log.flush()
            return os.path.getsize(logp)

        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        js(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        js(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
        js("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinPlaybackManager && !!window.icefinInputManager", timeout=90)
        js = page.eval
        time.sleep(2)
        js("window.icefinThemeSync ? window.icefinThemeSync.idle().then(() => true) : true")
        check("shell: NativeShell has enableFullscreen and disableFullscreen",
              js("typeof window.NativeShell.enableFullscreen === 'function' && typeof window.NativeShell.disableFullscreen === 'function'"))
        sid = js("window.ApiClient.serverId()")
        views = {ct: vid for vid, ct in js("window.ApiClient.getUserViews({}, window.ApiClient.getCurrentUserId()).then(r => r.Items.map(v => [v.Id, v.CollectionType || '']))")}
        books = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {Recursive: true, IncludeItemTypes: 'Book', Fields: 'Path'})"
                   ".then(r => r.Items.map(i => ({id: i.Id, name: i.Name, ext: (i.Path || '').split('.').pop().toLowerCase()})))")
        books = [b for b in books if b["ext"] in ("epub", "pdf")]
        for b in books:  # from the first page: an earlier run's reading position is saved on the server
            js(f"window.ApiClient.ajax({{type: 'POST', url: window.ApiClient.getUrl('UserItems/{b['id']}/UserData', {{userId: window.ApiClient.getCurrentUserId()}}), "
               f"data: JSON.stringify({{PlaybackPositionTicks: 0, Played: false}}), contentType: 'application/json'}}).then(() => true)")
        check("library: the lab's EPUB and PDF", sorted(b["ext"] for b in books) == ["epub", "pdf"] and bool(views.get("books")), json.dumps(books))
        js(COLLECT)

        def opened(label, b):
            """Waits for page 1, turns a page; True when the reader showed its pages."""
            s = {}
            for _ in range(40):
                time.sleep(0.5)
                s = shows()
                if b["ext"] == "epub" and s.get("open") and "Icefin test paragraph" in (s.get("text") or "") and s.get("opacity") == "" and not s.get("spinner"):
                    break
                if b["ext"] == "pdf" and s.get("open") and s.get("ink", 0) > 50 and not s.get("spinner"):
                    break
            ok = s.get("open") and not s.get("spinner") and (("Icefin test paragraph" in (s.get("text") or "")) if b["ext"] == "epub" else s.get("ink", 0) > 50)
            check(f"{label}: {b['ext']} shows page 1", bool(ok), json.dumps(s))
            shot(f"{label}-{b['ext']}-page1")
            if not ok:
                return False
            before = s.get("sig")
            nxt = js(f"{PRESS}({json.dumps(['Next'])})")
            time.sleep(2)
            s2 = shows()
            after = s2.get("sig")
            check(f"{label}: {b['ext']} Next turns the page", bool(nxt) and after is not None and after != before and not s2.get("spinner"), f"{before} -> {after}")
            shot(f"{label}-{b['ext']}-page2")
            return True

        def close(label, b, fs0):
            pos = log_pos()
            how = js(f"{PRESS}({json.dumps(['Close', 'Exit', 'Back'])})")
            if not how:  # no close button found: the remote's Stop does the same
                js("window.icefinPlaybackManager.stop(); true")
                how = "stop"
            closed = False
            for _ in range(20):
                time.sleep(0.5)
                if not shows().get("open"):
                    closed = True
                    break
            time.sleep(1)
            errs = js("window.__brErrs.splice(0)") + log_since(pos)
            check(f"{label}: {b['ext']} closes ({how})", closed)
            check(f"{label}: {b['ext']} closes without errors", not errs, json.dumps(errs[:4]))
            check(f"{label}: {b['ext']} leaves the window as it was", fullscreen() == fs0, f"full screen {fullscreen()}, was {fs0}")

        # ---- Plaza's Books screen ----
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        time.sleep(3)
        books_hash = f"#/books?topParentId={views.get('books')}&collectionType=books&serverId={sid}"
        js(f"location.hash = {json.dumps(books_hash)}; true")
        time.sleep(4)
        for b in books:
            fs0 = fullscreen()
            pos = log_pos()
            hit = js(f"(() => {{ const c = [...document.querySelectorAll('#icefin-theme-root .pz-cell')].find(x => x.plazaItem && x.plazaItem.Id === {json.dumps(b['id'])}); if (!c) return false; c.click(); return true; }})()")
            check(f"plaza: {b['ext']} cover on the Books screen", bool(hit))
            if not hit:
                continue
            if opened("plaza", b):
                # the reader's own full-screen button, on and off again
                fsb = gesture(f"{PRESS}({json.dumps(['Full screen', 'Exit full screen'])})")
                time.sleep(1.5)
                on, doc_on = fullscreen(), js("!!document.fullscreenElement")
                shot(f"plaza-{b['ext']}-fullscreen")
                fsb2 = gesture(f"{PRESS}({json.dumps(['Full screen', 'Exit full screen'])})")
                time.sleep(1.5)
                check(f"plaza: {b['ext']} full-screen button goes full screen and back", bool(fsb and fsb2) and on and fullscreen() == fs0,
                      f"{fsb}: window {on} page {doc_on}, {fsb2}: window {fullscreen()} page {js('!!document.fullscreenElement')}")
            errs = js("window.__brErrs.splice(0)") + log_since(pos)
            check(f"plaza: {b['ext']} opens without errors", not errs, json.dumps(errs[:4]))
            close("plaza", b, fs0)
            shot(f"plaza-{b['ext']}-closed")
        # ---- no theme: jellyfin-web's own details page ----
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
        time.sleep(2)
        for b in books:
            if b["ext"] == "pdf":  # the user's own full screen (F11, the remote) stays when a book closes
                js("window.api.window.setFullScreen(true); true")
                time.sleep(2)
                check("stock: the window is full screen before the pdf", fullscreen())
            fs0 = fullscreen()
            pos = log_pos()
            details_hash = f"#/details?id={b['id']}&serverId={sid}"
            js(f"location.hash = {json.dumps(details_hash)}; true")
            time.sleep(4)
            hit = js("(() => { const x = [...document.querySelectorAll('.btnPlay, .btnResume')].find(e => e.getClientRects().length); if (!x) return false; x.click(); return true; })()")
            check(f"stock: {b['ext']} details page has Read", bool(hit))
            if not hit:
                continue
            opened("stock", b)
            errs = js("window.__brErrs.splice(0)") + log_since(pos)
            check(f"stock: {b['ext']} opens without errors", not errs, json.dumps(errs[:4]))
            close("stock", b, fs0)
        js("window.api.window.setFullScreen(false); true")
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
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
    print("book_reader:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
