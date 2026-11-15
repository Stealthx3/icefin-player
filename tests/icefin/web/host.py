#!/usr/bin/env python3
"""host.py — the theme pipeline's host harness (PLAN 9.45, docs/themes/PIPELINE.md).

Walks and theme tests run on the user's workstation, against the installed Icefin Player Flatpak, the user's own
profile and their own server (the user's choice, 2026-11-12):
  - update() brings the Flatpak up to date from the test repository before every run and says what is installed;
  - one host run at a time (a lock): the app and the profile are the user's, and two runs would fight over them;
  - the app must not already be open: a run never takes over a session the user is in;
  - the theme's files come from a worktree (ICEFIN_THEME_PATH, mounted read-only); the engine is the installed build;
  - the user's theme choice (theme, preset, scheme) is put back when the run ends, whatever happens;
  - captures go through DevTools (the page); capture_screen() uses spectacle on Icefin's window only, and keeps the
    file only when its title bar is Icefin's (privacy: the user may switch windows during a run).
Nothing on the server may change: dialogs are opened and closed without saving, nothing is created or deleted, and
playback runs a few seconds only.
"""
import base64, fcntl, json, os, re, shutil, signal, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cdp import Page  # noqa: E402

APP = "io.github.stealthx3.IcefinPlayer"
REMOTE = "icefin-test"
STATE = os.path.expanduser("~/.local/share/icefin-walk")
LOCK = os.path.join(STATE, "host.lock")
TITLEBAR_REF = os.path.join(STATE, "titlebar-ref.png")  # a crop of Icefin's own title bar, kept off the repository


def _info(args):
    out = subprocess.run(args, capture_output=True, text=True).stdout
    get = lambda k: (re.search(rf"^\s*{k}:\s*(\S+)", out, re.M) or [None, ""])[1]
    return {"version": get("Version"), "commit": get("Commit")[:12], "date": get("Date")}


def update():
    """Update the player from the test repository (the user: before each walk) and report what is installed."""
    before = _info(["flatpak", "info", "--user", APP])
    r = subprocess.run(["flatpak", "update", "--user", "-y", "--noninteractive", APP], capture_output=True, text=True, timeout=900)
    after = _info(["flatpak", "info", "--user", APP])
    remote = _info(["flatpak", "remote-info", "--user", REMOTE, APP])
    res = dict(after, previous=before["commit"], updated=before["commit"] != after["commit"], remoteCommit=remote["commit"],
               current=bool(remote["commit"]) and remote["commit"] == after["commit"])
    if r.returncode != 0:
        res["updateError"] = (r.stderr or r.stdout).strip().splitlines()[-1:] or ["failed"]
    state = "updated " + before["commit"] + " -> " + after["commit"] if res["updated"] else "already current" if res["current"] else "NOT current (test repo has " + (remote["commit"] or "?") + ")"
    print(f"host: Icefin Player {after['version']} {after['commit']} ({after['date']}): {state}", flush=True)
    return res


def is_running():
    out = subprocess.run(["flatpak", "ps", "--columns=application"], capture_output=True, text=True).stdout
    return APP in out.split()


class Lock:
    """One host run at a time; a second run waits (up to `wait` seconds) and says so."""
    def __init__(self, wait=3600):
        os.makedirs(STATE, exist_ok=True)
        self.f, self.wait = open(LOCK, "a+"), wait

    def __enter__(self):
        end, said = time.time() + self.wait, False
        while True:
            try:
                fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.f.seek(0), self.f.truncate(), self.f.write(f"{os.getpid()} {' '.join(sys.argv[:3])}\n"), self.f.flush()
                return self
            except BlockingIOError:
                if time.time() > end:
                    raise TimeoutError("host: another host run still holds the lock: " + open(LOCK).read().strip())
                if not said:
                    print("host: waiting for another host run to finish: " + open(LOCK).read().strip(), flush=True)
                    said = True
                time.sleep(10)

    def __exit__(self, *a):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


class Host:
    """The user's Icefin, started for a run with a theme folder from a worktree; restores their theme on close()."""
    def __init__(self, themes, port, log_path):
        if is_running():
            raise RuntimeError("host: Icefin Player is open. Close it first: a run uses your profile and never takes over a session you are in.")
        self.themes, self.port, self.original = os.path.abspath(themes) if themes else None, port, None
        args = ["flatpak", "run", "--user"]
        if self.themes:
            args += [f"--filesystem={self.themes}:ro", f"--env=ICEFIN_THEME_PATH={self.themes}"]
        self.log = open(log_path, "w")
        self.app = subprocess.Popen(args + [APP, f"--remote-debugging-port={port}"], stdout=self.log, stderr=subprocess.STDOUT, start_new_session=True)
        self.page = Page(port, timeout=120)
        self.page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ctx && !!window.ApiClient && !!window.ApiClient.getCurrentUserId && !!window.ApiClient.getCurrentUserId()", timeout=150)
        time.sleep(2)
        self.original = self.page.eval("new Promise(r => window.api.theme.selection(r))") or {}
        print("host: your theme choice (put back at the end):", json.dumps(self.original), flush=True)

    def use_theme(self, theme):
        """Switch to `theme` for the run (a theme with a backdrop reloads the page once: 8.4)."""
        self.page.switch_theme_reloading(theme, "!!window.icefinTheme && !!window.icefinTheme.ctx && !!window.icefinPlaybackManager && !!window.ApiClient.getCurrentUserId()")
        self.page.reconnect()
        time.sleep(2)
        active = self.page.eval("(window.icefinTheme.active() || {}).id || ''")
        if active != theme:
            raise RuntimeError(f"host: asked for {theme}, {active or 'no theme'} is active")
        src = self.page.eval("(window.icefinTheme.active() || {}).source || (window.icefinTheme.active() || {}).path || ''")
        return {"id": active, "version": self.page.eval("(window.icefinTheme.active() || {}).version || ''"), "source": src}

    def capture_page(self, path):
        """The page as DevTools draws it; False when no frame came (Chromium draws none while Icefin's window is
        covered or minimised): the walk records the entry without a picture rather than stopping."""
        try:
            open(path, "wb").write(base64.b64decode(self.page.send("Page.captureScreenshot", format="png")["data"]))
            return True
        except (TimeoutError, OSError):
            self.page.reconnect()
            return False

    def capture_screen(self, path):
        """What the screen shows (black or stale frames), Icefin's window only; deleted unviewed unless its title bar is Icefin's."""
        if not os.path.exists(TITLEBAR_REF):
            return "no title-bar reference: " + TITLEBAR_REF
        subprocess.run(["spectacle", "-b", "-n", "-a", "-o", path], timeout=30, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            from PIL import Image
            # The strip with the fin mark and "Icefin Player" (a dark strip alone let another app's dark top through:
            # 9.60, the Claude window kept as Icefin's), and the fin's own cyan in the icon's corner.
            box = (0, 0, 160, 30)
            ref = list(Image.open(TITLEBAR_REF).convert("L").crop(box).getdata())
            shot = Image.open(path).convert("RGB")
            strip = list(shot.convert("L").crop(box).getdata())
            if len(ref) != len(strip) or sum(abs(a - b) for a, b in zip(strip, ref)) / len(strip) > 14:
                raise ValueError("title bar")
            fin = sum(1 for r, g, b in shot.crop((0, 0, 32, 30)).getdata() if b > 180 and g > 140 and r < 140)
            if fin < 25:
                raise ValueError("no fin mark")
            return "ok"
        except Exception as e:  # noqa: BLE001
            if os.path.exists(path):
                os.remove(path)
            return f"discarded ({e})"

    def crashed(self):
        """The app's exit code if it has gone (a crash mid-run), else None."""
        return self.app.poll()

    def _restore(self, page):
        o = self.original
        page.eval(f"new Promise(r => window.api.theme.select({json.dumps(o.get('theme') or '')}, {json.dumps(o.get('preset') or '')}, {json.dumps(o.get('scheme') or '')}, r))")
        time.sleep(2)
        print("host: your theme choice is back:", json.dumps(page.eval("new Promise(r => window.api.theme.selection(r))")), flush=True)

    def close(self):
        if self.original is not None:
            try:
                if self.crashed() is not None:
                    raise ConnectionError(f"Icefin exited ({self.crashed()})")
                self._restore(self.page)
            except Exception as e:  # noqa: BLE001
                # the app went away mid-run: start it again, plainly, just long enough to put the user's choice back
                print(f"host: Icefin is gone ({e}); starting it again to put your theme back", flush=True)
                try:
                    os.killpg(self.app.pid, signal.SIGTERM)
                except Exception:  # noqa: BLE001
                    pass
                again = subprocess.Popen(["flatpak", "run", "--user", APP, f"--remote-debugging-port={self.port}"], stdout=self.log, stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    p = Page(self.port, timeout=120)
                    p.wait_for("!!window.api && !!window.api.theme && !!window.ApiClient && !!window.ApiClient.getCurrentUserId && !!window.ApiClient.getCurrentUserId()", timeout=150)
                    self._restore(p)
                except Exception as e2:  # noqa: BLE001
                    print(f"host: COULD NOT put your theme back ({e2}); it was {json.dumps(self.original)}", flush=True)
                self.app = again
                self.page = p if "p" in locals() else self.page
        # Quit the way the user would. Signalling the whole process group took the sandbox's xdg-dbus-proxy down with
        # the app, and Qt WebEngine aborted on the lost connection (a core dump per run) until the D-Bus guard.
        try:
            self.page.eval("window.api.system.exit(); true", await_promise=False)
            self.app.wait(20)
        except Exception:  # noqa: BLE001
            try:
                os.killpg(self.app.pid, signal.SIGTERM)
                self.app.wait(20)
            except Exception:  # noqa: BLE001
                pass
        self.log.close()


def seed_titlebar_ref(src):
    """Keep a title-bar reference for capture_screen() (one-time, from a capture checked by eye)."""
    os.makedirs(STATE, exist_ok=True)
    shutil.copyfile(src, TITLEBAR_REF)


if __name__ == "__main__":
    if sys.argv[1:2] == ["update"]:
        update()
    elif sys.argv[1:2] == ["seed-titlebar"]:
        seed_titlebar_ref(sys.argv[2])
    else:
        print("usage: host.py update | seed-titlebar <png>")
