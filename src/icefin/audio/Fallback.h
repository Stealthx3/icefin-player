// Icefin: never-silent audio fallback (PLAN 3.6, SPEC "Never silent").
// When a file's audio track can't open its output: retry with passthrough off (PCM), then on the default device, and
// only then play silence, with an on-screen notice and a log entry. Hooked into PlayerComponent.
//
// How it notices (PLAN 3.9, Virtual AV tier): mpv keeps upstream's audio-fallback-to-null=yes, so a failed open lands
// on mpv's null output instead of ending the file. Without it, mpv retries a failed bitstream as PCM by itself, then
// declares "no sound" and ends an audio-only file before anyone can step in. Icefin checks, a second after the audio
// output settles, whether a playing audio track is on the null output; that only happens after a failure, so it takes
// the next step. A failed passthrough open is the exception: mpv skips the null output while passthrough is on and
// stalls after the failed open (mpv 0.40, stock mpv alike), so step 1 (PCM) is taken on mpv's "Failed to initialize
// audio driver" log line instead. Each step restarts the audio chain on the same track: mpv picks passthrough or a decoder, and opens
// the output, only when the chain starts (ao-reload alone reopens the same failing format).
#pragma once
#include <QString>
#include <QTimer>
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

  // The check, for tests: is a playing audio track on mpv's null output (a failed open)?
  static bool onNullOutput(const QString& currentAo, bool hasAudioTrack) { return hasAudioTrack && currentAo == "null"; }
  // mpv's log line for an output that couldn't be opened (prefix "ao").
  static bool isAoInitFailure(const QString& prefix, const QString& text)
  {
    return prefix == "ao" && text.startsWith("Failed to initialize audio driver");
  }

private:
  void check(MpvController* mpv);
  void schedule(MpvController* mpv);
  void advance(MpvController* mpv);
  void silent(MpvController* mpv);
  void restore(MpvController* mpv);
  int m_step = 0;
  bool m_saved = false;
  QVariant m_device, m_spdif;
  QTimer* m_timer = nullptr;
};

Fallback& fallback();
}
