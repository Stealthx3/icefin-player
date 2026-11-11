#!/usr/bin/env python3
"""theme-sounds.py — the bundled themes' interface sounds, synthesised (PLAN 9.31; user feedback 2026-11-11).

Every bundled theme with screens gets the five UI events the engine plays (focus, select, back, navigate, error),
made here from oscillators, FM bells, filtered noise and a small reverb, so the repository holds their recipes and no
recorded or sampled audio. Each theme's set aims at the character of its target's interface sounds (timbre, pitch
movement, length, loudness), not a copy of any of them (CLAUDE.md clone rules: no sounds from a target).

  python3 scripts/icefin/theme-sounds.py            write themes/<id>/sounds/*.wav and the "sounds" map in theme.json
  python3 scripts/icefin/theme-sounds.py --check    CI: every set present, 48 kHz 16-bit mono, short, not clipped, and
                                                    byte-identical to what the recipes make now
Standard library only; deterministic (seeded noise), so --check can compare bytes.
"""
import io, json, math, os, random, struct, sys, wave

SR = 48000
EVENTS = ["focus", "select", "back", "navigate", "error"]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TAU = 2 * math.pi


# ---- primitives (lists of floats, -1..1) ----
def n_of(ms):
    return max(1, int(SR * ms / 1000))


def env(n, attack_ms=2, decay_ms=80, hold_ms=0):
    """Linear attack, optional hold, exponential decay (time constant decay_ms)."""
    a, h = n_of(attack_ms), n_of(hold_ms) if hold_ms else 0
    out = []
    for i in range(n):
        if i < a:
            out.append(i / a)
        elif i < a + h:
            out.append(1.0)
        else:
            out.append(math.exp(-(i - a - h) / (SR * decay_ms / 1000)))
    # A short fade at the end so nothing clicks off.
    tail = min(n // 4, n_of(6))
    for i in range(tail):
        out[n - 1 - i] *= i / tail
    return out


def tone(ms, f0, f1=None, shape="sine", curve=1.0):
    """An oscillator gliding from f0 to f1 (curve > 1: slow start; < 1: fast start)."""
    n, f1 = n_of(ms), f1 if f1 is not None else f0
    out, ph = [], 0.0
    for i in range(n):
        k = (i / max(1, n - 1)) ** curve
        f = f0 + (f1 - f0) * k
        ph += TAU * f / SR
        if shape == "sine":
            v = math.sin(ph)
        elif shape == "tri":
            v = 2 / math.pi * math.asin(math.sin(ph))
        elif shape == "soft":  # a rounded square: odd harmonics, gentle
            v = math.tanh(2.2 * math.sin(ph)) / math.tanh(2.2)
        else:
            raise ValueError(shape)
        out.append(v)
    return out


def bell(ms, f, ratio=1.4, index=2.0, idecay_ms=40):
    """FM bell: the modulation index falls away faster than the tone, so the attack is bright and the tail pure."""
    n = n_of(ms)
    out = []
    for i in range(n):
        t = i / SR
        idx = index * math.exp(-t / (idecay_ms / 1000))
        out.append(math.sin(TAU * f * t + idx * math.sin(TAU * f * ratio * t)))
    return out


def noise(ms, seed):
    r = random.Random(seed)
    return [r.uniform(-1, 1) for _ in range(n_of(ms))]


def lowpass(x, hz):
    a = 1 - math.exp(-TAU * hz / SR)
    y, s = [], 0.0
    for v in x:
        s += a * (v - s)
        y.append(s)
    return y


def highpass(x, hz):
    lp = lowpass(x, hz)
    return [v - w for v, w in zip(x, lp)]


def bandpass(x, lo, hi):
    return lowpass(highpass(x, lo), hi)


def sweep_lowpass(x, hz0, hz1):
    """A low-pass whose corner glides (a whoosh)."""
    y, s, n = [], 0.0, len(x)
    for i, v in enumerate(x):
        hz = hz0 + (hz1 - hz0) * i / max(1, n - 1)
        s += (1 - math.exp(-TAU * hz / SR)) * (v - s)
        y.append(s)
    return y


def mul(x, e):
    return [a * b for a, b in zip(x, e)]


def gain(x, g):
    return [v * g for v in x]


def mix(*parts):
    """Mix (signal, start_ms) pairs or plain signals starting at 0."""
    items = [(p, 0) if isinstance(p, list) else p for p in parts]
    n = max(n_of(st) + len(sig) for sig, st in items)
    out = [0.0] * n
    for sig, st in items:
        o = n_of(st) if st else 0
        for i, v in enumerate(sig):
            out[o + i] += v
    return out


def reverb(x, mix_amount=0.2, size=1.0, tail_ms=250, feedback=0.72, predelay_ms=0, damp_hz=0):
    """A Schroeder reverb: four combs into two all-passes. feedback sets how long it rings (0.72 a small room,
    0.85+ a hall); predelay_ms holds the wet signal back; damp_hz low-passes it (a soft, distant room)."""
    y = list(x) + [0.0] * n_of(tail_ms)
    n = len(y)
    combs = [int(d * size) for d in (1557, 1617, 1491, 1422)]
    wet = [0.0] * n
    pd = n_of(predelay_ms) if predelay_ms else 0
    src = ([0.0] * pd + y)[:n] if pd else y
    for d in combs:
        buf = [0.0] * n
        for i in range(n):
            buf[i] = src[i] + (feedback * buf[i - d] if i >= d else 0.0)
            wet[i] += buf[i] * 0.25
    for d in (225, 556):
        out = [0.0] * n
        for i in range(n):
            xd = wet[i - d] if i >= d else 0.0
            yd = out[i - d] if i >= d else 0.0
            out[i] = -0.5 * wet[i] + xd + 0.5 * yd
        wet = out
    if damp_hz:
        wet = lowpass(wet, damp_hz)
    return [(1 - mix_amount) * a + mix_amount * b for a, b in zip(y, wet)]


def finish(x, level_db):
    """Trim trailing silence, normalise the peak to level_db (dBFS)."""
    end = len(x)
    while end > 1 and abs(x[end - 1]) < 1e-4:
        end -= 1
    x = x[:end]
    peak = max(1e-9, max(abs(v) for v in x))
    g = 10 ** (level_db / 20) / peak
    return [v * g for v in x]


def wav_bytes(x):
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(round(v * 32767))))) for v in x))
    return b.getvalue()


# ---- the sets: (signal, level dBFS) per event ----
def media_center():
    # Airy glass: a filtered-noise tick with a faint high shimmer; chimes for select; a soft fall for back.
    tick = mix(mul(bandpass(noise(60, 11), 2500, 9000), env(n_of(60), 1, 14)), gain(mul(tone(90, 3100, 2900), env(n_of(90), 1, 25)), 0.25))
    chime = reverb(mix(mul(bell(420, 1318, 3.5, 1.2, 60), env(n_of(420), 2, 150)), (gain(mul(bell(420, 1976, 3.5, 1.0, 60), env(n_of(420), 2, 150)), 0.6), 45)), 0.25)
    back = reverb(mul(tone(220, 880, 520, "sine", 0.7), env(n_of(220), 2, 70)), 0.2)
    nav = reverb(mul(sweep_lowpass(noise(320, 12), 300, 4500), env(n_of(320), 90, 110)), 0.25)
    err = mix(mul(tone(160, 311, 300, "soft"), env(n_of(160), 2, 60)), (mul(tone(200, 233, 225, "soft"), env(n_of(200), 2, 80)), 120))
    return {"focus": (tick, -16), "select": (chime, -9), "back": (back, -12), "navigate": (nav, -14), "error": (err, -10)}


def harbor():
    # Short, soft, neutral clicks; a lower tock for back.
    click = mul(mix(bandpass(noise(25, 21), 1200, 6000), gain(tone(25, 1800), 0.4)), env(n_of(25), 0.5, 5))
    sel = mul(mix(tone(70, 1250, 1100, "tri"), gain(bandpass(noise(30, 22), 1500, 7000), 0.4)), env(n_of(70), 1, 18))
    back = mul(tone(80, 700, 560, "tri"), env(n_of(80), 1, 20))
    nav = mul(lowpass(noise(140, 23), 2200), env(n_of(140), 30, 40))
    err = mul(tone(180, 220, 210, "soft"), env(n_of(180), 2, 70))
    return {"focus": (click, -17), "select": (sel, -11), "back": (back, -12), "navigate": (nav, -18), "error": (err, -11)}


def spark():
    # Crisp, bright, short: a tick and a pop.
    tick = mul(mix(highpass(noise(18, 31), 3500), gain(tone(18, 4200), 0.5)), env(n_of(18), 0.3, 4))
    pop = mul(tone(90, 700, 1500, "sine", 0.4), env(n_of(90), 1, 25))
    back = mul(tone(90, 1100, 600, "sine", 0.5), env(n_of(90), 1, 25))
    nav = mul(sweep_lowpass(noise(180, 32), 800, 6000), env(n_of(180), 40, 50))
    err = mix(mul(tone(110, 330, 320, "tri"), env(n_of(110), 1, 40)), (mul(tone(140, 262, 255, "tri"), env(n_of(140), 1, 50)), 100))
    return {"focus": (tick, -15), "select": (pop, -10), "back": (back, -12), "navigate": (nav, -17), "error": (err, -10)}


def plum():
    # Soft woody ticks (a damped triangle with a knock), a rounded click, a low thump for back.
    tick = mul(mix(tone(35, 1500, 1350, "tri"), gain(bandpass(noise(20, 41), 800, 3000), 0.5)), env(n_of(35), 0.5, 8))
    sel = mul(mix(tone(80, 990, 930, "tri"), (gain(tone(60, 1480, 1400, "tri"), 0.5), 10)), env(n_of(90), 1, 22))
    back = mul(mix(tone(120, 180, 90, "sine", 0.5), gain(lowpass(noise(60, 42), 900), 0.5)), env(n_of(120), 1, 35))
    nav = reverb(mul(sweep_lowpass(noise(240, 43), 400, 3500), env(n_of(240), 60, 70)), 0.15)
    err = mul(tone(220, 196, 185, "soft"), env(n_of(220), 2, 80))
    return {"focus": (tick, -15), "select": (sel, -11), "back": (back, -10), "navigate": (nav, -16), "error": (err, -11)}


def plaza():
    # Atmospheric (user feedback 2026-11-11: "lots of reverb"): soft marimba-like bars with a faint octave shimmer, in a
    # large, warm hall: pre-delay, a long damped tail, mostly wet. Focus stays short at its source so quick moves
    # don't smear; the room carries it.
    def bar(f, ms=180):
        return mul(mix(tone(ms, f), gain(tone(ms, f * 3.98), 0.18), gain(tone(ms, f * 2), 0.12)), env(n_of(ms), 1.5, ms / 3.5))
    hall = lambda x, tail=1600, wet=0.55: reverb(x, wet, 1.7, tail, 0.86, 28, 5200)
    focus = hall(bar(1568, 110), 1100, 0.5)
    sel = hall(mix(bar(1047, 220), (bar(1568, 260), 80), (gain(bar(2093, 300), 0.5), 160)), 1800, 0.55)
    back = hall(mix(bar(784, 170), (bar(587, 200), 70)), 1400, 0.55)
    nav = hall(mix(bar(1319, 130), (bar(1760, 150), 50), (bar(2093, 170), 100), (gain(bar(2637, 200), 0.5), 150)), 1800, 0.6)
    err = hall(mix(bar(370, 200), (bar(349, 240), 120)), 1300, 0.45)
    return {"focus": (focus, -15), "select": (sel, -9), "back": (back, -11), "navigate": (nav, -12), "error": (err, -10)}


def orbit():
    # Airy whooshes over a soft synth; a deep, warm confirm; back is the whoosh reversed.
    whoosh = mul(mix(sweep_lowpass(noise(200, 51), 600, 7000), gain(tone(200, 660, 990, "sine"), 0.15)), env(n_of(200), 70, 50))
    chord = reverb(mul(mix(tone(380, 196), gain(tone(380, 294), 0.7), gain(tone(380, 392), 0.5), gain(lowpass(noise(380, 52), 500), 0.2)), env(n_of(380), 8, 150)), 0.3)
    back = list(reversed(whoosh))
    nav = reverb(mul(mix(sweep_lowpass(noise(320, 53), 300, 5000), gain(tone(320, 440, 880, "sine", 0.6), 0.2)), env(n_of(320), 120, 90)), 0.3)
    err = mul(tone(260, 147, 139, "soft"), env(n_of(260), 4, 100))
    return {"focus": (whoosh, -15), "select": (chord, -9), "back": (back, -14), "navigate": (nav, -13), "error": (err, -10)}


def mosaic():
    # Crisp, light, metallic clicks (a short FM ping); a higher click for select.
    ping = lambda f, ms, seed: mul(mix(bell(ms, f, 2.76, 3.0, 8), gain(highpass(noise(ms, seed), 4000), 0.3)), env(n_of(ms), 0.3, ms / 5))
    back = ping(1500, 45, 63)
    nav = mul(sweep_lowpass(noise(150, 64), 1500, 9000), env(n_of(150), 30, 35))
    err = mix(ping(500, 80, 65), (ping(420, 90, 66), 70))
    return {"focus": (ping(2600, 30, 61), -17), "select": (ping(3400, 50, 62), -12), "back": (back, -13), "navigate": (nav, -17), "error": (err, -11)}


def lumen():
    # Barely there: a soft, low-passed tap; a gentle click for select.
    tap = mul(lowpass(mix(tone(30, 900, 700), gain(noise(30, 71), 0.3)), 2500), env(n_of(30), 0.5, 7))
    sel = mul(lowpass(mix(tone(60, 1200, 1000, "tri"), gain(noise(30, 72), 0.25)), 4000), env(n_of(60), 0.5, 14))
    back = mul(lowpass(tone(60, 700, 520), 2500), env(n_of(60), 0.5, 14))
    nav = mul(sweep_lowpass(noise(160, 73), 500, 3000), env(n_of(160), 40, 40))
    err = mul(tone(150, 260, 250, "tri"), env(n_of(150), 1, 50))
    return {"focus": (tap, -22), "select": (sel, -15), "back": (back, -17), "navigate": (nav, -21), "error": (err, -14)}


def marquee():
    # Minimal: a muted tap and a soft low thud.
    tap = mul(lowpass(mix(tone(25, 1100, 900), gain(noise(25, 81), 0.4)), 3500), env(n_of(25), 0.3, 6))
    thud = mul(mix(tone(110, 160, 110, "sine", 0.5), gain(lowpass(noise(50, 82), 1200), 0.4)), env(n_of(110), 1, 30))
    back = mul(tone(90, 520, 380), env(n_of(90), 1, 22))
    nav = mul(sweep_lowpass(noise(170, 83), 400, 2800), env(n_of(170), 50, 45))
    err = mul(tone(160, 185, 180, "soft"), env(n_of(160), 2, 60))
    return {"focus": (tap, -19), "select": (thud, -11), "back": (back, -15), "navigate": (nav, -19), "error": (err, -12)}


def almanac():
    # Round sine "bloops" that sweep: up for select, down for back; a short boop for focus.
    bloop = lambda f0, f1, ms: mul(tone(ms, f0, f1, "sine", 0.6), env(n_of(ms), 2, ms / 3.5))
    sel = mix(bloop(500, 1000, 120), (gain(bloop(750, 1500, 110), 0.6), 60))
    back = mix(bloop(900, 450, 120), (gain(bloop(600, 300, 120), 0.6), 60))
    nav = mix(bloop(600, 900, 90), (bloop(900, 1200, 90), 70))
    err = mix(bloop(300, 250, 160), (bloop(250, 200, 180), 120))
    return {"focus": (bloop(880, 980, 60), -15), "select": (sel, -10), "back": (back, -11), "navigate": (nav, -12), "error": (err, -10)}


def arcade():
    # Soft synth ticks with a short airy tail; rising and falling two-tone confirms.
    tick = reverb(mul(tone(40, 1700, 1600, "tri"), env(n_of(40), 0.5, 9)), 0.18, 0.7, 150)
    two = lambda a, b: reverb(mix(mul(tone(90, a, a, "tri"), env(n_of(90), 1, 30)), (mul(tone(110, b, b, "tri"), env(n_of(110), 1, 35)), 60)), 0.2, 0.8, 200)
    nav = reverb(mul(sweep_lowpass(noise(220, 91), 700, 6000), env(n_of(220), 60, 60)), 0.2)
    err = two(370, 277)
    return {"focus": (tick, -16), "select": (two(880, 1319), -11), "back": (two(1319, 880), -12), "navigate": (nav, -15), "error": (err, -10)}


def tide():
    # Low, muffled, rounded tocks with a soft room; a crystalline confirm; back is lower and softer.
    tock = reverb(lowpass(mul(mix(tone(90, 330, 250, "sine", 0.5), gain(lowpass(noise(40, 101), 900), 0.35)), env(n_of(90), 1, 22)), 1800), 0.3, 1.1, 260)
    crystal = reverb(mix(mul(bell(360, 1568, 2.0, 1.5, 50), env(n_of(360), 1, 110)), (gain(mul(bell(360, 2349, 2.0, 1.2, 50), env(n_of(360), 1, 120)), 0.5), 35)), 0.3, 1.1, 300)
    back = reverb(lowpass(mul(tone(130, 260, 180, "sine", 0.5), env(n_of(130), 1, 35)), 1400), 0.3, 1.1, 260)
    nav = reverb(mul(sweep_lowpass(noise(300, 102), 250, 2200), env(n_of(300), 100, 80)), 0.35, 1.2, 300)
    err = reverb(mix(mul(tone(170, 220, 210, "soft"), env(n_of(170), 2, 60)), (mul(tone(200, 196, 190, "soft"), env(n_of(200), 2, 70)), 110)), 0.25)
    return {"focus": (tock, -14), "select": (crystal, -10), "back": (back, -13), "navigate": (nav, -15), "error": (err, -11)}


SETS = {"media-center": media_center, "harbor": harbor, "spark": spark, "plum": plum, "plaza": plaza, "orbit": orbit, "mosaic": mosaic,
        "lumen": lumen, "marquee": marquee, "almanac": almanac, "arcade": arcade, "tide": tide}
MAX_MS = 2600  # Plaza's hall tails run to about two seconds


def build(tid):
    return {ev: wav_bytes(finish(sig, lvl)) for ev, (sig, lvl) in SETS[tid]().items()}


def write_theme_json(tid):
    p = os.path.join(ROOT, "themes", tid, "theme.json")
    s = open(p).read()
    meta = json.loads(s)
    want = {ev: f"sounds/{ev}.wav" for ev in EVENTS}
    if meta.get("sounds") == want:
        return
    if "sounds" in meta:
        meta["sounds"] = want
        open(p, "w").write(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
        return
    # Insert after "scripts" (or before "presets"/"schemes"), keeping the file's own formatting.
    block = '  "sounds": ' + json.dumps(want, indent=2).replace("\n", "\n  ") + ",\n"
    for key in ('"presets"', '"schemes"', '"backdrop"'):
        i = s.find("\n  " + key)
        if i >= 0:
            s = s[:i + 1] + block + s[i + 1:]
            break
    else:
        s = s.rstrip()[:-1].rstrip() + ",\n" + block.rstrip(",\n") + "\n}\n"
    json.loads(s)
    open(p, "w").write(s)


def main():
    check = "--check" in sys.argv
    bad = []
    for tid in SETS:
        sounds = build(tid)
        d = os.path.join(ROOT, "themes", tid, "sounds")
        for ev, data in sounds.items():
            path = os.path.join(d, f"{ev}.wav")
            if check:
                if not os.path.exists(path):
                    bad.append(f"{tid}/{ev}: missing")
                    continue
                if open(path, "rb").read() != data:
                    bad.append(f"{tid}/{ev}: differs from its recipe (run scripts/icefin/theme-sounds.py)")
                with wave.open(path) as w:
                    ms = w.getnframes() * 1000 / w.getframerate()
                    if (w.getnchannels(), w.getsampwidth(), w.getframerate()) != (1, 2, SR) or ms > MAX_MS:
                        bad.append(f"{tid}/{ev}: {w.getnchannels()} ch, {w.getsampwidth() * 8} bit, {w.getframerate()} Hz, {ms:.0f} ms")
                meta = json.load(open(os.path.join(ROOT, "themes", tid, "theme.json")))
                if meta.get("sounds", {}).get(ev) != f"sounds/{ev}.wav":
                    bad.append(f"{tid}/{ev}: not in theme.json")
            else:
                os.makedirs(d, exist_ok=True)
                open(path, "wb").write(data)
        if not check:
            write_theme_json(tid)
            print(f"theme-sounds: {tid}: " + ", ".join(f"{ev} {len(sounds[ev]) // 96} ms" for ev in EVENTS))
    if check:
        for b in bad:
            print("theme-sounds: FAIL " + b)
        print(f"theme-sounds: {'OK' if not bad else 'FAILED'} ({len(SETS)} themes x {len(EVENTS)} events)")
        return 1 if bad else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
