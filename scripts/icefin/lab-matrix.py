#!/usr/bin/env python3
"""lab-matrix.py — the full lab matrix (PLAN 11.1, D28): every lab test on one tree, with a summary. In lab-icefin-main.

Groups (default: all but "public"):
  unit    the unit tests (ctest)
  app     the app's own tests: settings, audio, capability model and prompt, routing rows, renderer and HDR, input
          (pads, LIRC), diagnostics, D-Bus guard, parity with stock mpv
  theme   the theme engine and every theme's tests, plus clone_layout.py for every reference spec
  av      the Virtual AV tier: the lab rows and Icefin's own rows (matrix.py --player icefin)
  hdr     the virtual HDR display (hdr_protocol.py, the Flatpak) and headless Gamescope (gamescope_hdr.py)
  public  the 40 public sinks (matrix.py --profiles public, ~40 min)
The low-spec budget runs in lab-icefin-htpcsim (tests/icefin/perf/perf_budget.py, docs/LAB.md); the VA-API import
test runs on the workstation; the hardware rows are docs/BETA-CHECKLIST.md.

Builds of the same tree (--src, default ~/src-matrix):
  --build     native, configured like the Flatpak (SDL3, the patched libmpv): the app, theme and HDR tests
  --build-av  native with the guest's stock libraries: the Virtual AV client gets only the binary
  the Flatpak (--flatpak), installed from that tree: hdr_protocol.py and dbus_drop.py
Between tests it waits while another lab session's test runs (the lab's convention: tests share the VM's virtual
pads, displays and CPU); it lives outside tests/icefin so its own long run doesn't hold the others up.
  lab-matrix.py [--groups app,theme] [--only NAME,...] [--list] [--out DIR]
Writes DIR/summary.json and DIR/summary.md after every test, and each test's output to DIR/<name>.log.
"""
import argparse, glob, json, os, subprocess, sys, time

HOME = os.path.expanduser("~")
MPV_LIB = f"{HOME}/mpv-icefin/lib/x86_64-linux-gnu"


def entries(a):
    src, B, BAV, FP = a.src, a.app, f"{a.build_av}/src/icefin-player", f"flatpak:{a.flatpak}"
    web = f"{src}/tests/icefin/web"
    E = []

    def add(name, group, cmd, timeout=900, env=None, out=False):
        E.append({"name": name, "group": group, "cmd": cmd, "timeout": timeout, "env": env or {}, "out": out})

    native = {"LD_LIBRARY_PATH": MPV_LIB}
    add("unit", "unit", ["ctest", "--test-dir", a.build, "-R", "test_icefin", "--output-on-failure"], 900,
        {"QT_QPA_PLATFORM": "offscreen", **native})
    # The lab's only Vulkan device is lavapipe, which the app refuses unless told (vulkan_video's own lab note).
    lavapipe = {**native, "ICEFIN_RENDERER_ALLOW_SOFTWARE": "1"}
    for t, extra in [("audio_delay_device", ["--server", "jf1011"]), ("audio_test_page", []),
                     ("capability_model", ["--server", "jf12"]), ("capability_prompt", ["--server", "jf12"]),
                     ("client_settings", ["--server", "jf12"]), ("device_profile", []),
                     ("diagnostics_report", ["--server", "jf12"]), ("fullscreen_setting", ["--server", "jf12"]),
                     ("gamepad_input", ["--server", "jf12"]), ("hardware_selftest", []), ("hdr_probe", []),
                     ("hwdec_setting", ["--server", "jf12"]), ("lirc_remote", ["--server", "jf12"]),
                     ("log_redaction", ["--server", "jf12"]), ("renderer_choice", []),
                     ("vulkan_video", ["--server", "jf12"]),
                     ("routing_rows", ["--server", "jf12", "--upstream", f"{HOME}/build-upstream/src/jellyfin-desktop"]),
                     ("parity", ["--server", "jf12", "--mpv", f"{HOME}/mpv-stock/bin/mpv"])]:
        add(t, "app", ["python3", f"{web}/{t}.py", "--app", B] + extra, 2400 if t == "routing_rows" else 900,
            lavapipe if t == "vulkan_video" else native)
    for t in ("alpha1_feedback", "book_reader", "dialogs_controller"):
        add(t, "app", ["python3", f"{web}/{t}.py", "--app", B, "--server", "jf12"], 1200, native, out=True)
    add("dbus_drop", "app", ["python3", f"{web}/dbus_drop.py", "--app", FP], 600, {}, out=True)

    for f in sorted(glob.glob(f"{web}/theme_*.py") + glob.glob(f"{web}/plaza_*.py") + glob.glob(f"{web}/media_center_*.py")):
        t = os.path.basename(f)[:-3]
        code = open(f).read()
        extra = [] if '"--server"' not in code else ["--server", "jf1011"] if t in ("theme_runtime", "theme_tokens") else ["--server", "jf12"]
        needs_out = "--out" in code
        add(t, "theme", ["python3", f, "--app", B] + extra, 3000 if t in ("plaza_walk", "plaza_everywhere") else 1500, native, out=needs_out)
    for spec in sorted(glob.glob(f"{src}/docs/themes/references/*.json")):
        th = os.path.basename(spec)[:-5]
        add(f"clone_layout-{th}", "theme", ["python3", f"{web}/clone_layout.py", "--app", B, "--server", "jf12", "--theme", th], 900, native, out=True)

    av = f"{src}/tests/icefin/avsim"
    avenv = {"AVSIM_MEM_MB": "4096", "AVSIM_BASE": "avsim-icefin"}
    add("avsim-lab", "av", ["bash", "-c", f"bash {av}/avsim.sh up >/dev/null && python3 {av}/matrix.py; rc=$?; bash {av}/avsim.sh down >/dev/null; exit $rc"], 3600, avenv)
    add("avsim-icefin", "av", ["bash", "-c", f"bash {av}/avsim.sh up >/dev/null && python3 {av}/matrix.py --player icefin --app {BAV}; rc=$?; bash {av}/avsim.sh down >/dev/null; exit $rc"], 5400, avenv)
    add("avsim-public", "public", ["bash", "-c", f"bash {av}/avsim.sh up >/dev/null && python3 {av}/matrix.py --profiles public --player icefin --app {BAV}; rc=$?; bash {av}/avsim.sh down >/dev/null; exit $rc"], 5400, avenv)

    add("hdr_protocol", "hdr", ["python3", f"{web}/hdr_protocol.py", "--app", a.flatpak], 1800)
    add("gamescope_hdr", "hdr", ["python3", f"{web}/gamescope_hdr.py", "--app", B], 1800, native)
    return E


def others_running(me):
    """Another lab session's test (python3 .../tests/icefin/...py or the AV matrix), not this run's own."""
    r = subprocess.run(["pgrep", "-af", r"python3 .*tests/icefin/[a-z/_]*[.]py|avsim/matrix[.]py"], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        pid = int(line.split()[0])
        if pid in me:
            continue
        # A child of this run? Walk up.
        p, ours = pid, False
        for _ in range(10):
            try:
                p = int(open(f"/proc/{p}/stat").read().rsplit(")", 1)[1].split()[1])
            except Exception:  # noqa: BLE001
                break
            if p == os.getpid():
                ours = True
                break
            if p <= 1:
                break
        if not ours:
            return line
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=f"{HOME}/src-matrix")
    ap.add_argument("--build", default=f"{HOME}/build-matrix")
    ap.add_argument("--build-av", default=f"{HOME}/build-matrix-av")
    ap.add_argument("--flatpak", default="io.github.stealthx3.IcefinPlayer")
    ap.add_argument("--groups", default="unit,app,theme,av,hdr")
    ap.add_argument("--only", help="comma-separated test names")
    ap.add_argument("--skip", default="")
    ap.add_argument("--out", default=f"{HOME}/lab-matrix/{time.strftime('%Y%m%d-%H%M')}")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    # The app runs under its own process name: other lab sessions clear stray apps with pkill -x icefin-player.
    os.makedirs(a.out, exist_ok=True)
    a.app = os.path.join(a.out, "icefin-matrix")
    if not os.path.exists(a.app):
        os.symlink(f"{a.build}/src/icefin-player", a.app)
    groups, only, skip = set(a.groups.split(",")), set(filter(None, (a.only or "").split(","))), set(filter(None, a.skip.split(",")))
    todo = [e for e in entries(a) if (e["name"] in only if only else e["group"] in groups) and e["name"] not in skip]
    if a.list:
        for e in todo:
            print(f"{e['group']:6} {e['name']}")
        return 0
    results, started = [], time.time()

    def write():
        passed = sum(r["ok"] for r in results)
        json.dump({"src": a.src, "results": results, "passed": passed, "total": len(results)}, open(f"{a.out}/summary.json", "w"), indent=1)
        lines = [f"# Lab matrix {os.path.basename(a.out)}", "", f"{passed}/{len(results)} pass ({(time.time() - started) / 60:.0f} min)", "",
                 "| Test | Group | Result | Time | Failures |", "| --- | --- | --- | --- | --- |"]
        for r in results:
            lines.append(f"| {r['name']} | {r['group']} | {'pass' if r['ok'] else 'FAIL'} | {r['seconds'] / 60:.1f} min | {'; '.join(r['fails'])[:300]} |")
        open(f"{a.out}/summary.md", "w").write("\n".join(lines) + "\n")

    def fixtures():
        """Fresh lab fixtures for the theme tests, which read home rows and the guide: a guide that starts now
        (livetv.py writes it to cover the next hours only), and the test user's watch state reset, as the app
        group's playback leaves Next Up and Continue Watching with one item (reset-watch.py, when the tree has it)."""
        steps = [["python3", "tests/icefin/servers/livetv.py", "tests/icefin/servers/servers.json"]]
        if os.path.exists(f"{a.src}/tests/icefin/servers/reset-watch.py"):
            steps.append(["python3", "tests/icefin/servers/reset-watch.py"])
        else:
            print("lab-matrix: fixtures: no reset-watch.py in this tree; watch state left as it is", flush=True)
        with open(f"{a.out}/fixtures.log", "a") as log:
            for c in steps:
                rc = subprocess.run(c, cwd=a.src, stdout=log, stderr=subprocess.STDOUT, timeout=600).returncode
                print(f"lab-matrix: fixtures: {os.path.basename(c[1])}: {'ok' if rc == 0 else f'exit {rc} (see fixtures.log)'}", flush=True)

    group = None
    for e in todo:
        waited = 0
        while (other := others_running({os.getpid()})) and waited < 7200:
            if waited % 300 == 0:
                print(f"lab-matrix: waiting for another session's test: {other[:120]}", flush=True)
            time.sleep(15)
            waited += 15
        if e["group"] == "theme" and group != "theme":
            fixtures()
        group = e["group"]
        cmd = list(e["cmd"])
        if e["out"]:
            cmd += ["--out", f"{a.out}/{e['name']}"]
        env = dict(os.environ, **e["env"])
        t0 = time.time()
        print(f"lab-matrix: {e['name']} ...", flush=True)
        with open(f"{a.out}/{e['name']}.log", "w") as log:
            try:
                rc = subprocess.run(cmd, cwd=a.src, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=e["timeout"]).returncode
            except subprocess.TimeoutExpired:
                rc = "timeout"
        text = open(f"{a.out}/{e['name']}.log", errors="replace").read()
        fails = [l.strip()[:160] for l in text.splitlines() if " FAIL " in f" {l} " or l.strip().startswith("FAIL") or ": FAIL" in l][:8]
        if rc not in (0,) and not fails:
            fails = [f"exit {rc}: " + " / ".join(text.strip().splitlines()[-2:])[:200]]
        results.append({"name": e["name"], "group": e["group"], "ok": rc == 0, "rc": rc, "seconds": round(time.time() - t0), "fails": fails})
        print(f"lab-matrix: {e['name']}: {'pass' if rc == 0 else 'FAIL'} ({(time.time() - t0) / 60:.1f} min)", flush=True)
        write()
    write()
    passed = sum(r["ok"] for r in results)
    print(f"lab-matrix: {passed}/{len(results)} pass - {a.out}/summary.md")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
