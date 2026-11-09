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

void Fallback::restore(MpvController* mpv)
{
  if (m_saved) {
    mpv->setProperty("audio-device", m_device);
    mpv->setProperty("audio-spdif", m_spdif);
    mpv->setProperty("audio-fallback-to-null", "no");
  }
  m_saved = false; m_step = 0;
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
      m_step = 3;
      qCritical() << "Icefin audio fallback 3/3: no audio output could be opened - playing without sound";
      mpv->setProperty("audio-fallback-to-null", "yes");
      mpv->command(QStringList() << "show-text" << "No audio output available. Check the audio device in Settings." << "6000" << "0");
    }
  }
  mpv->command(QStringList() << "ao-reload");
}

void Fallback::onMpvEvent(MpvController* mpv, mpv_event* event)
{
  switch (event->event_id) {
    case MPV_EVENT_START_FILE: restore(mpv); break;
    case MPV_EVENT_END_FILE: releaseReservation(); restoreSinkFormats(); state().setBitstream(false, "playback ended"); break;  // give the card back to the sound server
    // Judge only once playback has (re)started: AUDIO_RECONFIG fires before mpv tries to open the output.
    case MPV_EVENT_PLAYBACK_RESTART: {
      if (m_step >= 3) break;
      const bool hasAudio = mpv->getProperty("current-tracks/audio/id").isValid();
      const bool aoOpen = !mpv->getProperty("current-ao").toString().isEmpty();
      if (hasAudio && !aoOpen) advance(mpv);
      break;
    }
    default: break;
  }
}
}
