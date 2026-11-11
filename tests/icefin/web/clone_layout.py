#!/usr/bin/env python3
"""clone_layout.py — a clone theme against its reference spec (PLAN 9.1/9.10). Lab guests only.

One checker for every clone: docs/themes/references/<theme>.json holds the target's measurements at 1920x1080 (from
real captures for the GPL and workstation targets, from published guidelines and paused demo videos for the
proprietary ones; the spec names its sources). For each state the checker drives the theme with the engine's own
actions, waits for the motion to settle, and compares element boxes (scaled from the window to 1920x1080) with the
spec within its pixel tolerance; then it reads the CSS transitions and animations the spec names and compares them
with the reference timings (within 10%, the SPEC's acceptance) and easings.

Spec format (all keys but theme/states optional):
  {"theme": "harbor", "target": "...", "sources": [...], "tolerancePx": 12, "timingTolerance": 0.1,
   "ready": "<js expression true once the screen is up>",
   "states": [{"name": "...", "actions": ["down", {"repeat": "down", "until": "<js>", "max": 12}], "settleMs": 900,
               "boxes": {"label": {"sel": "css", "index": 0, "x": 0, "y": 240, "w": 462, "h": 95, "tol": 8}},
               "text": {"label": {"sel": "css", "index": 0, "x": 104, "cy": 288, "right": 1892}}}],
   "timings": [{"name": "...", "sel": "css", "kind": "transition", "property": "transform", "ms": 500,
                "easing": "cubic-bezier(0.215, 0.61, 0.355, 1)", "delayMs": 0}]}
Box keys: x, y, w, h, right, bottom, cx, cy (reference px). Text boxes measure the element's text (a DOM Range), so
font padding doesn't count. A selector's index picks among matches (negative counts from the end).
Usage: python3 clone_layout.py --app ~/build/src/icefin-player --server jf12 --theme harbor --out ~/r91/harbor
"""
import argparse, base64, json, os, re, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

SPECS = os.path.join(HERE, "..", "..", "..", "docs", "themes", "references")

MEASURE = r"""(spec => {
  const pick = (s) => { const all = [...document.querySelectorAll(s.sel)]; const i = s.index || 0; return all[i < 0 ? all.length + i : i] || null; };
  const sx = 1920 / window.innerWidth, sy = 1080 / window.innerHeight;
  const out = {};
  for (const [kind, group] of [['boxes', spec.boxes || {}], ['text', spec.text || {}]]) {
    for (const [label, s] of Object.entries(group)) {
      const e = pick(s);
      if (!e) { out[label] = null; continue; }
      let r = e.getBoundingClientRect();
      if (kind === 'text') { const rg = document.createRange(); rg.selectNodeContents(e); const rr = rg.getBoundingClientRect(); if (rr.width) r = rr; }
      out[label] = { x: r.left * sx, y: r.top * sy, w: r.width * sx, h: r.height * sy, right: r.right * sx, bottom: r.bottom * sy,
                     cx: (r.left + r.width / 2) * sx, cy: (r.top + r.height / 2) * sy };
    }
  }
  return JSON.stringify(out);
})"""

TIMING = r"""(t => {
  const e = document.querySelector(t.sel);
  if (!e) return null;
  const cs = getComputedStyle(e);
  const list = (v) => v.split(/,(?![^(]*\))/).map((x) => x.trim());
  const ms = (v) => v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
  if (t.kind === 'animation') {
    const names = list(cs.animationName), i = Math.max(0, t.name_ ? names.indexOf(t.name_) : 0);
    return JSON.stringify({ ms: ms(list(cs.animationDuration)[i] || '0s'), easing: list(cs.animationTimingFunction)[i] || '', delayMs: ms(list(cs.animationDelay)[i] || '0s'), name: names[i] });
  }
  const props = list(cs.transitionProperty);
  let i = props.indexOf(t.property || 'all');
  if (i < 0) i = props.indexOf('all');
  if (i < 0) return JSON.stringify({ ms: 0, easing: '', delayMs: 0, props: props.join(' ') });
  const pickAt = (v) => { const a = list(v); return a[i % a.length]; };
  return JSON.stringify({ ms: ms(pickAt(cs.transitionDuration)), easing: pickAt(cs.transitionTimingFunction), delayMs: ms(pickAt(cs.transitionDelay)) });
})"""


def norm_easing(s):
    s = (s or "").replace(" ", "")
    named = {"ease": "cubic-bezier(0.25,0.1,0.25,1)", "linear": "linear", "ease-in": "cubic-bezier(0.42,0,1,1)",
             "ease-out": "cubic-bezier(0,0,0.58,1)", "ease-in-out": "cubic-bezier(0.42,0,0.58,1)"}
    s = named.get(s, s)
    m = re.match(r"cubic-bezier\(([^)]*)\)", s)
    return tuple(round(float(v), 2) for v in m.group(1).split(",")) if m else s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--theme", required=True)
    ap.add_argument("--spec", help="default: docs/themes/references/<theme>.json")
    ap.add_argument("--port", type=int, default=9251)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.spec or os.path.join(SPECS, f"{a.theme}.json")))
    assert spec["theme"] == a.theme, "the spec is for another theme"
    os.makedirs(a.out, exist_ok=True)
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix=f"icefin-ref-{a.theme}-")
    log = open(os.path.join(a.out, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails, report = [], {"theme": a.theme, "target": spec.get("target"), "states": {}, "timings": {}}
    tag = f"clone_layout[{a.theme}]"

    def check(label, ok, detail=""):
        print(f"{tag}: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
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
        page.wait_for("!!window.api && !!window.icefinTheme && !!window.icefinTheme.ui && !!document.querySelector('.skinHeader')", timeout=90)
        js = page.eval
        ready = spec.get("ready", "!!document.querySelector('#icefin-theme-root:not([hidden])')")
        pkg = json.load(open(os.path.join(HERE, "..", "..", "..", "themes", a.theme, "theme.json")))
        if "backdrop" in pkg:  # a native backdrop: the page reloads once over it (8.4)
            page.switch_theme_reloading(a.theme, ready)
        else:
            js(f"new Promise(r => window.api.theme.setActiveTheme({json.dumps(a.theme)}, '', r))")
            page.wait_for(ready, timeout=60)
        js("window.icefinTheme.ui.motion.cap('normal'); true")
        vw, vh = js("[window.innerWidth, window.innerHeight]")
        check("window is 16:9 (boxes scale to 1920x1080)", abs(vw / vh - 16 / 9) < 0.01, f"{vw}x{vh}")
        tol_all = spec.get("tolerancePx", 12)
        for st in spec["states"]:
            for act in st.get("actions", []):
                if isinstance(act, dict):  # {"repeat": action, "until": js, "max": n}: walk until the condition holds
                    for _ in range(act.get("max", 12)):
                        if js(f"!!({act['until']})"):
                            break
                        js(f"window.icefinTheme.handleAction({json.dumps(act['repeat'])})")
                        time.sleep(st.get("stepMs", 700) / 1000)
                    if not js(f"!!({act['until']})"):
                        raise RuntimeError(f"{st['name']}: never reached {act['until']}")
                    continue
                js(f"window.icefinTheme.handleAction({json.dumps(act)})")
                time.sleep(st.get("stepMs", 700) / 1000)
            time.sleep(st.get("settleMs", 900) / 1000)
            for expr in st.get("log", []):  # spec debugging: print these expressions' values
                print(f"{tag}: log {st['name']}: {expr} = {js(expr)}", flush=True)
            got = json.loads(js(f"{MEASURE}({json.dumps({'boxes': st.get('boxes', {}), 'text': st.get('text', {})})})"))
            report["states"][st["name"]] = got
            for group in ("boxes", "text"):
                for label, want in st.get(group, {}).items():
                    have = got.get(label)
                    if have is None:
                        check(f"{st['name']}: {label}", False, f"nothing matches {want['sel']}")
                        continue
                    tol = want.get("tol", tol_all)
                    off = {k: round(have[k] - want[k]) for k in ("x", "y", "w", "h", "right", "bottom", "cx", "cy") if k in want}
                    check(f"{st['name']}: {label}", all(abs(v) <= tol for v in off.values()),
                          "off by " + ", ".join(f"{k} {v:+d}" for k, v in off.items()) + f" (±{tol})")
            open(os.path.join(a.out, f"{st['name']}.png"), "wb").write(base64.b64decode(page.send("Page.captureScreenshot", format="png")["data"]))
        ttol = spec.get("timingTolerance", 0.1)
        for t in spec.get("timings", []):
            q = dict(t, name_=t.get("animation"))
            got = js(f"{TIMING}({json.dumps(q)})")
            got = json.loads(got) if got else None
            report["timings"][t["name"]] = got
            if got is None:
                check(f"timing: {t['name']}", False, f"nothing matches {t['sel']}")
                continue
            ok = abs(got["ms"] - t["ms"]) <= ttol * t["ms"]
            if "easing" in t:
                ok = ok and norm_easing(got["easing"]) == norm_easing(t["easing"])
            if "delayMs" in t:
                ok = ok and abs(got["delayMs"] - t["delayMs"]) <= max(20, ttol * t["delayMs"])
            check(f"timing: {t['name']}", ok, f"{got['ms']:.0f} ms {got['easing']} (ref {t['ms']} ms {t.get('easing', '')})")
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        json.dump(report, open(os.path.join(a.out, "measured.json"), "w"), indent=1)
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        if xv:
            xv.terminate()
        log.close()
    print(f"{tag}:", "OK" if not fails else f"FAILED {fails}", "->", a.out)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
