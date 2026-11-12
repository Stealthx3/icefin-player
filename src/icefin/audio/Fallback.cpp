#include "Fallback.h"
#include <MpvController>
#include <mpv/client.h>
#include <QDebug>
#include "AudioPolicy.h"
#include "AudioState.h"
#include "Iec958Formats.h"

namespace Icefin::Audio
{
Fallback& fallback() { static Fallback f; return f; }

static constexpr int kSettleMs = 1000;  // after the last audio event: the output has opened, or fallen to null

void Fallback::restore(MpvController* mpv)
{
  if (m_saved) {
    mpv->setProperty("audio-device", m_device);
    mpv->setProperty("audio-spdif", m_spdif);
  }
  m_saved = false; m_step = 0;
  if (m_timer) m_timer->stop();
}

// Restart the audio chain on the same track (see Fallback.h).
static void restartAudio(MpvController* mpv)
{
  QVariant aid = mpv->getProperty("aid");
  const QString a = aid.toString();
  if (a.isEmpty() || a == "no" || a == "false" || a == "auto") {
    const QVariantMap t = selectedAudioTrack("auto", {}, mpv->getProperty("track-list").toList());
    if (t.isEmpty()) return;
    aid = t.value("id");
  }
  mpv->setProperty("aid", "no");
  mpv->setProperty("aid", aid);
}

void Fallback::schedule(MpvController* mpv)
{
  if (m_step >= 3) return;
  if (!m_timer) {
    m_timer = new QTimer;
    m_timer->setSingleShot(true);
  }
  m_timer->disconnect();
  QObject::connect(m_timer, &QTimer::timeout, mpv, [this, mpv] { check(mpv); });
  m_timer->start(kSettleMs);
}

void Fallback::check(MpvController* mpv)
{
  if (m_step >= 3) return;
  if (onNullOutput(mpv->getProperty("current-ao").toString(), mpv->getProperty("current-tracks/audio/id").isValid())) advance(mpv);
}

void Fallback::silent(MpvController* mpv)
{
  m_step = 3;
  if (m_timer) m_timer->stop();
  qCritical() << "Icefin audio fallback 3/3: no audio output could be opened - playing without sound";
  refreshBitstream(mpv, false, "no audio output");
  mpv->command(QStringList() << "show-text" << "No audio output available. Check the audio device in Settings." << "6000" << "0");
}

void Fallback::advance(MpvController* mpv)
{
  if (!m_saved) {
    m_device = mpv->getProperty("audio-device"); m_spdif = mpv->getProperty("audio-spdif"); m_saved = true;
  }
  ++m_step;
  if (m_step == 1 && !m_spdif.toString().isEmpty()) {
    qWarning() << "Icefin audio fallback 1/3: output failed with passthrough" << m_spdif.toString() << "- retrying as PCM";
    mpv->setProperty("audio-spdif", "");
    refreshBitstream(mpv, false, "fallback to PCM");
  } else {
    if (m_step == 1) m_step = 2;  // no passthrough was active: go straight to the default device
    if (m_step == 2 && m_device.toString() != "auto") {
      qWarning() << "Icefin audio fallback 2/3: device" << m_device.toString() << "failed - releasing any reservation, retrying on the default device";
      releaseReservation();
      mpv->setProperty("audio-device", "auto");
      refreshBitstream(mpv, false, "fallback to the default device");
    } else {
      silent(mpv);  // already on the null output: stay there, with the notice
      return;
    }
  }
  restartAudio(mpv);
  schedule(mpv);  // judge the new attempt once it settles
}

void Fallback::onMpvEvent(MpvController* mpv, mpv_event* event)
{
  switch (event->event_id) {
    case MPV_EVENT_START_FILE: restore(mpv); break;
    case MPV_EVENT_END_FILE:
      if (m_timer) m_timer->stop();
      releaseReservation(); restoreSinkFormats(); state().setBitstream(false, "playback ended");  // give the card back to the sound server
      break;
    // A passthrough open failed: mpv stalls rather than fall back, so take step 1 (PCM) now.
    case MPV_EVENT_LOG_MESSAGE: {
      const auto* msg = static_cast<mpv_event_log_message*>(event->data);
      if (m_step == 0 && msg && isAoInitFailure(QString::fromUtf8(msg->prefix), QString::fromUtf8(msg->text))
          && !mpv->getProperty("audio-spdif").toString().isEmpty())
        advance(mpv);
      break;
    }
    // The output (re)opened, or fell to null: judge once it settles.
    case MPV_EVENT_AUDIO_RECONFIG:
    case MPV_EVENT_PLAYBACK_RESTART:
      schedule(mpv);
      break;
    default: break;
  }
}
}
