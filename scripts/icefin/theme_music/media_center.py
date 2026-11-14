"""Media Center's music (PLAN 9.60, the sound board on the pass's canvas page): a startup jingle and a looping ambient
pad. Original, in the same airy glass as Media Center's UI sounds (scripts/icefin/theme-sounds.py media_center(): a
filtered-noise tick, bell chimes at 1318 and 1976 Hz, a soft reverb). No jingle per category: the target had none.
No target's music (CLAUDE.md clone rules). Rendered by scripts/icefin/theme-music.py."""
import numpy as np
from .synth import SR, Mix, bell, chord, fade, filt, hz, noise, pad, tt

# The UI's select chime: E6 (1318.5 Hz) and B6 (1975.5 Hz). Both pieces sit in E major around it.
CHIME = ("E6", "B6")


def glass(f, dur, vel=0.5, swell=1.2, release=1.6):
    """A held glass tone: a sine with a soft octave and a slightly sharp twelfth (a rubbed glass's partials), a slow
    swell, a gentle shimmer and a long release. Peak about vel."""
    n = dur + release
    t = tt(n)
    shimmer = 1 + 0.0009 * np.sin(2 * np.pi * 0.23 * t)
    x = (np.sin(2 * np.pi * f * shimmer * t) + 0.32 * np.sin(2 * np.pi * 2.001 * f * t)
         + 0.1 * np.sin(2 * np.pi * 3.006 * f * t)) / 1.42
    e = np.minimum(1, t / swell) ** 1.6
    r0 = int(SR * dur)
    e[r0:] *= np.exp(-(np.arange(len(t) - r0)) / (SR * release / 4))
    return fade(x * e * vel)


def startup():
    """About 3 s. A rising shimmer of glass partials (0 to 0.6 s) opens into a warm E major chord with the UI's chime
    on top, which blooms and fades."""
    m = Mix(3.2)
    # the shimmer: filtered noise opening upward, and quick soft bells climbing an E major arpeggio, speeding up
    rise = tt(0.7)
    sweep = filt(noise(0.7), "highpass", 1800) * (rise / 0.7) ** 2 * np.exp(-np.maximum(0, rise - 0.62) / 0.05)
    m.add(filt(sweep, "lowpass", 9000), 0, 0.0, 0.22, 0.7)
    climb = [(0.00, "B4"), (0.16, "E5"), (0.29, "G#5"), (0.39, "B5"), (0.47, "E6"), (0.53, "G#6")]
    for i, (at, n) in enumerate(climb):
        m.add(bell(hz(n), 0.9, 0.25 + i * 0.05, ratio=2.0, index=0.9), at, -0.45 + i * 0.18, 0.5, 0.55)
    # the chord lands at 0.6 s: a soft pad and glass tones, warm and low, an octave of air above
    land = 0.6
    chord(m, land, ["E3", "B3", "E4", "G#4", "B4"], pad, 1.5, 0.0, 0.16, 0.0, 0.45, swell=0.18, bright=2.0)
    for n, pan in (("E4", -0.3), ("G#4", 0.25), ("B4", -0.1), ("D#5", 0.35)):
        m.add(glass(hz(n), 1.3, 0.5, swell=0.12, release=1.2), land, pan, 0.28, 0.5)
    m.add(glass(hz("E2"), 1.6, 0.6, swell=0.2, release=1.0), land, 0.0, 0.3, 0.25)
    # the chime on top: the UI's select bells, a touch later, ringing out
    m.add(bell(hz(CHIME[0]), 2.2, 0.7, ratio=3.5, index=1.2), land + 0.06, -0.15, 0.42, 0.55)
    m.add(bell(hz(CHIME[1]), 2.2, 0.55, ratio=3.5, index=1.0), land + 0.11, 0.2, 0.3, 0.6)
    return m.render(2.6)


def ambient():
    """A gapless 64 s pad of glass tones drifting between two chords (Amaj9 and Emaj9, 8 s each), with a distant
    chime now and then. No beat, no melody to follow."""
    L = 64.0
    m = Mix(L)
    chords = [("A2", ["E3", "A3", "C#4", "G#4", "B4"]), ("E2", ["E3", "B3", "D#4", "G#4", "F#4"])]
    span = 8.0
    for k in range(int(L / span)):
        root, notes = chords[k % 2]
        at = k * span
        # the bed: a dark pad that crosses into the next chord (1.5 s swell, held past the change)
        m.add(pad(hz(root), span + 1.0, 0.5, swell=2.5, bright=1.6), at - 0.6, 0.0, 0.26, 0.35, wrap=True)
        for i, n in enumerate(notes):
            stagger = (i * 0.37 + (k % 3) * 0.21) % 1.3  # the voices arrive one by one, never together
            m.add(glass(hz(n), span - 1.4, 0.45, swell=2.4, release=3.2), at + stagger, -0.5 + i * 0.25, 0.2, 0.55,
                  wrap=True)
    # a high air layer: very quiet filtered noise, breathing slowly over the whole loop
    t = tt(L)
    air = filt(noise(L), "bandpass", [3000, 8000]) * (0.55 + 0.45 * np.sin(2 * np.pi * t / 32.0))
    m.add(air, 0, 0.0, 0.025, 0.9, wrap=True)
    # distant chimes: the UI's bells, far back in the room, at uneven times so the loop doesn't tick
    for at, n, pan in ((5.3, CHIME[0], -0.4), (19.1, CHIME[1], 0.45), (30.7, CHIME[0], 0.2), (43.9, "G#6", -0.3),
                       (57.2, CHIME[1], 0.35)):
        m.add(bell(hz(n), 3.0, 0.5, ratio=3.5, index=0.8), at, pan, 0.16, 0.92, wrap=True)
    return m.render(3.2, peak_db=-9.0, loop=True)  # level set against Plaza's (theme-music --levels); the user hears it


# The jingle's glass top end reads louder than Plaza's at the same RMS: -16.8 puts both at -11.3 LUFS.
LEVELS = {"startup": -16.8}

STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {}  # none: the target had no sound per category (the sound board)
PIECES = {STARTUP: startup, AMBIENT: ambient}
