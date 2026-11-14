#!/usr/bin/env python3
"""controller_run.py — the controller run (PLAN 7.6, D28): every controller family, inside and outside Steam, on every
screen. Lab only: the pads are virtual (vpads.py), each seen by the kernel, SDL3 and Icefin as the real one.

Parts (--parts, default all):
  pads   outside Steam, one app run, the pads plugged in one after another (Xbox Series, 8BitDo, DualSense, Switch
         Pro): SDL's name and Icefin's family; the button prompts (<html data-icefin-glyphs>, icefinTheme.glyph);
         every control of the standard action map gives its action exactly once (D-pad, left stick, south, east, west,
         north, Start, View, shoulders, triggers, right stick; Guide gives none); the Nintendo layout swaps A and B on
         the Switch Pro only; Client Settings -> Controllers lists the pad; unplugging removes it. A Steam Virtual
         Gamepad outside Steam stays hidden (SDL's rule).
  steam  inside Steam, one app run per physical pad, with the environment Steam gives a game (its virtual pad allowed,
         the physical pad it took over in SDL's ignore list): only the virtual pad is listed, its prompts are the
         physical pad's family, a press on it acts once, a press on the hidden physical pad does nothing.
  walk   every screen: from Home, the pad alone opens each screen it can reach (South on each control the D-pad
         reaches, East back), stock jellyfin-web and each bundled theme, a different pad family driving each walk
         and one walk inside Steam. Required screens must be reached; each screen's Back must return.
Writes run.json (every check, the screens each walk reached) and screenshots to --out.
Needs a build with -DENABLE_SDL2=OFF -DICEFIN_SDL3=ON, /dev/uinput and /dev/uhid (scripts/lab/70-icefin-lab-pads.rules)
and python3-evdev. Waits while another test's pad is plugged in.
Usage: python3 controller_run.py --app ~/build-matrix/src/icefin-player --server jf12 --out ~/crun [--parts pads,steam]
"""
import argparse, base64, json, os, re, signal, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import start_x, JF, LAB_DISPLAY  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import vpads  # noqa: E402

GLYPH_SOUTH = {"xbox": "A", "playstation": "cross", "nintendo": "B"}
SDL_NAME = {"xbox": "Xbox Series X Controller", "8bitdo": "8BitDo Pro 2 Wired Controller",
            "dualsense": "DualSense Wireless Controller", "switchpro": "Nintendo Switch Pro Controller"}
# The standard action map (SPEC, Controller support; src/icefin/inputmaps/icefin-gamepad.json): control -> action
ACTIONS = [("up", "up"), ("down", "down"), ("left", "left"), ("right", "right"),
           (("lx", -1), "left"), (("lx", 1), "right"), (("ly", -1), "up"), (("ly", 1), "down"),
           ("south", "enter"), ("east", "back"), ("west", "menu"), ("north", "search"), ("start", "play_pause"),
           ("back", "home"), ("l1", "step_backward"), ("r1", "step_forward"), ("l2", "seek_backward"),
           ("r2", "seek_forward"), (("ry", -1), "increase_volume"), (("ry", 1), "decrease_volume"), ("guide", None)]
# What Steam puts in SDL_GAMECONTROLLER_IGNORE_DEVICES for the physical pad it took over
STEAM_IGNORE = {"dualsense": "0x054c/0x0ce6", "switchpro": "0x057e/0x2009", "xbox": "0x045e/0x0b12"}


def other_pads():
    """Gamepads in the guest that aren't this run's (another test's virtual pad): the app would take their presses."""
    try:
        blocks = open("/proc/bus/input/devices").read().split("\n\n")
    except OSError:
        return 0
    return sum(1 for b in blocks if re.search(r"X-Box|Xbox|Gamepad|Controller|DualSense|8BitDo", b) and "vpads" not in b
               and "Motion Sensors" not in b and "Touchpad" not in b and "(IMU)" not in b)


def wait_quiet(limit=3600):
    t0 = time.time()
    while other_pads() and time.time() - t0 < limit:
        time.sleep(10)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9247)
    ap.add_argument("--out", required=True)
    ap.add_argument("--parts", default="pads,steam,walk")
    ap.add_argument("--themes", default="", help="walk only these (comma-separated; 'stock' for no theme)")
    ap.add_argument("--minutes", type=float, default=10, help="time per walk")
    ap.add_argument("--pads", default="xbox,8bitdo,dualsense,switchpro", help="the pads part: which pads, in order")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    parts = set(a.parts.split(","))
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    wait_quiet()
    xv = start_x()
    base_env = dict(os.environ, DISPLAY=LAB_DISPLAY, QT_QPA_PLATFORM="xcb", LC_ALL="C.UTF-8")
    report = {"checks": [], "walks": {}}
    fails = []
    state = {"app": None, "log": None, "pads": []}

    def check(label, ok, detail="", soft=False):
        print(f"controller_run: {'ok  ' if ok else ('note' if soft else 'FAIL')} {label} {detail}"[:400], flush=True)
        report["checks"].append({"label": label, "ok": bool(ok), "soft": soft, "detail": str(detail)[:400]})
        if not ok and not soft:
            fails.append(label)

    def save():
        json.dump(report, open(os.path.join(a.out, "run.json"), "w"), indent=1)

    def start(tag, env):
        cfgdir = tempfile.mkdtemp(prefix=f"icefin-crun-{tag}-")
        state["log"] = open(os.path.join(a.out, f"app-{tag}.log"), "w")
        state["app"] = subprocess.Popen([os.path.expanduser(a.app), f"--config-dir={cfgdir}", "--windowed", "--tv", "--disable-gpu",
                                         f"--remote-debugging-port={a.port}", "--log-level=info"], env=env,
                                        stdout=state["log"], stderr=subprocess.STDOUT, start_new_session=True)
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
        page.wait_for("!!window.api && !!window.api.gamepads && !!window.icefinTheme && !!window.icefinTheme._engine", timeout=90)
        return page

    def stop():
        for p in state["pads"]:
            try:
                p.close()
            except Exception:  # noqa: BLE001
                pass
        state["pads"] = []
        if state["app"]:
            try:
                os.killpg(state["app"].pid, signal.SIGTERM)
                state["app"].wait(20)
            except Exception:  # noqa: BLE001
                try:
                    os.killpg(state["app"].pid, signal.SIGKILL)
                except Exception:  # noqa: BLE001
                    pass
            state["app"] = None

    def plug(kind):
        p = vpads.make(kind)
        state["pads"].append(p)
        return p

    def unplug(p):
        p.close()
        state["pads"].remove(p)

    def pads_listed(page):
        return page.eval("new Promise(r => window.api.gamepads.list(r))") or []

    def watch_actions(page):
        """Record each action the input pipeline delivers, and keep it from acting (the screen stays put)."""
        page.eval("(() => { window.labActions = []; if (!window.labActionHook) window.labActionHook = "
                  "window.icefinTheme._engine.addActionHook((a) => { if (!window.labActionsPass) { window.labActions.push(a); return true; } return false; }); "
                  "window.labActionsPass = false; return true; })()")

    def actions_for(page, pad, control):
        page.eval("window.labActions = []; true")
        if isinstance(control, tuple):
            axis, v = control
            pad.stick(axis, v)
            time.sleep(0.15)
            pad.stick(axis, 0)
        else:
            vpads.press(pad, control)
        time.sleep(0.5)
        return page.eval("window.labActions.slice()")

    try:
        # ---------------------------------------------------------------- outside Steam
        if "pads" in parts:
            page = start("pads", base_env)
            js = page.eval
            check("built with the SDL3 layer", js("new Promise(r => window.api.gamepads.available(r))") is True)
            watch_actions(page)
            sv = plug("steam")
            time.sleep(3)
            check("outside Steam, a Steam Virtual Gamepad stays hidden (SDL)", not any("Steam" in (x.get("name") or "") for x in pads_listed(page)),
                  json.dumps(pads_listed(page)))
            unplug(sv)
            for kind in a.pads.split(","):
                fam = vpads.FAMILY[kind]
                watch_actions(page)   # again: a page reload drops the hook
                p = plug(kind)
                try:
                    page.wait_for("new Promise(r => window.api.gamepads.list(l => r(l.length === 1)))", timeout=20)
                except Exception:  # noqa: BLE001
                    pass
                listed = pads_listed(page)
                pd = listed[0] if listed else {}
                check(f"{kind}: SDL names it and Icefin gives it the {fam} family", len(listed) == 1 and pd.get("name") == SDL_NAME[kind]
                      and pd.get("family") == fam, json.dumps(listed))
                # prompts follow the pad used last: press something first
                actions_for(page, p, "down")
                g = js("document.documentElement.getAttribute('data-icefin-glyphs')")
                south = js("(window.icefinTheme.glyph('south').match(/aria-label=\"([^\"]+)\"/) || [])[1] || ''")
                check(f"{kind}: button prompts are {fam}'s", g == fam and south == GLYPH_SOUTH[fam], f"glyphs={g} south={south}")
                wrong = []
                for control, want in ACTIONS:
                    got = actions_for(page, p, control)
                    if got != ([want] if want else []):
                        wrong.append(f"{control}: {got} (want {want})")
                check(f"{kind}: every control of the action map acts once", not wrong, "; ".join(wrong))
                if kind == "switchpro":
                    js("new Promise(r => window.api.settings.setValue('main', 'icefin_nintendo_layout', true, () => r(true)))")
                    time.sleep(0.8)
                    e_, s_ = actions_for(page, p, "east"), actions_for(page, p, "south")
                    check("switchpro: the Nintendo layout makes A (east) confirm and B (south) go back", e_ == ["enter"] and s_ == ["back"], f"east={e_} south={s_}")
                    js("new Promise(r => window.api.settings.setValue('main', 'icefin_nintendo_layout', false, () => r(true)))")
                    time.sleep(0.8)
                # Client Settings from Home, and back to Home (history.back() can leave the web client and reload it)
                js("window.labActionsPass = true; location.hash = '#/home'; true")
                time.sleep(2)
                js("window.NativeShell.openClientSettings(); true")
                visible_row = ("(() => { const s = [...document.querySelectorAll('#icefin-controllers-section')].find((x) => x.getClientRects().length); "
                               "const r = s && s.querySelector('.icefin-pad-row'); return r ? r.textContent : ''; })()")
                try:
                    page.wait_for(f"!!{visible_row}", timeout=20)
                    row = js(visible_row)
                except Exception:  # noqa: BLE001
                    row = "not shown: " + str(js("location.hash"))
                    open(os.path.join(a.out, f"controllers-{kind}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
                check(f"{kind}: Client Settings -> Controllers lists it", fam in row and SDL_NAME[kind].split()[0] in row, row[:300])
                js("location.hash = '#/home'; true")
                time.sleep(2)
                js("window.labActionsPass = false; true")
                time.sleep(1.5)
                unplug(p)
                try:
                    page.wait_for("new Promise(r => window.api.gamepads.list(l => r(l.length === 0)))", timeout=15)
                    gone = True
                except Exception:  # noqa: BLE001
                    gone = False
                check(f"{kind}: unplugging removes it", gone)
                save()
            stop()

        # ---------------------------------------------------------------- inside Steam
        if "steam" in parts:
            for kind in ("dualsense", "switchpro", "xbox"):
                fam = vpads.FAMILY[kind]
                env = dict(base_env, SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD="1", SDL_GAMECONTROLLER_IGNORE_DEVICES=STEAM_IGNORE[kind])
                page = start(f"steam-{kind}", env)
                js = page.eval
                watch_actions(page)
                phys, sv = plug(kind), plug("steam")
                time.sleep(4)
                listed = pads_listed(page)
                check(f"Steam with a {kind}: only Steam's virtual pad is listed", len(listed) == 1 and "Steam" in (listed[0].get("name") or ""),
                      json.dumps(listed))
                actions_for(page, sv, "down")
                g = js("document.documentElement.getAttribute('data-icefin-glyphs')")
                check(f"Steam with a {kind}: prompts are the {fam} pad's", g == fam, f"glyphs={g}")
                got = [actions_for(page, sv, c) for c in ("south", "east", "up")]
                check(f"Steam with a {kind}: a press on the virtual pad acts once", got == [["enter"], ["back"], ["up"]], json.dumps(got))
                hidden = [actions_for(page, phys, c) for c in ("south", "right")]
                check(f"Steam with a {kind}: the physical pad Steam took over does nothing", hidden == [[], []], json.dumps(hidden))
                stop()
                save()

        # ---------------------------------------------------------------- every screen
        if "walk" in parts:
            import controller_walk  # noqa: E402
            controller_walk.run(a, start, stop, plug, check, report, save, base_env)
    except Exception as ex:  # noqa: BLE001 (reported, so a run that stops early never passes silently)
        check("the run itself", False, f"{type(ex).__name__}: {ex}")
    finally:
        stop()
        save()
        if xv:
            xv.terminate()
    print(f"controller_run: {'FAILED ' + str(fails) if fails else 'all passed'} -> {a.out}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
