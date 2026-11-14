"""Tide's music (PLAN 9.48, the soundboard for the pass): a startup swell and a looping ambient tide. Original, in the
same deep, rounded character as Tide's UI sounds (scripts/icefin/theme-sounds.py tide(): muffled low tocks, a
crystalline confirm of bells at G6 and D7, soft rooms). Nothing from the target: no recorded or sampled audio, none of
its music (CLAUDE.md clone rules). No jingle per category (the target has none). Rendered by
scripts/icefin/theme-music.py."""
import numpy as np
from .synth import SR, Mix, bell, fade, filt, hz, noise, pad, tt

# The UI's select chime: G6 (1568 Hz) and D7 (2349 Hz). Both pieces sit in G major around it.
CHIME = ("G6", "D7")


def swell_tone(f, dur, vel=0.5, swell=1.5, release=2.0):
    """A held, rounded tone: a sine with a quiet octave and a faint fifth above it, rising slowly, drifting a little in
    pitch like light on water, and fading long. Peak about vel."""
    t = tt(dur + release)
    drift = 1 + 0.0012 * np.sin(2 * np.pi * 0.11 * t + f % 1.0)
    x = (np.sin(2 * np.pi * f * drift * t) + 0.25 * np.sin(2 * np.pi * 2.0 * f * t)
         + 0.08 * np.sin(2 * np.pi * 3.0 * f * t)) / 1.33
    e = np.minimum(1, t / swell) ** 1.8
    r0 = int(SR * dur)
    e[r0:] *= np.exp(-(np.arange(len(t) - r0)) / (SR * release / 4))
    return fade(x * e * vel)


def wash(sec, rise, fall, low=250.0, high=2600.0):
    """A wave washing in and out: filtered noise whose level and brightness rise over `rise` seconds and ebb over
    `fall`, blended from a dark and a bright layer so the crest is brighter than the trough."""
    n = noise(sec)
    dark = filt(n, "bandpass", [80, low * 2])
    bright = filt(n, "bandpass", [low, high])
    t = tt(sec)
    up = np.clip(t / rise, 0, 1)
    down = np.clip(1 - (t - rise) / fall, 0, 1)
    env = np.where(t < rise, np.sin(up * np.pi / 2) ** 2, down ** 1.6)
    return fade(dark * env * 0.9 + bright * env ** 2 * 0.6, 40)


def startup():
    """About 3.4 s. A low wave swells in (0 to 1.1 s) under a rising G major arpeggio of soft tones; at its crest the
    UI's crystal chime rings over a deep G major chord, and the wave ebbs away beneath it."""
    m = Mix(3.6)
    m.add(wash(3.4, 1.1, 2.2), 0.0, 0.0, 0.5, 0.5)
    for i, (at, n) in enumerate(((0.10, "D4"), (0.32, "G4"), (0.52, "B4"), (0.70, "D5"), (0.86, "G5"))):
        m.add(swell_tone(hz(n), 0.9, 0.35 + i * 0.05, swell=0.25, release=1.2), at, -0.4 + i * 0.2, 0.32, 0.5)
    crest = 1.05
    for n, pan in (("G2", 0.0), ("D3", -0.15), ("G3", 0.15), ("B3", -0.3), ("D4", 0.3), ("F#4", -0.1)):
        m.add(swell_tone(hz(n), 1.6, 0.5, swell=0.18, release=1.4), crest, pan, 0.26, 0.45)
    m.add(pad(hz("G2"), 1.8, 0.45, swell=0.25, bright=1.5), crest, 0.0, 0.2, 0.3)
    m.add(bell(hz(CHIME[0]), 2.3, 0.7, ratio=2.0, index=1.4), crest + 0.04, -0.2, 0.42, 0.6)
    m.add(bell(hz(CHIME[1]), 2.3, 0.55, ratio=2.0, index=1.1), crest + 0.11, 0.25, 0.3, 0.65)
    return m.render(2.8)


def ambient():
    """A gapless 96 s tide: waves wash in and out every 12 s or so (uneven, so it never ticks), over a deep pad that
    drifts between Gmaj9, Em9 and Cmaj9 (16 s each), with the UI's crystal bells far off now and then. No beat, no
    melody to follow."""
    L = 96.0
    m = Mix(L)
    chords = [("G2", ["D3", "G3", "B3", "F#4", "A4"]), ("E2", ["B2", "E3", "G3", "D4", "F#4"]),
              ("C2", ["G2", "C3", "E3", "B3", "D4"])]
    span = 16.0
    for k in range(int(L / span)):
        root, notes = chords[k % 3]
        at = k * span
        m.add(pad(hz(root), span + 1.5, 0.45, swell=3.0, bright=1.3), at - 0.8, 0.0, 0.24, 0.35, wrap=True)
        for i, n in enumerate(notes):
            stagger = (i * 0.53 + (k % 4) * 0.29) % 2.1  # voices arrive one by one
            m.add(swell_tone(hz(n), span - 2.5, 0.42, swell=3.2, release=4.0), at + stagger, -0.5 + i * 0.25, 0.17,
                  0.55, wrap=True)
    # the waves: uneven periods, alternating sides, the crest a little brighter each time the tide comes in
    at = 0.0
    for i, period in enumerate((11.2, 12.9, 10.4, 13.6, 11.8, 12.3, 10.9, 12.9)):
        rise = period * 0.38
        m.add(wash(period + 3.0, rise, period * 0.62 + 2.5, high=2200 + 300 * (i % 3)), at, (-0.35, 0.35)[i % 2],
              0.16, 0.6, wrap=True)
        at += period
    # distant crystal bells at uneven times, far back in the room
    for at, n, pan in ((7.4, CHIME[0], -0.4), (26.1, CHIME[1], 0.4), (41.8, "B6", 0.15), (63.3, CHIME[0], 0.3),
                       (81.5, CHIME[1], -0.3)):
        m.add(bell(hz(n), 3.2, 0.45, ratio=2.0, index=0.7), at, pan, 0.13, 0.93, wrap=True)
    return m.render(3.6, peak_db=-9.0, loop=True)


LEVELS = {"startup": -18.0}  # -11.3 LUFS, level with Plaza's and Media Center's startups; the ambient lands at -20.4 as rendered

STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {}  # none: the target has no sound per category
PIECES = {STARTUP: startup, AMBIENT: ambient}
