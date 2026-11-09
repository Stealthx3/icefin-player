// Icefin: hardware decoding choices and renderer name (PLAN 4.2, SPEC "GPU acceleration and display").
//
// Icefin's settings description replaces upstream's video.hardwareDecoding choices (SettingsMerge: a value with the
// same key replaces upstream's) with: Auto (mpv auto-safe, default), VA-API, NVDEC, Vulkan, Copy, Off.
// Upstream's saved values still work: enabled -> Auto, copy -> Copy, disabled -> Off, osx_compat -> Auto.
#pragma once
#include <QString>

namespace Icefin::Gpu
{
// mpv "hwdec" value for a hardwareDecoding setting value (unknown values -> auto-safe).
QString hwdecFor(const QString& setting);
// Icefin value for an upstream value saved before Icefin's choices (enabled -> auto, disabled -> off, osx_compat -> auto);
// empty if the value is already one of Icefin's.
QString migratedSetting(const QString& setting);
// What the debug overlay prints for the UI renderer: "Vulkan" or "OpenGL (fallback)", from Qt Quick's graphics API.
QString rendererName();
}
