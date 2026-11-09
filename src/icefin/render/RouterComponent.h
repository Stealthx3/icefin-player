// Icefin: the capability prompt's native side, "router" on the QWebChannel (PLAN 6.3, SPEC "Capability prompt").
//
// PlayerComponent::queueMedia asks hold() before loading (ICEFIN-HOOK). When the PlaybackRouter says the active path
// can't show the source correctly, hold() keeps the load, and promptRequested() asks the page
// (native/icefin/capabilityPrompt.js). The page answers with resolve():
//  - play / playBaseLayer: the held load continues;
//  - cancel: the player ends without loading;
//  - transcodeHdr10 / transcodeSdr: the player ends and the page restarts playback with a device profile that makes the
//    server convert the video.
// "Remember on this device" keeps the choice per profile (state.icefin_prompt_memory) for that kind of source on that
// renderer; forgetChoices() resets it (Client Settings -> Hardware).
#pragma once
#include "core/ComponentManager.h"
#include "PlaybackRouter.h"
#include <functional>
#include <QVariantMap>

namespace Icefin::Render
{
class RouterComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(RouterComponent);

public:
  bool componentInitialize() override { return true; }
  const char* componentName() override { return "router"; }
  bool componentExport() override { return true; }

  // From PlayerComponent::queueMedia. True: hold the load (the prompt is up); proceed() or end() follows later.
  bool hold(const QVariantMap& loadMetadata, std::function<void()> proceed, std::function<void()> end);

  Q_INVOKABLE void resolve(const QString& choice, bool remember);
  Q_INVOKABLE QVariantMap rememberedChoices() const;
  Q_INVOKABLE void forgetChoices();
  // Diagnostics/tests: the decision for a VideoRangeType on this system, without loading anything.
  Q_INVOKABLE QVariantMap decide(const QString& videoRangeType) const;
  // The display state the router uses (6.1): {hdr: yes/no/unknown, transfer, primaries, maxLuminance, source, error}.
  Q_INVOKABLE QVariantMap display() const;
  void componentPostInitialize() override;

Q_SIGNALS:
  // {key, range, reason, options[{id, label}], remembered, itemId, serverId, startMs}
  void promptRequested(const QVariantMap& info);
  void displayChanged(const QVariantMap& info);

private:
  RouterComponent() = default;
  System system() const;
  QString m_bypassKey;  // one load that the user already answered for
  QString m_pendingKey;
  std::function<void()> m_proceed, m_end;
};

QString optionId(Option o);
}
