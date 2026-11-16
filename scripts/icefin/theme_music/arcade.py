"""Arcade's music (PLAN 9.50, Gate 1 decision 5a). The dark, controller-first launcher Arcade follows is quiet and
modern: soft synth swells, a warm low pad, a little shimmer, nothing busy. These are original compositions in that
character, in F# minor with an added ninth (the cool, night-time colour of its blue-grey field), in the same family as
Arcade's UI sounds (scripts/icefin/theme-sounds.py arcade()). No melody, sound or sample comes from the target or its
games. Rendered by scripts/icefin/theme-music.py.
  startup  a filtered swell rising out of a low hum into an F#m add9 chord, a soft electric-piano figure over it
  ambient  a 16-bar loop at 76 BPM (F#m9, Dmaj7, Amaj9, E6sus): an e-piano in slow broken chords, a warm pad, a soft
           low pulse every bar, a shimmer of bells now and then
  menu     a menu sliding in: a quick soft blip pair upward with a little air
  goodbye  the startup's figure falling as the pad closes"""
from .synth import Mix, bass, bell, chord, epiano, filt, hz, kick, noise, pad

import numpy as np

SR = 48000


def swell(sec, lo=200.0, hi=5000.0, vel=0.4, fall=False):
    """A soft filtered swell: noise and a low hum through a sweeping low-pass."""
    t = np.arange(int(SR * sec)) / SR
    x = noise(sec) * 0.6 + np.sin(2 * np.pi * 92.5 * t) * 0.4
    n = len(x)
    out = np.zeros(n)
    steps = 24
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        r = k / (steps - 1)
        f = (hi * (lo / hi) ** r) if fall else (lo * (hi / lo) ** r)
        out[a:b] = filt(x, "lowpass", f)[a:b]
    env = np.linspace(0, 1, n) ** 1.8 if not fall else np.linspace(1, 0, n) ** 1.5
    return out * env * vel


def startup():
    m = Mix(5.8)
    m.add(swell(1.4, 150, 4000, 0.5), 0.0, 0.0, 0.5, 0.4)
    chord(m, 1.25, ["F#2", "C#3", "F#3", "A3", "C#4", "G#4"], pad, 4.0, 0, 0.12, 0.5, 0.55, swell=0.2)
    m.add(bass(hz("F#1"), 3.0, 0.5), 1.25, 0, 0.4, 0.05)
    for k, n in enumerate(["C#4", "F#4", "G#4", "A4", "C#5"]):
        m.add(epiano(hz(n), 1.8, 0.5 - k * 0.04), 1.35 + k * 0.16, -0.4 + k * 0.2, 0.36, 0.5)
    m.add(bell(hz("G#5"), 2.2, 0.16), 2.3, 0.4, 0.18, 0.7)
    return m.render(2.4)


def ambient():
    bt = 60 / 76
    bars = 16
    L = bars * 4 * bt
    m = Mix(L)
    prog = [("F#1", ["A3", "C#4", "E4", "G#4"], ["F#3", "C#4", "A4", "G#4"]),
            ("D2", ["A3", "C#4", "F#4", "D4"], ["D3", "A3", "F#4", "C#5"]),
            ("A1", ["C#4", "E4", "G#4", "B3"], ["A3", "E4", "B4", "G#4"]),
            ("E2", ["B3", "D4", "F#4", "C#4"], ["E3", "B3", "F#4", "A4"])] * 4
    for bar, (root, ch, broken) in enumerate(prog):
        b0 = bar * 4
        chord(m, b0 * bt, ch, pad, 4.4 * bt, 0, 0.07, 0.6, 0.6, swell=0.7)
        m.add(bass(hz(root), 3.6 * bt, 0.42), b0 * bt, 0, 0.28, 0.05, wrap=True)
        for k, n in enumerate(broken):  # the e-piano on each beat, slowly
            m.add(epiano(hz(n), 2.0, 0.34 - (k % 2) * 0.06), (b0 + k) * bt, -0.35 + k * 0.23, 0.17, 0.55, wrap=True)
        if bar % 8 not in (0, 7):
            m.add(kick(0.3), b0 * bt, 0, 0.18, 0.1, wrap=True)
    for b, n in ((6, "G#5"), (22, "C#6"), (38, "E5"), (54, "F#5")):
        m.add(bell(hz(n), 2.6, 0.16), b * bt, 0.5 if b % 32 < 16 else -0.5, 0.1, 0.75, wrap=True)
    return m.render(2.6, peak_db=-8.0, loop=True)


def menu():
    m = Mix(1.6)
    m.add(swell(0.25, 800, 6000, 0.25), 0.0, 0, 0.35, 0.3)
    m.add(epiano(hz("C#5"), 0.8, 0.5), 0.15, -0.2, 0.35, 0.45)
    m.add(epiano(hz("F#5"), 1.0, 0.5), 0.25, 0.2, 0.35, 0.5)
    return m.render(1.6, peak_db=-4.0)


def goodbye():
    m = Mix(3.2)
    chord(m, 0.0, ["F#2", "C#3", "A3", "G#4"], pad, 2.4, 0, 0.1, 0.4, 0.5, swell=0.3)
    m.add(bass(hz("F#1"), 2.2, 0.4), 0.0, 0, 0.3, 0.05)
    for k, n in enumerate(["C#5", "A4", "G#4", "F#4", "C#4"]):
        m.add(epiano(hz(n), 1.4, 0.44 - k * 0.04), k * 0.17, 0.4 - k * 0.2, 0.3, 0.55)
    m.add(swell(1.2, 4000, 200, 0.2, fall=True), 0.9, 0, 0.3, 0.4)
    return m.render(2.0)


STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {"menu": menu, "goodbye": goodbye}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}

# loudness per jingle (RMS of the mono sum, dB): the menu blip sits lower than the goodbye
LEVELS = {"menu": -21.0, "goodbye": -17.0}
