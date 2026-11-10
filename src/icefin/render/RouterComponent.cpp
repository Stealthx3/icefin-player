#include "RouterComponent.h"
#include <QDebug>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include "settings/SettingsComponent.h"
#include "HdrCapabilityProbe.h"
#include <QGuiApplication>
#include <QTimer>
#include <QWindow>

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

System RouterComponent::system() const { return currentSystem(); }

System currentSystem()
{
  System s;
  s.renderer = QQuickWindow::graphicsApi() == QSGRendererInterface::Vulkan ? Renderer::Vulkan : Renderer::OpenGlFallback;
  s.vulkanAvailable = false;     // until the Vulkan renderer exists (5.1): no "switch to Vulkan" option
  switch (HdrCapabilityProbe::instance().current().hdr) {  // 6.1
    case DisplayInfo::Hdr::Yes: s.display = DisplayState::Hdr; break;
    case DisplayInfo::Hdr::No: s.display = DisplayState::Sdr; break;
    default: s.display = DisplayState::Unknown;
  }
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
  if (m_session.contains(key)) {  // answered at the start of this play action (bumpers, then the feature)
    qInfo().noquote() << "Icefin router:" << key << "-> this play action's choice" << m_session.value(key);
    return false;
  }
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
  if (remember && choice != "cancel") this->remember(key, choice);
  if (choice.startsWith("transcode")) m_session.insert(key, choice);  // the page's transcode restart goes ahead
  qInfo().noquote() << "Icefin router:" << key << "->" << choice << (remember ? "(remembered on this device)" : "");
  if (choice == "play" || choice == "playBaseLayer") {
    m_bypassKey = key;
    if (proceed) proceed();
  } else if (end) {
    end();  // cancel, or a transcode the page restarts
  }
}

void RouterComponent::remember(const QString& key, const QString& choice)
{
  QJsonObject m = memory();
  m[key] = choice;
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kMemory, QString::fromUtf8(QJsonDocument(m).toJson(QJsonDocument::Compact)));
}

void RouterComponent::setSessionChoice(const QString& key, const QString& choice, bool remember)
{
  if (key.isEmpty() || choice == "cancel") return;
  if (remember) this->remember(key, choice);
  m_session.insert(key, choice);
  qInfo().noquote() << "Icefin router:" << key << "->" << choice << "for this play action"
                    << (remember ? "(remembered on this device)" : "");
}

void RouterComponent::clearSession()
{
  if (!m_session.isEmpty()) qInfo() << "Icefin router: new play action, earlier answers cleared";
  m_session.clear();
  m_bypassKey.clear();
}

QVariantMap RouterComponent::rememberedChoices() const { return memory().toVariantMap(); }

void RouterComponent::forgetChoices()
{
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kMemory, QString("{}"));
  qInfo() << "Icefin router: remembered playback choices cleared";
}

QVariantMap RouterComponent::display() const { return HdrCapabilityProbe::instance().current().toMap(); }

void RouterComponent::componentPostInitialize()
{
  connect(&HdrCapabilityProbe::instance(), &HdrCapabilityProbe::changed, this, &RouterComponent::displayChanged);
  // The main window exists once QML has loaded; attach the probe to the first visible top-level window.
  auto* t = new QTimer(this);
  t->setInterval(1000);
  connect(t, &QTimer::timeout, this, [t] {
    for (QWindow* w : QGuiApplication::topLevelWindows())
      if (w->isVisible()) { HdrCapabilityProbe::instance().attach(w); t->stop(); t->deleteLater(); return; }
  });
  t->start();
}
}
