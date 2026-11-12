// Icefin: the client-side capability model (PLAN 6.7, D23, D26; case study path 1).
//
// One place that knows what this machine can show and play, assembled from facts Icefin already collects:
//  - the renderer: Vulkan or the OpenGL fallback, the video path, the compositor, HDR output and its tag, whether a
//    usable Vulkan GPU exists while on OpenGL, and why Vulkan was given up (5.1-5.7);
//  - the display: HdrCapabilityProbe (6.1);
//  - decoders: the decoder self-test (4.1), the hwdec setting, and mpv's loaded interop and current decoder;
//  - the HDMI sink: the receiver's ELD as the passthrough decision last read it (3.2, 3.3);
//  - versions: mpv, FFmpeg, libplacebo, libass, Qt, Icefin.
// Its consumers: PlaybackRouter (the System it routes against), the Auto device profile (6.4), the Hardware page and
// debug overlay, and themes through the read-only `icefinTheme.system` (theme API v1, additive). Out of scope (D26):
// disc menus, DoP, secondary playback windows, theme.json changes.
// The assembly is pure (Inputs -> System / snapshot / theme view) so it is unit-tested; CapabilityModel gathers the
// inputs and emits changed() when the snapshot differs.
#pragma once
#include <QObject>
#include <QVariantMap>
#include "icefin/render/PlaybackRouter.h"

class MpvController;

namespace Icefin::Capability
{
struct Inputs
{
  bool vulkanRenderer = false;   // Qt Quick runs on Vulkan
  bool vulkanVideoPath = false;  // this build has the Vulkan video path (patched libmpv)
  bool vulkanUsable = false;     // a usable Vulkan GPU exists (probed; only matters on OpenGL)
  QString vulkanFallback;        // why this start is on OpenGL after a Vulkan failure (5.7), or empty
  QVariantMap compositor;        // CompositorState::toMap()
  bool hdrOutput = false;        // vulkanHdrOutput(): HDR10 out and the surface says so
  QVariantMap display;           // DisplayInfo::toMap()
  QString hdrSetting = "auto";   // main.icefin_hdr_output
  QVariantMap selfTest;          // HardwareComponent::results(): samples, transcode, fingerprint, time
  QString hwdecSetting, hwdecInterop, hwdecCurrent;
  QVariantMap sink;              // the HDMI sink last seen by the passthrough decision
  QVariantMap versions;
  // The display the window is on: name, diagonalInches (from the size it reports, 0 if unknown), and the session
  // (gamescope: Steam's Big Picture / Gamescope). Feeds Couch Mode's detection.
  QVariantMap screen;
};

// A couch display: watched from across the room (alpha feedback, 4K controls too small). A TV-sized display (40 inches
// and up, from the physical size it reports) or a Gamescope / Steam Big Picture session. {couch, reason}.
QVariantMap couchDisplay(const QVariantMap& screen);

// The router's view of this system.
Render::System routerSystem(const Inputs& in);
// The whole model as one map (router.capabilities(), the Hardware page, logs).
QVariantMap snapshot(const Inputs& in);
// What themes see (icefinTheme.system): no device paths, receiver names or file names.
QVariantMap themeView(const QVariantMap& snapshot);
// One line for the debug overlay's renderer row.
QString rendererSummary(const QVariantMap& snapshot);

class CapabilityModel : public QObject
{
  Q_OBJECT
public:
  static CapabilityModel& instance();
  Render::System system();          // gathers now: the router asks at load time
  QVariantMap current();            // gathers now
  QVariantMap last() const { return m_last; }
  void setMpv(MpvController* mpv);  // for versions and hwdec state (VulkanVideo::createFor, both renderers)
  void setSink(const QVariantMap& sink);  // from the passthrough decision (AudioPolicy)
  // Connects the sources' change signals; call once the components exist.
  void attach();

public Q_SLOTS:
  void refresh();  // gathers and emits changed() when the snapshot differs

Q_SIGNALS:
  void changed(const QVariantMap& snapshot);

private:
  CapabilityModel() = default;
  Inputs gather() const;
  MpvController* m_mpv = nullptr;
  QVariantMap m_sink;
  QVariantMap m_last;
};
}
