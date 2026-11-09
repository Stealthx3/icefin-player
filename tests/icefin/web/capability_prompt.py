#!/usr/bin/env python3
"""capability_prompt.py — the capability prompt in the running app (PLAN 6.3). Lab guests only.

The lab has no Dolby Vision media, so the test loads an SDR file through api.player.load with load metadata that says
"DOVI" (Dolby Vision 5). On the OpenGL fallback that must raise the prompt. Checks:
  1. the prompt appears before anything loads, with "play anyway", the transcode options (the lab user may
     transcode) and "cancel";
  2. cancel ends the player without loading;
  3. play anyway (remember) loads the file; a second load plays with no prompt (remembered);
  4. Client Settings -> Hardware shows the remembered choice and forgets it; the next load asks again;
  5. transcode: the next device profile asks the server to convert Dolby Vision (one-shot);
  6. an SDR load and an HDR10 load never prompt.
Usage: python3 capability_prompt.py --app ~/build/src/icefin-player --server jf12
"""
import argparse, json, os, signal, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "servers"))
from session_play import launch, start_x, JF  # noqa: E402
from setup import Server  # noqa: E402
from cdp import Page  # noqa: E402

LOAD = """(() => {
  window.labEvents = window.labEvents || [];
  if (!window.labHooked) { window.labHooked = true;
    window.api.player.finished.connect(() => window.labEvents.push('finished'));
    window.api.player.playing.connect(() => window.labEvents.push('playing')); }
  window.api.player.load(%s, {startMilliseconds: 0, autoplay: true},
    {type: 'video', headers: {}, metadata: {Id: %s, Name: 'Lab clip', ServerId: 'lab'}, media: {},
     icefinMediaSource: {MediaStreams: [{Type: 'Video', VideoRangeType: %s}]}}, -1, -1);
  return true; })()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--server", default="jf12")
    ap.add_argument("--port", type=int, default=9236)
    a = ap.parse_args()
    cfg = {s["name"]: s for s in json.load(open(os.path.join(HERE, "..", "servers", "servers.json")))["servers"]}[a.server]
    cred = json.load(open(os.path.join(JF, "creds.json")))[a.server]
    srv = Server(cfg)
    srv.wait()
    srv.token = srv.call("POST", "/Users/AuthenticateByName", {"Username": cred["user"], "Pw": cred["password"]})["AccessToken"]
    uid = srv.call("GET", "/Users/Me")["Id"]
    item = srv.call("GET", f"/Items?Recursive=true&searchTerm=SDR%20H264%20AAC&userId={uid}&IncludeItemTypes=Movie")["Items"][0]["Id"]
    url = f"{srv.base}/Videos/{item}/stream?static=true&api_key={srv.token}"
    xv = start_x()
    cfgdir = tempfile.mkdtemp(prefix="icefin-prompt-")
    log = open(os.path.join(cfgdir, "app.log"), "w")
    app = launch(a.app, a.port, cfgdir, log, "xcb")
    fails = []

    def check(label, ok, detail=""):
        print(f"capability_prompt: {'ok  ' if ok else 'FAIL'} {label} {detail}", flush=True)
        if not ok:
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
        page.wait_for("!!window.api && !!window.api.router && !!window.icefinCapabilityPrompt && !!window.icefinPlaybackManager", timeout=90)
        js = page.eval
        load = lambda vrt: js(LOAD % (json.dumps(url), json.dumps(item), json.dumps(vrt)))
        prompt_open = "!!document.getElementById('icefin-capability-prompt')"
        choices = lambda: js("JSON.stringify([...document.querySelectorAll('#icefin-capability-prompt .icefin-prompt-option')].map(b => b.dataset.choice))")
        click = lambda c, remember=False: js("(() => { %s document.querySelector('#icefin-capability-prompt [data-choice=%s]').click(); return true; })()"
                                             % ("document.querySelector('#icefin-capability-prompt .icefin-prompt-remember').checked = true;" if remember else "", json.dumps(c)))
        events = lambda: js("JSON.stringify(window.labEvents || [])")
        reset_events = lambda: js("window.labEvents = []; true")

        d = js("new Promise(r => window.api.router.decide('DOVI', r))")
        check("router: DV5 on the OpenGL fallback -> prompt", d["output"] == "capability prompt", d["reason"])

        reset_events()
        load("DOVI")
        page.wait_for(prompt_open, timeout=10)
        check("prompt appears", True)
        check("prompt lists this system's options", json.loads(choices()) == ["play", "transcodeHdr10", "transcodeSdr", "cancel"], choices())
        check("nothing loaded while the prompt is up", "playing" not in events())
        click("cancel")
        time.sleep(2)
        check("cancel: prompt closed, player ended, nothing played", js(prompt_open) is False and "finished" in events() and "playing" not in events(), events())

        reset_events()
        load("DOVI")
        page.wait_for(prompt_open, timeout=10)
        click("play", remember=True)
        page.wait_for("(window.labEvents || []).includes('playing')", timeout=20)
        check("play anyway: the held load plays", True)
        js("window.api.player.stop(); true")
        time.sleep(2)
        reset_events()
        load("DOVI")
        page.wait_for("(window.labEvents || []).includes('playing')", timeout=20)
        check("remembered: plays with no prompt", js(prompt_open) is False)
        js("window.api.player.stop(); true")
        time.sleep(2)

        js("window.NativeShell.openClientSettings(); true")
        page.wait_for("!!document.querySelector('#icefin-hardware-section .icefin-hw-forget')", timeout=30)
        check("Hardware section lists the remembered choice", "1" in js("document.querySelector('#icefin-hardware-section .icefin-hw-choices').textContent"))
        js("document.querySelector('#icefin-hardware-section .icefin-hw-forget').click(); document.querySelector('.dialogContainer').remove(); true")
        time.sleep(1)
        check("forgotten", js("new Promise(r => window.api.router.rememberedChoices(m => r(Object.keys(m).length)))") == 0)
        reset_events()
        load("DOVI")
        page.wait_for(prompt_open, timeout=10)
        check("after forgetting, the prompt asks again", True)

        js("window.labPlayCalls = []; const pm = window.icefinPlaybackManager; window.labRealPlay = pm.play; pm.play = (o) => { window.labPlayCalls.push(o); return Promise.resolve(); }; true")
        click("transcodeHdr10")
        page.wait_for("window.labPlayCalls.length === 1", timeout=10)
        call = js("JSON.stringify(window.labPlayCalls[0])")
        check("transcode: playback restarted for the item", item in call, call)
        prof = js("JSON.stringify(window.NativeShell.AppHost.getDeviceProfile().CodecProfiles)")
        check("transcode: next device profile limits the range", "EqualsAny" in prof and "SDR|HDR10|HDR10Plus|HLG" in prof, prof[:200])
        prof2 = js("JSON.stringify(window.NativeShell.AppHost.getDeviceProfile().CodecProfiles)")
        check("transcode: the profile change is one-shot", "EqualsAny" not in prof2)
        js("window.icefinPlaybackManager.play = window.labRealPlay; true")

        for vrt in ("SDR", "HDR10"):
            reset_events()
            load(vrt)
            page.wait_for("(window.labEvents || []).includes('playing')", timeout=20)
            check(f"{vrt}: plays with no prompt", js(prompt_open) is False)
            js("window.api.player.stop(); true")
            time.sleep(2)
    except Exception as e:  # noqa: BLE001
        check("run", False, f"{type(e).__name__}: {e}")
    finally:
        try:
            os.killpg(app.pid, signal.SIGTERM)
            app.wait(15)
        except Exception:  # noqa: BLE001
            pass
        if xv:
            xv.terminate()
        log.close()
    print("capability_prompt:", "OK" if not fails else f"FAILED {fails}", "- log:", log.name)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
