// Icefin: HdrCapabilityProbe (PLAN 6.1, 4.4; SPEC "Inputs to the router" 3, spike 2.3).
//
// Wayland: reads the output's image description through wp_color_manager_v1 on Qt's own Wayland connection (its own
// event queue, so Qt's isn't touched): transfer function, primaries, luminances. The display counts as HDR when the
// output's transfer function is PQ or HLG. It probes again when the window moves to another screen or the compositor
// says the output's description changed (4.4).
// X11 and Gamescope (5.6): the answer comes from the Vulkan surface's colour spaces: Icefin asks Qt for an HDR10
// swapchain and Qt makes one only when the surface offers HDR10_ST2084 (Gamescope's WSI layer with HDR on), so the
// swapchain Qt made is the answer (setFromSwapchain). Before it exists, or on the OpenGL fallback, the state is
// Unknown, which the router treats as SDR (safe: tone-mapped).
//
// Surface tagging (5.5): on the same connection it tags the window's wl_surface with an image description, so the
// compositor reads the HDR10 swapchain the compositor pass (Compositing.h) writes as PQ / BT.2020 with SDR white at
// the reference white, plus the video's HDR10 static metadata (mastering display, MaxCLL, MaxFALL) where the
// compositor takes it. Neither Mesa nor NVIDIA tags the surface for a Vulkan HDR swapchain (spikes 2.3, 2.8), so
// without this KWin shows the PQ values as sRGB.
#pragma once
#include <QObject>
#include <QPointer>
#include <QVariantMap>

class QWindow;

namespace Icefin::Render
{
struct DisplayInfo
{
  enum class Hdr { Yes, No, Unknown } hdr = Hdr::Unknown;
  QString transfer, primaries, source, error;  // source: "wayland" / "x11"
  int maxLuminance = -1, referenceLuminance = -1;
  double minLuminance = -1;  // nits (the protocol sends 0.0001 cd/m² units)
  QVariantMap toMap() const;
};

// Classify an output description from wp_color_manager_v1. HDR when the transfer function is PQ or HLG, or when the
// output has luminance headroom over its reference white (max at least 1.5x reference): KWin describes an HDR output
// as gamma22 / bt2020 with max 800, reference 200 (RTX 4090 ultrawide, 2026-11-09), and an SDR one as max = reference.
DisplayInfo::Hdr hdrForTransfer(const QString& tf, int maxLuminance = -1, int referenceLuminance = -1);

// What the window's surface says it holds (5.5).
struct SurfaceDescription
{
  enum class Kind { None, Hdr10 } kind = Kind::None;
  int referenceWhite = 203;              // cd/m² of SDR white in the PQ signal
  // The video's HDR10 static metadata; 0 / false = not known, left out.
  bool hasMasteringPrimaries = false;
  double masteringPrimaries[8] = {};     // red, green, blue, white: CIE 1931 x, y
  double masteringMinLuminance = 0;      // cd/m²
  int masteringMaxLuminance = 0;         // cd/m²
  int maxCll = 0, maxFall = 0;           // cd/m²
  bool operator==(const SurfaceDescription& o) const;
  bool operator!=(const SurfaceDescription& o) const { return !(*this == o); }
  QString summary() const;
};

class HdrCapabilityProbe : public QObject
{
  Q_OBJECT
public:
  static HdrCapabilityProbe& instance();
  void attach(QWindow* window);   // probes now and on every screen change
  DisplayInfo current() const { return m_info; }
  void probe();
  // The compositor accepts an HDR10 surface description: parametric, PQ, BT.2020, its own luminances, perceptual intent.
  bool canTagHdr10() const;
  // Any connected screen is in HDR (Wayland). The swapchain format is fixed before the window is placed, and the window
  // can move between screens, so HDR output is chosen when any screen can show it; an SDR screen shows the tagged PQ
  // surface through the compositor's own conversion.
  bool anyScreenHdr();
  // X11 (5.6): what the Vulkan swapchain Qt made says about the display. HDR10 means the surface offered it.
  void setFromSwapchain(bool hdr10, int maxLuminance, int referenceLuminance);
  // Tags `window`'s surface (Wayland only). Kind::None removes the tag. Returns an error, or an empty string.
  QString tagSurface(QWindow* window, const SurfaceDescription& d);
  SurfaceDescription currentTag() const { return m_tag; }
  QWindow* window() const;
  struct Wl;  // Wayland objects (HdrCapabilityProbe.cpp); public so the C listeners can reach it
Q_SIGNALS:
  void changed(const QVariantMap& info);
private:
  HdrCapabilityProbe() = default;
  QPointer<QWindow> m_window;
  DisplayInfo m_info;
  SurfaceDescription m_tag;
  bool m_haveSwapchainInfo = false;
  DisplayInfo m_swapchainInfo;
  Wl* m_wl = nullptr;
};
}
