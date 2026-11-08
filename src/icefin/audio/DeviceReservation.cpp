#include "DeviceReservation.h"
#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusInterface>
#include <QDBusReply>
#include <QDebug>

namespace Icefin::Audio
{
DeviceReservation::DeviceReservation(int card, QObject* parent) : QObject(parent), m_card(card) {}
DeviceReservation::~DeviceReservation() { release(); }

QString DeviceReservation::serviceName() const { return QString("org.freedesktop.ReserveDevice1.Audio%1").arg(m_card); }
QString DeviceReservation::applicationName() const { return "Icefin Player"; }
QString DeviceReservation::applicationDeviceName() const { return QString("hw:%1").arg(m_card); }

bool DeviceReservation::RequestRelease(int priority)
{
  qInfo() << "Icefin reservation: release requested for card" << m_card << "by priority" << priority << "- declined while playing";
  return false;
}

bool DeviceReservation::acquire(int priority)
{
  m_priority = priority;
  auto bus = QDBusConnection::sessionBus();
  if (!bus.isConnected()) { m_error = "no session bus"; return false; }
  const QString name = serviceName(), path = QString("/org/freedesktop/ReserveDevice1/Audio%1").arg(m_card);
  auto* iface = bus.interface();

  if (iface->isServiceRegistered(name)) {
    const QString owner = iface->serviceOwner(name);
    QDBusInterface other(owner, path, "org.freedesktop.ReserveDevice1", bus);
    QDBusReply<bool> r = other.call("RequestRelease", priority);
    if (!r.isValid() || !r.value()) {
      m_error = QString("owner %1 refused: %2").arg(owner, r.isValid() ? "declined" : r.error().message());
      return false;
    }
  }
  if (!bus.registerObject(path, this, QDBusConnection::ExportAllSlots | QDBusConnection::ExportAllProperties)) {
    m_error = "could not export reservation object"; return false;
  }
  auto reply = iface->registerService(name, QDBusConnectionInterface::DontQueueService, QDBusConnectionInterface::DontAllowReplacement);
  if (!reply.isValid() || reply.value() != QDBusConnectionInterface::ServiceRegistered) {
    bus.unregisterObject(path);
    m_error = "name still owned after release: " + (reply.isValid() ? QString::number(int(reply.value())) : reply.error().message());
    return false;
  }
  m_held = true;
  qInfo() << "Icefin reservation: holding" << name;
  return true;
}

void DeviceReservation::release()
{
  if (!m_held) return;
  auto bus = QDBusConnection::sessionBus();
  bus.interface()->unregisterService(serviceName());
  bus.unregisterObject(QString("/org/freedesktop/ReserveDevice1/Audio%1").arg(m_card));
  m_held = false;
  qInfo() << "Icefin reservation: released" << serviceName();
}
}
