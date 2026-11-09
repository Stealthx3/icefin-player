// Icefin: playback audio state shared by the audio policy, input and theme UI sounds (PLAN 3.7,
// SPEC "Volume and UI sounds").
//
// "Bitstream" means software volume can't reach the speakers: passthrough (audio-spdif carries a codec) or
// exclusive playback (Icefin holds the ALSA device, or mpv's audio-exclusive is on). While it is set:
//  - volume actions go to the receiver over CEC when a CEC adapter is open (routeVolumeActions);
//  - theme UI sounds stay silent (uiSoundsMuted, bitstreamChanged).
#pragma once
#include <QObject>
#include <QMutex>
#include <QStringList>
#include <functional>

namespace Icefin::Audio
{
class AudioState : public QObject
{
  Q_OBJECT
  Q_PROPERTY(bool bitstream READ bitstream NOTIFY bitstreamChanged)
  Q_PROPERTY(bool uiSoundsMuted READ uiSoundsMuted NOTIFY bitstreamChanged)

public:
  // +1 volume up, -1 volume down. Runs on the caller's thread; the sender queues to its own thread.
  using ReceiverVolume = std::function<void(int direction)>;

  bool bitstream() const { return m_bitstream; }
  bool uiSoundsMuted() const { return m_bitstream; }
  void setBitstream(bool on, const QString& why);

  // Registered by the CEC input while an adapter is open; cleared (empty function) when it closes.
  void setReceiverVolume(ReceiverVolume send);
  bool hasReceiverVolume();

  // Removes the volume actions it sent to the receiver and returns the rest, for the web client.
  // Outside bitstream playback, or without CEC, the list comes back unchanged (software volume).
  QStringList routeVolumeActions(const QStringList& actions);

Q_SIGNALS:
  void bitstreamChanged(bool on);

private:
  bool m_bitstream = false;
  QMutex m_lock;  // guards m_send: set on the CEC worker thread, called from the main thread
  ReceiverVolume m_send;
};

AudioState& state();

// Volume direction for an input action: +1 increase_volume, -1 decrease_volume, 0 anything else.
int volumeDirection(const QString& action);
}
