#!/usr/bin/env python3
"""steam_shortcut.py — Add to Steam in the running app (Steam Shortcut Standard v1 §6, D43, PLAN 11.10). Lab guests only.

The app is pointed at the vendored helper, its config and a fake Flatpak-Steam root (ICEFIN_STEAM_HELPER, _CONFIG,
_ROOT); the root has a signed-in account with a persona name and another non-Steam game already in shortcuts.vdf.
Signed in, on the home screen:
  - the first-run offer appears by itself, once; "Not now" writes nothing and is remembered;
  - Client Settings ends with the Steam section, just above Close, offering Add to Steam;
  - Add asks the user to quit Steam first and, for Flatpak Steam, shows the flatpak override command; Escape cancels
    with nothing written; confirming adds the shortcut (checked with the vdf parser: one IceFin entry through
    flatpak-spawn, the other game unchanged, the five images) and says "Start Steam" with the account's name;
  - the section then offers Update art and Remove from Steam; Update art re-copies the art; Remove takes ours out;
  - after a re-add and a restart with a new art export, the art in Steam is updated with no dialog, and the offer
    doesn't come back.
Usage: ~/venv-steam/bin/python tests/icefin/web/steam_shortcut.py --app ~/build-steam/src/icefin-player --server jf12
       (needs the vdf package: python3 -m venv ~/venv-steam && ~/venv-steam/bin/pip install vdf==3.4)
"""
import argparse, json, os, shutil, signal, sys, tempfile, time, zlib

import vdf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PKG = os.path.join(REPO, "packaging", "steam")
NAME, APP_ID = "IceFin Player", "io.github.stealthx3.IcefinPlayer"
OTHER = {"appid": -1234567890, "AppName": "Another Game", "Exe": '"/usr/bin/another-game"', "StartDir": '"/usr/bin/"',
         "icon": "", "ShortcutPath": "", "LaunchOptions": "", "IsHidden": 0, "AllowDesktopConfig": 1, "AllowOverlay": 1,
         "OpenVR": 0, "Devkit": 0, "DevkitGameID": "", "DevkitOverrideAppID": 0, "LastPlayTime": 1763700000,
         "FlatpakAppID": "", "tags": {"0": "Favorites"}}
DLG = "document.getElementById('icefin-steam-dialog')"
SEC = "document.getElementById('icefin-steam-section')"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9281)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    tmp = tempfile.mkdtemp(prefix="icefin-steam-web-")
    root = os.path.join(tmp, "com.valvesoftware.Steam", "data", "Steam")  # the Flatpak Steam layout
    conf = os.path.join(root, "userdata", "12345", "config")
    os.makedirs(os.path.join(conf, "grid"))
    open(os.path.join(conf, "localconfig.vdf"), "w").write('"UserLocalConfigStore"\n{\n\t"friends"\n\t{\n\t\t"PersonaName"\t\t"Lab Viewer"\n\t}\n}\n')
    vdf_path = os.path.join(conf, "shortcuts.vdf")
    open(vdf_path, "wb").write(vdf.binary_dumps({"shortcuts": {"0": dict(OTHER)}}))
    sid = (zlib.crc32(('"/usr/bin/flatpak-spawn"' + NAME).encode()) & 0xffffffff) | 0x80000000
    os.environ.update(ICEFIN_STEAM_HELPER=os.path.join(PKG, "add_to_steam.py"), ICEFIN_STEAM_CONFIG=os.path.join(PKG, "steam-shortcut.json"),
                      ICEFIN_STEAM_ROOT=root)
    xv = start_x()
    cfgdir = os.path.join(tmp, "config")
    os.makedirs(cfgdir)
    fails = []
    app = None

    def check(label, ok, detail=""):
        print(f"steam_shortcut: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    def shortcuts():
        return vdf.binary_loads(open(vdf_path, "rb").read())["shortcuts"]

    def start(signin):
        nonlocal app
        app = launch(a.app, a.port, cfgdir, open(os.path.join(tmp, f"app-{int(time.time())}.log"), "w"), "xcb")
        page = Page(a.port, timeout=90)
        if signin:
            page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
            page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(5)
            page.reconnect()
            page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
            page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
            page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(8)
            page.reconnect()
        page.wait_for("!!window.api && !!window.api.steam && !!window.NativeShell && !!document.querySelector('.skinHeader')", timeout=90)
        return page

    def stop():
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            try:
                os.killpg(app.pid, signal.SIGKILL)
            except Exception:  # noqa: BLE001
                pass

    def choose(page, choice):
        page.eval(f"{DLG}.querySelector('[data-choice=\"{choice}\"]').click(); true")

    try:
        page = start(True)
        js = page.eval
        st = js("new Promise(r => window.api.steam.state(r))")
        check("the app found the helper and the Flatpak Steam account", st.get("available") and st.get("flatpakSteam") is not None, json.dumps({k: st.get(k) for k in ("available", "checked", "steam", "present", "flatpakSteam", "offer")}))
        # ---- the first-run offer ----
        page.wait_for(f"!!{DLG}", timeout=40)
        title = js(f"{DLG}.querySelector('.formDialogHeaderTitle').textContent")
        check("the first-run offer appears by itself", title == f"Add {NAME} to Steam?", repr(title))
        choose(page, "later")
        time.sleep(1.5)
        st = js("new Promise(r => window.api.steam.state(r))")
        check("Not now: the offer is answered and nothing was written", st.get("offer") is False and len(shortcuts()) == 1 and dict(shortcuts()["0"]) == OTHER)
        # ---- Client Settings -> Steam, the last section ----
        js("window.NativeShell.openClientSettings(); true")
        page.wait_for(f"!!{SEC} && {SEC}.dataset.state === 'absent'", timeout=30)
        time.sleep(1)
        last = js(f"(() => {{ const s = {SEC}; const n = s.nextElementSibling; return !!n && n.tagName === 'DIV' && !!n.querySelector(':scope > button') && !n.nextElementSibling; }})()")
        check("Steam is the last section of Client Settings, just above Close", last is True)
        check("it offers Add to Steam", js(f"!!{SEC}.querySelector('.icefin-steam-add')") is True)
        js(f"{SEC}.querySelector('.icefin-steam-add').click(); true")
        page.wait_for(f"!!{DLG}", timeout=10)
        text = js(f"{DLG}.textContent")
        check("Add asks the user to quit Steam completely first", "Quit Steam completely" in text and "tray" in text)
        check("Flatpak Steam: the permission command is shown", "flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam" in text)
        js(f"{DLG}.querySelector('button').focus(); true")
        for t in ("keyDown", "keyUp"):
            page.send("Input.dispatchKeyEvent", type=t, key="Escape", code="Escape", windowsVirtualKeyCode=27)
        time.sleep(1)
        check("Escape cancels it with nothing written", js(f"!{DLG}") is True and len(shortcuts()) == 1)
        js(f"{SEC}.querySelector('.icefin-steam-add').click(); true")
        page.wait_for(f"!!{DLG}", timeout=10)
        choose(page, "go")
        page.wait_for(f"!!{DLG} && {DLG}.querySelector('.formDialogHeaderTitle').textContent.includes('is in Steam')", timeout=30)
        text = js(f"{DLG}.textContent")
        check("the result says to start Steam and names the account", "Start Steam" in text and "Lab Viewer" in text and "/" not in text.replace("Steam (Flatpak)", ""), repr(text))
        choose(page, "ok")
        sc = shortcuts()
        ours = [e for e in sc.values() if e.get("AppName") == NAME]
        check("one IceFin Player entry, through flatpak-spawn, the other game unchanged",
              len(sc) == 2 and len(ours) == 1 and ours[0]["Exe"] == '"/usr/bin/flatpak-spawn"' and dict(sc["0"]) == OTHER)
        grid = os.path.join(conf, "grid")
        names = [f"{sid}p.png", f"{sid}.png", f"{sid}_hero.png", f"{sid}_logo.png", f"{sid}_icon.png"]
        check("the five images are in Steam's grid", all(os.path.isfile(os.path.join(grid, n)) for n in names))
        page.wait_for(f"{SEC}.dataset.state === 'present'", timeout=20)
        check("the section now offers Update art and Remove from Steam",
              js(f"!!{SEC}.querySelector('.icefin-steam-art') && !!{SEC}.querySelector('.icefin-steam-remove')") is True)
        os.remove(os.path.join(grid, f"{sid}_logo.png"))
        js(f"{SEC}.querySelector('.icefin-steam-art').click(); true")
        page.wait_for(f"{SEC}.querySelector('.icefin-steam-note') && {SEC}.querySelector('.icefin-steam-note').textContent.length > 0", timeout=20)
        check("Update art re-copies the art", os.path.isfile(os.path.join(grid, f"{sid}_logo.png")))
        js(f"{SEC}.querySelector('.icefin-steam-remove').click(); true")
        page.wait_for(f"!!{DLG}", timeout=10)
        check("Remove asks the user to quit Steam too", "Quit Steam completely" in js(f"{DLG}.textContent"))
        choose(page, "go")
        page.wait_for(f"!!{DLG} && {DLG}.querySelector('.formDialogHeaderTitle').textContent.includes('removed')", timeout=30)
        choose(page, "ok")
        sc = shortcuts()
        check("Remove: only the other game is left, unchanged", list(sc) == ["0"] and dict(sc["0"]) == OTHER)
        check("Remove: our art is gone", not any(os.path.exists(os.path.join(grid, n)) for n in names))
        # ---- silent refresh at start ----
        js("window.api.steam.add(); true")
        time.sleep(4)
        stop()
        newpkg = os.path.join(tmp, "newart")
        shutil.copytree(PKG, newpkg)
        open(os.path.join(newpkg, "hero-3840x1240.png"), "ab").write(b"new export")
        os.environ["ICEFIN_STEAM_CONFIG"] = os.path.join(newpkg, "steam-shortcut.json")
        before = open(vdf_path, "rb").read()
        page = start(False)
        time.sleep(12)
        check("at start, new art reaches Steam with no prompt", open(os.path.join(grid, f"{sid}_hero.png"), "rb").read().endswith(b"new export")
              and page.eval(f"!{DLG}") is True)
        check("the start's refresh leaves shortcuts.vdf alone", open(vdf_path, "rb").read() == before)
        st = page.eval("new Promise(r => window.api.steam.state(r))")
        check("the offer doesn't come back", st.get("offer") is False and st.get("present") is True)
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        if app:
            stop()
        if xv:
            xv.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
    print("steam_shortcut:", "OK" if not fails else f"FAILED {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
