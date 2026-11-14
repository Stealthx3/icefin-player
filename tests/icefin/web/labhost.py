#!/usr/bin/env python3
"""labhost.py — the theme walk's lab host (PLAN 9.48: the user chose the VM lab for Tide's walks, 2026-11-14, "so I can
lock my screens"). The same interface as host.Host (page, use_theme, capture_page, capture_screen, crashed, close),
over the lab's own build (~/build/src/icefin-player) and Jellyfin server (servers.json, default jf12), with the
theme folder given as ICEFIN_THEME_PATH. Watchable in virt-manager (lab-icefin-main). Lab guests only.

Captures take the web layer alone: over the native backdrop (8.4) a theme's screens can be transparent, and a capture
drops the alpha (a soft glow comes out opaque). After the theme is on, the theme's gradient goes under its screens for
the run, as without the backdrop.
"""
import base64, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

OPAQUE = ("(() => { if (document.getElementById('lab-opaque')) return true; const s = document.createElement('style'); s.id = 'lab-opaque';"
          " s.textContent = 'html[data-icefin-backdrop] #icefin-theme-root { background: linear-gradient(180deg, var(--icefin-color-waveTop, var(--icefin-color-background)),"
          " var(--icefin-color-waveBottom, var(--icefin-color-background))) !important; } html[data-icefin-backdrop] body { background: var(--icefin-color-background) !important; }';"
          " document.head.append(s); return true; })()")


class LabHost:
    def __init__(self, themes, port, log_path, app="~/build/src/icefin-player", server="jf12"):
        cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[server]
        cred = json.load(open(os.path.join(JF, "creds.json")))[server]
        srv = Server(cfg)
        srv.wait()
        start_x()
        if themes:
            os.environ["ICEFIN_THEME_PATH"] = os.path.abspath(os.path.expanduser(themes))
        self.cfgdir = tempfile.mkdtemp(prefix="icefin-labwalk-")
        self.log = open(log_path, "w")
        self.app = launch(app, port, self.cfgdir, self.log, "xcb")
        self.original = None
        page = self.page = Page(port, timeout=90)
        page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ctx && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()", timeout=90)
        print("labhost: signed in to", server, flush=True)

    def use_theme(self, theme):
        self.page.switch_theme_reloading(theme, "!!window.icefinTheme && !!window.icefinTheme.ctx && !!window.icefinPlaybackManager && !!window.ApiClient.getCurrentUserId()")
        self.page.reconnect()
        time.sleep(2)
        active = self.page.eval("(window.icefinTheme.active() || {}).id || ''")
        if active != theme:
            raise RuntimeError(f"labhost: asked for {theme}, {active or 'no theme'} is active")
        self.page.eval(OPAQUE)
        return {"id": active, "version": self.page.eval("(window.icefinTheme.active() || {}).version || ''"), "source": self.page.eval("(window.icefinTheme.active() || {}).source || ''")}

    def capture_page(self, path):
        try:
            self.page.eval(OPAQUE)  # a reload drops it
            open(path, "wb").write(base64.b64decode(self.page.send("Page.captureScreenshot", format="png")["data"]))
            return True
        except (TimeoutError, OSError):
            self.page.reconnect()
            return False

    def capture_screen(self, path):
        return "lab: the page capture is the screen (Xvfb)"

    def crashed(self):
        return self.app.poll()

    def close(self):
        try:
            self.app.terminate()
            self.app.wait(timeout=15)
        except Exception:  # noqa: BLE001
            try:
                self.app.kill()
            except Exception:  # noqa: BLE001
                pass
