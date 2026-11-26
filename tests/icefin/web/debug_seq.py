#!/usr/bin/env python3
"""Debug: run a JSON list of steps ({"js": ...} printed, {"key": name}, {"sleep": s}, {"route": hash}) in a theme."""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "servers"))
import input_walk as iw  # noqa: E402
ap = argparse.ArgumentParser()
ap.add_argument("steps"); ap.add_argument("--app", default="~/build-qa76/src/icefin-player"); ap.add_argument("--server", default="jf12")
ap.add_argument("--port", type=int, default=9456); ap.add_argument("--display", default=":156")
ap.add_argument("--theme", default="media-center"); ap.add_argument("--mode", default="tv"); ap.add_argument("--user", default="")
ap.add_argument("--out", default="/tmp/debug-seq")
a = ap.parse_args(); a.sdl_only = "0x0000/0x0000"
os.makedirs(a.out, exist_ok=True); os.environ["ICEFIN_LAB_DISPLAY"] = a.display
VK = {"Enter": 13, "Escape": 27, "Backspace": 8, "ArrowDown": 40, "ArrowUp": 38, "ArrowRight": 39, "ArrowLeft": 37}
steps = json.load(open(a.steps))
app = iw.LabApp(a)
try:
    iw.use_theme(app.page, a.theme); page = app.page
    for i, s in enumerate(steps):
        if "route" in s: page.eval(f"location.hash = {json.dumps(s['route'].lstrip('#'))}; true"); time.sleep(s.get("wait", 7))
        if "js" in s: print(f"[{i}]", s.get("tag", ""), page.eval(s["js"]))
        if "key" in s:
            k = s["key"]; page.send("Input.dispatchKeyEvent", type="rawKeyDown", key=k, code=k, windowsVirtualKeyCode=VK[k])
            if k == "Enter": page.send("Input.dispatchKeyEvent", type="char", text="\r", key=k, code=k, windowsVirtualKeyCode=13)
            page.send("Input.dispatchKeyEvent", type="keyUp", key=k, code=k, windowsVirtualKeyCode=VK[k])
            time.sleep(s.get("wait", 2))
        if "mouse" in s:
            x, y = s["mouse"]
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
            time.sleep(s.get("wait", 0.6))
        if "click" in s:
            x, y = s["click"]
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
            page.send("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
            page.send("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
            time.sleep(s.get("wait", 1.0))
        if "mback" in s:
            x, y = s["mback"]
            page.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
            page.send("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="back", buttons=8, clickCount=1)
            page.send("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="back", buttons=0, clickCount=1)
            time.sleep(s.get("wait", 2.5))
        if "sleep" in s: time.sleep(s["sleep"])
finally:
    app.close()
