#include "RouterComponent.h"
#include <QDebug>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include "settings/SettingsComponent.h"

namespace Icefin::Render
{
static const char* kMemory = "icefin_prompt_memory";  // state section: {"<range>|<renderer>": "<choice>"}

static QJsonObject memory()
{
  return QJsonDocument::fromJson(SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kMemory).toString().toUtf8()).object();
}

QString optionId(Option o)
{
  switch (o) {
    case Option::PlayAnyway: return "play";
    case Option::PlayBaseLayer: return "playBaseLayer";
    case Option::TranscodeHdr10: return "transcodeHdr10";
    case Option::TranscodeSdr: return "transcodeSdr";
    case Option::SwitchToVulkan: return "switchToVulkan";
    case Option::Cancel: return "cancel";
  }
  return "cancel";
}

System RouterComponent::system() const
{
  System s;
  s.renderer = QQuickWindow::graphicsApi() == QSGRendererInterface::Vulkan ? Renderer::Vulkan : Renderer::OpenGlFallback;
  s.vulkanAvailable = false;     // until the Vulkan renderer exists (5.1): no "switch to Vulkan" option
  s.display = DisplayState::Unknown;  // HdrCapabilityProbe: 6.1
  s.serverTranscode = true;      // the page drops the transcode options when the user's policy forbids them
  return s;
}

static QString keyFor(Range r, const System& s)
{
  return rangeName(r) + "|" + (s.renderer == Renderer::Vulkan ? "vulkan" : "opengl");
}

QVariantMap RouterComponent::decide(const QString& videoRangeType) const
{
  const System s = system();
  const Range r = rangeFromJellyfin(videoRangeType);
  const Route route = Render::route(r, s);
  QVariantList opts;
  for (Option o : route.options) opts << QVariantMap{{"id", optionId(o)}, {"label", optionName(o)}};
  return {{"output", outputName(route.output)}, {"reason", route.reason}, {"options", opts}, {"key", keyFor(r, s)},
          {"range", rangeName(r)}, {"remembered", memory().value(keyFor(r, s)).toString()}};
}

bool RouterComponent::hold(const QVariantMap& load, std::function<void()> proceed, std::function<void()> end)
{
  const QString vrt = videoRangeType(load);
  QVariantMap d = decide(vrt);
  if (d.value("output").toString() != outputName(Output::Prompt)) return false;
  const QString key = d.value("key").toString();
  if (m_bypassKey == key) { m_bypassKey.clear(); return false; }  // answered: this load goes ahead
  const QString remembered = d.value("remembered").toString();
  if (remembered == "play" || remembered == "playBaseLayer") {
    qInfo().noquote() << "Icefin router:" << key << "-> remembered choice" << remembered;
    return false;
  }
  if (m_end) m_end();  // an older prompt still open: that load is abandoned
  m_pendingKey = key;
  m_proceed = std::move(proceed);
  m_end = std::move(end);
  const QVariantMap item = load.value("metadata").toMap();
  d["itemId"] = item.value("Id");
  d["serverId"] = item.value("ServerId");
  d["name"] = item.value("Name");
  qInfo().noquote() << "Icefin router: capability prompt for" << vrt << "(" + d.value("reason").toString() + ")"
                    << (remembered.isEmpty() ? QString() : "remembered: " + remembered);
  emit promptRequested(d);
  return true;
}

void RouterComponent::resolve(const QString& choice, bool remember)
{
  if (m_pendingKey.isEmpty()) return;
  const QString key = m_pendingKey;
  auto proceed = std::move(m_proceed);
  auto end = std::move(m_end);
  m_pendingKey.clear();
  m_proceed = nullptr;
  m_end = nullptr;
  if (remember && choice != "cancel") {
    QJsonObject m = memory();
    m[key] = choice;
    SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kMemory, QString::fromUtf8(QJsonDocument(m).toJson(QJsonDocument::Compact)));
  }
  qInfo().noquote() << "Icefin router:" << key << "->" << choice << (remember ? "(remembered on this device)" : "");
  if (choice == "play" || choice == "playBaseLayer") {
    m_bypassKey = key;
    if (proceed) proceed();
  } else if (end) {
    end();  // cancel, or a transcode the page restarts
  }
}

QVariantMap RouterComponent::rememberedChoices() const { return memory().toVariantMap(); }

void RouterComponent::forgetChoices()
{
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kMemory, QString("{}"));
  qInfo() << "Icefin router: remembered playback choices cleared";
}
}
