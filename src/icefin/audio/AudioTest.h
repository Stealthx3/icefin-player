// Icefin: the audio test page's native side, "audiotest" on the QWebChannel (PLAN 3.8, SPEC "Sync and testing").
// Plays a bundled two-second clip per format through the user's current audio settings (backend, device, passthrough
// toggles and the receiver's ELD, decided exactly as playback decides: Passthrough.h) in a separate headless mpv,
// and reports what mpv actually sent: bitstream (spdif-*) or PCM with its channel count. The page shows that beside
// what the receiver should display; on the HTPC the user confirms the receiver's display (deferred step, 10 AM).
#pragma once
#include "core/ComponentManager.h"
#include <QVariantList>
#include <QVariantMap>

namespace Icefin::Audio
{
class AudioTestComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(AudioTestComponent);
public:
  bool componentInitialize() override { return true; }
  const char* componentName() override { return "audiotest"; }
  bool componentExport() override { return true; }

  // [{id, label, codec, channels, receiverShows}]
  Q_INVOKABLE QVariantList formats() const;
  // Plays one clip; result() follows with
  // {id, ok, error, decision{mode, spdif, reason}, output{format, channels, ao, device}}.
  Q_INVOKABLE void play(const QString& id);
Q_SIGNALS:
  void result(const QVariantMap& r);
private:
  AudioTestComponent() = default;
};
}
