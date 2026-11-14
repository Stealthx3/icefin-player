// Icefin: per-track passthrough decision (PLAN 3.3, SPEC "Per-track decision at load").
#pragma once
#include "Eld.h"
#include <QSet>
#include <QString>

namespace Icefin::Audio
{
enum class Backend { PipeWire, PulseAudio, Alsa, Jack };

// Can this backend carry this bitstream? (SPEC backend table; PulseAudio HD formats are not guaranteed.)
bool backendCarries(Backend b, Codec c);

struct Track
{
  QString codec;    // mpv codec name: ac3, eac3, dts, truehd, aac, ...
  QString profile;  // mpv audio profile, e.g. "DTS-HD MA", "DTS-HD HRA", "DTS" (empty if unknown)
  int channels = 2;
};

// What to send while the receiver isn't ready (standby, off or unplugged: an ELD that was read but isn't valid).
// Linux doesn't set the HDMI pin up for a bitstream then: no IEC958 non-audio bit, HBR left as the previous stream
// had it (found in the Virtual AV tier, PLAN 3.9). Setting audio.icefin_standby (the user, 2026-11-12, D32):
//  - Wake (default): PCM, and the bitstream once the receiver has been ready for kWakeDelayMs (it may still be booting);
//  - Pcm: PCM for the whole track;
//  - Bitstream: the bitstream the remembered ELD allows, straight away (receivers that report standby wrongly).
enum class Standby { Wake, Pcm, Bitstream };
Standby standbyForSetting(const QString& value);
constexpr int kWakeDelayMs = 4000;  // the user: 3-5 s after the receiver reports ready, for its boot-up

struct Decision
{
  enum Mode { Passthrough, PassthroughCore, Pcm };
  Mode mode = Pcm;
  QString spdif;        // value for mpv's audio-spdif (empty for PCM)
  int pcmChannels = 2;  // for Pcm
  QString reason;       // short explanation for logs and the debug overlay
  bool waitForReceiver = false;  // PCM because the receiver isn't ready: switch when it wakes (Standby::Wake)
};

// user: codecs the user enabled for passthrough. eld: receiver capabilities, or nullopt when none are known
// (S/PDIF, analog, no ELD): then the user's toggles are trusted, as upstream does.
Decision decide(const Track& t, const QSet<Codec>& user, const std::optional<Eld>& eld, Backend backend,
                Standby standby = Standby::Wake);

// When to switch to the bitstream after the receiver wakes (unit-tested): fed the ELD's validity on every poll, it
// says yes once the ELD has stayed valid for the delay. Going back to standby starts the wait again.
class WakeGate
{
public:
  explicit WakeGate(int delayMs = kWakeDelayMs) : m_delay(delayMs) {}
  bool update(bool valid, qint64 nowMs);
  bool waiting() const { return m_since >= 0; }
  void reset() { m_since = -1; }

private:
  int m_delay;
  qint64 m_since = -1;
};
}
