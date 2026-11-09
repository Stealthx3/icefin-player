#include "AudioState.h"
#include <QDebug>

namespace Icefin::Audio
{
AudioState& state() { static AudioState s; return s; }

int volumeDirection(const QString& action)
{
  if (action == "increase_volume") return 1;
  if (action == "decrease_volume") return -1;
  return 0;
}

void AudioState::setBitstream(bool on, const QString& why)
{
  if (on == m_bitstream) return;
  m_bitstream = on;
  qInfo().noquote() << "Icefin audio:" << (on ? "bitstream playback" : "PCM playback") << "(" + why + ")"
                    << "- UI sounds" << (on ? "muted" : "on") << "- volume"
                    << (on ? (hasReceiverVolume() ? "to the receiver over CEC" : "fixed (no CEC adapter)") : "in software");
  emit bitstreamChanged(on);
}

void AudioState::setReceiverVolume(ReceiverVolume send)
{
  QMutexLocker l(&m_lock);
  m_send = std::move(send);
}

bool AudioState::hasReceiverVolume()
{
  QMutexLocker l(&m_lock);
  return bool(m_send);
}

QStringList AudioState::routeVolumeActions(const QStringList& actions)
{
  if (!m_bitstream) return actions;
  ReceiverVolume send;
  { QMutexLocker l(&m_lock); send = m_send; }
  if (!send) return actions;
  QStringList rest;
  for (const QString& a : actions) {
    if (const int dir = volumeDirection(a)) send(dir);
    else rest << a;
  }
  return rest;
}
}
