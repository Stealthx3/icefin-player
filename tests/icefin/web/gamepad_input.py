#!/usr/bin/env python3
"""gamepad_input.py — the SDL3 controller layer in the running app (PLAN 7.1-7.3, 7.5). Lab guests only.

Needs a build with -DENABLE_SDL2=OFF -DICEFIN_SDL3=ON, /dev/uinput and python3-evdev. A virtual Xbox-360-style pad
(uinput) drives a themed screen (lab-screens) in TV mode, so presses take the real path: SDL3 -> GamepadService ->
InputComponent -> inputPlugin.js -> the theme runtime's focus engine. Checks:
  - hotplug: the pad appears in api.gamepads with family "xbox", and disappears when unplugged;
  - D-pad and left stick move focus, south selects, east is Back;
  - button prompts: <html data-icefin-glyphs="xbox">, icefinTheme.glyph('south') draws "A";
  - the page's Gamepad API shows no pads;
  - Client Settings -> Controllers lists the pad;
  - a Nintendo-style pad (reported only: SDL needs its mapping for evdev pads).
Usage: python3 gamepad_input.py --app ~/build-sdl3/src/icefin-player --server jf12
"""
import argparse, json, os, signal, subprocess, sys, tempfile, time

from evdev import UInput, AbsInfo, ecodes as e

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

THEMES = os.path.abspath(os.path.join(HERE, "..", "themes"))
CAPS = {e.EV_KEY: [e.BTN_SOUTH, e.BTN_EAST, e.BTN_NORTH, e.BTN_WEST, e.BTN_TL, e.BTN_TR, e.BTN_SELECT, e.BTN_START,
                   e.BTN_MODE, e.BTN_THUMBL, e.BTN_THUMBR],
        e.EV_ABS: [(a, AbsInfo(0, -32768, 32767, 16, 128, 0)) for a in (e.ABS_X, e.ABS_Y, e.ABS_RX, e.ABS_RY)]
                  + [(a, AbsInfo(0, 0, 255, 0, 0, 0)) for a in (e.ABS_Z, e.ABS_RZ)]
                  + [(a, AbsInfo(0, -1, 1, 0, 0, 0)) for a in (e.ABS_HAT0X, e.ABS_HAT0Y)]}


def pad(name="Microsoft X-Box 360 pad", vendor=0x045E, product=0x028E):
    return UInput(CAPS, name=name, vendor=vendor, product=product, version=0x110, bustype=e.BUS_USB)


def press(ui, code, hold=0.12):
    ui.write(e.EV_KEY, code, 1); ui.syn(); time.sleep(hold)
    ui.write(e.EV_KEY, code, 0); ui.syn(); time.sleep(0.5)


def hat(ui, axis, v):
    ui.write(e.EV_ABS, axis, v); ui.syn(); time.sleep(0.12)
    ui.write(e.EV_ABS, axis, 0); ui.syn(); time.sleep(0.5)


def stick(ui, axis, v):
    ui.write(e.EV_ABS, axis, v); ui.syn(); time.sleep(0.15)
    ui.write(e.EV_ABS, axis, 0); ui.syn(); time.sleep(0.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9238)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-pad-")
    env = dict(os.environ, DISPLAY=":99", QT_QPA_PLATFORM="xcb", LC_ALL="C.UTF-8", ICEFIN_THEME_PATH=THEMES)
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = subprocess.Popen([os.path.expanduser(a.app), f"--config-dir={cfgdir}", "--windowed", "--tv", "--disable-gpu",
                            f"--remote-debugging-port={a.port}", "--log-level=info"], env=env, stdout=log, stderr=subprocess.STDOUT,
                           start_new_session=True)
    fails = []
    ui = None

    def check(label, ok, detail="", soft=False):
        print(f"gamepad_input: {'ok  ' if ok else ('note' if soft else 'FAIL')} {label} {detail}", flush=True)
        if not ok and not soft:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("document.getElementById('address') !== null", timeout=60)
        page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
        time.sleep(5)
        page.reconnect()
        page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
        page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
        page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
        time.sleep(8)
        page.reconnect()
        page.wait_for("!!window.api && !!window.api.gamepads && !!window.icefinTheme && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        check("built with the SDL3 layer", js("new Promise(r => window.api.gamepads.available(r))") is True)
        js("new Promise(r => window.api.theme.setActiveTheme('lab-screens', '', r))")
        page.wait_for("window.icefinTheme.active() && window.icefinTheme.active().route === '#/home'", timeout=20)
        js("window.labPageKeys = 0; document.addEventListener('keydown', () => window.labPageKeys++, true); true")
        subprocess.run(["xdotool", "search", "--sync", "--onlyvisible", "--pid", str(app.pid), "windowactivate", "--sync"], env=env, capture_output=True, timeout=10)

        ui = pad()
        page.wait_for("new Promise(r => window.api.gamepads.list(l => r(l.length === 1)))", timeout=15)
        pads = js("new Promise(r => window.api.gamepads.list(r))")
        check("hotplug: pad listed", pads[0]["family"] == "xbox", json.dumps(pads[0]))
        foc = lambda: js("(document.querySelector('#icefin-theme-root .icefin-focused') || {}).textContent || ''")
        check("first tile focused", foc() == "one")
        hat(ui, e.ABS_HAT0X, 1)
        check("D-pad right moves focus", foc() == "two", f"focused={foc()}")
        stick(ui, e.ABS_X, 32000)
        check("left stick right moves focus", foc() == "three", f"focused={foc()}")
        hat(ui, e.ABS_HAT0X, -1)
        press(ui, e.BTN_SOUTH)
        clicks = js("JSON.stringify(window.labScreens.clicks)")
        check("south selects", clicks == '["two"]', f"clicks={clicks}")
        press(ui, e.BTN_EAST)
        check("east is Back (offered to the screen)", js("window.labScreens.backs") == 1)
        check("no key reached the page directly", js("window.labPageKeys") == 0, f"page keys={js('window.labPageKeys')}")
        check("button prompts follow the pad", js("document.documentElement.getAttribute('data-icefin-glyphs')") == "xbox"
              and ">A<" in js("window.icefinTheme.glyph('south')"))
        check("page Gamepad API shows no pads", js("navigator.getGamepads().length") == 0)

        js("window.NativeShell.openClientSettings(); true")
        page.wait_for("document.querySelectorAll('#icefin-controllers-section .icefin-pad-row').length === 1", timeout=20)
        check("Client Settings lists the pad", "xbox" in js("document.querySelector('#icefin-controllers-section .icefin-pad-row').textContent"))
        # 7.2: remap south to Back in the editor, save, and press it.
        js("document.querySelector('#icefin-controllers-section .icefin-pad-remap').click(); true")
        page.wait_for("document.querySelectorAll('#icefin-controllers-section .icefin-remap-select').length === 12", timeout=10)
        check("remap editor lists 12 buttons with their standard actions", "standard: Select" in js("document.querySelector('#icefin-controllers-section .icefin-remap').textContent"))
        js("(() => { const s = document.querySelector('.icefin-remap-select[data-code=PAD_SOUTH]'); s.value = 'back'; s.dispatchEvent(new Event('change')); "
           "document.querySelector('.icefin-remap-save').click(); return true; })()")
        time.sleep(1)
        name = pads[0]["name"]
        check("remap saved for this controller", js("new Promise(r => window.api.gamepads.remaps(r))").get(name) == {"PAD_SOUTH": "back"})
        js("document.querySelector('.dialogContainer').remove(); true")
        backs, clicks0 = js("window.labScreens.backs"), js("window.labScreens.clicks.length")
        press(ui, e.BTN_SOUTH)
        check("remapped south now goes Back", js("window.labScreens.backs") == backs + 1 and js("window.labScreens.clicks.length") == clicks0)
        js("new Promise(r => { window.api.gamepads.setRemap(%s, {PAD_SOUTH: 'none'}); r(true); })" % json.dumps(name))
        time.sleep(0.5)
        press(ui, e.BTN_SOUTH)
        check("remapped to nothing: no action", js("window.labScreens.backs") == backs + 1 and js("window.labScreens.clicks.length") == clicks0)
        js("new Promise(r => { window.api.gamepads.setRemap(%s, {}); r(true); })" % json.dumps(name))
        time.sleep(0.5)
        press(ui, e.BTN_SOUTH)
        check("reset: south selects again", js("window.labScreens.clicks.length") == clicks0 + 1)

        ui.close()
        ui = None
        page.wait_for("new Promise(r => window.api.gamepads.list(l => r(l.length === 0)))", timeout=15)
        check("hotplug: pad removed", True)

        n = pad("Nintendo Switch Pro Controller", 0x057E, 0x2009)
        time.sleep(2)
        fam = [p["family"] for p in js("new Promise(r => window.api.gamepads.list(r))")]
        check("Nintendo-style pad family", fam == ["nintendo"], f"families={fam} (evdev pads need an SDL mapping)", soft=True)
        n.close()
        js("new Promise(r => window.api.theme.setActiveTheme('', '', r))")
    except Exception as ex:  # noqa: BLE001
        check("run", False, f"{type(ex).__name__}: {ex}")
    finally:
        if ui:
            ui.close()
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        if xv:
            xv.terminate()
        log.close()
    print("gamepad_input:", "OK" if not fails else f"FAILED {fails}", "- log:", log.name)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
