// Icefin: apply the per-track passthrough decision when mpv preloads a file (PLAN 3.3).
// Called from PlayerComponent's on_preloaded hook (ICEFIN-HOOK), before audio decoding starts.
#pragma once
#include <QStringList>

class MpvController;

namespace Icefin::Audio
{
// passthroughCodecs: upstream's enabled list for the device type (e.g. "ac3","dts-hd","truehd").
// hdmiDevice: upstream's audio device type is HDMI (ELD applies); for S/PDIF and basic the toggles are trusted.
void applyForCurrentTrack(MpvController* mpv, const QStringList& passthroughCodecs, bool hdmiDevice);
// Release the exclusive-ALSA device reservation, if Icefin holds one (end of file, or fallback step 2).
void releaseReservation();
// Update AudioState's bitstream flag: passthrough, or exclusive output (reservation held or audio-exclusive).
void refreshBitstream(MpvController* mpv, bool passthrough, const QString& why);
}
