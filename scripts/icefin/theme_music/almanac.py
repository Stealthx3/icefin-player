"""Almanac's music (PLAN 9.33). Almanac follows a cable operator's grid guide, which has no music of its own; the
character is the easy, unhurried lounge sound of a TV guide left on in the background: a soft electric piano, a
walking upright bass, brushes and vibes. These are original compositions in that character, in B-flat major at a
relaxed swing. No melody, sound or sample comes from the target. Rendered by scripts/icefin/theme-music.py.
  startup  brushes count in, then a rising vibes figure lands on a warm Bbmaj9 with the bass
  ambient  a 16-bar loop at 88 BPM, swung (Bbmaj7, G7, Cm9, F13 twice, then Ebmaj7, Edim7, Bbmaj7/D, C9 F13):
           e-piano comping, a walking bass, brushes on 2 and 4, a vibes line now and then
  goodbye  a turnaround that settles on Bb6/9"""
from .synth import Mix, bass, brush, chord, epiano, hz, pad, vibes

SWING = 0.16  # how late the off-beat eighths land, in beats


def wchord(m, at, names, inst, dur, pan=0.0, gain=0.25, spread=0.0, send=0.3, **kw):
    """synth.chord, wrapping round the end of a loop."""
    for i, n in enumerate(names):
        m.add(inst(hz(n), dur, **kw), at + i * spread, pan + (i - len(names) / 2) * 0.12, gain, send, wrap=True)


def startup():
    m = Mix(5.0)
    bt = 60 / 88
    for k in range(3):  # brushes count in
        m.add(brush(0.3 + k * 0.05), k * bt * 0.5, 0.2, 0.35, 0.2)
    for k, n in enumerate(["F4", "A4", "C5", "D5", "F5"]):  # vibes rising into the chord
        m.add(vibes(hz(n), 1.6, 0.5), 1.4 * bt + k * bt * 0.33, -0.3 + k * 0.15, 0.28, 0.45)
    land = 1.4 * bt + 5 * bt * 0.33
    chord(m, land, ["Bb3", "D4", "F4", "A4", "C5"], epiano, 2.6, 0, 0.22, 0.4, 0.4)
    chord(m, land, ["Bb3", "F4", "A4", "D5"], pad, 2.8, 0, 0.07, 0.5, 0.5, swell=0.3, bright=2.5)
    m.add(bass(hz("Bb1"), 2.4, 0.6), land, 0, 0.4, 0.05)
    m.add(vibes(hz("D6"), 2.4, 0.45), land + 0.05, 0.3, 0.25, 0.55)
    return m.render(1.8)


def ambient():
    bt = 60 / 88
    bars = 16
    L = bars * 4 * bt
    m = Mix(L)
    # (bass walk per bar, e-piano voicing)
    A = [(["Bb1", "D2", "F2", "A1"], ["A3", "D4", "F4", "C5"]),     # Bbmaj7
         (["G1", "B1", "D2", "F2"], ["F3", "B3", "E4", "Ab4"]),     # G7(b13)
         (["C2", "Eb2", "G2", "D2"], ["Bb3", "Eb4", "G4", "D5"]),   # Cm9
         (["F1", "A1", "C2", "E2"], ["A3", "Eb4", "G4", "D5"])]     # F13
    B = [(["Eb2", "G2", "Bb2", "D2"], ["G3", "Bb3", "D4", "F4"]),   # Ebmaj7
         (["E2", "G2", "Bb1", "Db2"], ["G3", "Bb3", "Db4", "E4"]),  # Edim7
         (["D2", "F2", "Bb1", "A1"], ["F3", "A3", "D4", "G4"]),     # Bbmaj7/D (6)
         (["C2", "E2", "F1", "A1"], ["Bb3", "E4", "A4", "D5"])]     # C9 -> F13
    prog = A + A + B + A  # 16 bars: A A B A
    for bar, (walk, voicing) in enumerate(prog):
        b0 = bar * 4
        for k, n in enumerate(walk):  # walking quarter notes
            m.add(bass(hz(n), bt * 0.95, 0.55 - (k % 2) * 0.08), (b0 + k) * bt, 0, 0.3, 0.05, wrap=True)
        # comping: a long chord on 1, a short stab on the "and" of 2 (swung)
        wchord(m, b0 * bt, voicing, epiano, 1.6 * bt, -0.15, 0.13, 0.3, 0.35)
        wchord(m, (b0 + 1.5 + SWING) * bt, voicing, epiano, 0.5 * bt, 0.15, 0.08, 0.3, 0.3)
        for k in (1, 3):  # brushes on 2 and 4, a softer swish between
            m.add(brush(0.32), (b0 + k) * bt, 0.35, 0.18, 0.25, wrap=True)
            m.add(brush(0.14, 0.3), (b0 + k + 0.5 + SWING) * bt, -0.3, 0.12, 0.25, wrap=True)
    # a vibes line in bars 5-8 and 13-16, sparse and swung
    phrase = [(0, "D5", 1.0), (1.5, "F5", 0.5), (2, "A5", 1.5), (4, "G5", 1.0), (5.5, "Eb5", 0.5), (6, "D5", 2.0),
              (8, "C5", 1.0), (9.5, "Eb5", 0.5), (10, "G5", 1.0), (12, "A5", 1.5), (14, "F5", 2.0)]
    for start_bar in (4, 12):
        for beat, n, dur in phrase:
            sw = SWING if beat % 1 else 0.0
            m.add(vibes(hz(n), dur * bt + 0.6, 0.42), (start_bar * 4 + beat + sw) * bt, 0.35, 0.16, 0.5, wrap=True)
    return m.render(1.6, peak_db=-8.0, loop=True)


def goodbye():
    m = Mix(4.0)
    bt = 60 / 88
    steps = [(["A3", "D4", "F4", "C5"], "D2"), (["Bb3", "E4", "A4", "D5"], "C2"), (["A3", "Eb4", "G4", "D5"], "F1")]
    for k, (v, b) in enumerate(steps):
        chord(m, k * bt, v, epiano, bt * 0.9, 0, 0.18, 0.3, 0.35)
        m.add(bass(hz(b), bt * 0.9, 0.5), k * bt, 0, 0.32, 0.05)
    end = 3 * bt
    chord(m, end, ["Bb3", "D4", "G4", "C5", "F5"], epiano, 2.4, 0, 0.2, 0.4, 0.45)
    m.add(bass(hz("Bb1"), 2.2, 0.55), end, 0, 0.36, 0.05)
    m.add(vibes(hz("G5"), 2.2, 0.4), end + 0.04, 0.3, 0.22, 0.55)
    m.add(brush(0.25, 0.4), end, 0.2, 0.2, 0.3)
    return m.render(1.6)


STARTUP = "startup"
AMBIENT = "ambient"
JINGLES = {"goodbye": goodbye}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}

LEVELS = {"goodbye": -17.0}
