#include "HardwareComponent.h"
#include <QClipboard>
#include <QDateTime>
#include <QDebug>
#include <QDir>
#include <QGuiApplication>
#include <QScreen>
#include <QStandardPaths>
#include <QSysInfo>
#include <QWindow>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QThread>
#include <QTimer>
#include "Branding.h"
#include "Version.h"
#include "icefin/audio/AudioState.h"
#include "icefin/capability/CapabilityModel.h"
#include "icefin/diag/Report.h"
#include "icefin/log/Recent.h"
#include "player/PlayerComponent.h"
#include "settings/SettingsComponent.h"
#include "WebGpuStatus.h"

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
  m["web"] = m_web;
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

void HardwareComponent::checkWeb()
{
  auto* w = new WebGpuStatus(this);
  connect(w, &WebGpuStatus::done, this, [this, w](const QVariantMap& status) {
    m_web = status;
    qInfo().noquote() << "Icefin hardware: web layer" << (status.value("accelerated").toBool() ? "GPU-accelerated" : "not GPU-accelerated")
                      << "- rasterization:" << status.value("features").toMap().value("Rasterization").toString()
                      << "- compositing:" << status.value("features").toMap().value("Compositing").toString();
    emit webStatusReady(status);
    w->deleteLater();
  });
  w->check();
}

// The Flatpak runtime from /.flatpak-info ("runtime=runtime/org.kde.Platform/x86_64/6.10"), empty outside one.
static QString flatpakRuntime()
{
  QFile f("/.flatpak-info");
  if (!f.open(QIODevice::ReadOnly)) return {};
  for (const QByteArray& line : f.readAll().split('\n'))
    if (line.startsWith("runtime=")) return QString::fromUtf8(line.mid(8)).remove("runtime/");
  return QStringLiteral("(runtime unknown)");
}

QString HardwareComponent::report() const
{
  Diag::ReportInputs in;
  in.generated = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
  const QString runtime = flatpakRuntime();
  in.app = {{"version", QString::fromLatin1(Icefin::Version)}, {"base", QString::fromLatin1(Icefin::UpstreamVersion)},
            {"web", ::Version::GetWebVersion()}, {"build", ::Version::GetBuildDate()},
            {"flatpak", !runtime.isEmpty()}, {"runtime", runtime}};
  QString session = qEnvironmentVariable("XDG_SESSION_TYPE");
  if (session.isEmpty()) session = qEnvironmentVariableIsSet("WAYLAND_DISPLAY") ? "wayland" : qEnvironmentVariableIsSet("DISPLAY") ? "x11" : "";
  in.system = {{"os", QSysInfo::prettyProductName()}, {"kernel", QSysInfo::kernelVersion()}, {"arch", QSysInfo::currentCpuArchitecture()},
               {"platform", QGuiApplication::platformName()}, {"session", session}, {"desktop", qEnvironmentVariable("XDG_CURRENT_DESKTOP")},
               {"gamescope", qEnvironmentVariableIsSet("GAMESCOPE_WAYLAND_DISPLAY") || qEnvironmentVariable("SteamGamepadUI") == "1"}};
  QScreen* windowScreen = nullptr;
  for (QWindow* w : QGuiApplication::topLevelWindows())
    if (w->isVisible() && w->screen()) { windowScreen = w->screen(); break; }
  for (QScreen* s : QGuiApplication::screens())
    in.screens << QVariantMap{{"name", s->name()}, {"size", QString("%1x%2").arg(s->size().width()).arg(s->size().height())},
                              {"refresh", QString::number(s->refreshRate(), 'f', 2)}, {"dpr", s->devicePixelRatio()},
                              {"primary", s == QGuiApplication::primaryScreen()}, {"window", s == windowScreen}};
  in.capabilities = Capability::CapabilityModel::instance().current();
  in.web = m_web;
  auto& settings = SettingsComponent::Get();
  const QVariantMap audioSettings = settings.allValues(SETTINGS_SECTION_AUDIO).toMap();
  QStringList passthrough;
  for (auto it = audioSettings.cbegin(); it != audioSettings.cend(); ++it)
    if (it.key().startsWith("passthrough.") && it.value().toBool()) passthrough << it.key().mid(12);
  in.audio = {{"backend", audioSettings.value("backend", "auto")}, {"device", audioSettings.value("device")},
              {"deviceType", audioSettings.value("devicetype")}, {"channels", audioSettings.value("channels")},
              {"exclusive", audioSettings.value("exclusive")}, {"passthrough", passthrough},
              {"bitstream", Audio::state().bitstream()}, {"receiverVolumeOverCec", Audio::state().hasReceiverVolume()}};
  const QVariantMap all = settings.allValues().toMap();
  for (const QString& section : Diag::reportSections())
    if (all.contains(section)) in.settings[section] = all.value(section);
  in.nowPlaying = PlayerComponent::Get().videoInformation();
  in.recentLog = Icefin::Log::recentLines();
  in.home = QStandardPaths::writableLocation(QStandardPaths::HomeLocation);
  in.hostName = QSysInfo::machineHostName();
  return Diag::build(in);
}

QString HardwareComponent::copyReport() const
{
  const QString text = report();
  if (QClipboard* c = QGuiApplication::clipboard()) c->setText(text);
  qInfo().noquote() << "Icefin hardware: diagnostics report copied (" << text.size() << "characters)";
  return text;
}
}
