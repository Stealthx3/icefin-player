"""Synthesis primitives for theme music (PLAN 9.33): oscillators, FM tines and bells, Karplus-Strong plucks, additive
pads and brass, filtered-noise percussion, a stereo mixer with a noise-impulse reverb. No samples. numpy + scipy.
Used by scripts/icefin/theme-music.py; every theme's recipes are in a module of their own next to this one."""
import math, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
RNG = np.random.default_rng(7)


def _rng():
    return RNG


def reseed(seed):
    """Each piece starts from its own seed, so a piece renders the same whatever else is rendered."""
    global RNG
    RNG = np.random.default_rng(seed)
NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(n):
    if isinstance(n, (int, float)):
        return n
    acc = n[1:-1]
    return 12 * (int(n[-1]) + 1) + NOTE[n[0]] + acc.count("#") - acc.count("b")


def hz(n):
    return 440.0 * 2 ** ((midi(n) - 69) / 12)


def tt(sec):
    return np.arange(int(SR * sec)) / SR


def fade(x, ms=12):
    k = min(len(x), int(SR * ms / 1000))
    if k:
        x[-k:] *= np.linspace(1, 0, k)
    return x


def att(x, ms=2):
    k = min(len(x), max(1, int(SR * ms / 1000)))
    x[:k] *= np.linspace(0, 1, k)
    return x


def filt(x, kind, f):
    sos = butter(2, f, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x)


# ---- instruments (mono, peak about 1) ----
def epiano(f, dur, vel=0.8, bright=1.0):
    t = tt(dur + 1.2)
    tau = 1.4 * (440 / f) ** 0.35
    mod = (1.6 * vel * bright) * np.exp(-t / 0.35) * np.sin(2 * np.pi * f * t)
    body = np.sin(2 * np.pi * f * t + mod)
    tine = 0.18 * vel * bright * np.exp(-t / 0.06) * np.sin(2 * np.pi * f * 7.0 * t + 0.6 * np.sin(2 * np.pi * f * t))
    x = (body + tine) * np.exp(-t / tau)
    rel = np.ones_like(t)
    r0 = int(SR * dur)
    rel[r0:] = np.exp(-(np.arange(len(t) - r0)) / (SR * 0.12))
    return fade(att(x * rel * vel, 3))


def marimba(f, dur=0.6, vel=0.8):
    t = tt(max(dur, 0.7))
    s = (440 / f) ** 0.4
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / (0.32 * s))
         + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / (0.07 * s))
         + 0.08 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.025))
    return fade(att(x * vel, 1))


def vibes(f, dur=1.2, vel=0.7, trem=5.2):
    t = tt(dur + 1.0)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / 1.6)
         + 0.22 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / 0.35)
         + 0.05 * np.sin(2 * np.pi * f * 10.0 * t) * np.exp(-t / 0.08))
    x *= 1 - 0.22 * (0.5 + 0.5 * np.sin(2 * np.pi * trem * t))
    rel = np.ones_like(t)
    r0 = int(SR * dur)
    rel[r0:] = np.exp(-(np.arange(len(t) - r0)) / (SR * 0.25))
    return fade(att(x * rel * vel, 2))


def bell(f, dur=1.6, vel=0.6, ratio=3.5, index=2.4):
    t = tt(dur)
    mod = index * np.exp(-t / 0.25) * np.sin(2 * np.pi * f * ratio * t)
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (dur / 3))
    return fade(att(x * vel, 1))


def musicbox(f, dur=1.4, vel=0.6):
    t = tt(dur)
    x = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 4.2 * t) * np.exp(-t / 0.05)
         + 0.12 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.3)) * np.exp(-t / 0.55)
    return fade(att(x * vel, 1))


def pluck(f, dur=1.4, vel=0.7, damp=0.996, bright=0.5):
    n = int(SR * dur)
    P = max(2, int(round(SR / f)))
    y = np.zeros(n + P + 1)
    burst = _rng().uniform(-1, 1, P + 1)
    burst = bright * burst + (1 - bright) * np.convolve(burst, np.ones(4) / 4, "same")
    y[:P + 1] = burst
    i = P + 1
    while i < n + P + 1:
        j = min(i + P, n + P + 1)
        y[i:j] = damp * 0.5 * (y[i - P:j - P] + y[i - P - 1:j - P - 1])
        i = j
    x = filt(y[P + 1:P + 1 + n], "lowpass", min(5000, f * 6))
    x = x / (np.max(np.abs(x)) + 1e-9)
    return fade(att(x * vel, 1), 30)


def bass(f, dur, vel=0.8, slap=0.0):
    t = tt(dur + 0.15)
    x = (np.sin(2 * np.pi * f * t) + (0.35 + slap) * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (0.25 - 0.15 * slap))
         + (0.12 + slap * 0.6) * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.08))
    x *= np.exp(-t / 0.9)
    rel = np.ones_like(t)
    r0 = int(SR * dur)
    rel[r0:] = np.exp(-(np.arange(len(t) - r0)) / (SR * 0.04))
    return fade(att(x * rel * vel, 4))


def saw_add(f, t, bright):
    x = np.zeros_like(t)
    for k in range(1, 24):
        if f * k > 14000:
            break
        x += np.sin(2 * np.pi * f * k * t) / k * np.exp(-k / bright)
    return x


def pad(f, dur, vel=0.4, swell=0.5, bright=4.0):
    t = tt(dur + 0.8)
    x = sum(saw_add(f * d, t, bright) for d in (0.997, 1.0, 1.004)) / 3
    e = np.minimum(1, t / swell)
    r0 = int(SR * dur)
    e[r0:] *= np.exp(-(np.arange(len(t) - r0)) / (SR * 0.3))
    return fade(x * e * vel / 1.4)


def brass(f, dur, vel=0.6):
    t = tt(dur + 0.4)
    x = np.zeros_like(t)
    open_ = np.minimum(1, t / 0.18)
    for k in range(1, 18):
        if f * k > 12000:
            break
        x += np.sin(2 * np.pi * f * k * t) / k * np.exp(-k / (1.5 + 5 * open_))
    e = np.minimum(1, t / 0.06)
    r0 = int(SR * dur)
    e[r0:] *= np.exp(-(np.arange(len(t) - r0)) / (SR * 0.12))
    return fade(x * e * vel / 1.6)


def noise(sec):
    return _rng().uniform(-1, 1, int(SR * sec))


def kick(vel=0.8):
    t = tt(0.35)
    f = 45 + 80 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)
    return fade(att(x * vel, 1))


def brush(vel=0.4, length=0.18):
    x = filt(noise(length), "bandpass", [1800, 9000]) * np.exp(-tt(length) / (length / 3))
    return fade(att(x * vel * 2.2, 3))


def shaker(vel=0.25):
    x = filt(noise(0.06), "highpass", 6000) * np.exp(-tt(0.06) / 0.015)
    return fade(att(x * vel * 3, 4))


def woodblock(f=880, vel=0.7):
    t = tt(0.12)
    x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.6 * t)) * np.exp(-t / 0.025)
    return fade(att(x * vel, 0.5))


def timpani(f=73.4, sec=1.6, vel=0.7):
    t = tt(sec)
    x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t / 0.4)
         + 0.25 * np.sin(2 * np.pi * f * 1.98 * t) * np.exp(-t / 0.3)) * np.exp(-t / 0.7)
    x += filt(noise(sec), "lowpass", 400) * np.exp(-tt(sec) / 0.05) * 0.8
    return fade(att(x * vel, 3))


def shutter(vel=0.6):
    a = filt(noise(0.03), "bandpass", [1500, 7000]) * np.exp(-tt(0.03) / 0.006)
    b = filt(noise(0.05), "bandpass", [900, 5000]) * np.exp(-tt(0.05) / 0.01)
    x = np.zeros(int(SR * 0.16))
    x[:len(a)] += a
    k = int(SR * 0.09)
    x[k:k + len(b)] += b
    return x * vel * 2


# ---- a stereo score ----
class Mix:
    def __init__(self, sec):
        self.n = int(SR * sec)
        self.dry = np.zeros((2, self.n))
        self.wet = np.zeros((2, self.n))

    def add(self, x, at, pan=0.0, gain=1.0, send=0.25, wrap=False):
        i = int(SR * at)
        l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
        for buf, amt in ((self.dry, 1 - send * 0.5), (self.wet, send)):
            if wrap:
                idx = (np.arange(len(x)) + i) % self.n
                np.add.at(buf[0], idx, x * l * gain * amt)
                np.add.at(buf[1], idx, x * r * gain * amt)
            else:
                j = min(self.n, i + len(x))
                if j > i:
                    buf[0, i:j] += x[:j - i] * l * gain * amt
                    buf[1, i:j] += x[:j - i] * r * gain * amt

    def render(self, room=1.6, peak_db=-1.0, loop=False):
        ir_len = int(SR * room)
        out = self.dry.copy()
        for ch in range(2):
            ir = _rng().normal(0, 1, ir_len) * np.exp(-np.arange(ir_len) / (SR * room / 6))
            ir = filt(ir, "lowpass", 5200)
            ir[: int(SR * 0.012)] = 0
            ir /= np.sqrt(np.sum(ir ** 2))
            w = fftconvolve(self.wet[ch], ir) * 0.9
            if loop:  # fold the tail back onto the start so the loop has no seam
                head = w[: self.n].copy()
                tail = w[self.n:]
                for k in range(0, len(tail), self.n):
                    seg = tail[k:k + self.n]
                    head[: len(seg)] += seg
                out[ch] += head
            else:
                out[ch] += w[: self.n]
        out = np.tanh(out * 0.9) / 0.9
        out *= 10 ** (peak_db / 20) / (np.max(np.abs(out)) + 1e-9)
        if not loop:
            k = int(SR * 0.25)
            out[:, -k:] *= np.linspace(1, 0, k)
        return out


def save(path, st):
    data = (np.clip(st.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def chord(m, at, names, inst, dur, pan=0.0, gain=0.25, spread=0.0, send=0.3, **kw):
    for i, n in enumerate(names):
        m.add(inst(hz(n), dur, **kw), at + i * spread, pan + (i - len(names) / 2) * 0.12, gain, send)


def line(m, notes, beat, inst, pan=0.0, gain=0.5, send=0.25, swing=0.0, offset=0.0, **kw):
    """notes: (beat, length in beats, note[, velocity])"""
    for nt in notes:
        b, ln, n = nt[:3]
        v = nt[3] if len(nt) > 3 else 0.8
        if swing and (b * 2) % 2 == 1:
            b += swing
        m.add(inst(hz(n), ln * beat, vel=v, **kw), offset + b * beat, pan, gain, send)


def master(st, level_rms_db=-16.0, peak_db=-1.0):
    """Jingles: matched loudness (RMS of the mono sum), peaks soft-limited."""
    r = np.sqrt((st.mean(0) ** 2).mean())
    st = st * (10 ** (level_rms_db / 20) / r)
    lim = 10 ** (peak_db / 20)
    knee = 0.7 * lim
    return np.where(np.abs(st) > knee, np.sign(st) * (knee + 0.3 * lim * np.tanh((np.abs(st) - knee) / (0.3 * lim))), st)
