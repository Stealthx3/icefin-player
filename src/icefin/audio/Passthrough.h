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

struct Decision
{
  enum Mode { Passthrough, PassthroughCore, Pcm };
  Mode mode = Pcm;
  QString spdif;        // value for mpv's audio-spdif (empty for PCM)
  int pcmChannels = 2;  // for Pcm
  QString reason;       // short explanation for logs and the debug overlay
};

// user: codecs the user enabled for passthrough. eld: receiver capabilities, or nullopt when none are known
// (S/PDIF, analog, no ELD): then the user's toggles are trusted, as upstream does.
Decision decide(const Track& t, const QSet<Codec>& user, const std::optional<Eld>& eld, Backend backend);
}
