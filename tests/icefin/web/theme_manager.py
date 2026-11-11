#!/usr/bin/env python3
"""theme_manager.py — Client Settings -> Theme, the theme manager (PLAN 9.21). Lab guests only; no server needed.

  1. the manager replaces the section's plain drop-down: a theme list (Off + every usable theme) and a scheme list;
  2. choosing a theme, a colour scheme or a Mode (Standard, Dark: 9.20) redraws the preview from that theme's tokens
     and applies nothing; the Mode is a preference across themes;
  3. Cancel goes back to the active theme; Apply switches the UI to the choice (no restart);
  4. install from file (installFile, the path the file chooser hands over): a zipped package inside one folder
     installs, shows in the list as yours with Remove; installing it again updates it; a package with scripts shows
     the trust row; Remove takes it away;
  5. refused packages say why and install nothing: an unsafe path ("..", which Qt's zip reader already drops), an id a
     built-in theme uses, a file that isn't a zip.
Usage: python3 theme_manager.py --app ~/build-mpv/src/icefin-player
"""
import argparse, json, os, shutil, signal, sys, tempfile, time, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
from session_play import launch, start_x  # noqa: E402
from cdp import Page  # noqa: E402

M = "#icefin-theme-manager"


def make_package(work, name, theme_id, scripts=False, top=True, extra=None):
    """A copy of the bundled Baseline package under a new id, zipped (inside one folder when top)."""
    src = os.path.join(ROOT, "themes", "baseline")
    d = os.path.join(work, theme_id)
    shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(src, d)
    meta = json.load(open(os.path.join(d, "theme.json")))
    meta.update({"id": theme_id, "name": name, "version": "1.0.0", "description": "A lab package."})
    if not scripts:
        meta.pop("scripts", None)
        os.remove(os.path.join(d, "baseline.js"))
    json.dump(meta, open(os.path.join(d, "theme.json"), "w"))
    z = os.path.join(work, f"{theme_id}{'-s' if scripts else ''}.zip")
    with zipfile.ZipFile(z, "w") as f:
        for fn in sorted(os.listdir(d)):
            f.write(os.path.join(d, fn), (theme_id + "/" if top else "") + fn)
        if extra:
            f.writestr(extra, "x")
    return z


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--port", type=int, default=9251)
    a = ap.parse_args()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-tm-")
    work = tempfile.mkdtemp(prefix="icefin-tm-pkg-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"theme_manager: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
            fails.append(label)

    try:
        page = Page(a.port, timeout=90)
        page.wait_for("!!window.api && !!window.api.theme && !!window.NativeShell", timeout=90)
        js = page.eval
        q = lambda sel: f"document.querySelector('{M} {sel}')"
        pick = lambda sel, v: js(f"(() => {{ const s = {q(sel)}; s.value = {json.dumps(v)}; s.dispatchEvent(new Event('change')); return true; }})()")
        click = lambda sel: js(f"{q(sel)}.click(); true")
        selection = lambda: js("new Promise(r => window.api.theme.selection(r))")
        options = lambda: js(f"[...{q('.icefin-tm-theme')}.options].map(o => o.value)")
        js("window.NativeShell.openClientSettings(); true")
        page.wait_for(f"!!document.querySelector('{M} .icefin-tm-theme') && document.querySelector('{M} .icefin-tm-theme').options.length > 1", timeout=20)
        usable = [t["id"] for t in js("new Promise(r => window.api.theme.themes(r))") if t["ok"]]
        check("the manager lists Off and every usable theme", sorted(options()) == sorted([""] + usable), f"{len(options())} entries")
        hidden = js("[...document.querySelectorAll('label.inputContainer')].filter(l => /^Theme:/.test((l.querySelector('.inputLabel') || {}).textContent || '') && l.querySelector('select') && !l.closest('" + M + "')).every(l => l.style.display === 'none')")
        check("the plain theme drop-down is hidden under the manager", hidden is True)
        before = selection()["theme"]

        # 2. Preview without applying: Media Center's own background, then its teal scheme's focus colour.
        pick(".icefin-tm-theme", "media-center")
        time.sleep(0.6)
        tok = js("new Promise(r => window.api.theme.previewTokens('media-center', '', '', r))")
        bg = js(f"getComputedStyle({q('.icefin-tm-preview')}).backgroundColor")
        check("choosing a theme draws its preview from its tokens", tok.get("color.background", "").lower() == "#06122b" and bg == "rgb(6, 18, 43)", bg)
        check("choosing a theme applies nothing", selection()["theme"] == before)
        check("the scheme list offers the theme's presets", js(f"[...{q('.icefin-tm-preset')}.options].map(o => o.value)") == ["", "teal"])
        pick(".icefin-tm-preset", "teal")
        time.sleep(0.6)
        focus = js(f"{q('.icefin-tm-card.focused')}.style.boxShadow")
        check("choosing a scheme redraws the preview with it", "127, 240, 226" in focus or "#7ff0e2" in focus.lower(), focus)
        check("Apply is offered for a change", js(f"{q('.icefin-tm-apply')}.disabled") is False)
        # Mode (9.20): Standard or the theme's Dark scheme, previewed before it's applied.
        check("the Mode list offers Standard and Dark", js(f"[...{q('.icefin-tm-scheme')}.options].map(o => o.textContent)") == ["Standard", "Dark"])
        pick(".icefin-tm-preset", "")
        pick(".icefin-tm-scheme", "dark")
        time.sleep(0.6)
        bg = js(f"getComputedStyle({q('.icefin-tm-preview')}).backgroundColor")
        check("choosing Dark redraws the preview with the dark scheme", bg == "rgb(2, 8, 20)", bg)
        check("choosing Dark applies nothing", selection().get("scheme", "") == "")
        pick(".icefin-tm-scheme", "")

        # 3. Cancel, then Apply (Mosaic: no backdrop, so no page reload).
        click(".icefin-tm-cancel")
        time.sleep(0.8)
        check("Cancel returns to the active theme", js(f"{q('.icefin-tm-theme')}.value") == before and js(f"{q('.icefin-tm-apply')}.disabled") is True)
        pick(".icefin-tm-theme", "mosaic")
        time.sleep(0.5)
        click(".icefin-tm-apply")
        page.wait_for("!!window.icefinTheme && window.icefinTheme.active() && window.icefinTheme.active().id === 'mosaic'", timeout=20)
        check("Apply switches the UI to the theme", selection()["theme"] == "mosaic" and js("document.documentElement.hasAttribute('data-icefin-theme')") is True,
              js(f"{q('.icefin-tm-status')}.textContent"))
        # Dark on the light theme: one Apply, the page's tokens follow, html carries the scheme.
        pick(".icefin-tm-scheme", "dark")
        time.sleep(0.4)
        click(".icefin-tm-apply")
        page.wait_for("document.documentElement.getAttribute('data-icefin-scheme') === 'dark'", timeout=20)
        page.wait_for("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-background').trim().toLowerCase() === '#111315'", timeout=20)
        check("Apply with Dark switches the theme's colours to its dark scheme", selection().get("scheme") == "dark")
        # The scheme is a preference across themes: another theme opens in its own Dark.
        pick(".icefin-tm-theme", "spark")
        time.sleep(0.5)
        check("the Mode stays Dark when another theme is chosen", js(f"{q('.icefin-tm-scheme')}.value") == "dark")
        pick(".icefin-tm-theme", "mosaic")
        time.sleep(0.4)
        pick(".icefin-tm-scheme", "")
        time.sleep(0.3)
        click(".icefin-tm-apply")
        page.wait_for("!document.documentElement.hasAttribute('data-icefin-scheme')", timeout=20)
        check("Standard again restores the theme's own colours", js("getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-background').trim().toLowerCase()") == "#dcdcde")

        # 4. Install from file, update, scripts and trust, remove.
        z = make_package(work, "Lab Installed", "lab-installed")
        r = js(f"new Promise(r => window.api.theme.installFile({json.dumps(z)}, r))")
        check("a zipped package (inside a folder) installs", r.get("ok") is True and r.get("id") == "lab-installed" and not r.get("replaced"), json.dumps(r))
        page.wait_for(f"[...{q('.icefin-tm-theme')}.options].some(o => o.value === 'lab-installed')", timeout=10)
        label = js(f"[...{q('.icefin-tm-theme')}.options].find(o => o.value === 'lab-installed').textContent")
        check("it shows in the list as yours", label == "Lab Installed (installed by you)", label)
        pick(".icefin-tm-theme", "lab-installed")
        time.sleep(0.5)
        check("Remove is offered for a theme you installed", js(f"{q('.icefin-tm-remove')}.style.display") != "none")
        flat = make_package(work, "Lab Installed", "lab-installed", top=False)
        r = js(f"new Promise(r => window.api.theme.installFile({json.dumps(flat)}, r))")
        check("installing it again updates it (a package without a folder too)", r.get("ok") is True and r.get("replaced") is True, json.dumps(r))
        zs = make_package(work, "Lab Scripted", "lab-scripted", scripts=True)
        r = js(f"new Promise(r => window.api.theme.installFile({json.dumps(zs)}, r))")
        check("a package with scripts installs and says so", r.get("ok") is True and r.get("hasScripts") is True, json.dumps(r))
        time.sleep(0.5)
        pick(".icefin-tm-theme", "lab-scripted")
        time.sleep(0.6)
        check("its scripts wait for trust: the trust row shows, unticked", js(f"{q('.icefin-tm-trust')}.style.display") == "block"
              and js(f"{q('.icefin-tm-trust-box')}.checked") is False)
        click(".icefin-tm-remove")
        page.wait_for(f"![...{q('.icefin-tm-theme')}.options].some(o => o.value === 'lab-scripted')", timeout=10)
        check("Remove takes it away", js("new Promise(r => window.api.theme.themes(r))").__len__() == len(usable) + 1)
        r = js("new Promise(r => window.api.theme.removePackage('mosaic', r))")
        check("a built-in theme can't be removed", r.get("ok") is False, json.dumps(r))

        # 5. Refusals.
        bad = make_package(work, "Lab Bad", "lab-bad", extra="../escape.txt")
        r = js(f"new Promise(r => window.api.theme.installFile({json.dumps(bad)}, r))")
        # Qt's zip reader drops ".." from entry names, so the entry lands beside the package folder instead: the
        # package is refused either way, and nothing is written outside the themes folder.
        check("a package with an unsafe path is refused", r.get("ok") is False, json.dumps(r))
        clash = make_package(work, "Not Mosaic", "mosaic")
        r = js(f"new Promise(r => window.api.theme.installFile({json.dumps(clash)}, r))")
        check("a package with a built-in theme's id is refused", r.get("ok") is False and "built-in" in " ".join(r.get("errors", [])), json.dumps(r))
        junk = os.path.join(work, "junk.zip")
        open(junk, "wb").write(b"not a zip at all")
        r = js(f"new Promise(r => window.api.theme.installFile({json.dumps(junk)}, r))")
        check("a file that isn't a zip is refused", r.get("ok") is False and "zip" in " ".join(r.get("errors", [])), json.dumps(r))
        ids = [t["id"] for t in js("new Promise(r => window.api.theme.themes(r))")]
        check("refused packages install nothing", "lab-bad" not in ids and ids.count("mosaic") == 1)

        # Off again through the manager.
        pick(".icefin-tm-theme", "")
        time.sleep(0.4)
        click(".icefin-tm-apply")
        page.wait_for("!window.icefinTheme || !window.icefinTheme.active()", timeout=20)
        check("Off through the manager restores the stock look", selection()["theme"] == "")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            try:
                os.killpg(app.pid, signal.SIGKILL)
                print("theme_manager: note: the app didn't quit within 15 s of SIGTERM", flush=True)
            except Exception:  # noqa: BLE001
                pass
        if xv:
            xv.terminate()
    print("theme_manager:", "OK" if not fails else f"FAILED {fails}", "->", cfgdir)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
