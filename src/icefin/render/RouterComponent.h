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
// This system as the router sees it now: renderer, display (HdrCapabilityProbe), server transcode. Shared by the
// router and PlayerComponent's routing log, so the two can't disagree.
System currentSystem();

class RouterComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(RouterComponent);

public:
  bool componentInitialize() override;
  const char* componentName() override { return "router"; }
  bool componentExport() override { return true; }

  // From PlayerComponent::queueMedia. True: hold the load (the prompt is up); proceed() or end() follows later.
  bool hold(const QVariantMap& loadMetadata, std::function<void()> proceed, std::function<void()> end);

  Q_INVOKABLE void resolve(const QString& choice, bool remember);
  // A play action (jellyfin-web's playbackManager.play: cinema-mode intros, then the feature) asks once, before
  // anything plays; its answer holds for every load until the next play action clears it. remember also keeps it
  // on this device for later play actions.
  Q_INVOKABLE void setSessionChoice(const QString& key, const QString& choice, bool remember);
  Q_INVOKABLE void clearSession();
  Q_INVOKABLE QVariantMap rememberedChoices() const;
  Q_INVOKABLE void forgetChoices();
  // Diagnostics/tests: the decision for a VideoRangeType on this system, without loading anything.
  Q_INVOKABLE QVariantMap decide(const QString& videoRangeType) const;
  // The display state the router uses (6.1): {hdr: yes/no/unknown, transfer, primaries, maxLuminance, source, error}.
  Q_INVOKABLE QVariantMap display() const;
  void componentPostInitialize() override;

  // The single-surface compositor (5.4, Compositing.h): CompositorState::toMap() for Compositor.qml and tests.
  Q_INVOKABLE QVariantMap compositor() const;
  // How the UI is blended over video: "srgb" or "linear" (D24 compares them; tests switch at run time).
  Q_INVOKABLE void setUiBlend(const QString& name);
  // Tests: false shows the video alone, without the UI layer (parity with stock mpv, 5.8).
  Q_INVOKABLE void setUiLayerVisible(bool visible);
  // Reference white, peak and transfer from the display; called on display and swapchain changes.
  Q_INVOKABLE void refreshCompositor();
  // The capability model (6.7, src/icefin/capability/CapabilityModel.h): what this machine can show and play. The
  // "theme" key is what themes get as icefinTheme.system.
  Q_INVOKABLE QVariantMap capabilities() const;

Q_SIGNALS:
  // {key, range, reason, options[{id, label}], remembered, itemId, serverId, startMs}
  void promptRequested(const QVariantMap& info);
  void displayChanged(const QVariantMap& info);
  void compositorChanged(const QVariantMap& state);
  void capabilitiesChanged(const QVariantMap& snapshot);

private:
  RouterComponent() = default;
  System system() const;
  void remember(const QString& key, const QString& choice);
  QString m_bypassKey;  // one load that the user already answered for
  QMap<QString, QString> m_session;  // this play action's answers, by key
  QString m_pendingKey;
  std::function<void()> m_proceed, m_end;
  QVariantMap m_compositorSent;  // the state last logged and sent to QML
};

QString optionId(Option o);
}
