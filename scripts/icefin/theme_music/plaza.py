"""Plaza's music (PLAN 9.33): a startup jingle, a jingle for each kind of channel and a looping ambient piece. Original
compositions in the character of a bright, friendly console menu (electric piano, marimba, vibraphone, plucked strings,
bells, brushes); no target's music (CLAUDE.md clone rules). Rendered by scripts/icefin/theme-music.py."""
import numpy as np
from .synth import (SR, Mix, bass, bell, brass, brush, chord, epiano, filt, hz, kick, line, marimba, midi, musicbox,
                    noise, pad, pluck, shaker, shutter, timpani, tt, vibes, woodblock, fade, att)

def startup():
    bt = 60 / 112
    m = Mix(5.2)
    m.add(kick(0.6), 0, 0, 0.6, 0.05)
    m.add(bass(hz("D2"), 1.2), 0, 0, 0.5, 0.05)
    line(m, [(0, .25, "A4"), (.25, .25, "D5"), (.5, .25, "F#5"), (.75, .25, "A5"), (1.0, .5, "E5"), (1.25, .5, "F#5")], bt, marimba, -0.3, 0.45)
    chord(m, 1.5 * bt, ["D4", "F#4", "A4", "C#5", "E5"], epiano, 2.2, 0.1, 0.17, 0.012, 0.35)
    chord(m, 1.5 * bt, ["A3", "E4"], pad, 2.4, 0, 0.12, 0, 0.4, swell=0.5)
    m.add(bass(hz("D2"), 2.0), 1.5 * bt, 0, 0.45, 0.05)
    line(m, [(1.5, 1, "A5", .5), (1.75, 1, "D6", .45), (2.0, 1, "F#6", .4), (2.25, 2, "E6", .4), (2.75, 3, "A6", .35)], bt, bell, 0.4, 0.35, 0.45)
    m.add(brush(0.3, 0.6), 1.5 * bt, 0.2, 0.4, 0.2)
    return m.render(2.2)


def movies():
    bt = 60 / 88
    m = Mix(6.2)
    for i in range(10):
        m.add(timpani(hz("C2"), 0.5, 0.25 + i * 0.05), i * 0.09, -0.1, 0.5, 0.1)
    m.add(timpani(hz("C2"), 2.4, 0.9), 0.95, 0, 0.8, 0.2)
    line(m, [(1.3, 0.5, "G3"), (1.8, 0.5, "C4"), (2.3, 0.5, "D4"), (2.8, 2.5, "E4")], bt, brass, -0.2, 0.55, 0.35)
    line(m, [(1.3, 0.5, "E3"), (1.8, 0.5, "G3"), (2.3, 0.5, "B3"), (2.8, 2.5, "C4")], bt, brass, 0.2, 0.45, 0.35)
    chord(m, 2.8 * bt, ["C3", "G3", "D4", "F#4", "A4"], pad, 3.2, 0, 0.16, 0, 0.45, swell=0.8)
    m.add(bass(hz("C2"), 3.0, 0.7), 2.8 * bt, 0, 0.5, 0.1)
    line(m, [(3.2, 2, "D6", .35), (3.45, 2, "F#6", .3), (3.7, 2, "A6", .3), (3.95, 3, "E7", .25)], bt, bell, 0.5, 0.3, 0.5)
    return m.render(2.6)


def tvshows():
    bt = 60 / 128
    m = Mix(4.2)
    line(m, [(0, .4, "F2"), (.75, .25, "F2"), (1.0, .4, "A2"), (1.5, .4, "C3"), (2.0, .25, "D3"), (2.5, .5, "Eb3"), (3.0, 1.5, "F2")], bt, bass, 0, 0.6, 0.05, slap=0.5)
    for b in (0.5, 1.5, 2.5):
        chord(m, b * bt, ["A4", "C5", "E5"], vibes, 0.18, 0.2, 0.14, 0, 0.25)
    line(m, [(2.0, .5, "Bb5"), (2.5, .5, "C6"), (3.0, 1.5, "F6")], bt, vibes, -0.25, 0.45, 0.3)
    chord(m, 3.0 * bt, ["F4", "A4", "C5", "E5", "G5"], epiano, 1.3, 0.1, 0.16, 0.01, 0.3)
    for b in (0, 1, 2):
        m.add(kick(0.6), b * bt, 0, 0.5, 0.05)
    for b in (1, 3):
        m.add(brush(0.5, 0.2), b * bt, 0.15, 0.5, 0.15)
    for b in np.arange(0, 3, 0.5):
        m.add(shaker(0.25), b * bt, 0.4, 0.4, 0.1)
    return m.render(1.6)


def music():
    bt = 60 / 108
    m = Mix(5.6)
    sw = 0.16
    line(m, [(0, 1, "Bb2"), (1, 1, "D3"), (2, 1, "F3"), (3, 1, "G3"), (4, 1, "Eb3"), (5, 1, "E3"), (6, 2.5, "F2")], bt, bass, 0, 0.6, 0.05)
    line(m, [(0.5, .5, "F5"), (1, .5, "G5"), (1.5, .5, "Bb5"), (2, 1, "D6"), (3.5, .5, "C6"), (4, .5, "Bb5"), (4.5, .5, "G5"), (5, 1, "Ab5"), (6, 2, "Bb5")], bt, epiano, -0.2, 0.42, 0.3, swing=sw)
    chord(m, 0, ["D4", "F4", "A4", "C5"], epiano, 1.6 * bt, 0.2, 0.12, 0, 0.3, vel=0.6)
    chord(m, 2 * bt, ["D4", "F4", "G4", "Bb4"], epiano, 1.6 * bt, 0.2, 0.12, 0, 0.3, vel=0.6)
    chord(m, 4 * bt, ["Db4", "F4", "G4", "Bb4"], epiano, 1.6 * bt, 0.2, 0.12, 0, 0.3, vel=0.6)
    chord(m, 6 * bt, ["D4", "F4", "G4", "A4", "C5"], epiano, 2.2, 0.2, 0.14, 0.015, 0.35, vel=0.65)
    for b in range(0, 7):
        m.add(brush(0.35 if b % 2 else 0.2, 0.25), b * bt, 0.25, 0.45, 0.12)
        m.add(shaker(0.2), (b + 0.5 + sw) * bt, 0.45, 0.35, 0.1)
    return m.render(1.8)


def livetv():
    bt = 60 / 100
    m = Mix(4.6)
    line(m, [(0, 1, "D5", .7), (0.75, 1, "A5", .65), (1.5, 1, "F#5", .65), (2.25, 3, "B5", .7)], bt, bell, 0, 0.5, 0.4, ratio=2.0, index=1.4)
    chord(m, 2.25 * bt, ["G3", "D4", "F#4", "B4"], pad, 2.0, 0, 0.13, 0, 0.4, swell=0.4, bright=3)
    m.add(bass(hz("G2"), 2.0, 0.6), 2.25 * bt, 0, 0.4, 0.05)
    hum = (np.sin(2 * np.pi * 60 * tt(4.4)) * 0.4 + filt(noise(4.4), "bandpass", [300, 2500]) * 0.2) * np.minimum(1, tt(4.4) / 0.3)
    m.add(hum * np.exp(-tt(4.4) / 1.4), 0, 0, 0.06, 0)
    return m.render(2.0)


def resume():
    bt = 60 / 116
    m = Mix(4.4)
    t = tt(0.55)
    rate = 0.45 + 0.55 * (t / t[-1]) ** 0.6
    for n in ("A4", "C#5", "E5"):
        ph = np.cumsum(2 * np.pi * hz(n) * rate / SR)
        m.add(fade(att(np.sin(ph) * np.minimum(1, t / 0.2), 5), 20), 0, -0.1, 0.12, 0.2)
    line(m, [(1.1, .5, "C#5"), (1.6, .5, "E5"), (2.1, .5, "A5"), (2.6, .5, "B5"), (3.1, 1.5, "C#6")], bt, marimba, -0.2, 0.5, 0.25)
    chord(m, 3.1 * bt, ["A3", "E4", "G#4", "B4", "C#5"], epiano, 1.6, 0.15, 0.15, 0.01, 0.3)
    m.add(bass(hz("A2"), 1.6, 0.7), 3.1 * bt, 0, 0.45, 0.05)
    for b in (1.1, 2.1):
        m.add(kick(0.4), b * bt, 0, 0.4, 0.05)
    return m.render(1.8)


def nextup():
    bt = 60 / 132
    m = Mix(3.8)
    line(m, [(0, .25, "E5"), (.5, .25, "F#5"), (1, .25, "G#5"), (1.5, .25, "B5"), (2, .25, "C#6"), (2.5, .25, "B5"), (3, 1.5, "E6")], bt, pluck, 0.2, 0.45, 0.25, damp=0.993, bright=0.7)
    line(m, [(0, .25, "B4"), (.5, .25, "C#5"), (1, .25, "E5"), (1.5, .25, "F#5"), (2, .25, "G#5"), (2.5, .25, "F#5"), (3, 1.5, "B5")], bt, marimba, -0.3, 0.35, 0.25)
    chord(m, 3 * bt, ["E4", "G#4", "B4", "D#5", "F#5"], vibes, 1.2, 0, 0.13, 0.01, 0.35)
    line(m, [(0, .4, "E2"), (1, .4, "E2"), (2, .4, "A2"), (2.5, .4, "B2"), (3, 1.4, "E2")], bt, bass, 0, 0.55, 0.05)
    for b in np.arange(0, 3, 0.5):
        m.add(shaker(0.3), b * bt, 0.5, 0.4, 0.1)
    m.add(kick(0.5), 3 * bt, 0, 0.5, 0.05)
    return m.render(1.6)


def playlists():
    bt = 60 / 100
    m = Mix(5.0)
    for i, n in enumerate(["C3", "G3", "E4", "B4", "D5"]):
        m.add(pluck(hz(n), 2.4, 0.6, 0.9975, 0.45), i * 0.025, -0.3 + i * 0.12, 0.3, 0.3)
    for i, n in enumerate(["A2", "E3", "C4", "G4", "B4"]):
        m.add(pluck(hz(n), 2.4, 0.6, 0.9975, 0.45), 2 * bt + i * 0.025, -0.3 + i * 0.12, 0.3, 0.3)
    line(m, [(0.5, .5, "E5"), (1, .5, "G5"), (1.5, .5, "A5"), (2, 1, "C6"), (3, .5, "B5"), (3.5, 1.5, "G5")], bt, pluck, 0.3, 0.4, 0.3, damp=0.997, bright=0.6)
    chord(m, 4 * bt, ["F3", "C4", "E4", "A4", "D5"], epiano, 1.6, 0, 0.13, 0.03, 0.35, vel=0.6)
    line(m, [(0, 2, "C2"), (2, 2, "A1"), (4, 1.6, "F2")], bt, bass, 0, 0.5, 0.05)
    return m.render(2.0)


def homevideos():
    bt = 60 / 150
    m = Mix(5.6)
    mel = [(0, 1, "A5"), (1, 1, "C6"), (2, 1, "F6"), (3, 2, "E6"), (5, 1, "C6"), (6, 1, "D6"), (7, 1, "Bb5"), (8, 1, "G5"), (9, 3, "A5")]
    line(m, mel, bt, musicbox, 0.2, 0.5, 0.35)
    for bar, (root, ch) in enumerate([("F3", ["A4", "C5"]), ("C3", ["G4", "C5"]), ("Bb2", ["F4", "D5"]), ("F3", ["A4", "C5"])]):
        b0 = bar * 3
        m.add(bass(hz(root), 0.6, 0.5), b0 * bt, -0.1, 0.35, 0.1)
        for b in (1, 2):
            chord(m, (b0 + b) * bt, ch, musicbox, 0.8, -0.3, 0.16, 0, 0.3, vel=0.4)
    chord(m, 9 * bt, ["F3", "C4", "A4"], pad, 1.8, 0, 0.1, 0, 0.4, swell=0.5, bright=2.5)
    return m.render(2.2)


def photos():
    bt = 60 / 120
    m = Mix(3.6)
    m.add(shutter(0.7), 0, 0.1, 0.5, 0.15)
    line(m, [(0.6, .5, "D6", .4), (0.75, .5, "E6", .4), (0.9, .5, "F#6", .4), (1.05, .5, "A6", .4), (1.2, .5, "B6", .38), (1.35, 2, "D7", .38)], bt, bell, 0.3, 0.4, 0.45, ratio=4.0, index=1.2)
    chord(m, 1.35 * bt, ["D4", "A4", "E5", "F#5"], vibes, 1.4, -0.1, 0.16, 0.01, 0.35)
    m.add(bass(hz("D2"), 1.4, 0.6), 1.35 * bt, 0, 0.4, 0.05)
    return m.render(1.8)


def books():
    bt = 60 / 76
    m = Mix(6.4)
    arp = ["Eb3", "Bb3", "G4", "Eb4", "Bb4", "G4"]
    for i, n in enumerate(arp):
        m.add(pluck(hz(n), 2.6, 0.5, 0.998, 0.25), i * 0.5 * bt, -0.3 + i * 0.1, 0.32, 0.4)
    line(m, [(0.5, 1, "G5", .5), (1.5, .5, "F5", .45), (2, .5, "Eb5", .45), (2.5, 1, "Bb4", .45), (3.5, .5, "C5", .45), (4, .5, "D5", .45), (4.5, 2, "Eb5", .5)], bt, musicbox, 0.25, 0.42, 0.45)
    chord(m, 3 * bt, ["Ab3", "C4", "Eb4", "G4"], pad, 3.0, 0, 0.09, 0, 0.5, swell=1.0, bright=2.0)
    m.add(bass(hz("Eb2"), 2.8, 0.45), 0, 0, 0.35, 0.1)
    m.add(bass(hz("Ab1"), 1.5, 0.4), 3 * bt, 0, 0.3, 0.1)
    m.add(bass(hz("Eb2"), 2.0, 0.4), 4.5 * bt, 0, 0.3, 0.1)
    return m.render(2.6)


def boxsets():
    bt = 60 / 120
    m = Mix(3.8)
    for i, (f, n) in enumerate([(700, "G4"), (850, "B4"), (1020, "D5")]):
        m.add(woodblock(f, 0.7), i * 0.5 * bt, -0.3 + i * 0.3, 0.45, 0.15)
        m.add(marimba(hz(n), 0.5), i * 0.5 * bt, -0.3 + i * 0.3, 0.4, 0.2)
    m.add(kick(0.7), 1.5 * bt, 0, 0.55, 0.05)
    chord(m, 1.5 * bt, ["G3", "D4", "F#4", "B4", "E5"], epiano, 1.6, 0.1, 0.15, 0.01, 0.3)
    m.add(bass(hz("G2"), 1.6, 0.7), 1.5 * bt, 0, 0.45, 0.05)
    line(m, [(1.5, 2, "G6", .4), (2.0, 2, "D7", .3)], bt, bell, 0.4, 0.3, 0.4)
    return m.render(1.6)


def folder():
    bt = 60 / 120
    m = Mix(3.8)
    line(m, [(0, .5, "A4"), (.5, .5, "C5"), (1, .5, "E5"), (1.5, .5, "D5"), (2, .5, "C5"), (2.5, .5, "B4"), (3, 1.5, "C5")], bt, pluck, 0.15, 0.45, 0.25, damp=0.99, bright=0.35)
    line(m, [(0, .45, "A2"), (1, .45, "F2"), (2, .45, "G2"), (3, 1.3, "C2")], bt, bass, 0, 0.5, 0.05)
    chord(m, 3 * bt, ["E4", "G4", "B4", "D5"], vibes, 1.2, -0.2, 0.13, 0.01, 0.3)
    for b in (1, 3):
        m.add(brush(0.35, 0.2), b * bt, 0.2, 0.4, 0.12)
    return m.render(1.6)


def ambient():
    """A 16-bar loop at 92 BPM in F: Rhodes comping, a walking-ish bass, brushes and shaker, a sparse vibraphone melody."""
    bt = 60 / 92
    bars = 16
    L = bars * 4 * bt
    m = Mix(L)
    prog = [("F2", ["A3", "C4", "E4", "G4"]), ("E2", ["G3", "B3", "D4", "F#4"]), ("A1", ["G3", "C#4", "E4", "F#4"]),
            ("D2", ["F3", "A3", "C4", "E4"]), ("G1", ["F3", "A3", "B3", "E4"]), ("C2", ["E3", "Bb3", "D4", "G4"]),
            ("Bb1", ["A3", "D4", "F4", "C5"]), ("A1", ["G3", "C4", "E4", "G4"]), ("D2", ["F3", "A3", "C4", "E4"]),
            ("G1", ["F3", "Bb3", "D4", "A4"]), ("C2", ["E3", "Bb3", "D4", "G4"]), ("F2", ["E3", "A3", "C4", "G4"]),
            ("Bb1", ["A3", "D4", "F4", "C5"]), ("A1", ["G3", "C#4", "F4", "Bb4"]), ("D2", ["F3", "A3", "C4", "E4"]),
            ("C2", ["E3", "Bb3", "D4", "G4"])]
    comp = [(0, 1.4, 0.55), (1.5, 0.9, 0.42), (3.0, 0.8, 0.38)]
    for bar, (root, ch) in enumerate(prog):
        b0 = bar * 4
        for (b, ln, v) in comp:
            for i, n in enumerate(ch):
                m.add(epiano(hz(n), ln * bt, v, 0.7), (b0 + b) * bt + i * 0.008, -0.25 + i * 0.12, 0.13, 0.35, wrap=True)
        r = midi(root)
        nxt = midi(prog[(bar + 1) % bars][0])
        approach = nxt + (1 if nxt < r else -1)
        for b, n, ln in ((0, r, 1.6), (2, r + 7, 0.9), (3, approach, 0.9)):
            m.add(bass(hz(n), ln * bt, 0.6), (b0 + b) * bt, 0, 0.42, 0.05, wrap=True)
        m.add(kick(0.35), b0 * bt, 0, 0.35, 0.03, wrap=True)
        m.add(kick(0.25), (b0 + 2.5) * bt, 0, 0.3, 0.03, wrap=True)
        for b in (1, 3):
            m.add(brush(0.28, 0.22), (b0 + b) * bt, 0.2, 0.35, 0.15, wrap=True)
        for b in np.arange(0, 4, 0.5):
            sw = 0.12 if (b * 2) % 2 == 1 else 0
            m.add(shaker(0.13 if sw else 0.18), (b0 + b + sw) * bt, 0.45, 0.35, 0.12, wrap=True)
    mel = [(8, 1.5, "C6"), (9.5, .5, "A5"), (10, 2, "G5"), (13, 1, "B5"), (14, 2, "A5"),
           (16, 1.5, "F5"), (17.5, .5, "G5"), (18, 1, "A5"), (19, 1, "C6"), (20, 3, "D6"),
           (24, 1, "E6"), (25, 1, "D6"), (26, 2, "C6"), (29, 1, "A5"), (30, 2, "Bb5"),
           (40, 1.5, "A5"), (41.5, .5, "C6"), (42, 2, "E6"), (45, 1, "D6"), (46, 2, "C6"),
           (48, 1, "Bb5"), (49, 1, "A5"), (50, 2, "F5"), (53, 1, "G5"), (54, 2.5, "A5"),
           (56, 1.5, "F5"), (57.5, .5, "A5"), (58, 2, "C6"), (61, 1, "Bb5"), (62, 2, "G5")]
    for b, ln, n in mel:
        m.add(vibes(hz(n), ln * bt, 0.5), b * bt, 0.3, 0.28, 0.45, wrap=True)
    return m.render(2.4, peak_db=-7.4, loop=True)  # 15 % under its first level (the user, 2026-11-13)


STARTUP = "startup"
AMBIENT = "ambient"
# jingle key (Plaza's channel kinds; favourites have none) -> recipe
JINGLES = {"resume": resume, "nextup": nextup, "movies": movies, "tvshows": tvshows, "music": music, "livetv": livetv,
           "homevideos": homevideos, "photos": photos, "books": books, "boxsets": boxsets, "playlists": playlists,
           "folder": folder}
PIECES = {STARTUP: startup, AMBIENT: ambient, **JINGLES}
