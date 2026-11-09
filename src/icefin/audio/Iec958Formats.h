// Icefin: the HDMI sink's IEC958 (bitstream) formats at runtime (PLAN 3.4, SPEC "Setting IEC958 formats on PipeWire
// and PulseAudio").
//
// Passthrough through a sound server needs the sink to accept the bitstream format. First choice: the PulseAudio
// device-restore extension, which pavucontrol's passthrough checkboxes use and pipewire-pulse implements, so one path
// covers both servers with no config files. Icefin adds the formats a track needs before mpv opens the output, reads
// them back, and puts the sink's original formats back when playback ends.
// Fallback, when the server doesn't take them: a WirePlumber rule the user can copy (wirePlumberRule()).
#pragma once
#include <QString>
#include <QStringList>

namespace Icefin::Audio
{
// PulseAudio format name for an mpv spdif codec: "ac3" -> "ac3-iec61937", "dts-hd" -> "dtshd-iec61937", ...
QString pulseFormatFor(const QString& spdifCodec);
// Sink name from mpv's audio-device ("pulse/<sink>" or "pipewire/<node>"); empty if not a sound-server sink.
QString sinkFromDevice(const QString& mpvDevice);
// formats + what the codecs need, PCM first, no duplicates.
QStringList withCodecs(const QStringList& formats, const QStringList& spdifCodecs);
// WirePlumber drop-in (~/.config/wireplumber/wireplumber.conf.d/51-icefin-passthrough.conf) for the sink.
QString wirePlumberRule(const QString& sink, const QStringList& spdifCodecs);

struct FormatChange
{
  bool ok = false;             // the server took them (read back)
  QString sink, error;
  QStringList before, after;
};

// Synchronous, with a short timeout (it runs before mpv opens the output). Talks to the session's sound server.
FormatChange ensureSinkFormats(const QString& sink, const QStringList& spdifCodecs);
// Put back the formats ensureSinkFormats found, if it changed them (end of playback).
void restoreSinkFormats();
}
