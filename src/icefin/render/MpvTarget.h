// Icefin: the compositor's target description for mpv on the Vulkan path (PLAN 5.2, D23).
//
// libplacebo maps video to the display it's told about. Instead of a guess (mpv's --target-colorspace-hint), Icefin
// tells it what the compositor reported through HdrCapabilityProbe: primaries, transfer, peak and minimum luminance,
// and reference white, as mpv's target-* options (the patched libmpv backend reads them per frame, external/mpv).
//
// What "the target" is depends on what Icefin sends. Until the Vulkan path outputs HDR and tags its surface (5.4/5.5),
// the surface is untagged SDR, which the compositor shows as sRGB primaries with its own SDR transfer (KWin: gamma
// 2.2) at its reference white; so the target is that SDR description, not the output's HDR one. Gamescope gets its
// description from the Vulkan colour space instead (5.6). The OpenGL fallback keeps upstream's behaviour (5.7).
#pragma once
#include <QByteArray>
#include <QList>
#include <QPair>
#include "HdrCapabilityProbe.h"

namespace Icefin::Render
{
using MpvOptions = QList<QPair<QByteArray, QByteArray>>;
// mpv option values ("auto" where unknown) for this display; hdrOutput: the Vulkan path outputs HDR (5.4/5.5).
MpvOptions mpvTargetOptions(const DisplayInfo& display, bool hdrOutput);
// The protocol's names in mpv's terms ("" when mpv has no match).
QByteArray mpvPrimaries(const QString& probe);
QByteArray mpvTransfer(const QString& probe);
}
