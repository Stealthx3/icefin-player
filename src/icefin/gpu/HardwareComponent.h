// Icefin: "hardware" on the QWebChannel (PLAN 4.1). Runs the decoder self-test in the background and keeps the result.
#pragma once
#include "core/ComponentManager.h"
#include "DecoderSelfTest.h"
#include <QVariantMap>

class MpvController;

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
  // Is the web layer GPU-accelerated (4.3)? Asynchronous: webStatusReady() follows; also kept in results().web.
  Q_INVOKABLE void checkWeb();
  // The diagnostics report (PLAN 11.4, src/icefin/diag/Report.h): redacted Markdown text for a bug report.
  Q_INVOKABLE QString report() const;
  // report() onto the clipboard; returns the text too, so the page can show it where the clipboard doesn't reach.
  Q_INVOKABLE QString copyReport() const;
  // Playback counters from mpv (PLAN 11.5 option P, the performance budget; also for testers): dropped and delayed
  // frames, the decoder's drops, the video's and the measured frame rate, the decoder in use. Empty when idle.
  Q_INVOKABLE QVariantMap playbackStats() const;
  // The player's mpv controller, set once by PlayerComponent::initializeMpv (ICEFIN-HOOK).
  static void setPlayer(MpvController* mpv);
  // Frame timing of the window (PLAN 11.5 option P): from startFrameStats() until frameStats(), each frame Qt Quick
  // draws, its cost (scene-graph sync to swap, on the render thread) and the interval since the one before. Qt draws
  // on demand, so an idle screen draws few frames; animations and video draw every vsync.
  Q_INVOKABLE void startFrameStats();
  // {frames, seconds, fps, cost_p50_ms, cost_p95_ms, cost_max_ms, interval_p95_ms, jank_pct}; stops recording.
  Q_INVOKABLE QVariantMap frameStats();
  // The summary above from raw samples (ms), separate so it can be unit-tested.
  static QVariantMap summarizeFrames(const QList<double>& costs, const QList<double>& intervals, double seconds);

Q_SIGNALS:
  void finished(const QVariantMap& results);
  void webStatusReady(const QVariantMap& status);

private:
  HardwareComponent() = default;
  bool m_running = false;
  QVariantMap m_web;
  QList<QMetaObject::Connection> m_frameHooks;
};
}
