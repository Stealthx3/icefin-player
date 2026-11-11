// Theme UI sounds (PLAN 8.5): plays a theme's WAV clips through one audio stream that Icefin owns.
//
// QSoundEffect tags its stream as a desktop notification (PipeWire media.role Notification, PulseAudio "event"), so
// a desktop with its notification sounds muted silenced every theme (user report 2026-11-11). A plain QAudioSink is an
// ordinary application stream: Icefin's own Theme Sounds switch and the passthrough rule decide, not the desktop's
// notification mute.
//
// Clips are decoded once (PCM 8/16/24/32-bit or float WAV, any rate and channel count) to 48 kHz stereo float. One sink
// in pull mode mixes every clip that is playing, so sounds overlap and start with the sink's short buffer of latency;
// it closes after a few idle seconds and opens again, on the current default output, with the next sound.
#pragma once
#include <QHash>
#include <QObject>
#include <QSharedPointer>
#include <QVector>

class QAudioSink;
class QTimer;

namespace Icefin::Theme
{
class UiSounds : public QObject
{
  Q_OBJECT

public:
  explicit UiSounds(QObject* parent = nullptr);
  ~UiSounds() override;

  // Plays the WAV at path (a file or ":/" resource) at volume 0..1. False, with the reason, when it can't be read.
  bool play(const QString& path, float volume, QString* error = nullptr);
  void stopAll();
  // Forgets the decoded clips (the theme changed) and stops what is playing.
  void clear();

  // 48 kHz interleaved stereo float from a RIFF/WAVE file. Exposed for tests.
  static bool decodeWav(const QByteArray& data, QVector<float>* out, QString* error);

private:
  class Mixer;
  void openSink();
  void closeSink();

  Mixer* m_mixer = nullptr;
  QAudioSink* m_sink = nullptr;
  QTimer* m_idle = nullptr;
  QHash<QString, QSharedPointer<const QVector<float>>> m_clips;
};
}
