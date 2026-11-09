#include "DecoderSelfTest.h"
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QSysInfo>
#include <mpv/client.h>

namespace Icefin::Gpu
{
QJsonObject SampleResult::toJson() const
{
  return {{"codec", codec}, {"file", file}, {"ok", ok}, {"hwdec", hwdec}, {"speed", speed}, {"error", error},
          {"hardware", hardware()}, {"realtime", realtime()}};
}

SampleResult testSample(const QString& codec, const QString& mediaPath, const QString& hwdec)
{
  SampleResult r;
  r.codec = codec;
  r.file = QFileInfo(mediaPath).fileName();
  mpv_handle* h = mpv_create();
  if (!h) { r.error = "mpv_create failed"; return r; }
  for (auto [k, v] : std::initializer_list<std::pair<const char*, const char*>>{
         {"vo", "null"}, {"ao", "null"}, {"audio", "no"}, {"untimed", "yes"}, {"terminal", "no"},
         {"config", "no"}, {"idle", "yes"}, {"hwdec-codecs", "all"}, {"msg-level", "all=no"}})
    mpv_set_option_string(h, k, v);
  mpv_set_option_string(h, "hwdec", hwdec.toUtf8().constData());
  if (mpv_initialize(h) < 0) { r.error = "mpv_initialize failed"; mpv_terminate_destroy(h); return r; }
  mpv_observe_property(h, 1, "hwdec-current", MPV_FORMAT_STRING);
  const QByteArray path = mediaPath.toUtf8();
  const char* cmd[] = {"loadfile", path.constData(), nullptr};
  mpv_command(h, cmd);
  QElapsedTimer t;
  bool started = false;
  double duration = 0;
  for (QElapsedTimer guard; !guard.isValid() || guard.elapsed() < 30000;) {
    if (!guard.isValid()) guard.start();
    mpv_event* e = mpv_wait_event(h, 1.0);
    if (e->event_id == MPV_EVENT_NONE) continue;
    if (e->event_id == MPV_EVENT_FILE_LOADED) {
      started = true;
      t.start();
      mpv_get_property(h, "duration", MPV_FORMAT_DOUBLE, &duration);
    } else if (e->event_id == MPV_EVENT_PROPERTY_CHANGE) {
      auto* p = static_cast<mpv_event_property*>(e->data);
      if (p->format == MPV_FORMAT_STRING && p->data) {
        const QString v = QString::fromUtf8(*static_cast<char**>(p->data));
        if (!v.isEmpty() && v != "no") r.hwdec = v;
      }
    } else if (e->event_id == MPV_EVENT_END_FILE) {
      auto* ef = static_cast<mpv_event_end_file*>(e->data);
      if (ef->reason == MPV_END_FILE_REASON_EOF && started) {
        r.ok = true;
        const double secs = qMax(1, int(t.elapsed())) / 1000.0;
        r.speed = (duration > 0 ? duration : 2.0) / secs;
      } else {
        r.error = ef->reason == MPV_END_FILE_REASON_ERROR ? QString("decode error: %1").arg(mpv_error_string(ef->error)) : "stopped";
      }
      break;
    } else if (e->event_id == MPV_EVENT_SHUTDOWN) {
      r.error = "mpv shut down";
      break;
    }
  }
  if (!r.ok && r.error.isEmpty()) r.error = "timed out";
  mpv_terminate_destroy(h);
  return r;
}

QString fingerprint(const QString& sysRoot)
{
  QStringList parts;
  for (const QString& card : QDir(sysRoot + "/class/drm").entryList({"card[0-9]", "card[0-9][0-9]"}, QDir::Dirs | QDir::System)) {
    auto read = [&](const char* f) {
      QFile file(sysRoot + "/class/drm/" + card + "/device/" + f);
      return file.open(QIODevice::ReadOnly) ? QString::fromUtf8(file.readAll()).trimmed() : QString();
    };
    const QString id = read("vendor") + ":" + read("device");
    if (id != ":") parts << id;
  }
  parts.sort();
  parts << "kernel " + QSysInfo::kernelVersion();
  const unsigned long v = mpv_client_api_version();
  parts << QString("mpv-api %1.%2").arg(v >> 16).arg(v & 0xffff);
  return parts.join(", ");
}

QStringList transcodeCodecs(const QList<SampleResult>& results)
{
  QStringList out;
  for (const SampleResult& r : results) if (!r.hardware() && !r.realtime()) out << r.codec;
  return out;
}
}
