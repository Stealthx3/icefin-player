"""Lumen's music (PLAN 9.53, Gate 1 decision 5a). The interface Lumen follows has no music of its own; its feel is
quiet, glassy and bright over dark art. These are original compositions in that character: D-flat major with added
ninths and sharp elevenths, bells and a soft electric piano over a slow pad, no drums. No melody, sound or sample comes
from the target. Rendered by scripts/icefin/theme-music.py.
  startup  a pad opening out of air into D-flat major 9, a chime rising in fifths over it
  ambient  a 16-bar loop at 68 BPM (Dbmaj9, Gbmaj7#11, Bbm9, Absus): a pad, an e-piano in slow broken chords, a low
           soft bass, a bell now and then
  menu     the sidebar sliding in: two glassy notes upward
  goodbye  the startup's chime falling as the pad closes"""
from .synth import Mix, bass, bell, chord, epiano, filt, noise, pad, vibes
from .synth import hz

import numpy as np

SR = 48000


def air(sec, lo=300.0, hi=7000.0, vel=0.3, fall=False):
    """Breath of air: soft noise through a sweeping low-pass."""
    x = noise(sec)
    n = len(x)
    out = np.zeros(n)
    steps = 24
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        r = k / (steps - 1)
        f = (hi * (lo / hi) ** r) if fall else (lo * (hi / lo) ** r)
        out[a:b] = filt(x, "lowpass", f)[a:b]
    env = np.linspace(0, 1, n) ** 1.6 if not fall else np.linspace(1, 0, n) ** 1.4
    return out * env * vel


def startup():
    m = Mix(6.0)
    m.add(air(1.3, 250, 6000, 0.35), 0.0, 0.0, 0.45, 0.5)
    chord(m, 1.1, ["Db3", "Ab3", "C4", "Eb4", "F4"], pad, 4.2, 0, 0.11, 0.5, 0.6, swell=0.25)
    m.add(bass(hz("Db2"), 3.2, 0.4), 1.1, 0, 0.32, 0.05)
    for k, n in enumerate(["Ab4", "Eb5", "Bb5", "F6"]):  # a chime rising in fifths
        m.add(bell(hz(n), 2.4, 0.3 - k * 0.04), 1.25 + k * 0.2, -0.45 + k * 0.3, 0.3, 0.7)
    m.add(epiano(hz("C5"), 2.0, 0.3), 2.1, 0.2, 0.28, 0.6)
    return m.render(2.6)


def ambient():
    bt = 60 / 68
    bars = 16
    L = bars * 4 * bt
    m = Mix(L)
    prog = [("Db2", ["Ab3", "C4", "Eb4", "F4"], ["Db4", "Ab4", "Eb5", "C5"]),
            ("Gb1", ["Bb3", "Db4", "F4", "C5"], ["Gb3", "Db4", "C5", "Bb4"]),
            ("Bb1", ["Db4", "F4", "Ab4", "C5"], ["Bb3", "F4", "C5", "Ab4"]),
            ("Ab1", ["Db4", "Eb4", "Ab4", "Bb4"], ["Ab3", "Eb4", "Bb4", "Db5"])] * 4
    for bar, (root, ch, broken) in enumerate(prog):
        b0 = bar * 4
        chord(m, b0 * bt, ch, pad, 4.4 * bt, 0, 0.065, 0.6, 0.65, swell=0.7)
        m.add(bass(hz(root), 3.6 * bt, 0.36), b0 * bt, 0, 0.24, 0.05, wrap=True)
        for k, n in enumerate(broken):  # the e-piano on each beat, slowly
            m.add(epiano(hz(n), 2.2, 0.3 - (k % 2) * 0.05), (b0 + k) * bt, -0.35 + k * 0.23, 0.15, 0.6, wrap=True)
    for b, n in ((6, "F5"), (22, "C6"), (38, "Ab5"), (54, "Eb6")):
        m.add(bell(hz(n), 2.8, 0.14), b * bt, 0.5 if b % 32 < 16 else -0.5, 0.09, 0.8, wrap=True)
        m.add(vibes(hz(n) / 2, 2.0, 0.12), b * bt + 0.3, 0, 0.06, 0.7, wrap=True)
    return m.render(2.6, peak_db=-8.0, loop=True)


def menu():
    m = Mix(1.6)
    m.add(air(0.22, 1200, 8000, 0.18), 0.0, 0, 0.3, 0.4)
    m.add(bell(hz("Ab5"), 0.9, 0.42), 0.1, -0.2, 0.32, 0.55)
    m.add(bell(hz("Eb6"), 1.1, 0.42), 0.2, 0.2, 0.32, 0.6)
    return m.render(1.6, peak_db=-4.0)


def goodbye():
    m = Mix(3.4)
    chord(m, 0.0, ["Db3", "Ab3", "C4", "F4"], pad, 2.4, 0, 0.1, 0.4, 0.55, swell=0.3)
    m.add(bass(hz("Db2"), 2.2, 0.36), 0.0, 0, 0.28, 0.05)
    for k, n in enumerate(["F6", "Bb5", "Eb5", "Ab4", "Db4"]):
        m.add(bell(hz(n), 1.6, 0.32 - k * 0.03), k * 0.18, 0.4 - k * 0.2, 0.28, 0.65)
    m.add(air(1.2, 6000, 300, 0.16, fall=True), 0.9, 0, 0.28, 0.5)
    return m.render(2.2)


STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {"menu": menu, "goodbye": goodbye}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}

# loudness per jingle (RMS of the mono sum, dB): the menu chime sits lower than the goodbye
LEVELS = {"menu": -22.0, "goodbye": -17.0}
