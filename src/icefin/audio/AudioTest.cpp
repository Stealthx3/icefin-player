#include "AudioTest.h"
#include "AudioOutput.h"
#include "Eld.h"
#include "Passthrough.h"
#include <QDebug>
#include <QFile>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QThread>
#include <mpv/client.h>
#include "settings/SettingsComponent.h"
#include "settings/SettingsSection.h"

namespace Icefin::Audio
{
struct Clip { QString id, file, label, codec; int channels; QString receiver; };
static const QList<Clip> kClips{
  {"ac3", "ac3.mka", "Dolby Digital (AC-3) 5.1", "ac3", 6, "Dolby Digital"},
  {"eac3", "eac3.mka", "Dolby Digital Plus (E-AC-3) 5.1", "eac3", 6, "Dolby Digital Plus"},
  {"dts", "dts.mka", "DTS 5.1", "dts", 6, "DTS"},
  {"truehd", "truehd.mka", "Dolby TrueHD 5.1", "truehd", 6, "Dolby TrueHD"},
  {"lpcm71", "lpcm71.mka", "PCM 7.1", "flac", 8, "Multichannel PCM (7.1)"},
};

QVariantList AudioTestComponent::formats() const
{
  QVariantList out;
  for (const Clip& c : kClips)
    out << QVariantMap{{"id", c.id}, {"label", c.label}, {"codec", c.codec}, {"channels", c.channels}, {"receiverShows", c.receiver}};
  return out;
}

static QString mpvString(mpv_handle* h, const char* prop)
{
  char* v = mpv_get_property_string(h, prop);
  const QString s = v ? QString::fromUtf8(v) : QString();
  if (v) mpv_free(v);
  return s;
}

void AudioTestComponent::play(const QString& id)
{
  auto it = std::find_if(kClips.begin(), kClips.end(), [&](const Clip& c) { return c.id == id; });
  if (it == kClips.end()) { emit result({{"id", id}, {"ok", false}, {"error", "unknown format"}}); return; }
  const Clip clip = *it;

  // The same inputs playback uses (main thread): backend, device, passthrough toggles, ELD.
  SettingsSection* audio = SettingsComponent::Get().getSection(SETTINGS_SECTION_AUDIO);
  const QString backendSetting = audio->value("backend").toString();
  const QString device = audio->value("device").toString();
  const QString type = audio->value("devicetype").toString();
  QSet<Codec> user;
  if (type != "basic") {
    static const QMap<QString, Codec> names{{"ac3", Codec::AC3}, {"eac3", Codec::EAC3}, {"dts", Codec::DTS}, {"dts-hd", Codec::DTSHD}, {"truehd", Codec::TrueHD}};
    for (auto n = names.begin(); n != names.end(); ++n)
      if (audio->value("passthrough." + n.key()).toBool()) user << n.value();
    if (user.contains(Codec::DTSHD)) user << Codec::DTS;
  }
  const Output out = parseDevice(device);
  const auto chosen = backendForSetting(backendSetting);
  const Backend backend = out.backend ? *out.backend : chosen ? *chosen : autoBackend(QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation));
  std::optional<Eld> eld;
  if (type == "hdmi" && out.card >= 0) eld = readEld(out.card, out.hdmiIndex);
  const Decision d = decide({clip.codec, QString(), clip.channels}, user, eld, backend);
  const QString ao = aoForSetting(backendSetting);

  QThread* worker = QThread::create([this, clip, d, ao, device] {
    QVariantMap r{{"id", clip.id}, {"decision", QVariantMap{{"mode", d.mode == Decision::Pcm ? "pcm" : "passthrough"}, {"spdif", d.spdif}, {"reason", d.reason}}}};
    QTemporaryDir tmp;
    const QString path = tmp.path() + "/" + clip.file;
    if (!QFile::copy(":/icefin/audiotest/" + clip.file, path)) {
      r["ok"] = false; r["error"] = "clip missing";
    } else {
      mpv_handle* h = mpv_create();
      for (auto [k, v] : std::initializer_list<std::pair<const char*, QByteArray>>{
             {"video", "no"}, {"terminal", "no"}, {"config", "no"}, {"idle", "yes"}, {"msg-level", "all=no"},
             {"ao", ao.toUtf8()}, {"audio-device", device.toUtf8()}, {"audio-spdif", d.spdif.toUtf8()},
             {"audio-fallback-to-null", "yes"}})
        mpv_set_option_string(h, k, v.constData());
      if (mpv_initialize(h) < 0) { r["ok"] = false; r["error"] = "mpv_initialize failed"; }
      else {
        const QByteArray p = path.toUtf8();
        const char* cmd[] = {"loadfile", p.constData(), nullptr};
        mpv_command(h, cmd);
        QVariantMap output;
        bool ok = false;
        for (int i = 0; i < 100; ++i) {
          mpv_event* e = mpv_wait_event(h, 0.2);
          if (e->event_id == MPV_EVENT_PLAYBACK_RESTART || (e->event_id == MPV_EVENT_NONE && output.isEmpty() && !mpvString(h, "audio-out-params/format").isEmpty())) {
            output = {{"format", mpvString(h, "audio-out-params/format")}, {"channels", mpvString(h, "audio-out-params/channel-count")},
                      {"ao", mpvString(h, "current-ao")}, {"device", mpvString(h, "audio-device")}, {"codec", mpvString(h, "audio-codec-name")}};
          }
          if (e->event_id == MPV_EVENT_END_FILE) {
            ok = static_cast<mpv_event_end_file*>(e->data)->reason == MPV_END_FILE_REASON_EOF;
            break;
          }
        }
        r["ok"] = ok && !output.isEmpty();
        if (!r["ok"].toBool())
          r["error"] = !output.isEmpty() ? QString("playback did not finish")
                     : d.spdif.isEmpty() ? QString("no audio output opened")
                     : QString("the audio output didn't accept the %1 bitstream: check the device type, the device and the receiver").arg(d.spdif);
        r["output"] = output;
      }
      mpv_terminate_destroy(h);
    }
    QMetaObject::invokeMethod(this, [this, r] {
      const QVariantMap o = r.value("output").toMap();
      qInfo().noquote() << "Icefin audio test:" << r.value("id").toString() << "->" << o.value("format").toString()
                        << o.value("channels").toString() << "ch on" << o.value("ao").toString() << (r.value("ok").toBool() ? "" : "(" + r.value("error").toString() + ")");
      emit result(r);
    });
  });
  connect(worker, &QThread::finished, worker, &QObject::deleteLater);
  worker->start();
}
}
