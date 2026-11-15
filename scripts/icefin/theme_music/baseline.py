"""Baseline's music (PLAN 9.51, the user's Gate 1 call 7: the whole set, then a soundboard). Stock's look has no music;
Baseline's is as plain and modern as its screens, in the same glassy character as its UI sounds (scripts/icefin/
theme-sounds.py baseline(): sine ticks, triangle pairs at B5 and E6, a bright small room). Original compositions in E
major: soft pads, electric piano, bells and a sub bass, no drums. Rendered by scripts/icefin/theme-music.py.
  startup  a rising bell arpeggio over an E add9 swell
  ambient  a calm 16-bar loop at 68 BPM (E, C#m, A, B); sparse piano and bells over pads
  goodbye  a short descending phrase, for leaving the app or signing out"""
from .synth import Mix, bass, bell, chord, epiano, hz, line, pad, vibes


def startup():
    bt = 60 / 96
    m = Mix(5.0)
    chord(m, 0.0, ["E3", "B3", "F#4", "G#4", "B4"], pad, 3.6, 0, 0.16, 0, 0.45, swell=0.7)
    m.add(bass(hz("E2"), 3.0, 0.5), 0.1, 0, 0.4, 0.05)
    line(m, [(0, 1, "B5", .5), (.5, 1, "E6", .5), (1, 1, "G#6", .45), (1.5, 3, "B6", .45)], bt, bell, 0.3, 0.32, 0.5)
    line(m, [(1.5, 2.5, "F#5", .5), (1.5, 2.5, "B5", .45), (1.5, 2.5, "D#6", .4)], bt, epiano, -0.25, 0.22, 0.4)
    return m.render(1.8)


def ambient():
    bt = 60 / 68
    bars = 16
    L = bars * 4 * bt
    m = Mix(L)
    prog = [("E2", ["B3", "E4", "F#4", "G#4"]), ("C#2", ["B3", "E4", "G#4", "D#5"]), ("A1", ["C#4", "E4", "G#4", "B4"]), ("B1", ["A3", "D#4", "F#4", "C#5"])] * 4
    for bar, (root, ch) in enumerate(prog):
        b0 = bar * 4
        chord(m, b0 * bt, ch, pad, 4.4 * bt, 0, 0.11, 0, 0.5, swell=0.6)
        m.add(bass(hz(root), 3.6 * bt, 0.45), b0 * bt, 0, 0.32, 0.05, wrap=True)
        # a sparse broken chord on the piano, every other bar, never the same twice in a row
        if bar % 2 == 1:
            for k, n in enumerate(ch[1:] if bar % 4 == 1 else ch[:3]):
                m.add(epiano(hz(n) * 2, 1.4 * bt, 0.35, 0.6), (b0 + 1 + k * 0.5) * bt, -0.3 + k * 0.25, 0.12, 0.45, wrap=True)
    mel = [(8, 2, "G#5"), (10, 1, "F#5"), (11, 3, "E5"), (16, 2, "B5"), (18, 2, "G#5"), (24, 1, "A5"), (25, 1, "G#5"), (26, 4, "F#5"),
           (40, 2, "E6"), (42, 1, "D#6"), (43, 3, "B5"), (48, 2, "C#6"), (50, 2, "G#5"), (56, 1, "A5"), (57, 1, "B5"), (58, 4, "D#6")]
    for b, ln, n in mel:
        m.add(vibes(hz(n), ln * bt, 0.4, 4.4), b * bt, 0.25, 0.2, 0.55, wrap=True)
    for b, n in ((4, "B6"), (20, "E7"), (36, "G#6"), (52, "B6")):
        m.add(bell(hz(n), 2.4, 0.3), b * bt, 0.45, 0.1, 0.6, wrap=True)
    return m.render(2.6, peak_db=-8.0, loop=True)


def goodbye():
    bt = 60 / 92
    m = Mix(3.4)
    line(m, [(0, 1, "B6", .45), (.5, 1, "G#6", .45), (1, 1, "E6", .42), (1.5, 3, "B5", .4)], bt, bell, 0.25, 0.3, 0.5)
    chord(m, 0.0, ["E3", "B3", "E4", "G#4"], pad, 2.6, 0, 0.13, 0, 0.45, swell=0.4)
    m.add(bass(hz("E2"), 2.2, 0.4), 0.0, 0, 0.35, 0.05)
    return m.render(1.4)


STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {"goodbye": goodbye}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}
