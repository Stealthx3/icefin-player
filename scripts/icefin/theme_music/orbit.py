"""Orbit's music (PLAN 9.56, Gate 1 decision 5, then the user's note on the soundboard: "Try something more xboxy").
The console dashboard Orbit follows is glassy, techy and spacious: a deep bloom when it starts, crystalline plucked
arpeggios, airy risers, a sub bass under everything and, in the ambient, a soft pulse. These are original
compositions in that character, in E (lydian colour: the raised fourth, A#), in the same airy family as Orbit's UI
sounds (scripts/icefin/theme-sounds.py orbit()). No melody, sound or sample comes from the console or its games.
Rendered by scripts/icefin/theme-music.py.
  startup  a low rumble rising through an airy riser into a bright bloom: an E add9(#11) chord, a crystalline
           arpeggio cascading up over it, a sub drop
  ambient  a 16-bar loop at 100 BPM (Emaj9, C#m11, Amaj9#11, B6sus): a glassy plucked 8th-note arpeggio, a soft kick
           and shaker pulse, wide pads, a sub bass, a riser into every fourth bar, a bell answering now and then
  guide    the guide opening: a quick whoosh and a two-note glassy blip upward
  goodbye  a crystalline arpeggio falling over the chord, the sub fading, a reversed breath"""
from .synth import Mix, bass, bell, chord, filt, hz, kick, noise, pad, pluck, shaker

import numpy as np

SR = 48000


def riser(sec, lo=300.0, hi=7000.0, vel=0.5, fall=False):
    """An airy whoosh: noise through a band that sweeps up (or down), swelling in and cut at the top."""
    x = noise(sec)
    n = len(x)
    out = np.zeros(n)
    steps = 32
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        r = k / (steps - 1)
        f = (hi * (lo / hi) ** r) if fall else (lo * (hi / lo) ** r)
        out[a:b] = filt(filt(x, "highpass", f * 0.7), "lowpass", min(f * 1.5, 20000.0))[a:b]
    env = np.linspace(0, 1, n) ** 2.2 if not fall else np.linspace(1, 0, n) ** 1.4
    return out * env * vel


def rumble(sec, vel=0.6):
    """A low rumble with a sub sine falling under it: the bloom's floor."""
    t = np.arange(int(SR * sec)) / SR
    sub = np.sin(2 * np.pi * np.cumsum(55 - 14 * t / sec) / SR)
    x = filt(noise(sec), "lowpass", 180) * 2.5 + sub * 0.8
    return x * (np.sin(np.pi * t / sec) ** 0.8) * vel


def glass(f, dur=1.2, vel=0.6):
    """A crystalline pluck: the string with a bell's shimmer on top."""
    p = pluck(f, dur, vel, 0.997, 0.8)
    b = bell(f * 2, dur, vel * 0.35, 3.0, 1.6)
    n = min(len(p), len(b))
    return p[:n] + b[:n]


def startup():
    m = Mix(6.4)
    m.add(rumble(2.2, 0.5), 0.0, 0, 0.55, 0.3)
    m.add(riser(1.6, 250, 9000, 0.6), 0.3, 0.0, 0.5, 0.45)
    # the bloom at 1.9 s: E add9 #11, wide, with a sub under it
    chord(m, 1.9, ["E2", "B2", "E3", "B3", "F#4", "G#4", "A#4", "D#5"], pad, 3.8, 0, 0.13, 0.5, 0.55, swell=0.15)
    m.add(bass(hz("E1"), 3.0, 0.6), 1.9, 0, 0.5, 0.05)
    m.add(kick(0.7), 1.9, 0, 0.5, 0.2)
    # the cascade: a crystalline arpeggio rising over the bloom, 16ths at 120 BPM
    notes = ["B4", "E5", "F#5", "G#5", "A#5", "B5", "D#6", "E6", "F#6", "B6"]
    for k, n in enumerate(notes):
        m.add(glass(hz(n), 1.4, 0.5 - k * 0.02), 1.95 + k * 0.125, -0.6 + k * 0.13, 0.32, 0.6)
    m.add(bell(hz("E7"), 2.6, 0.3), 3.25, 0.4, 0.2, 0.7)
    return m.render(2.4)


def ambient():
    bt = 60 / 100
    bars = 16
    L = bars * 4 * bt
    m = Mix(L)
    prog = [("E1", ["B3", "D#4", "F#4", "G#4"], ["E4", "G#4", "B4", "D#5", "F#5", "B4", "G#4", "D#5"]),
            ("C#2", ["B3", "E4", "F#4", "G#4"], ["C#4", "E4", "G#4", "B4", "F#5", "E5", "B4", "G#4"]),
            ("A1", ["C#4", "D#4", "G#4", "B4"], ["A3", "C#4", "E4", "G#4", "D#5", "B4", "G#4", "E4"]),
            ("B1", ["A3", "C#4", "E4", "G#4"], ["B3", "E4", "F#4", "G#4", "C#5", "B4", "F#4", "E4"])] * 4
    for bar, (root, ch, arp) in enumerate(prog):
        b0 = bar * 4
        chord(m, b0 * bt, ch, pad, 4.3 * bt, 0, 0.075, 0.6, 0.6, swell=0.6)
        m.add(bass(hz(root), 3.7 * bt, 0.5), b0 * bt, 0, 0.3, 0.05, wrap=True)
        # the glassy 8th-note arpeggio, panned back and forth, softer on the off-beats
        for k, n in enumerate(arp):
            m.add(glass(hz(n), 0.9, 0.42 if k % 2 == 0 else 0.3), (b0 + k * 0.5) * bt, -0.45 if k % 2 == 0 else 0.45, 0.16, 0.6, wrap=True)
        # the pulse: a soft kick on 1 and 3, a shaker on the off-beats, out for the first and last bars of each 8
        if bar % 8 not in (0, 7):
            for beat in (0, 2):
                m.add(kick(0.55), (b0 + beat) * bt, 0, 0.32, 0.1, wrap=True)
            for k in range(8):
                if k % 2 == 1:
                    m.add(shaker(0.22), (b0 + k * 0.5) * bt, 0.35, 0.22, 0.2, wrap=True)
        # a riser into every fourth bar
        if bar % 4 == 3:
            m.add(riser(4 * bt, 300, 6000, 0.22), b0 * bt, 0.2, 0.35, 0.6, wrap=True)
    for b, n in ((7, "B6"), (23, "F#6"), (39, "D#7"), (55, "G#6")):
        m.add(bell(hz(n), 2.8, 0.24), b * bt, 0.5 if b % 32 < 16 else -0.5, 0.12, 0.75, wrap=True)
    return m.render(2.6, peak_db=-8.0, loop=True)


def guide():
    m = Mix(1.8)
    m.add(riser(0.35, 800, 9000, 0.45), 0.0, 0, 0.45, 0.4)
    m.add(glass(hz("B5"), 0.9, 0.55), 0.3, -0.25, 0.36, 0.5)
    m.add(glass(hz("E6"), 1.1, 0.55), 0.42, 0.25, 0.36, 0.55)
    m.add(bass(hz("E2"), 0.5, 0.4), 0.3, 0, 0.25, 0.05)
    return m.render(1.4, peak_db=-4.0)


def goodbye():
    m = Mix(3.6)
    chord(m, 0.0, ["E2", "B2", "E3", "G#3", "D#4"], pad, 2.6, 0, 0.11, 0.4, 0.5, swell=0.3)
    m.add(bass(hz("E1"), 2.4, 0.45), 0.0, 0, 0.35, 0.05)
    notes = ["E6", "D#6", "B5", "G#5", "F#5", "E5", "B4"]
    for k, n in enumerate(notes):
        m.add(glass(hz(n), 1.3, 0.48 - k * 0.03), k * 0.16, 0.5 - k * 0.15, 0.3, 0.6)
    m.add(riser(1.4, 6000, 300, 0.25, fall=True), 1.1, 0, 0.3, 0.5)
    return m.render(1.6)


STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {"guide": guide, "goodbye": goodbye}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}

# loudness per jingle (RMS of the mono sum, dB): the guide is a short blip, so it sits lower than the goodbye
LEVELS = {"guide": -21.0, "goodbye": -17.0}
