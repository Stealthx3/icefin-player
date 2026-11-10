#include "GamepadComponent.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include "utils/Utils.h"
#include "settings/SettingsComponent.h"
#ifdef ICEFIN_SDL3
#include "GamepadService.h"
#endif

namespace Icefin::Input
{
void GamepadComponent::componentPostInitialize()
{
#ifdef ICEFIN_SDL3
  if (auto* s = GamepadService::instance()) {
    connect(s, &GamepadService::padsChanged, this, &GamepadComponent::changed);
    connect(s, &GamepadService::familyChanged, this, &GamepadComponent::familyChanged);
  }
#endif
}

QVariantList GamepadComponent::list() const
{
#ifdef ICEFIN_SDL3
  if (auto* s = GamepadService::instance()) return s->pads();
#endif
  return {};
}

QString GamepadComponent::family() const
{
#ifdef ICEFIN_SDL3
  if (auto* s = GamepadService::instance()) return s->lastFamily();
#endif
  return QString();
}

bool GamepadComponent::available() const
{
#ifdef ICEFIN_SDL3
  return GamepadService::instance() != nullptr;
#else
  return false;
#endif
}

static const char* kRemaps = "icefin_pad_remaps";  // state section: {"<pad name>": {"PAD_*": "<action>"}}

static QJsonObject remapStore()
{
  return QJsonDocument::fromJson(SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kRemaps).toString().toUtf8()).object();
}

QVariantMap GamepadComponent::remaps() const { return remapStore().toVariantMap(); }

void GamepadComponent::setRemap(const QString& padName, const QVariantMap& map)
{
  QJsonObject store = remapStore();
  QJsonObject clean;
  for (auto it = map.begin(); it != map.end(); ++it)
    if (it.key().startsWith("PAD_") && !it.value().toString().isEmpty()) clean[it.key()] = it.value().toString();
  if (clean.isEmpty()) store.remove(padName); else store[padName] = clean;
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kRemaps, QString::fromUtf8(QJsonDocument(store).toJson(QJsonDocument::Compact)));
  qInfo().noquote() << "Icefin gamepad:" << padName << (clean.isEmpty() ? "back to the standard map" : QString("remapped (%1 buttons)").arg(clean.size()));
}

QString GamepadComponent::remapped(const QString& padName, const QString& keycode)
{
  return remapStore().value(padName).toObject().value(keycode).toString();
}

QVariantMap GamepadComponent::standardMap() const
{
  QJsonParseError err;  // the map allows // comments; upstream's reader handles them
  return Utils::OpenJsonDocument(":/inputmaps/icefin-gamepad.json", &err).object().value("mapping").toObject().toVariantMap();
}
}
