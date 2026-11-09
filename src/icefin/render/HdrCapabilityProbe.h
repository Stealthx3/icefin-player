// Icefin: HdrCapabilityProbe (PLAN 6.1, 4.4; SPEC "Inputs to the router" 3, spike 2.3).
//
// Wayland: reads the output's image description through wp_color_manager_v1 on Qt's own Wayland connection (its own
// event queue, so Qt's isn't touched): transfer function, primaries, luminances. The display counts as HDR when the
// output's transfer function is PQ or HLG. It probes again when the window moves to another screen or the compositor
// says the output's description changed (4.4).
// X11 and Gamescope: the answer comes from the Vulkan surface's colour spaces, which needs the Vulkan renderer (5.6);
// until then the state is Unknown, which the router treats as SDR (safe: tone-mapped).
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
  QVariantMap toMap() const;
};

// Classify a named transfer function from wp_color_manager_v1 ("st2084_pq", "srgb", ...).
DisplayInfo::Hdr hdrForTransfer(const QString& tf);

class HdrCapabilityProbe : public QObject
{
  Q_OBJECT
public:
  static HdrCapabilityProbe& instance();
  void attach(QWindow* window);   // probes now and on every screen change
  DisplayInfo current() const { return m_info; }
  void probe();
  struct Wl;  // Wayland objects (HdrCapabilityProbe.cpp); public so the C listeners can reach it
Q_SIGNALS:
  void changed(const QVariantMap& info);
private:
  HdrCapabilityProbe() = default;
  QPointer<QWindow> m_window;
  DisplayInfo m_info;
  Wl* m_wl = nullptr;
};
}
