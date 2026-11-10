#include "Hwdec.h"
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QMap>
#include <QQuickWindow>
#include <QSGRendererInterface>

namespace Icefin::Gpu
{
static int s_loading = 0;
HwdecLoadScope::HwdecLoadScope() { ++s_loading; }
HwdecLoadScope::~HwdecLoadScope() { --s_loading; }

bool deferHwdecChange(bool playing, const QString& current, const QString& next)
{
  static QString logged;  // settings changes arrive more than once: log each pending change once
  if (s_loading > 0 || !playing || current == next) { logged.clear(); return false; }
  if (logged != current + ">" + next)
    qInfo().noquote() << "Icefin hwdec: decoder change" << current << "->" << next << "applies to the next video (not switched mid-playback)";
  logged = current + ">" + next;
  return true;
}

bool hasNvidiaGpu(const QString& sysRoot)
{
  for (const QString& card : QDir(sysRoot + "/class/drm").entryList({"card[0-9]", "card[0-9][0-9]"}, QDir::Dirs | QDir::System)) {
    QFile f(sysRoot + "/class/drm/" + card + "/device/vendor");
    if (f.open(QIODevice::ReadOnly) && f.readAll().trimmed() == "0x10de") return true;
  }
  return false;
}

QString hwdecFor(const QString& setting)
{
  static const bool nvidia = hasNvidiaGpu();
  const bool openGl = QQuickWindow::graphicsApi() != QSGRendererInterface::Vulkan;
  const QString v = hwdecFor(setting, nvidia && openGl);
  if (nvidia && openGl && v == "auto-copy-safe" && setting != "copy")
    qInfo() << "Icefin hwdec: Auto uses copy mode on NVIDIA with the OpenGL renderer (zero-copy shows a blank picture there)";
  return v;
}

QString hwdecFor(const QString& setting, bool nvidiaOnOpenGl)
{
  static const QMap<QString, QString> map{
    {"auto", "auto-safe"}, {"vaapi", "vaapi"}, {"nvdec", "nvdec"}, {"vulkan", "vulkan"},
    {"copy", "auto-copy-safe"}, {"off", "no"},
    // upstream's values, from settings saved before Icefin 0.2
    {"enabled", "auto-safe"}, {"osx_compat", "auto-safe"}, {"disabled", "no"},
  };
  const QString v = map.value(setting, "auto-safe");
  return (nvidiaOnOpenGl && v == "auto-safe") ? QString("auto-copy-safe") : v;
}

QString migratedSetting(const QString& setting)
{
  if (setting == "enabled" || setting == "osx_compat") return "auto";
  if (setting == "disabled") return "off";
  return QString();
}

QString rendererName()
{
  switch (QQuickWindow::graphicsApi()) {
    case QSGRendererInterface::Vulkan: return "Vulkan";
    case QSGRendererInterface::OpenGL: return "OpenGL (fallback)";
    case QSGRendererInterface::Software: return "Software";
    default: return "other";
  }
}
}
