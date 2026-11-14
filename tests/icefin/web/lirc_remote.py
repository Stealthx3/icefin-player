#!/usr/bin/env python3
"""lirc_remote.py — an IR remote through LIRC, simulated (PLAN 11.5 option R, SPEC "Remotes"). Lab guests only.

Icefin reads IR remotes from lircd's socket, /run/lirc/lircd (upstream's InputLIRC; the Flatpak grants /run/lirc).
A fake lircd sends the lines a real one sends ("<code> <repeat> <KEY_NAME> <remote>"), and the app runs in a
bubblewrap mount namespace whose /run/lirc is the test's own directory, so no other lab session's app sees it.
On a themed screen (lab-screens, TV mode), checks:
  - the app connects to the socket;
  - the five-way keys move focus (KEY_RIGHT, KEY_LEFT), KEY_OK selects, KEY_BACK is Back;
  - one press moves focus once and stays put: lircd sends no release, and a press sent as a key-down started
    InputComponent's auto-repeat for good (focus ran to the end of the row; fixed, Icefin's LircKeys);
  - IR bursts: lircd's repeats 1 and 2 of a held key are dropped (upstream acts on every third), so one press moves
    focus once;
  - a lircd that sends releases (the "_LIRCUP" suffix): a press and release move once; a held button repeats;
  - a key that isn't in the LIRC map changes nothing and nothing breaks;
  - lircd going away and coming back: reported in the log, the app carries on with its other inputs.
Bluetooth remotes are keyboards to the app: the keyboard rows elsewhere cover them.
Needs: bwrap, sudo for an empty /run/lirc mount point (made once per boot), the lab servers.
Usage: python3 lirc_remote.py --app ~/build/src/icefin-player [--server jf12]
"""
import argparse, json, os, signal, socket, subprocess, sys, tempfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))


class FakeLircd:
    """lircd's socket protocol: one line per IR event, "<64-bit code> <repeat, hex> <key> <remote>"."""

    def __init__(self, path):
        self.path, self.conns, self.stop = path, [], False
        self.srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.srv.bind(path)
        self.srv.listen(4)
        self.srv.settimeout(0.5)
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while not self.stop:
            try:
                c, _ = self.srv.accept()
                self.conns.append(c)
            except socket.timeout:
                continue
            except OSError:
                return

    def send(self, key, repeat=0):
        line = f"000000037ff07bfe {repeat:02x} {key} lab-remote\n".encode()
        for c in list(self.conns):
            try:
                c.sendall(line)
            except OSError:
                self.conns.remove(c)

    def press(self, key, repeats=0, gap=0.11):
        for r in range(repeats + 1):  # a held key: lircd repeats it about every 110 ms
            self.send(key, r)
            time.sleep(gap)
        time.sleep(0.6)

    def close(self):
        self.stop = True
        for c in self.conns:
            c.close()
        self.conns = []
        self.srv.close()
        if os.path.exists(self.path):
            os.unlink(self.path)


def own_x(logdir):
    num = next(n for n in range(150, 200) if not os.path.exists(f"/tmp/.X11-unix/X{n}") and not os.path.exists(f"/tmp/.X{n}-lock"))
    p = subprocess.Popen(["Xvfb", f":{num}", "-screen", "0", "1920x1080x24", "-nolisten", "tcp", "-noreset"],
                         stdout=subprocess.DEVNULL, stderr=open(os.path.join(logdir, "xvfb.log"), "w"), start_new_session=True)
    time.sleep(2)
    return p, f":{num}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9251)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    out = tempfile.mkdtemp(prefix="icefin-lirc-")
    lircdir = os.path.join(out, "lirc")
    os.makedirs(lircdir)
    if not os.path.isdir("/run/lirc"):
        subprocess.run(["sudo", "-n", "mkdir", "-p", "/run/lirc"], check=True)  # the mount point only; stays empty
    lircd = FakeLircd(os.path.join(lircdir, "lircd"))
    xv, display = own_x(out)
    binary = os.path.join(out, "icefin-lirc")  # its own process name: other sessions clear stray icefin-player apps
    os.symlink(os.path.abspath(os.path.expanduser(a.app)), binary)
    env = dict(os.environ, DISPLAY=display, QT_QPA_PLATFORM="xcb", LC_ALL="C.UTF-8", ICEFIN_THEME_PATH=THEMES)
    log = open(os.path.join(out, "app.log"), "w")
    app = subprocess.Popen(["bwrap", "--dev-bind", "/", "/", "--bind", lircdir, "/run/lirc", "--", binary,
                            f"--config-dir={out}/config", "--windowed", "--tv", "--disable-gpu",
                            f"--remote-debugging-port={a.port}", "--log-level=info"],
                           env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    fails = []

    def check(label, ok, detail=""):
        print(f"lirc_remote: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def text():
        log.flush()
        return open(log.name, errors="replace").read()

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
        page.wait_for("!!window.api && !!window.icefinTheme && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        check("the app connected to lircd's socket", "LIRC socket connected" in text() and len(lircd.conns) >= 1,
              f"connections={len(lircd.conns)}")
        js("new Promise(r => window.api.theme.setActiveTheme('lab-screens', '', r))")
        page.wait_for("window.icefinTheme.active() && window.icefinTheme.active().route === '#/home'", timeout=20)
        foc = lambda: js("(document.querySelector('#icefin-theme-root .icefin-focused') || {}).textContent || ''")
        for _ in range(60):  # the start-up hardware self-test takes the CPU for a while: press after it
            if "self-test done" in text():
                break
            time.sleep(1)
        check("first tile focused", foc() == "one", f"focused={foc()}")
        lircd.press("KEY_RIGHT")
        time.sleep(1.5)  # past InputComponent's 650 ms auto-repeat start
        check("KEY_RIGHT moves focus once, and stays", foc() == "two", f"focused={foc()}")
        lircd.press("KEY_RIGHT", repeats=2)  # one press with two IR repeats: repeats 1 and 2 are dropped
        check("a press with IR repeats moves focus once", foc() == "three", f"focused={foc()}")
        lircd.press("KEY_LEFT")
        check("KEY_LEFT moves focus back", foc() == "two", f"focused={foc()}")
        lircd.press("KEY_OK")
        clicks = js("JSON.stringify(window.labScreens.clicks)")
        check("KEY_OK selects", clicks == '["two"]', f"clicks={clicks}")
        lircd.press("KEY_BACK")
        check("KEY_BACK is Back (offered to the screen)", js("window.labScreens.backs") == 1)
        lircd.press("KEY_SOMETHING_UNMAPPED")
        check("an unmapped key changes nothing", foc() == "two" and js("window.labScreens.clicks.length") == 1, f"focused={foc()}")

        # A lircd set up to send releases: presses follow the button.
        lircd.send("KEY_LEFT")
        time.sleep(0.15)
        lircd.send("KEY_LEFT_LIRCUP")
        time.sleep(1.5)
        check("with releases: a press and release move once", foc() == "one", f"focused={foc()}")
        lircd.send("KEY_RIGHT")
        time.sleep(1.4)  # held: InputComponent repeats from 650 ms
        lircd.send("KEY_RIGHT_LIRCUP")
        time.sleep(0.6)
        check("with releases: a held button repeats", foc() == "three", f"focused={foc()}")
        held = foc()
        time.sleep(1.0)
        check("with releases: repeat stops at the release", foc() == held)

        # lircd restarts (a package update, the remote's receiver unplugged): the app notices, keeps running.
        lircd.close()
        time.sleep(2)
        check("lircd going away is noticed", "LIRC socket disconnected" in text())
        check("the app keeps running", app.poll() is None and js("1 + 1") == 2)
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
    except Exception as ex:  # noqa: BLE001
        check("run", False, f"{type(ex).__name__}: {ex}")
    finally:
        lircd.close()
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        xv.terminate()
        log.close()
    print("lirc_remote:", "OK" if not fails else f"FAILED {fails}", "- log:", log.name)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
