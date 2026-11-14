#include "UiSounds.h"
#include <QAudioDevice>
#include <QAudioFormat>
#include <QAudioSink>
#include <QCoreApplication>
#include <QDebug>
#include <QFile>
#include <QIODevice>
#include <QMediaDevices>
#include <QMutex>
#include <QTimer>
#include <QtEndian>
#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <limits>

namespace Icefin::Theme
{
static std::atomic_bool s_exiting{false};  // set once the process is exiting (atexit, below)
static constexpr int kRate = 48000;
static constexpr int kChannels = 2;
static constexpr int kIdleCloseMs = 4000;  // close the stream after this long without a sound
static constexpr int kBufferMs = 30;       // the sink's buffer: the latency of a sound's start

// Mixes the playing clips into the sink's buffer. Pull mode: the sink reads from it, on whatever thread its backend
// uses, so the voice list is behind a mutex. Always answers with a full buffer (silence when idle), so the stream
// keeps running until UiSounds closes it.
class UiSounds::Mixer : public QIODevice
{
public:
  struct Voice { QSharedPointer<const QVector<float>> clip; qsizetype pos = 0; float gain = 1.0f; };

  explicit Mixer(QObject* parent) : QIODevice(parent) {}
  bool isSequential() const override { return true; }
  qint64 bytesAvailable() const override { return std::numeric_limits<qint32>::max(); }
  void setOutput(QAudioFormat::SampleFormat f) { m_format = f; }
  void add(Voice v) { QMutexLocker l(&m_lock); m_voices.push_back(std::move(v)); }
  void clearVoices() { QMutexLocker l(&m_lock); m_voices.clear(); }
  bool idle() { QMutexLocker l(&m_lock); return m_voices.isEmpty(); }

protected:
  qint64 writeData(const char*, qint64) override { return -1; }
  qint64 readData(char* data, qint64 maxlen) override
  {
    const int bytesPerSample = m_format == QAudioFormat::Float ? 4 : 2;
    const qint64 samples = (maxlen / (bytesPerSample * kChannels)) * kChannels;
    if (samples <= 0) return 0;
    m_mix.fill(0.0f, samples);
    {
      QMutexLocker l(&m_lock);
      for (auto it = m_voices.begin(); it != m_voices.end();) {
        const QVector<float>& c = *it->clip;
        const qsizetype n = std::min<qsizetype>(samples, c.size() - it->pos);
        for (qsizetype i = 0; i < n; ++i) m_mix[i] += c[it->pos + i] * it->gain;
        it->pos += n;
        it = it->pos >= c.size() ? m_voices.erase(it) : it + 1;
      }
    }
    if (m_format == QAudioFormat::Float) {
      auto* out = reinterpret_cast<float*>(data);
      for (qint64 i = 0; i < samples; ++i) out[i] = std::clamp(m_mix[i], -1.0f, 1.0f);
    } else {
      auto* out = reinterpret_cast<qint16*>(data);
      for (qint64 i = 0; i < samples; ++i) out[i] = qint16(std::clamp(m_mix[i], -1.0f, 1.0f) * 32767.0f);
    }
    return samples * bytesPerSample;
  }

private:
  QMutex m_lock;
  QVector<Voice> m_voices;
  QVector<float> m_mix;
  QAudioFormat::SampleFormat m_format = QAudioFormat::Float;
};

UiSounds::UiSounds(QObject* parent) : QObject(parent)
{
  m_mixer = new Mixer(this);
  m_mixer->open(QIODevice::ReadOnly);
  m_idle = new QTimer(this);
  m_idle->setSingleShot(true);
  m_idle->setInterval(kIdleCloseMs);
  connect(m_idle, &QTimer::timeout, this, [this]() {
    if (m_mixer->idle()) closeSink(); else m_idle->start();
  });
  // The owning component is a static that outlives the application: the stream has to be closed while Qt Multimedia
  // is still up. A normal quit closes it here; on exit() (Qt's X11 layer calls it when the display goes away) static
  // teardown may already have taken Qt Multimedia, and stopping the stream then crashed, so it is left to the process.
  if (auto* app = QCoreApplication::instance()) connect(app, &QCoreApplication::aboutToQuit, this, [this]() { closeSink(); });
  static const bool atExit = (std::atexit([]() { s_exiting = true; }), true);
  Q_UNUSED(atExit);
}

UiSounds::~UiSounds()
{
  if (!s_exiting) closeSink();
}

void UiSounds::openSink()
{
  if (m_sink) return;
  const QAudioDevice dev = QMediaDevices::defaultAudioOutput();
  if (dev.isNull()) return;
  QAudioFormat f;
  f.setSampleRate(kRate);
  f.setChannelCount(kChannels);
  f.setSampleFormat(QAudioFormat::Float);
  if (!dev.isFormatSupported(f)) f.setSampleFormat(QAudioFormat::Int16);
  m_mixer->setOutput(f.sampleFormat());
  m_sink = new QAudioSink(dev, f, this);
  m_sink->setBufferSize(f.bytesForDuration(kBufferMs * 1000));
  m_sink->start(m_mixer);
  if (m_sink->error() != QtAudio::NoError) qWarning() << "Icefin theme: UI sound output failed to start:" << m_sink->error();
}

void UiSounds::closeSink()
{
  if (!m_sink) return;
  m_sink->stop();
  m_sink->deleteLater();
  m_sink = nullptr;
}

bool UiSounds::play(const QString& path, float volume, QString* error)
{
  QSharedPointer<const QVector<float>> clip = m_clips.value(path);
  if (!clip) {
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) { if (error) *error = "can't open " + path; return false; }
    auto pcm = QSharedPointer<QVector<float>>::create();
    QString why;
    if (!decodeWav(f.readAll(), pcm.data(), &why)) { if (error) *error = why; qWarning() << "Icefin theme: sound" << path << why; return false; }
    clip = pcm;
    m_clips.insert(path, clip);
  }
  if (clip->isEmpty()) return true;
  openSink();
  if (!m_sink) { if (error) *error = "no audio output"; return false; }
  m_mixer->add({clip, 0, std::clamp(volume, 0.0f, 1.0f)});
  m_idle->start();
  return true;
}

void UiSounds::stopAll() { m_mixer->clearVoices(); }

void UiSounds::clear()
{
  stopAll();
  m_clips.clear();
}

bool UiSounds::decodeWav(const QByteArray& data, QVector<float>* out, QString* error)
{
  auto fail = [error](const char* why) { if (error) *error = QString::fromLatin1(why); return false; };
  const auto* p = reinterpret_cast<const uchar*>(data.constData());
  const qsizetype size = data.size();
  if (size < 12 || std::memcmp(p, "RIFF", 4) != 0 || std::memcmp(p + 8, "WAVE", 4) != 0) return fail("not a WAV file");
  int format = 0, channels = 0, bits = 0;
  quint32 rate = 0;
  const uchar* pcm = nullptr;
  qsizetype pcmBytes = 0;
  for (qsizetype at = 12; at + 8 <= size;) {
    const quint32 len = qFromLittleEndian<quint32>(p + at + 4);
    const uchar* body = p + at + 8;
    const qsizetype avail = std::min<qsizetype>(len, size - at - 8);
    if (std::memcmp(p + at, "fmt ", 4) == 0 && avail >= 16) {
      format = qFromLittleEndian<quint16>(body);
      channels = qFromLittleEndian<quint16>(body + 2);
      rate = qFromLittleEndian<quint32>(body + 4);
      bits = qFromLittleEndian<quint16>(body + 14);
      if (format == 0xFFFE && avail >= 26) format = qFromLittleEndian<quint16>(body + 24);  // WAVE_FORMAT_EXTENSIBLE
    } else if (std::memcmp(p + at, "data", 4) == 0) {
      pcm = body;
      pcmBytes = avail;
    }
    at += 8 + len + (len & 1);
  }
  if (!pcm || !channels || !rate) return fail("no fmt or data chunk");
  if (!((format == 1 && (bits == 8 || bits == 16 || bits == 24 || bits == 32)) || (format == 3 && bits == 32)))
    return fail("unsupported sample format (PCM 8/16/24/32-bit or 32-bit float)");
  const int bytes = bits / 8;
  const qsizetype frames = pcmBytes / (bytes * channels);
  auto sample = [&](qsizetype frame, int ch) -> float {
    const uchar* s = pcm + (frame * channels + ch) * bytes;
    switch (format == 3 ? 0 : bits) {
      case 0: { float v; std::memcpy(&v, s, 4); return v; }
      case 8: return (int(s[0]) - 128) / 128.0f;
      case 16: return qFromLittleEndian<qint16>(s) / 32768.0f;
      case 24: return qint32(quint32(s[0]) << 8 | quint32(s[1]) << 16 | quint32(s[2]) << 24) / 2147483648.0f;
      default: return qFromLittleEndian<qint32>(s) / 2147483648.0f;
    }
  };
  // Stereo at the source rate: mono plays on both sides, more channels keep their front pair.
  QVector<float> src(frames * 2);
  for (qsizetype i = 0; i < frames; ++i) {
    src[2 * i] = sample(i, 0);
    src[2 * i + 1] = channels > 1 ? sample(i, 1) : src[2 * i];
  }
  if (rate == quint32(kRate)) { *out = std::move(src); return true; }
  // Linear resampling to 48 kHz: plenty for short interface sounds.
  const double step = double(rate) / kRate;
  const qsizetype outFrames = qsizetype(frames / step);
  out->resize(outFrames * 2);
  for (qsizetype i = 0; i < outFrames; ++i) {
    const double x = i * step;
    const qsizetype a = qsizetype(x), b = std::min(a + 1, frames - 1);
    const float t = float(x - a);
    for (int c = 0; c < 2; ++c) (*out)[2 * i + c] = src[2 * a + c] * (1 - t) + src[2 * b + c] * t;
  }
  return true;
}
}
