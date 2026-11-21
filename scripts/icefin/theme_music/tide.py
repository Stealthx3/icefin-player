"""Tide's music (PLAN 9.33). Tide follows a console's cross-bar menu over an animated wave; the target's menu has no
music of its own. The character is still and oceanic: slow swells of air like water, wide pads that change only every
few seconds, and glassy notes falling like drops, with no beat and no melody to follow. Original compositions in
A major with lydian colour. No melody, sound or sample comes from the target. Rendered by
scripts/icefin/theme-music.py.
  startup  a wave of air rises and breaks into Amaj9, drops of glass over it
  ambient  a 64 s loop: four slow chords (Amaj9, F#m11, Dmaj7#11, Esus) of 16 s each under a breathing wash, with
           drops at uneven times so the loop doesn't tick
  goodbye  the chord settling down as the wave draws back"""
import numpy as np

from .synth import Mix, bell, chord, filt, hz, noise, pad, tt, vibes


def wchord(m, at, names, inst, dur, pan=0.0, gain=0.25, spread=0.0, send=0.3, **kw):
    """synth.chord, wrapping round the end of a loop."""
    for i, n in enumerate(names):
        m.add(inst(hz(n), dur, **kw), at + i * spread, pan + (i - len(names) / 2) * 0.12, gain, send, wrap=True)


def wave(sec, peak_at, vel=0.3, lo=250.0, hi=3200.0):
    """One swell of water: noise through a band that opens as it rises and closes as it falls back."""
    x = noise(sec)
    t = tt(sec)
    env = np.exp(-((t - peak_at) / (sec * 0.32)) ** 2)
    n = len(x)
    out = np.zeros(n)
    steps = 20
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        e = env[(a + b) // 2]
        out[a:b] = filt(x, "lowpass", lo + (hi - lo) * e)[a:b]
    return out * env * vel


def drop(f, vel=0.3):
    """A drop of glass: a soft bell with a vibes shimmer under it."""
    return bell(f, 2.6, vel, ratio=2.76, index=1.1)


def startup():
    m = Mix(6.0)
    m.add(wave(2.4, 1.3, 0.45), 0.0, 0.0, 0.5, 0.55)
    land = 1.25
    chord(m, land, ["A2", "E3", "B3", "C#4", "G#4"], pad, 3.6, 0, 0.12, 0.6, 0.6, swell=0.6, bright=2.2)
    for k, n in enumerate(["E5", "B5", "G#5", "C#6"]):
        m.add(drop(hz(n), 0.32 - k * 0.03), land + 0.15 + k * 0.32, -0.5 + k * 0.33, 0.3, 0.75)
    m.add(vibes(hz("E4"), 2.4, 0.25), land + 0.1, 0, 0.12, 0.6)
    return m.render(3.0)


def ambient():
    L = 64.0
    m = Mix(L)
    span = 16.0
    chords = [("A1", ["E3", "B3", "C#4", "G#4"]), ("F#1", ["E3", "A3", "B3", "C#4"]),
              ("D2", ["F#3", "A3", "C#4", "G#4"]), ("E1", ["E3", "A3", "B3", "F#4"])]
    for k, (root, notes) in enumerate(chords):
        at = k * span
        m.add(pad(hz(root), span + 2.0, 0.5, swell=4.0, bright=1.4), at - 1.0, 0, 0.22, 0.35, wrap=True)
        wchord(m, at, notes, pad, span + 1.5, 0, 0.07, 0.7, 0.6, swell=3.2, bright=2.0)
    for k in range(8):  # the wash: one swell every 8 s, alternating sides
        m.add(wave(9.0, 4.5, 0.22), k * 8.0, -0.4 if k % 2 else 0.4, 0.35, 0.6, wrap=True)
    for at, n, pan in ((3.7, "C#6", -0.4), (11.2, "G#5", 0.5), (20.9, "E6", 0.2), (27.4, "B5", -0.5),
                       (36.1, "F#6", 0.4), (45.8, "C#6", -0.2), (52.3, "A5", 0.5), (59.6, "G#5", -0.4)):
        m.add(drop(hz(n), 0.22), at, pan, 0.14, 0.85, wrap=True)
    return m.render(3.4, peak_db=-6.0, loop=True)  # level set against Plaza's loop (about -20 LUFS)


def goodbye():
    m = Mix(5.0)
    chord(m, 0.0, ["A2", "E3", "B3", "C#4", "E4"], pad, 2.6, 0, 0.12, 0.5, 0.55, swell=0.2, bright=2.0)
    for k, n in enumerate(["C#6", "G#5", "E5", "B4"]):
        m.add(drop(hz(n), 0.28 - k * 0.04), 0.1 + k * 0.3, 0.45 - k * 0.3, 0.28, 0.75)
    m.add(wave(2.6, 0.6, 0.35, hi=2400.0), 0.6, 0, 0.4, 0.6)
    return m.render(2.8)


STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {"goodbye": goodbye}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}

LEVELS = {"goodbye": -20.5}
