#include "Hwdec.h"
#include <QMap>
#include <QtGlobal>
#include <QQuickWindow>
#include <QSGRendererInterface>

namespace Icefin::Gpu
{
QString hwdecFor(const QString& setting)
{
  static const QMap<QString, QString> map{
    {"auto", "auto-safe"}, {"vaapi", "vaapi"}, {"nvdec", "nvdec"}, {"vulkan", "vulkan"},
    {"copy", "auto-copy-safe"}, {"off", "no"},
    // upstream's values, from settings saved before Icefin 0.2
    {"enabled", "auto-safe"}, {"osx_compat", "auto-safe"}, {"disabled", "no"},
  };
  return map.value(setting, "auto-safe");
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

void applyGlEnv()
{
  if (!qEnvironmentVariableIsSet("QT_XCB_GL_INTEGRATION")) qputenv("QT_XCB_GL_INTEGRATION", "xcb_egl");
}
}
