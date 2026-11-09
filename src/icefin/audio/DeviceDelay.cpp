#include "DeviceDelay.h"
#include <QDebug>
#include <QJsonDocument>
#include <QStringList>
#include "settings/SettingsComponent.h"

namespace Icefin::Audio
{
static const char* kStore = "icefin_audio_delays";  // state section: hidden, stored apart, no player listener

const QStringList& delayKeys()
{
  static const QStringList k{"normal", "24hz", "25hz", "50hz"};
  return k;
}

QJsonObject rememberDelays(QJsonObject store, const QString& device, const Delays& d)
{
  if (device.isEmpty()) return store;
  QJsonObject o;
  for (const QString& k : delayKeys()) o[k] = d.value(k, 0.0);
  store[device] = o;
  return store;
}

std::optional<Delays> recallDelays(const QJsonObject& store, const QString& device)
{
  if (device.isEmpty() || !store.value(device).isObject()) return std::nullopt;
  const QJsonObject o = store.value(device).toObject();
  Delays d;
  for (const QString& k : delayKeys()) d[k] = o.value(k).toDouble(0.0);
  return d;
}

static QJsonObject loadStore()
{
  const QString s = SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kStore).toString();
  return QJsonDocument::fromJson(s.toUtf8()).object();
}

static void saveStore(const QJsonObject& o)
{
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kStore, QString::fromUtf8(QJsonDocument(o).toJson(QJsonDocument::Compact)));
}

Delays DeviceDelay::current() const
{
  Delays d;
  for (const QString& k : delayKeys())
    d[k] = SettingsComponent::Get().value(SETTINGS_SECTION_VIDEO, "audio_delay." + k).toDouble();
  return d;
}

void DeviceDelay::remember()
{
  if (m_loading || m_device.isEmpty()) return;
  const QJsonObject store = loadStore();
  const auto have = recallDelays(store, m_device);
  const Delays now = current();
  if (have && *have == now) return;  // unchanged: don't rewrite settings on every video reconfigure
  saveStore(rememberDelays(store, m_device, now));
}

void DeviceDelay::switchDevice(const QString& device)
{
  if (device == m_device) return;
  remember();  // the live values still belong to the previous device
  m_device = device;
  const auto d = recallDelays(loadStore(), device);
  if (!d) { remember(); return; }  // first time on this device: it starts from the current values
  if (*d == current()) return;
  m_loading = true;
  for (const QString& k : delayKeys())
    SettingsComponent::Get().setValue(SETTINGS_SECTION_VIDEO, "audio_delay." + k, d->value(k));
  m_loading = false;
  qInfo().noquote() << "Icefin audio: delays for" << device << "loaded:" << d->value("normal") << "ms (24/25/50 Hz:"
                    << d->value("24hz") << d->value("25hz") << d->value("50hz") << ")";
}

DeviceDelay& deviceDelay() { static DeviceDelay d; return d; }
}
