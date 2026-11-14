// Icefin: receiver capabilities from the HDMI ELD (PLAN 3.2, SPEC "Audio subsystem").
#pragma once
#include <QMap>
#include <QString>
#include <QStringList>
#include <optional>

namespace Icefin::Audio
{
// Bitstream formats Icefin can pass through. Values are CEA-861 audio coding types.
enum class Codec { AC3 = 2, DTS = 7, EAC3 = 10, DTSHD = 11, TrueHD = 12 };

struct Eld
{
  bool present = false;     // monitor_present
  bool valid = false;       // eld_valid (0 when the receiver is off or in standby)
  QString monitorName;
  int lpcmChannels = 0;     // max LPCM channels (0 = no LPCM descriptor)
  QMap<Codec, int> codecs;  // bitstream formats listed, with their max channel count
  // What the HDMI PCM can open (PLAN 3.9): the kernel limits it to the union of the SADs' rates (plus the basic 32,
  // 44.1 and 48 kHz) and their largest channel count (snd_hdmi_eld_update_pcm_info). 0 = not listed.
  int maxRate = 0;
  int maxChannels = 0;
  bool stale = false;       // set by EldMonitor when this is a remembered result

  bool supports(Codec c) const { return codecs.contains(c); }
  QString summary() const;
};

// Parse the text of /proc/asound/cardN/eld#X.Y (kernel sound/hda hdmi_print_eld_info format).
std::optional<Eld> parseEld(const QString& text);

// All ELD files for an ALSA card, sorted by name (eld#<codec>.<index>).
QStringList eldFiles(int card, const QString& procRoot = "/proc/asound");

// Pick the ELD for an HDMI output on `card`. HDMI PCM devices are numbered in the order of the codec's
// converters, so the n-th HDMI PCM device of a card maps to the n-th ELD file; `hdmiIndex` is that position.
// With hdmiIndex < 0 the first valid ELD is used.
std::optional<Eld> readEld(int card, int hdmiIndex = -1, const QString& procRoot = "/proc/asound");

// Remembers the last valid ELD per output so a receiver in standby doesn't erase its capabilities.
class EldMonitor
{
public:
  // key identifies the output (e.g. "card1/hdmi0"); returns the current ELD, or the last valid one marked stale.
  std::optional<Eld> update(const QString& key, const std::optional<Eld>& current);

private:
  QMap<QString, Eld> m_lastValid;
};

QString codecName(Codec c);
}
