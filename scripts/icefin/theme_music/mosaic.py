"""Mosaic's music (PLAN 9.55, Gate 1 decision 5a). The flat, bright dashboard Mosaic follows is clean, light and
digital: short glassy chimes over soft airy pads, nothing heavy. These are original compositions in that character,
in D major with an added ninth (the open, hopeful colour of its era's interface sounds), in the same family as
Mosaic's UI sounds (scripts/icefin/theme-sounds.py mosaic()). No melody, sound or sample comes from the console or its
apps. Rendered by scripts/icefin/theme-music.py.
  startup  a soft airy swell, then a bright rising chime figure over a D add9 chord, a light sub under it
  ambient  a 16-bar loop at 84 BPM (Dmaj9, Bm11, Gmaj7#11, A6sus): music-box and vibes in a slow interlocking
           pattern, wide quiet pads, a soft heartbeat of a kick every two bars, a chime answering now and then
  guide    the guide panel rising: a quick two-note chime upward
  goodbye  the startup's chime figure falling over the chord, the pad fading"""
from .synth import Mix, bass, bell, chord, filt, hz, kick, musicbox, noise, pad, vibes

import numpy as np

SR = 48000


def air(sec, lo=600.0, hi=8000.0, vel=0.4, fall=False):
    """An airy swell: noise through a band sweeping up (or down)."""
    x = noise(sec)
    n = len(x)
    out = np.zeros(n)
    steps = 24
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        r = k / (steps - 1)
        f = (hi * (lo / hi) ** r) if fall else (lo * (hi / lo) ** r)
        out[a:b] = filt(filt(x, "highpass", f * 0.7), "lowpass", min(f * 1.4, 20000.0))[a:b]
    env = np.linspace(0, 1, n) ** 2 if not fall else np.linspace(1, 0, n) ** 1.5
    return out * env * vel


def chime(f, dur=1.3, vel=0.5):
    """A glassy chime: a music box with a soft bell an octave up."""
    a = musicbox(f, dur, vel)
    b = bell(f * 2, dur, vel * 0.3, 3.0, 1.4)
    n = min(len(a), len(b))
    return a[:n] + b[:n]


def startup():
    m = Mix(5.6)
    m.add(air(1.1, 500, 9000, 0.45), 0.0, 0.0, 0.5, 0.5)
    chord(m, 0.95, ["D3", "A3", "E4", "F#4", "A4", "C#5"], pad, 3.6, 0, 0.12, 0.45, 0.55, swell=0.25)
    m.add(bass(hz("D2"), 2.8, 0.45), 0.95, 0, 0.35, 0.05)
    for k, n in enumerate(["A4", "D5", "E5", "F#5", "A5", "D6"]):
        m.add(chime(hz(n), 1.6, 0.5 - k * 0.03), 1.0 + k * 0.11, -0.5 + k * 0.2, 0.34, 0.55)
    m.add(bell(hz("E6"), 2.4, 0.22), 1.9, 0.4, 0.2, 0.7)
    return m.render(2.4)


def ambient():
    bt = 60 / 84
    bars = 16
    L = bars * 4 * bt
    m = Mix(L)
    prog = [("D2", ["F#3", "A3", "C#4", "E4"], ["D4", "A4", "E5", "F#5", "C#5", "A4"]),
            ("B1", ["D3", "F#3", "A3", "E4"], ["B3", "F#4", "D5", "E5", "A4", "F#4"]),
            ("G1", ["B3", "C#4", "F#4", "D4"], ["G3", "D4", "B4", "C#5", "F#4", "D4"]),
            ("A1", ["D4", "E4", "F#4", "B3"], ["A3", "E4", "B4", "D5", "F#4", "E4"])] * 4
    for bar, (root, ch, pat) in enumerate(prog):
        b0 = bar * 4
        chord(m, b0 * bt, ch, pad, 4.4 * bt, 0, 0.07, 0.6, 0.6, swell=0.7)
        m.add(bass(hz(root), 3.6 * bt, 0.4), b0 * bt, 0, 0.26, 0.05, wrap=True)
        # music box on the beats, vibes answering on the off-beats, slowly interlocking
        for k, n in enumerate(pat):
            at = (b0 + k * 0.667) * bt
            inst = musicbox if k % 2 == 0 else vibes
            m.add(inst(hz(n), 1.4, 0.36 if k % 2 == 0 else 0.26), at, -0.4 if k % 2 == 0 else 0.4, 0.15, 0.6, wrap=True)
        if bar % 2 == 0 and bar % 8 not in (0, 7):
            m.add(kick(0.4), b0 * bt, 0, 0.22, 0.1, wrap=True)
        if bar % 4 == 3:
            m.add(air(4 * bt, 800, 6000, 0.15), b0 * bt, 0.2, 0.3, 0.6, wrap=True)
    for b, n in ((6, "A6"), (22, "F#6"), (38, "E6"), (54, "D6")):
        m.add(bell(hz(n), 2.6, 0.2), b * bt, 0.5 if b % 32 < 16 else -0.5, 0.12, 0.75, wrap=True)
    return m.render(2.6, peak_db=-8.0, loop=True)


def guide():
    m = Mix(1.8)
    m.add(air(0.3, 1200, 9000, 0.35), 0.0, 0, 0.4, 0.4)
    m.add(chime(hz("A5"), 1.0, 0.55), 0.24, -0.25, 0.36, 0.5)
    m.add(chime(hz("D6"), 1.2, 0.55), 0.34, 0.25, 0.36, 0.55)
    return m.render(1.8, peak_db=-4.0)


def goodbye():
    m = Mix(3.4)
    chord(m, 0.0, ["D3", "A3", "F#4", "E4"], pad, 2.4, 0, 0.1, 0.4, 0.5, swell=0.3)
    m.add(bass(hz("D2"), 2.2, 0.4), 0.0, 0, 0.3, 0.05)
    for k, n in enumerate(["D6", "A5", "F#5", "E5", "D5", "A4"]):
        m.add(chime(hz(n), 1.3, 0.46 - k * 0.03), k * 0.15, 0.5 - k * 0.18, 0.3, 0.6)
    m.add(air(1.2, 7000, 500, 0.2, fall=True), 1.0, 0, 0.3, 0.5)
    return m.render(2.0)


STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {"guide": guide, "goodbye": goodbye}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}

# loudness per jingle (RMS of the mono sum, dB): the guide is a short chime, so it sits lower than the goodbye
LEVELS = {"guide": -21.0, "goodbye": -17.0}
