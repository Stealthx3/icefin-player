#include "HardwareComponent.h"
#include <QDateTime>
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QThread>
#include <QTimer>
#include "settings/SettingsComponent.h"

namespace Icefin::Gpu
{
static const char* kStateKey = "icefin_hw_selftest";
static const QList<QPair<QString, QString>> kSamples{
  {"h264", "h264.mp4"}, {"hevc", "hevc10.mp4"}, {"av1", "av1.mp4"}, {"vp9", "vp9.webm"}};

static QJsonObject stored()
{
  return QJsonDocument::fromJson(SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kStateKey).toString().toUtf8()).object();
}

bool HardwareComponent::componentInitialize() { return true; }

void HardwareComponent::componentPostInitialize()
{
  const QString now = fingerprint();
  if (stored().value("fingerprint").toString() == now) return;
  qInfo().noquote() << "Icefin hardware: self-test due (" << (stored().isEmpty() ? QString("first run") : "changed: " + now) << ")";
  QTimer::singleShot(15000, this, &HardwareComponent::run);  // after startup settles
}

QVariantMap HardwareComponent::results() const
{
  QVariantMap m = stored().toVariantMap();
  m["running"] = m_running;
  return m;
}

QStringList HardwareComponent::transcodeCodecs() const
{
  QStringList out;
  for (const QJsonValue& v : stored().value("transcode").toArray()) out << v.toString();
  return out;
}

void HardwareComponent::run()
{
  if (m_running) return;
  m_running = true;
  QThread* worker = QThread::create([this] {
    QTemporaryDir tmp;
    QList<SampleResult> results;
    for (const auto& [codec, file] : kSamples) {
      const QString local = tmp.path() + "/" + file;  // mpv can't read Qt resources
      if (!QFile::copy(":/icefin/testmedia/" + file, local)) { SampleResult r; r.codec = codec; r.file = file; r.error = "sample missing"; results << r; continue; }
      results << testSample(codec, local);
    }
    QJsonArray samples;
    QJsonArray transcode;
    for (const SampleResult& r : results) samples << r.toJson();
    for (const QString& c : Gpu::transcodeCodecs(results)) transcode << c;
    const QJsonObject out{{"fingerprint", fingerprint()}, {"time", QDateTime::currentDateTimeUtc().toString(Qt::ISODate)},
                          {"samples", samples}, {"transcode", transcode}};
    QMetaObject::invokeMethod(this, [this, out] {
      SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kStateKey, QString::fromUtf8(QJsonDocument(out).toJson(QJsonDocument::Compact)));
      m_running = false;
      QStringList summary;
      for (const QJsonValue& v : out.value("samples").toArray()) {
        const QJsonObject s = v.toObject();
        summary << QString("%1 %2 %3x").arg(s.value("codec").toString(), s.value("hardware").toBool() ? s.value("hwdec").toString() : QString("software"))
                                       .arg(s.value("speed").toDouble(), 0, 'f', 1);
      }
      qInfo().noquote() << "Icefin hardware: self-test done:" << summary.join("; ");
      emit finished(this->results());
    });
  });
  connect(worker, &QThread::finished, worker, &QObject::deleteLater);
  worker->start();
}
}
