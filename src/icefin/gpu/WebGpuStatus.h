// Icefin: is the web layer GPU-accelerated? (PLAN 4.3, SPEC "UI rendering")
// Loads chrome://gpu in a hidden page on the app's web profile and reads Chromium's "Graphics Feature Status".
// Also: the QTWEBENGINE_FORCE_USE_GBM=0 switch for drivers where Chromium's GBM path crashes (main.icefin_webengine_gbm).
#pragma once
#include <QMap>
#include <QObject>
#include <QStringList>
#include <QVariantMap>

namespace Icefin::Gpu
{
// "*   Rasterization: Hardware accelerated" lines -> {"Rasterization": "Hardware accelerated", ...}
QMap<QString, QString> parseFeatureStatus(const QStringList& lines);
// Hardware compositing and rasterization both on.
bool webAccelerated(const QMap<QString, QString>& features);

// Before WebEngine starts (ICEFIN-HOOK in main.cpp): apply the GBM switch from the saved settings.
void applyWebEngineEnv();

class WebGpuStatus : public QObject
{
  Q_OBJECT
public:
  using QObject::QObject;
  // Asynchronous; emits done() with {accelerated, features{...}, gbm (the user's switch), gbmEnv, error}.
  void check();
Q_SIGNALS:
  void done(const QVariantMap& status);
};
}
