#!/usr/bin/env python3
"""media_center_settings.py — Media Center's settings, slide show and book reader (PLAN 9.46). Lab only.

With Media Center active:
  - the hub (#/mypreferencesmenu): one list with every entry (This device, Theme, the account pages, Profile, Quick
    Connect, Classic view, Server dashboard for an administrator, Sign out), the focused entry described at the right;
  - Playback (jellyfin-web's page, laid out): its buttons in a column at the left with Cancel, a ‹ › spinner on every
    drop-down, and the spinner steps the value (put back before leaving, nothing saved); Cancel returns to the hub on
    Playback;
  - This device (?pane=client): Media Center's chrome around the engine's Client Settings page, its sections at the
    left, spinners on its drop-downs, and the remote's Right on a drop-down steps it (Left puts it back);
    ?section=theme opens on the Theme section;
  - the slide show: Media Center's layout (the picture's name and "… · n of N" from the server, previous, pause and
    next together at the bottom right, Back round at the top left) and the slow pan and zoom;
  - the book reader: the title where a page title goes, the reader's buttons round.
Screenshots go to --out (page captures, and x-*.png of the display).
Usage: python3 media_center_settings.py --app ~/build/src/icefin-player --server jf12 --out ~/rmcs
"""
import argparse, base64, json, os, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

RECT = r"""((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  return {x: r.left / innerHeight * 100, y: r.top / innerHeight * 100, w: r.width / innerHeight * 100, radius: parseFloat(cs.borderTopLeftRadius) || 0, anim: cs.animationName, opacity: +cs.opacity}; })"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9272)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-mcs-"), log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"media_center_settings: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shot(name):
        open(os.path.join(a.out, name), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1920x1080", "-i", ":99", "-frames:v", "1",
                        os.path.join(a.out, "x-" + name)], timeout=20)

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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        js("new Promise(r => window.api.theme.setActiveTheme('media-center', '', r))")
        time.sleep(2)
        rect = lambda sel: js(RECT + "(" + json.dumps(sel) + ")")

        # ---- the hub ----
        js("location.hash = '#/mypreferencesmenu'; true")
        page.wait_for("+(document.querySelector('#icefin-theme-root').getAttribute('data-icefin-settings-ready') || 0) > 0", timeout=20)
        entries = js("[...document.querySelectorAll('.mc-set-entry')].map(e => e.dataset.entry)")
        want = ["client", "theme", "playback", "subtitles", "display", "home", "controls", "profile", "quickconnect", "signout"]
        check("hub: every entry in one list", all(w in entries for w in want), json.dumps(entries))
        admin = js("window.ApiClient.getCurrentUser().then(u => !!(u.Policy && u.Policy.IsAdministrator))")
        check("hub: Server dashboard for an administrator", ("server" in entries) == admin, f"admin={admin}")
        check("hub: Classic view (ui.settings.classic)", ("classic" in entries) == js("!!window.icefinTheme.ui.settings.classic"))
        js("window.icefinTheme.handleAction('down'); window.icefinTheme.handleAction('down'); true")
        time.sleep(0.4)
        about = js("document.querySelector('.mc-set-about-name').textContent + ' | ' + document.querySelector('.mc-set-about-note').textContent")
        check("hub: the focused entry is described (Playback, saved with the account)", about.startswith("Playback |") and "account" in about, about)
        shot("hub.png")

        # ---- Playback: jellyfin-web's page, laid out ----
        js("window.icefinTheme.handleAction('enter'); true")
        page.wait_for("!!document.querySelector('.page[data-mc-form=\"mypreferencesplayback\"]:not(.hide) .mc-form-col')", timeout=20)
        time.sleep(1.5)
        col = js("[...document.querySelector('.page[data-mc-form=\"mypreferencesplayback\"]:not(.hide) .mc-form-col').children].map(b => b.textContent.trim())")
        check("playback: Save and Cancel in a column at the left", col[:1] == ["Save"] and col[-1] == "Cancel", json.dumps(col))
        sp = js("(() => { const p = document.querySelector('.page[data-mc-form=\"mypreferencesplayback\"]:not(.hide)'); return [p.querySelectorAll('.selectContainer select').length, p.querySelectorAll('.selectContainer select[data-mc-spin]').length, p.querySelectorAll('button.mc-spin').length]; })()")
        check("playback: a spinner on every drop-down", sp[0] > 0 and sp[0] == sp[1] and sp[2] == 2 * sp[0], json.dumps(sp))
        stepped = js("""(() => { const p = document.querySelector('.page[data-mc-form="mypreferencesplayback"]:not(.hide)'); const s = p.querySelector('#selectAllowedAudioChannels');
            const before = s.value; let changed = 0; s.addEventListener('change', () => changed++, {once: true});
            s.parentElement.querySelector('.mc-spin-next').click(); const after = s.value;
            s.parentElement.querySelector('.mc-spin-prev').click(); return [before, after, s.value, changed]; })()""")
        check("playback: › steps the value and tells the page, ‹ puts it back", stepped[0] != stepped[1] and stepped[2] == stepped[0] and stepped[3] == 1, json.dumps(stepped))
        r = rect(".page[data-mc-form='mypreferencesplayback']:not(.hide) .selectContainer")
        check("playback: rows at the right of the column (the board's 58 vh)", r and 55 <= r["x"] <= 62, json.dumps(r))
        js("document.querySelector('.page[data-mc-form=\"mypreferencesplayback\"]:not(.hide) #selectAllowedAudioChannels').focus(); true")
        shot("playback.png")
        js("document.querySelector('.page[data-mc-form=\"mypreferencesplayback\"]:not(.hide) .mc-form-cancel').click(); true")
        page.wait_for("document.querySelector('#icefin-theme-root').getAttribute('data-mc') === 'settings' && !!document.querySelector('.mc-set-entry.icefin-focused')", timeout=20)
        check("playback: Cancel returns to the hub on Playback", js("document.querySelector('.mc-set-entry.icefin-focused').dataset.entry") == "playback")

        # ---- This device ----
        js("location.hash = '#/mypreferencesmenu?pane=client'; true")
        page.wait_for("+(document.querySelector('#icefin-theme-root').getAttribute('data-icefin-client-settings') || 0) > 0", timeout=30)
        time.sleep(1.5)
        cs = js("""(() => { const r = document.querySelector('#icefin-theme-root'); return {mc: r.getAttribute('data-mc'), title: (r.querySelector('.mc-title') || {}).textContent,
            rail: r.querySelectorAll('.icefin-cs-rail .icefin-d-btn').length, sel: r.querySelectorAll('.icefin-cs-host select').length,
            spun: r.querySelectorAll('.icefin-cs-host select[data-mc-spin]').length, engineNav: !!(r.querySelector('.icefin-settings .icefin-d-nav') || {}).offsetParent}; })()""")
        check("this device: Media Center's chrome around Client Settings", cs["mc"] == "client" and cs["title"] == "this device" and not cs["engineNav"], json.dumps(cs))
        check("this device: sections at the left, a spinner on every drop-down", cs["rail"] >= 5 and cs["sel"] > 0 and cs["sel"] == cs["spun"], json.dumps(cs))
        res = js("""(() => { const s = [...document.querySelectorAll('#icefin-theme-root .icefin-cs-host select[data-mc-spin]')].find(x => x.offsetParent && x.options.length > 2 && x.selectedIndex < x.options.length - 1 && !x.closest('#icefin-theme-manager'));
            if (!s) return null; s.scrollIntoView({block: 'center'}); window.icefinTheme.ctx.focus(s); const before = s.selectedIndex;
            window.icefinTheme.handleAction('right'); const after = s.selectedIndex; window.icefinTheme.handleAction('left');
            return [before, after, s.selectedIndex, (s.closest('.inputContainer') || {}).textContent.trim().slice(0, 30)]; })()""")
        check("this device: Right steps a drop-down, Left puts it back", bool(res) and res[1] == res[0] + 1 and res[2] == res[0], json.dumps(res))
        shot("client.png")
        js("location.hash = '#/mypreferencesmenu?pane=client&section=theme'; true")
        page.wait_for("document.querySelector('#icefin-theme-root .mc-title') && document.querySelector('#icefin-theme-root .mc-title').textContent === 'theme' && +(document.querySelector('#icefin-theme-root').getAttribute('data-icefin-client-settings') || 0) > 0", timeout=30)
        time.sleep(1.5)
        here = js("(document.querySelector('#icefin-theme-root .icefin-cs-rail .icefin-cs-here') || {dataset: {}}).dataset.section || ''")
        check("theme: opens on the Theme section", here.lower() == "theme", here)
        shot("theme.png")

        # ---- the slide show ----
        js("location.hash = '#/home'; true")
        time.sleep(3)
        # as the picture library opens one: the picture alone, with its ParentId (jellyfin-web shows its folder from it)
        photos = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Photo', Recursive: true, Limit: 6, SortBy: 'SortName', Fields: 'ParentId'}).then(r => r.Items)")
        if len(photos) >= 2:
            first = photos[1]
            folder = js(f"window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {{ParentId: '{first['ParentId']}', Filters: 'IsNotFolder', MediaTypes: 'Photo,Video', Limit: 0}}).then(r => r.TotalRecordCount)")
            js(f"window.icefinTheme.ctx.play({{items: [{json.dumps(first)}]}}); true")
            page.wait_for("!!document.querySelector('.slideshowDialog[data-mc-ss]')", timeout=20)
            time.sleep(2)
            # jellyfin-web shows the controls when the pointer really moves: two events, apart
            js("document.querySelector('.slideshowDialog').dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerType: 'mouse', screenX: 300, screenY: 300, clientX: 300, clientY: 300})); true")
            time.sleep(0.3)
            js("document.querySelector('.slideshowDialog').dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerType: 'mouse', screenX: 420, screenY: 360, clientX: 420, clientY: 360})); true")
            time.sleep(0.6)
            try:
                page.wait_for("(document.querySelector('.slideshowDialog .mc-ss-name') || {}).textContent", timeout=10)
            except Exception:  # noqa: BLE001
                print("media_center_settings: (slide)", js("(() => { const s = document.querySelector('.slideshowDialog .swiper-slide-active'); const i = s && s.querySelector('img'); return JSON.stringify({aria: s && s.getAttribute('aria-label'), src: i && (i.currentSrc || i.src || i.getAttribute('data-src')), line: (document.querySelector('.slideshowDialog .mc-ss-line') || {}).textContent}); })()"))
            info = js("[document.querySelector('.slideshowDialog .mc-ss-name').textContent, document.querySelector('.slideshowDialog .mc-ss-line').textContent]")
            # the count follows the whole show, not the window of slides the swiper renders
            sw = js("(() => { const s = document.querySelector('.slideshowSwiperContainer').swiper; return [s.activeIndex + 1, (s.virtual && s.virtual.slides.length) || s.slides.length]; })()")
            check("slide show: the picture's name, and 'n of N' through its folder", info[0] == first["Name"] and info[1].endswith(f"{sw[0]} of {sw[1]}") and sw[1] == folder,
                  json.dumps(info) + f" swiper={sw} folder={folder}")
            row = js("(() => { const b = document.querySelector('.slideshowDialog .slideshowBottomBar'); return [...b.children].filter(x => getComputedStyle(x).display !== 'none').map(x => x.className.split(' ').find(c => c.startsWith('btnSlideshow'))); })()")
            check("slide show: previous, pause and next together", row == ["btnSlideshowPrevious", "btnSlideshowPause", "btnSlideshowNext"], json.dumps(row))
            bar = rect(".slideshowDialog .slideshowBottomBar")
            ex = rect(".slideshowDialog .btnSlideshowExit")
            check("slide show: the buttons at the bottom right, Back at the top left", bar and ex and bar["x"] > 100 and bar["y"] > 80 and ex["x"] < 6 and ex["y"] < 8, f"{bar} {ex}")
            kb = rect(".slideshowDialog .swiper-slide-active .swiper-slide-img")
            check("slide show: the slow pan and zoom", kb and kb["anim"] == "mc-kb", json.dumps(kb))
            shot("slideshow.png")
            js("document.querySelector('.slideshowDialog .btnSlideshowExit').click(); true")
            time.sleep(2)
        else:
            check("slide show: the lab has pictures", False, str(len(photos)))

        # ---- the book reader ----
        books = js("window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), {IncludeItemTypes: 'Book', Recursive: true}).then(r => r.Items.map(i => [i.Id, i.Name]))")
        epub = [b[0] for b in books if b[1] == "Icefin Test Book"]
        if epub:
            js(f"window.icefinTheme.ctx.play({{ids: ['{epub[0]}'], serverId: window.ApiClient.serverId(), startPositionTicks: 0}}); true")
            page.wait_for("!!document.querySelector('#bookPlayer[data-mc-reader]')", timeout=30)
            time.sleep(3)
            js("document.dispatchEvent(new PointerEvent('pointermove', {bubbles: true})); document.querySelector('#bookPlayer').dispatchEvent(new MouseEvent('mousemove', {bubbles: true})); true")
            time.sleep(1)
            t = rect("#bookPlayer .bookOsdTitle")
            b = rect("#bookPlayer .bookOsdRow:nth-child(2) .paper-icon-button-light")
            check("book: the title where a page title goes", t and 20 <= t["x"] <= 23 and t["y"] < 9, json.dumps(t))
            check("book: the reader's buttons round, at the bottom right", b and b["radius"] > 10 and b["y"] > 80, json.dumps(b))
            shot("book.png")
            js("window.icefinPlaybackManager.stop(); true")
            time.sleep(2)
        else:
            check("book: the lab has the test book", False, json.dumps(books))
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
    print("media_center_settings:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
