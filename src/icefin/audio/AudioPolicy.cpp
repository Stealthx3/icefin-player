#include "AudioPolicy.h"
#include "icefin/capability/CapabilityModel.h"
#include "AudioOutput.h"
#include "Eld.h"
#include "Passthrough.h"
#include "DeviceReservation.h"
#include "AudioState.h"
#include "Iec958Formats.h"
#include <memory>
#include <MpvController>
#include <QDebug>
#include <QElapsedTimer>
#include <QStandardPaths>
#include <QTimer>
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

// While a track plays as PCM because the receiver wasn't ready (Standby::Wake), watch its ELD; once it has been ready
// for kWakeDelayMs, decide again for the playing track, which reopens the audio with the bitstream (PLAN 3.9).
class WakeWatch : public QObject
{
public:
  WakeWatch() { m_timer.setInterval(500); connect(&m_timer, &QTimer::timeout, this, &WakeWatch::tick); }
  void arm(MpvController* mpv, const QStringList& codecs, bool hdmi, const Output& out)
  {
    m_mpv = mpv; m_codecs = codecs; m_hdmi = hdmi; m_out = out;
    m_path = mpv->getProperty("path").toString();
    m_gate.reset();
    m_clock.start();
    m_timer.start();
  }
  void disarm() { m_timer.stop(); }

private:
  void tick()
  {
    if (!m_mpv || m_mpv->getProperty("idle-active").toBool() || m_mpv->getProperty("path").toString() != m_path) { disarm(); return; }
    const auto e = readEld(m_out.card, m_out.hdmiIndex);
    const bool ready = e && e->valid;
    const bool wasWaiting = m_gate.waiting();
    if (m_gate.update(ready, m_clock.elapsed())) {
      disarm();
      qInfo().noquote() << "Icefin audio: receiver ready for" << kWakeDelayMs / 1000.0 << "s - deciding again for the playing track";
      const QString before = m_mpv->getProperty("audio-spdif").toString();
      applyForCurrentTrack(m_mpv, m_codecs, m_hdmi);
      if (m_mpv->getProperty("audio-spdif").toString() != before) {
        // mpv picks the spdif wrapper or a decoder when the audio decoder starts, so a new audio-spdif alone changes
        // nothing mid-track (seen in the Virtual AV tier): restart the decoder on the same track.
        const QVariant aid = m_mpv->getProperty("aid");
        m_mpv->setProperty("aid", "no");
        m_mpv->setProperty("aid", aid);
        qInfo().noquote() << "Icefin audio: audio restarted on track" << aid.toString() << "with" << m_mpv->getProperty("audio-spdif").toString();
      }
      return;
    }
    if (ready && !wasWaiting)
      qInfo().noquote() << "Icefin audio: receiver woke (" + e->monitorName + ") - bitstream in" << kWakeDelayMs / 1000.0 << "s if it stays ready";
    else if (!ready && wasWaiting)
      qInfo().noquote() << "Icefin audio: receiver not ready again - waiting for it";
  }

  QTimer m_timer;
  QElapsedTimer m_clock;
  WakeGate m_gate;
  MpvController* m_mpv = nullptr;
  QStringList m_codecs;
  bool m_hdmi = false;
  Output m_out;
  QString m_path;
};
static WakeWatch& wakeWatch() { static WakeWatch* w = new WakeWatch; return *w; }

QVariantMap selectedAudioTrack(const QVariant& aid, const QVariantMap& current, const QVariantList& trackList)
{
  if (!current.value("codec").toString().isEmpty()) return current;
  // In on_preloaded the aid upstream has just set (reselectStream) isn't in current-tracks yet (found in the Virtual AV
  // tier, PLAN 3.9): take the track from track-list by that id, or the selected / first audio track for "auto".
  const QString a = aid.toString();
  if (a == "no" || a == "false") return {};
  bool numeric = false;
  const int id = a.toInt(&numeric);
  QVariantMap first;
  for (const QVariant& v : trackList) {
    const QVariantMap t = v.toMap();
    if (t.value("type").toString() != "audio") continue;
    if (numeric) { if (t.value("id").toInt() == id) return t; continue; }
    if (t.value("selected").toBool()) return t;
    if (first.isEmpty()) first = t;
  }
  return numeric ? QVariantMap() : first;
}

void applyForCurrentTrack(MpvController* mpv, const QStringList& passthroughCodecs, bool hdmiDevice)
{
  wakeWatch().disarm();  // a new track (or the watch's own call) decides afresh
  {
    const Output o = parseDevice(mpv->getProperty("audio-device").toString());
    const auto chosen = backendForSetting(SettingsComponent::Get().value(SETTINGS_SECTION_AUDIO, "backend").toString());
    reserveFor(o, o.backend ? *o.backend : chosen.value_or(Backend::PipeWire));  // reservation is independent of passthrough
  }
  const QVariantMap track = selectedAudioTrack(mpv->getProperty("aid"), mpv->getProperty("current-tracks/audio").toMap(),
                                              mpv->getProperty("track-list").toList());
  const QString codec = track.value("codec").toString();
  if (codec.isEmpty() || passthroughCodecs.isEmpty()) {  // no audio, or passthrough off: upstream behaviour
    refreshBitstream(mpv, false, codec.isEmpty() ? "no audio track" : "passthrough off");
    return;
  }
  Track t{codec, track.value("codec-profile").toString(), track.value("demux-channel-count").toInt()};
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

  const Standby standby = standbyForSetting(SettingsComponent::Get().value(SETTINGS_SECTION_AUDIO, "icefin_standby").toString());
  const Decision d = decide(t, user, eld, backend, standby);
  // The capability model (6.7) keeps the sink this decision saw: what the receiver takes.
  QStringList eldCodecs;
  if (eld) for (auto it = eld->codecs.begin(); it != eld->codecs.end(); ++it) eldCodecs << codecName(it.key());
  Capability::CapabilityModel::instance().setSink({{"device", device}, {"hdmi", hdmiDevice}, {"present", eld && eld->present},
                                                   {"valid", eld && eld->valid}, {"stale", eld && eld->stale},
                                                   {"name", eld ? eld->monitorName : QString()},
                                                   {"lpcmChannels", eld ? eld->lpcmChannels : 0}, {"codecs", eldCodecs}});
  // Sound-server output: make sure the sink accepts the bitstream before mpv opens it (3.4).
  if (!d.spdif.isEmpty() && (backend == Backend::PipeWire || backend == Backend::PulseAudio)) {
    const QString sink = sinkFromDevice(device);
    const FormatChange fc = ensureSinkFormats(sink.isEmpty() ? QStringLiteral("@DEFAULT_SINK@") : sink, d.spdif.split(','));
    if (!fc.ok) qWarning().noquote() << "Icefin audio: passthrough may fail:" << fc.error << "- Client Settings -> Audio test offers a WirePlumber rule";
  }
  // Only on a change: setting audio-spdif reopens the audio output (that is how the wake switch takes effect).
  if (mpv->getProperty("audio-spdif").toString() != d.spdif) mpv->setProperty("audio-spdif", d.spdif);
  if (d.waitForReceiver) wakeWatch().arm(mpv, passthroughCodecs, hdmiDevice, out);
  refreshBitstream(mpv, d.mode != Decision::Pcm, d.mode != Decision::Pcm ? "passthrough " + d.spdif : d.reason);
  qInfo().noquote() << "Icefin audio:" << codec << t.profile << t.channels << "ch on" << device
                    << "->" << (d.mode == Decision::Pcm ? QString("PCM %1ch").arg(d.pcmChannels) : d.spdif)
                    << "(" + d.reason + ")" << (eld ? "ELD: " + eld->summary() : QString("no ELD"));
}
}
