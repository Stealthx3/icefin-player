#!/usr/bin/env python3
"""plaza_move.py — moving Plaza's channels (user request 2026-11-11). Lab only.

On Plaza's home:
  - controller: Menu lifts the focused channel (it rides over the focused slot with a hint), arrows carry it, OK drops it
    (swapping with the channel there); Back puts it back; carried past the last column it turns onto a fresh page;
  - pointer: dragging a channel onto an empty slot moves it there and leaves a gap; holding it lifts it without a drag,
    and letting go where it was changes nothing and opens no card;
  - the order, gaps included, survives a reload (per user, on this device); a channel the saved order doesn't know takes
    the first empty slot.
Usage: python3 plaza_move.py --app ~/build-mpv/src/icefin-player --server jf12 --out ~/rpm
"""
import argparse, base64, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

READY = "(() => { const r = document.querySelector('#icefin-theme-root[data-pz=\"home\"]'); return !!r && r.hasAttribute('data-pz-ready') && !!r.querySelector('.pz-tile.icefin-focused'); })()"
SLOTS = "[...document.querySelectorAll('#icefin-theme-root .pz-page .pz-tile')].map(t => t.getAttribute('data-pz-channel'))"
STATE = r"""(() => { const r = document.getElementById('icefin-theme-root'); const f = document.activeElement; const g = r.querySelector('.pz-ghost');
  const fr = f && f.classList.contains('pz-tile') ? f.getBoundingClientRect() : null; const gr = g ? g.getBoundingClientRect() : null;
  return JSON.stringify({moving: r.getAttribute('data-pz-moving'), page: r.getAttribute('data-pz-page'), focus: f ? Number(f.getAttribute('data-pz-slot')) : -1,
    hint: (r.querySelector('.pz-move-hint') || {}).textContent || '', card: !!r.querySelector('.pz-card'), lifted: r.querySelectorAll('.pz-lifted').length,
    over: !!(fr && gr && Math.abs((fr.left + fr.right) / 2 - (gr.left + gr.right) / 2) < 8 && Math.abs((fr.top + fr.bottom) / 2 - (gr.top + gr.bottom) / 2) < 30)}); })()"""
CENTRE = "(i => { const t = document.querySelector(`#icefin-theme-root .pz-tile[data-pz-slot=\"${i}\"]`); const r = t.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9263)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-pm-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"plaza_move: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        key = js("'icefin.plaza.order.' + window.ApiClient.getCurrentUserId()")
        js(f"localStorage.removeItem({json.dumps(key)}); true")
        js("new Promise(r => window.api.theme.setActiveTheme('plaza', '', r))")
        page.wait_for(READY, timeout=40)
        time.sleep(1)
        pad = lambda x: js(f"window.icefinTheme.handleAction({json.dumps(x)})")
        state = lambda: json.loads(js(STATE))
        slots = lambda: js(SLOTS)
        focus = lambda i: js(f"window.icefinTheme.ctx.focus(document.querySelector('#icefin-theme-root .pz-tile[data-pz-slot=\"{i}\"]')); true")
        saved = lambda: json.loads(js(f"localStorage.getItem({json.dumps(key)}) || 'null'"))
        cols = js("Number(getComputedStyle(document.getElementById('icefin-theme-root')).getPropertyValue('--pz-cols'))")
        per = cols * 3

        def shot(name):
            open(os.path.join(a.out, f"{name}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))

        s0 = slots()
        chans = [x for x in s0 if x]
        check("home has at least three channels", len(chans) >= 3, json.dumps(s0))
        # ---- controller ----
        focus(0)
        pad("menu")
        time.sleep(0.4)
        st = state()
        check("Menu lifts the focused channel, with a hint", st["moving"] == s0[0] and st["lifted"] == 1 and "OK places it" in st["hint"], json.dumps(st))
        pad("right")
        time.sleep(0.5)
        st = state()
        check("Right carries it to the next slot, riding over it", st["focus"] == 1 and st["over"], json.dumps(st))
        shot("pad-carry")
        pad("enter")
        time.sleep(0.4)
        s1 = slots()
        check("OK drops it there, swapping with the channel in that slot", s1[0] == s0[1] and s1[1] == s0[0] and state()["moving"] is None, json.dumps(s1[:3]))
        check("the order is saved", (saved() or [None, None])[:2] == [s0[1], s0[0]], json.dumps(saved()))
        focus(0)
        pad("menu")
        pad("down")
        time.sleep(0.3)
        pad("back")
        time.sleep(0.3)
        check("Back puts it back where it was", slots() == s1 and state()["moving"] is None, json.dumps(slots()[:3]))
        # Carried right from the last column: onto a fresh page.
        last = cols - 1
        focus(last)
        moving = slots()[last]
        pad("menu")
        pad("right")
        time.sleep(0.8)
        st = state()
        check("past the last column the page turns (a fresh page when needed)", st["page"].startswith("2/") and st["focus"] == per, json.dumps(st))
        pad("enter")
        time.sleep(0.6)
        s2 = slots()
        check("dropped on page 2, the channel lives there", len(s2) >= 2 * per and s2[per] == moving and s2[last] is None, f"{moving}: {json.dumps(s2)}")
        # ---- pointer: back to page 1, then drag a channel onto an empty slot ----
        js("document.querySelector('#icefin-theme-root .pz-arrow.pz-prev').click(); true")
        time.sleep(0.8)
        cur = slots()
        empty = next((i for i in range(per) if cur[i] is None and i != last), None)
        src = next((i for i in range(per) if cur[i]), None)
        if empty is None:
            check("an empty slot on page 1 to drag onto", False, json.dumps(cur))
        else:
            (x0, y0), (x1, y1) = js(f"{CENTRE}({src})"), js(f"{CENTRE}({empty})")
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x0, y=y0)
            page.send("Input.dispatchMouseEvent", type="mousePressed", x=x0, y=y0, button="left", buttons=1, clickCount=1)
            for k in range(1, 13):
                page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x0 + (x1 - x0) * k / 12, y=y0 + (y1 - y0) * k / 12, button="left", buttons=1)
                time.sleep(0.03)
            st = state()
            check("dragging lifts the channel", st["moving"] == cur[src], json.dumps(st))
            shot("pointer-drag")
            page.send("Input.dispatchMouseEvent", type="mouseReleased", x=x1, y=y1, button="left", buttons=0, clickCount=1)
            time.sleep(0.6)
            s3 = slots()
            check("dropped on an empty slot, it moves there and leaves a gap", s3[empty] == cur[src] and s3[src] is None and not state()["card"], json.dumps(s3[:per]))
            # Hold without moving: lifted; let go in place: nothing changes and no card opens.
            xh, yh = js(f"{CENTRE}({empty})")
            page.send("Input.dispatchMouseEvent", type="mousePressed", x=xh, y=yh, button="left", buttons=1, clickCount=1)
            time.sleep(0.7)
            held = state()["moving"]
            page.send("Input.dispatchMouseEvent", type="mouseReleased", x=xh, y=yh, button="left", buttons=0, clickCount=1)
            time.sleep(0.6)
            st = state()
            check("holding lifts it; letting go in place changes nothing and opens no card", held == cur[src] and slots() == s3 and not st["card"] and st["moving"] is None, f"held={held} {json.dumps(st)}")
            # Reload: the order, gaps and page 2 included, is kept.
            before = slots()
            js("location.reload(); true", await_promise=False)
            time.sleep(6)
            page.reconnect()
            page.wait_for(READY, timeout=60)
            time.sleep(0.5)
            after = slots()
            check("the order, gaps included, survives a reload", after == before, f"{json.dumps(before)} vs {json.dumps(after)}")
            # A channel the saved order doesn't know takes the first empty slot.
            order = saved()
            dropped = order[src if order[src] else empty]
            order = [None if x == dropped else x for x in order]
            js(f"localStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(order))}); location.reload(); true", await_promise=False)
            time.sleep(6)
            page.reconnect()
            page.wait_for(READY, timeout=60)
            time.sleep(0.5)
            s4 = slots()
            first_gap = order.index(None)
            check("a channel the order doesn't know takes the first empty slot", s4[first_gap] == dropped, f"{dropped} at {first_gap}: {json.dumps(s4)}")
        js(f"localStorage.removeItem({json.dumps(key)}); true")
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
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
    print("plaza_move:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
