// Icefin: apply the per-track passthrough decision when mpv preloads a file (PLAN 3.3).
// Called from PlayerComponent's on_preloaded hook (ICEFIN-HOOK), before audio decoding starts.
#pragma once
#include <QStringList>
#include <QVariantMap>

class MpvController;

namespace Icefin::Audio
{
// passthroughCodecs: upstream's enabled list for the device type (e.g. "ac3","dts-hd","truehd").
// hdmiDevice: upstream's audio device type is HDMI (ELD applies); for S/PDIF and basic the toggles are trusted.
// The audio track the decision is for: mpv's current-tracks/audio, or, while that is still empty in on_preloaded, the
// track-list entry the aid property names (PLAN 3.9). Empty when no audio is selected.
QVariantMap selectedAudioTrack(const QVariant& aid, const QVariantMap& current, const QVariantList& trackList);
void applyForCurrentTrack(MpvController* mpv, const QStringList& passthroughCodecs, bool hdmiDevice);
// Release the exclusive-ALSA device reservation, if Icefin holds one (end of file, or fallback step 2).
void releaseReservation();
// Update AudioState's bitstream flag: passthrough, or exclusive output (reservation held or audio-exclusive).
void refreshBitstream(MpvController* mpv, bool passthrough, const QString& why);
}
