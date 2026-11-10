// Icefin: hardware decoding choices and renderer name (PLAN 4.2, SPEC "GPU acceleration and display").
//
// Icefin's settings description replaces upstream's video.hardwareDecoding choices (SettingsMerge: a value with the
// same key replaces upstream's) with: Auto (mpv auto-safe, default), VA-API, NVDEC, Vulkan, Copy, Off.
// Upstream's saved values still work: enabled -> Auto, copy -> Copy, disabled -> Off, osx_compat -> Auto.
#pragma once
#include <QString>

namespace Icefin::Gpu
{
// mpv "hwdec" value for a hardwareDecoding setting value (unknown values -> auto-safe). Auto takes the copy path
// (auto-copy-safe) on an NVIDIA GPU while Qt Quick runs on OpenGL: NVDEC's zero-copy CUDA frames reach mpv's OpenGL
// renderer as a blank picture there (RTX 4090, Plasma Wayland, Flatpak, 2026-11-09). An explicit NVDEC choice is kept.
QString hwdecFor(const QString& setting);
QString hwdecFor(const QString& setting, bool nvidiaOnOpenGl);
// A hardwareDecoding change made while a video plays waits for the next load: switching mpv's decoder under the
// running render path left the picture white (RTX 4090, OpenGL, 2026-11-09). PlayerComponent::queueMedia opens a
// HwdecLoadScope around its settings refresh, so a load always applies the setting.
struct HwdecLoadScope
{
  HwdecLoadScope();
  ~HwdecLoadScope();
};
// True if the hwdec property should not change now: not during a load, a video is playing, and the value differs.
bool deferHwdecChange(bool playing, const QString& current, const QString& next);

// True if a DRM card under sysRoot has PCI vendor 0x10de (NVIDIA).
bool hasNvidiaGpu(const QString& sysRoot = "/sys");
// Icefin value for an upstream value saved before Icefin's choices (enabled -> auto, disabled -> off, osx_compat -> auto);
// empty if the value is already one of Icefin's.
QString migratedSetting(const QString& setting);
// What the debug overlay prints for the UI renderer: "Vulkan" or "OpenGL (fallback)", from Qt Quick's graphics API.
QString rendererName();
}
