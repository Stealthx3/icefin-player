// Icefin: never-silent audio fallback (PLAN 3.6, SPEC "Never silent"). Replaces upstream's audio-fallback-to-null=yes.
// When a file has an audio track but no audio output could be opened: retry with passthrough off (PCM), then on the
// default device, and only then play silence, with an on-screen notice and a log entry. Hooked into PlayerComponent.
#pragma once
#include <QString>
#include <QVariant>

class MpvController;
struct mpv_event;

namespace Icefin::Audio
{
class Fallback
{
public:
  void onMpvEvent(MpvController* mpv, mpv_event* event);
  int step() const { return m_step; }  // 0 = no fallback in use

private:
  void advance(MpvController* mpv);
  void restore(MpvController* mpv);
  int m_step = 0;
  bool m_saved = false;
  QVariant m_device, m_spdif;
};

Fallback& fallback();
}
