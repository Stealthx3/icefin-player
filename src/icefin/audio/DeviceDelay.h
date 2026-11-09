// Icefin: audio delay per output device (PLAN 3.7, SPEC "Sync and testing").
//
// Upstream keeps four global delays in the video section (audio_delay.normal/.24hz/.25hz/.50hz). Icefin keeps
// those as the live values, and stores a copy per audio device in the hidden setting state.icefin_audio_delays
// (JSON: {"<mpv audio-device>": {"normal": ms, "24hz": ms, "25hz": ms, "50hz": ms}}).
// When the device changes, the old device's values are saved and the new device's values are loaded.
// A device seen for the first time keeps the current values.
#pragma once
#include <QJsonObject>
#include <QMap>
#include <QString>
#include <optional>

namespace Icefin::Audio
{
using Delays = QMap<QString, double>;  // "normal", "24hz", "25hz", "50hz" -> milliseconds

// Settings keys in the video section, in order.
const QStringList& delayKeys();

// Pure store operations (tested in tests/icefin/unit).
QJsonObject rememberDelays(QJsonObject store, const QString& device, const Delays& d);
std::optional<Delays> recallDelays(const QJsonObject& store, const QString& device);

class DeviceDelay
{
public:
  // Call when the user's audio device setting is applied. Saves the current values under the previous device,
  // then loads the new device's values into the video section (if it has any).
  void switchDevice(const QString& device);
  // Call when the delays are applied (they may have been edited): saves them under the current device.
  void remember();

private:
  Delays current() const;
  QString m_device;
  bool m_loading = false;
};

DeviceDelay& deviceDelay();
}
