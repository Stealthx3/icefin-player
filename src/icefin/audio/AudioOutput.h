// Icefin: map mpv's audio-device to backend, ALSA card and HDMI index (PLAN 3.1, 3.2).
#pragma once
#include "Passthrough.h"
#include <QString>
#include <optional>

namespace Icefin::Audio
{
struct Output
{
  std::optional<Backend> backend;  // nullopt: mpv "auto" or unknown
  int card = -1;                   // ALSA card index, -1 if unknown
  int hdmiIndex = -1;              // n-th HDMI output of the card, -1 if not HDMI or unknown
  bool isHdmi() const { return hdmiIndex >= 0; }
};

// Parse an mpv audio-device name. sysRoot/procRoot are overridable for tests.
Output parseDevice(const QString& mpvDevice, const QString& sysRoot = "/sys", const QString& procRoot = "/proc/asound");

// ALSA card index from its id (the CARD= name), via /proc/asound/cards. -1 if not found.
int cardIndexFromId(const QString& id, const QString& procRoot = "/proc/asound");

// mpv "ao" value for the audio.backend setting (auto, pipewire, pulse, alsa, jack). SPEC: JACK is never automatic.
QString aoForSetting(const QString& backendSetting);
// Passthrough toggles are hidden when the backend can't carry any bitstream (JACK).
bool backendHidesPassthrough(const QString& backendSetting);
// Backend for a setting value; nullopt for "auto".
std::optional<Backend> backendForSetting(const QString& backendSetting);

// Backend mpv will use for "auto": PipeWire if its socket exists, then PulseAudio, then ALSA (SPEC: JACK never automatic).
Backend autoBackend(const QString& runtimeDir);
}
