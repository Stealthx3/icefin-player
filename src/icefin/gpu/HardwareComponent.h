// Icefin: "hardware" on the QWebChannel (PLAN 4.1). Runs the decoder self-test in the background and keeps the result.
#pragma once
#include "core/ComponentManager.h"
#include "DecoderSelfTest.h"
#include <QVariantMap>

namespace Icefin::Gpu
{
class HardwareComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(HardwareComponent);

public:
  bool componentInitialize() override;
  void componentPostInitialize() override;
  const char* componentName() override { return "hardware"; }
  bool componentExport() override { return true; }

  // {fingerprint, time, running, samples[{codec, file, ok, hwdec, speed, hardware, realtime, error}], transcode[]}
  Q_INVOKABLE QVariantMap results() const;
  // Start the self-test now (no-op while one runs); finished() follows.
  Q_INVOKABLE void run();
  // Codecs the server should transcode on this machine (6.4's Auto device profile).
  QStringList transcodeCodecs() const;

Q_SIGNALS:
  void finished(const QVariantMap& results);

private:
  HardwareComponent() = default;
  bool m_running = false;
};
}
