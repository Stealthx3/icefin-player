#!/usr/bin/env python3
"""item_actions.py — the engine's item actions for themes' item menus (ui.items, PLAN 9.60).

  - ui.items is there with its parts: menu, run, the dialogs' data;
  - menu(movie) lists the actions the user may take, grouped in order (play, go, organise, info, manage), each once,
    administrators' edits only for an administrator, Delete marked dangerous;
  - the dialogs' data reads: media info per version, the user's playlists, subtitle languages, the movie's images,
    what it is identified as;
  - More options on the engine's details screen opens the theme's menu when the theme set one (setMenu), with the item,
    and stays on the themed screen; without one it opens jellyfin-web's menu on its own page, as before;
  - lab only (it saves to the server): run('favourite') then run('unfavourite') round trip, the item as it was.
Usage: python3 item_actions.py --app ~/build/src/icefin-player --server jf12 --out ~/rit
       python3 item_actions.py --host --out ~/rit    (the user's Icefin and server, read-only)
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402
import hostmode  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app")
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9264)
    ap.add_argument("--out", required=True)
    ap.add_argument("--theme", default="media-center", help="a theme on the engine's details screen")
    hostmode.add_args(ap)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    app = xv = stop = None
    fails = []

    def check(label, ok, detail=""):
        print(f"item_actions: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        if a.host:
            page, stop = hostmode.start(a, a.out, theme=a.theme)
        else:
            cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
            cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
            srv = Server(cfg)
            srv.wait()
            xv = start_x()
            log = open(os.path.join(a.out, "app.log"), "w")
            app = launch(a.app, a.port, tempfile.mkdtemp(prefix="icefin-items-"), log, "xcb")
            page = Page(a.port, timeout=90)
            page.wait_for("typeof tryConnect === 'function' && document.getElementById('address') !== null", timeout=60)
            page.eval(f"document.getElementById('address').value = '{srv.base}'; document.getElementById('connect-form').requestSubmit(); true")
            time.sleep(5)
            page.reconnect()
            page.wait_for("typeof window.ApiClient !== 'undefined' && !!window.ApiClient.serverAddress() && !!window.api", timeout=90)
            page.eval(f"window.ApiClient.authenticateUserByName({json.dumps(cred['user'])}, {json.dumps(cred['password'])}).then(r => !!r.AccessToken)")
            page.eval(f"new Promise(r => window.api.theme.select({json.dumps(a.theme)}, '', '', r))")
            page.eval("location.hash = '#/home'; location.reload(); true", await_promise=False)
            time.sleep(8)
            page.reconnect()
        page.wait_for("!!window.icefinTheme && !!window.icefinTheme.ui && !!window.icefinTheme.ctx && !!window.ApiClient && !!window.ApiClient.getCurrentUserId()", timeout=90)
        js = page.eval
        I = "window.icefinTheme.ui.items"
        api = "window.icefinTheme.ctx.apiClient()"
        parts = js(f"(() => {{ const x = {I}; return x ? Object.keys(x).sort() : null; }})()")
        want = ["addTo", "collections", "createWith", "details", "identify", "images", "mediaInfo", "menu", "open", "remove", "run", "setMenu", "subtitles"]
        check("ui.items is there with its parts", parts is not None and all(w in parts for w in want), json.dumps(parts))
        movie = js(f"new Promise(r => {api}.getItems({api}.getCurrentUserId(), {{IncludeItemTypes: 'Movie', Recursive: true, Limit: 1, Fields: 'MediaSources'}}).then(x => r((x.Items || [])[0] || null)))")
        check("the library has a movie", bool(movie), (movie or {}).get("Name", ""))
        m = js(f"{I}.menu({{Id: {json.dumps(movie['Id'])}}}).then(m => ({{admin: m.admin, actions: m.actions, name: m.item.Name}}))")
        ids = [x["id"] for x in m["actions"]]
        groups = [x["group"] for x in m["actions"]]
        order = ["play", "go", "organise", "info", "manage"]
        check("menu(movie): actions, each once, grouped in order", ids and len(ids) == len(set(ids)) and groups == sorted(groups, key=order.index), json.dumps(ids))
        check("menu(movie): what any user may do on a movie", "addToPlaylist" in ids and ("favourite" in ids or "unfavourite" in ids) and ("played" in ids or "unplayed" in ids) and "mediaInfo" in ids, json.dumps(ids))
        admin_only = {"edit", "refresh", "images", "identify"}
        check("menu(movie): administrators' edits only for an administrator", admin_only <= set(ids) if m["admin"] else not (admin_only & set(ids)), f"admin={m['admin']}")
        dele = [x for x in m["actions"] if x["id"] == "delete"]
        check("Delete, when offered, is marked dangerous and opens a dialog (the theme confirms)", all(x.get("danger") and x.get("dialog") for x in dele), json.dumps(dele))
        info = js(f"{api}.getItem({api}.getCurrentUserId(), {json.dumps(movie['Id'])}).then(it => {I}.mediaInfo(it))")
        check("mediaInfo: a section per version, with its streams", bool(info) and bool(info[0]["rows"]), json.dumps(info)[:200])
        data = js(f"(async () => ({{pl: (await {I}.collections('Playlist')).length, langs: {I}.subtitles.languages.length, imgs: (await {I}.images.list({{Id: {json.dumps(movie['Id'])}}}, 'Primary')).length, kind: {I}.identify.kind({{Type: 'Movie'}}), modes: {I}.refreshModes.length, locks: {I}.details.lockFields.length}}))()")
        check("the dialogs' data reads", data["langs"] >= 10 and data["imgs"] >= 0 and data["kind"] == "Movie" and data["modes"] == 4 and data["locks"] >= 5, json.dumps(data))

        # More options: the theme's menu when it set one, else jellyfin-web's
        det = f"#/details?id={movie['Id']}&serverId=' + {api}.serverId() + '"
        more = "(() => { const b = document.querySelector('#icefin-theme-root .icefin-d-btn[data-action=\"more\"]'); if (!b) return false; b.click(); return true; })()"
        js(f"window.__menuSaw = null; window.__prevMenu = {I}.hasMenu(); {I}.setMenu((it, where) => {{ window.__menuSaw = it.Id; }}); true")
        js(f"location.hash = '{det}'; true")
        page.wait_for("!!document.querySelector('#icefin-theme-root[data-icefin-details-ready]')", timeout=30)
        time.sleep(1)
        clicked = js(more)
        time.sleep(1)
        check("More options opens the theme's menu with the item, on the themed screen", clicked and js("window.__menuSaw") == movie["Id"] and "icefin=stock" not in js("location.hash"), js("location.hash"))
        js(f"{I}.setMenu(null); true")
        js(more)
        try:
            page.wait_for("location.hash.includes('icefinmore=1')", timeout=10)
            stock = True
        except Exception:  # noqa: BLE001
            stock = False
        check("without a theme menu, More options opens jellyfin-web's on its page (as before)", stock, js("location.hash"))
        js("location.hash = '#/home'; true")
        time.sleep(2)

        if not a.host:
            before = js(f"{api}.getItem({api}.getCurrentUserId(), {json.dumps(movie['Id'])}).then(it => !!(it.UserData || {{}}).IsFavorite)")
            js(f"{I}.run('{'unfavourite' if before else 'favourite'}', {{Id: {json.dumps(movie['Id'])}}})")
            mid = js(f"{api}.getItem({api}.getCurrentUserId(), {json.dumps(movie['Id'])}).then(it => !!(it.UserData || {{}}).IsFavorite)")
            js(f"{I}.run('{'favourite' if before else 'unfavourite'}', {{Id: {json.dumps(movie['Id'])}}})")
            after = js(f"{api}.getItem({api}.getCurrentUserId(), {json.dumps(movie['Id'])}).then(it => !!(it.UserData || {{}}).IsFavorite)")
            check("run(): favourite round trip, the item as it was", mid != before and after == before, f"{before} -> {mid} -> {after}")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        if stop:
            stop()
        if app:
            try:
                os.killpg(app.pid, signal.SIGTERM)
                app.wait(15)
            except Exception:  # noqa: BLE001
                pass
        if xv:
            xv.terminate()
    print("item_actions:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
