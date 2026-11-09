#include "AudioPolicy.h"
#include "AudioOutput.h"
#include "Eld.h"
#include "Passthrough.h"
#include "DeviceReservation.h"
#include "AudioState.h"
#include "Iec958Formats.h"
#include <memory>
#include <MpvController>
#include <QDebug>
#include <QStandardPaths>
#include "settings/SettingsComponent.h"

namespace Icefin::Audio
{
static EldMonitor& monitor() { static EldMonitor m; return m; }
static std::unique_ptr<DeviceReservation>& reservation() { static std::unique_ptr<DeviceReservation> r; return r; }

void releaseReservation() { if (reservation()) reservation()->release(); }

void refreshBitstream(MpvController* mpv, bool passthrough, const QString& why)
{
  const bool exclusive = (reservation() && reservation()->held()) || mpv->getProperty("audio-exclusive").toBool();
  state().setBitstream(passthrough || exclusive, passthrough ? why : exclusive ? QString("exclusive output") : why);
}

// Exclusive ALSA: claim the card from PipeWire/PulseAudio/JACK before mpv opens it (SPEC "Exclusive ALSA").
static void reserveFor(const Output& out, Backend backend)
{
  if (backend != Backend::Alsa || out.card < 0) { releaseReservation(); return; }
  auto& r = reservation();
  if (r && r->held() && r->serviceName().endsWith(QString("Audio%1").arg(out.card))) return;
  r = std::make_unique<DeviceReservation>(out.card);
  if (!r->acquire()) qWarning().noquote() << "Icefin audio: could not reserve card" << out.card << "-" << r->lastError();
}

void applyForCurrentTrack(MpvController* mpv, const QStringList& passthroughCodecs, bool hdmiDevice)
{
  {
    const Output o = parseDevice(mpv->getProperty("audio-device").toString());
    const auto chosen = backendForSetting(SettingsComponent::Get().value(SETTINGS_SECTION_AUDIO, "backend").toString());
    reserveFor(o, o.backend ? *o.backend : chosen.value_or(Backend::PipeWire));  // reservation is independent of passthrough
  }
  const QString codec = mpv->getProperty("current-tracks/audio/codec").toString();
  if (codec.isEmpty() || passthroughCodecs.isEmpty()) {  // no audio, or passthrough off: upstream behaviour
    refreshBitstream(mpv, false, codec.isEmpty() ? "no audio track" : "passthrough off");
    return;
  }
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
  const auto chosen = backendForSetting(SettingsComponent::Get().value(SETTINGS_SECTION_AUDIO, "backend").toString());
  const Backend backend = out.backend ? *out.backend
                        : chosen ? *chosen : autoBackend(QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation));
  std::optional<Eld> eld;
  if (hdmiDevice && out.card >= 0) eld = monitor().update(device, readEld(out.card, out.hdmiIndex));
  else if (hdmiDevice && out.card < 0 && !out.backend) eld = std::nullopt;  // "auto": card unknown, trust toggles

  const Decision d = decide(t, user, eld, backend);
  // Sound-server output: make sure the sink accepts the bitstream before mpv opens it (3.4).
  if (!d.spdif.isEmpty() && (backend == Backend::PipeWire || backend == Backend::PulseAudio)) {
    const QString sink = sinkFromDevice(device);
    const FormatChange fc = ensureSinkFormats(sink.isEmpty() ? QStringLiteral("@DEFAULT_SINK@") : sink, d.spdif.split(','));
    if (!fc.ok) qWarning().noquote() << "Icefin audio: passthrough may fail:" << fc.error << "- Client Settings -> Audio test offers a WirePlumber rule";
  }
  mpv->setProperty("audio-spdif", d.spdif);
  refreshBitstream(mpv, d.mode != Decision::Pcm, d.mode != Decision::Pcm ? "passthrough " + d.spdif : d.reason);
  qInfo().noquote() << "Icefin audio:" << codec << t.profile << t.channels << "ch on" << device
                    << "->" << (d.mode == Decision::Pcm ? QString("PCM %1ch").arg(d.pcmChannels) : d.spdif)
                    << "(" + d.reason + ")" << (eld ? "ELD: " + eld->summary() : QString("no ELD"));
}
}
