// Icefin: exclusive ALSA access via the org.freedesktop.ReserveDevice1 protocol (PLAN 3.5, SPEC "Exclusive ALSA").
// Claiming org.freedesktop.ReserveDevice1.Audio<N> makes PipeWire/PulseAudio (and JACK) release card N.
#pragma once
#include <QObject>
#include <QString>

namespace Icefin::Audio
{
class DeviceReservation : public QObject
{
  Q_OBJECT
  Q_CLASSINFO("D-Bus Interface", "org.freedesktop.ReserveDevice1")
  Q_PROPERTY(int Priority READ priority)
  Q_PROPERTY(QString ApplicationName READ applicationName)
  Q_PROPERTY(QString ApplicationDeviceName READ applicationDeviceName)
public:
  explicit DeviceReservation(int card, QObject* parent = nullptr);
  ~DeviceReservation() override;

  // Ask the current owner to release the card, then own the name. Returns true when Icefin holds the card.
  bool acquire(int priority = 10);
  void release();
  bool held() const { return m_held; }
  QString serviceName() const;
  QString lastError() const { return m_error; }

  int priority() const { return m_priority; }
  QString applicationName() const;
  QString applicationDeviceName() const;

public Q_SLOTS:
  // Called by another application that wants the card. Icefin keeps it while it holds it for playback.
  bool RequestRelease(int priority);

private:
  int m_card;
  int m_priority = 10;
  bool m_held = false;
  QString m_error;
};
}
