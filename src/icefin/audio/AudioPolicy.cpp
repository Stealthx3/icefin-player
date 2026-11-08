#include "AudioPolicy.h"
#include "AudioOutput.h"
#include "Eld.h"
#include "Passthrough.h"
#include <MpvController>
#include <QDebug>
#include <QStandardPaths>

namespace Icefin::Audio
{
static EldMonitor& monitor() { static EldMonitor m; return m; }

void applyForCurrentTrack(MpvController* mpv, const QStringList& passthroughCodecs, bool hdmiDevice)
{
  const QString codec = mpv->getProperty("current-tracks/audio/codec").toString();
  if (codec.isEmpty() || passthroughCodecs.isEmpty()) return;  // no audio, or passthrough off: upstream behaviour
  Track t{codec, mpv->getProperty("current-tracks/audio/codec-profile").toString(),
          mpv->getProperty("current-tracks/audio/demux-channel-count").toInt()};
  if (t.channels <= 0) t.channels = 2;

  QSet<Codec> user;
  static const QMap<QString, Codec> names{{"ac3", Codec::AC3}, {"eac3", Codec::EAC3}, {"dts", Codec::DTS},
                                          {"dts-hd", Codec::DTSHD}, {"truehd", Codec::TrueHD}};
  for (const QString& c : passthroughCodecs) if (names.contains(c)) user << names[c];
  if (user.contains(Codec::DTSHD)) user << Codec::DTS;  // upstream drops "dts" when "dts-hd" is on; the core still works

  const QString device = mpv->getProperty("audio-device").toString();
  Output out = parseDevice(device);
  const Backend backend = out.backend.value_or(autoBackend(QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation)));
  std::optional<Eld> eld;
  if (hdmiDevice && out.card >= 0) eld = monitor().update(device, readEld(out.card, out.hdmiIndex));
  else if (hdmiDevice && out.card < 0 && !out.backend) eld = std::nullopt;  // "auto": card unknown, trust toggles

  const Decision d = decide(t, user, eld, backend);
  mpv->setProperty("audio-spdif", d.spdif);
  qInfo().noquote() << "Icefin audio:" << codec << t.profile << t.channels << "ch on" << device
                    << "->" << (d.mode == Decision::Pcm ? QString("PCM %1ch").arg(d.pcmChannels) : d.spdif)
                    << "(" + d.reason + ")" << (eld ? "ELD: " + eld->summary() : QString("no ELD"));
}
}
