#include "HdrCapabilityProbe.h"
#include <QDebug>
#include <QGuiApplication>
#include <QScreen>
#include <QTimer>
#include <QWindow>
#ifdef ICEFIN_WAYLAND_CM
#include <QtGui/qguiapplication_platform.h>
#include <QtGui/qscreen_platform.h>
#include <wayland-client.h>
#include <unistd.h>
#include "color-management-v1-client-protocol.h"
#if __has_include(<qpa/qplatformnativeinterface.h>)
#include <qpa/qplatformnativeinterface.h>
#define ICEFIN_WL_SURFACE 1
#endif
#endif

namespace Icefin::Render
{
QVariantMap DisplayInfo::toMap() const
{
  return {{"hdr", hdr == Hdr::Yes ? "yes" : hdr == Hdr::No ? "no" : "unknown"}, {"transfer", transfer}, {"primaries", primaries},
          {"maxLuminance", maxLuminance}, {"referenceLuminance", referenceLuminance}, {"minLuminance", minLuminance}, {"source", source}, {"error", error}};
}

DisplayInfo::Hdr hdrForTransfer(const QString& tf, int maxLuminance, int referenceLuminance)
{
  if (tf == "st2084_pq" || tf == "hlg") return DisplayInfo::Hdr::Yes;
  if (tf.isEmpty()) return DisplayInfo::Hdr::Unknown;
  if (maxLuminance > 0 && referenceLuminance > 0 && maxLuminance * 2 >= referenceLuminance * 3) return DisplayInfo::Hdr::Yes;
  return DisplayInfo::Hdr::No;
}

bool SurfaceDescription::operator==(const SurfaceDescription& o) const
{
  if (kind != o.kind || referenceWhite != o.referenceWhite || hasMasteringPrimaries != o.hasMasteringPrimaries
      || masteringMinLuminance != o.masteringMinLuminance || masteringMaxLuminance != o.masteringMaxLuminance
      || maxCll != o.maxCll || maxFall != o.maxFall)
    return false;
  for (int i = 0; i < 8; ++i)
    if (masteringPrimaries[i] != o.masteringPrimaries[i]) return false;
  return true;
}

QString SurfaceDescription::summary() const
{
  if (kind == Kind::None) return "untagged (SDR)";
  QString s = QString("HDR10 (PQ, BT.2020, reference white %1)").arg(referenceWhite);
  if (masteringMaxLuminance > 0) s += QString(", mastering %1-%2 nits").arg(masteringMinLuminance).arg(masteringMaxLuminance);
  if (hasMasteringPrimaries)
    s += QString(", mastering primaries R %1,%2 G %3,%4 B %5,%6 W %7,%8")
           .arg(masteringPrimaries[0]).arg(masteringPrimaries[1]).arg(masteringPrimaries[2]).arg(masteringPrimaries[3])
           .arg(masteringPrimaries[4]).arg(masteringPrimaries[5]).arg(masteringPrimaries[6]).arg(masteringPrimaries[7]);
  if (maxCll > 0) s += QString(", MaxCLL %1").arg(maxCll);
  if (maxFall > 0) s += QString(", MaxFALL %1").arg(maxFall);
  return s;
}

QWindow* HdrCapabilityProbe::window() const { return m_window.data(); }

HdrCapabilityProbe& HdrCapabilityProbe::instance() { static HdrCapabilityProbe p; return p; }

void HdrCapabilityProbe::attach(QWindow* window)
{
  if (!window) return;
  if (m_window != window) {
    m_window = window;
    connect(window, &QWindow::screenChanged, this, [this] { qInfo() << "Icefin display: window moved to another screen, probing again"; probe(); });
  }
  probe();  // again for the same window too: once it is shown, its screen is the one it opened on
}

#ifdef ICEFIN_WAYLAND_CM
static const char* kTf[] = {"", "bt1886", "gamma22", "gamma28", "st240", "ext_linear", "log_100", "log_316", "xvycc", "srgb", "ext_srgb", "st2084_pq", "st428", "hlg"};
static const char* kPrim[] = {"", "srgb", "pal_m", "pal", "ntsc", "generic_film", "bt2020", "cie1931_xyz", "dci_p3", "display_p3", "adobe_rgb"};

struct HdrCapabilityProbe::Wl
{
  wl_display* display = nullptr;
  wl_event_queue* queue = nullptr;
  wl_display* wrapper = nullptr;  // the display proxy on our queue
  wp_color_manager_v1* cm = nullptr;
  wp_color_management_output_v1* out = nullptr;
  wp_image_description_v1* desc = nullptr;
  int state = 0;  // 1 ready, -1 failed
  DisplayInfo info;
  bool infoDone = false;
  // What the compositor supports (bit n set for enum value n), from wp_color_manager_v1's events at bind.
  uint32_t features = 0, intents = 0, tfs = 0, prims = 0;
  bool supportDone = false;
  // Surface tagging (5.5).
  wp_color_management_surface_v1* surface = nullptr;
  wl_surface* taggedSurface = nullptr;
  wp_image_description_v1* tag = nullptr;
};

static void bit(uint32_t& mask, uint32_t v) { if (v < 32) mask |= 1u << v; }

static const wp_color_manager_v1_listener kCm = {
  [](void* d, wp_color_manager_v1*, uint32_t v) { bit(static_cast<HdrCapabilityProbe::Wl*>(d)->intents, v); },
  [](void* d, wp_color_manager_v1*, uint32_t v) { bit(static_cast<HdrCapabilityProbe::Wl*>(d)->features, v); },
  [](void* d, wp_color_manager_v1*, uint32_t v) { bit(static_cast<HdrCapabilityProbe::Wl*>(d)->tfs, v); },
  [](void* d, wp_color_manager_v1*, uint32_t v) { bit(static_cast<HdrCapabilityProbe::Wl*>(d)->prims, v); },
  [](void* d, wp_color_manager_v1*) { static_cast<HdrCapabilityProbe::Wl*>(d)->supportDone = true; }};

static const wl_registry_listener kRegistry = {
  [](void* data, wl_registry* r, uint32_t name, const char* iface, uint32_t version) {
    auto* w = static_cast<HdrCapabilityProbe::Wl*>(data);
    if (!strcmp(iface, wp_color_manager_v1_interface.name)) {
      w->cm = static_cast<wp_color_manager_v1*>(wl_registry_bind(r, name, &wp_color_manager_v1_interface, std::min(version, 1u)));
      // At once: the supported_* events follow the bind and are lost to a proxy without a listener.
      wp_color_manager_v1_add_listener(w->cm, &kCm, w);
    }
  },
  [](void*, wl_registry*, uint32_t) {}};


static const wp_image_description_v1_listener kDesc = {
  [](void* data, wp_image_description_v1*, uint32_t, const char* msg) { auto* w = static_cast<HdrCapabilityProbe::Wl*>(data); w->state = -1; w->info.error = QString::fromUtf8(msg); },
  [](void* data, wp_image_description_v1*, uint32_t) { static_cast<HdrCapabilityProbe::Wl*>(data)->state = 1; }};

static const wp_image_description_info_v1_listener kInfo = {
  [](void* data, wp_image_description_info_v1*) { static_cast<HdrCapabilityProbe::Wl*>(data)->infoDone = true; },
  [](void*, wp_image_description_info_v1*, int32_t fd, uint32_t) { close(fd); },
  [](void*, wp_image_description_info_v1*, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t) {},
  [](void* data, wp_image_description_info_v1*, uint32_t p) { static_cast<HdrCapabilityProbe::Wl*>(data)->info.primaries = p < 11 ? kPrim[p] : "other"; },
  [](void*, wp_image_description_info_v1*, uint32_t) {},
  [](void* data, wp_image_description_info_v1*, uint32_t tf) { static_cast<HdrCapabilityProbe::Wl*>(data)->info.transfer = tf < 14 ? kTf[tf] : "other"; },
  [](void* data, wp_image_description_info_v1*, uint32_t mn, uint32_t mx, uint32_t ref) {
    auto* w = static_cast<HdrCapabilityProbe::Wl*>(data); w->info.minLuminance = mn / 10000.0; w->info.maxLuminance = int(mx); w->info.referenceLuminance = int(ref); },
  [](void*, wp_image_description_info_v1*, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t) {},
  [](void*, wp_image_description_info_v1*, uint32_t, uint32_t) {},
  [](void* data, wp_image_description_info_v1*, uint32_t mx) { auto* w = static_cast<HdrCapabilityProbe::Wl*>(data); if (w->info.maxLuminance < 0) w->info.maxLuminance = int(mx); },
  [](void*, wp_image_description_info_v1*, uint32_t) {}};

static const wp_color_management_output_v1_listener kOut = {
  [](void* data, wp_color_management_output_v1*) {
    // The compositor changed this output's description (mode switch, HDR toggled): probe again.
    QMetaObject::invokeMethod(&HdrCapabilityProbe::instance(), [] { HdrCapabilityProbe::instance().probe(); }, Qt::QueuedConnection);
    (void)data;
  }};
static void readOutputDescription(HdrCapabilityProbe::Wl* w, wp_color_management_output_v1* out)
{
  w->state = 0; w->info = DisplayInfo(); w->infoDone = false;
  wp_image_description_v1* desc = wp_color_management_output_v1_get_image_description(out);
  wp_image_description_v1_add_listener(desc, &kDesc, w);
  for (int i = 0; i < 5 && w->state == 0; ++i) wl_display_roundtrip_queue(w->display, w->queue);
  if (w->state == 1) {
    wp_image_description_info_v1* inf = wp_image_description_v1_get_information(desc);
    wp_image_description_info_v1_add_listener(inf, &kInfo, w);
    for (int i = 0; i < 5 && !w->infoDone; ++i) wl_display_roundtrip_queue(w->display, w->queue);
  }
  wp_image_description_v1_destroy(desc);
}
#endif

void HdrCapabilityProbe::probe()
{
  DisplayInfo info;
  const QString platform = QGuiApplication::platformName();
#ifdef ICEFIN_WAYLAND_CM
  if (platform.startsWith("wayland") && m_window && m_window->screen()) {
    info.source = "wayland";
    auto* app = qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>();
    auto* scr = m_window->screen()->nativeInterface<QNativeInterface::QWaylandScreen>();
    if (!app || !scr || !app->display() || !scr->output()) info.error = "no Wayland handles from Qt";
    else {
      if (!m_wl) {
        m_wl = new Wl;
        m_wl->display = app->display();
        m_wl->queue = wl_display_create_queue(m_wl->display);
        m_wl->wrapper = static_cast<wl_display*>(wl_proxy_create_wrapper(m_wl->display));
        wl_proxy_set_queue(reinterpret_cast<wl_proxy*>(m_wl->wrapper), m_wl->queue);
        wl_registry* reg = wl_display_get_registry(m_wl->wrapper);
        wl_registry_add_listener(reg, &kRegistry, m_wl);
        wl_display_roundtrip_queue(m_wl->display, m_wl->queue);
        for (int i = 0; i < 3 && m_wl->cm && !m_wl->supportDone; ++i) wl_display_roundtrip_queue(m_wl->display, m_wl->queue);
        // Qt reads the socket and files our objects' events on our queue, but only we dispatch it. Without this, the
        // output's "description changed" event (HDR turned on or off in the display settings) waits until the next
        // probe and the toggle goes unnoticed.
        auto* pump = new QTimer(this);
        pump->setInterval(1000);
        connect(pump, &QTimer::timeout, this, [this] { if (m_wl) wl_display_dispatch_queue_pending(m_wl->display, m_wl->queue); });
        pump->start();
      }
      Wl* w = m_wl;
      if (!w->cm) info.error = "the compositor has no wp_color_manager_v1";
      else {
        if (w->out) wp_color_management_output_v1_destroy(w->out);
        auto* output = scr->output();
        // The output proxy belongs to Qt's queue; the objects created from it are moved to ours.
        w->out = wp_color_manager_v1_get_output(w->cm, output);
        wl_proxy_set_queue(reinterpret_cast<wl_proxy*>(w->out), w->queue);
        wp_color_management_output_v1_add_listener(w->out, &kOut, w);
        readOutputDescription(w, w->out);
        info.transfer = w->info.transfer;
        info.primaries = w->info.primaries;
        info.maxLuminance = w->info.maxLuminance;
        info.referenceLuminance = w->info.referenceLuminance;
        info.minLuminance = w->info.minLuminance;
        info.error = w->state == 1 ? QString() : w->info.error.isEmpty() ? QString("no image description") : w->info.error;
        info.hdr = hdrForTransfer(info.transfer, info.maxLuminance, info.referenceLuminance);
      }
    }
  } else
#endif
  {
    info.source = platform.startsWith("wayland") ? "wayland" : "x11";
    info.error = platform.startsWith("wayland") ? "built without the color-management protocol"
                                               : "X11/Gamescope: read from the Vulkan surface once the Vulkan renderer exists (5.6)";
  }
  m_info = info;
  qInfo().noquote() << "Icefin display:" << (info.hdr == DisplayInfo::Hdr::Yes ? "HDR" : info.hdr == DisplayInfo::Hdr::No ? "SDR" : "unknown")
                    << info.source << info.transfer << info.primaries
                    << (info.maxLuminance >= 0 ? QString("max %1 nits, reference %2").arg(info.maxLuminance).arg(info.referenceLuminance) : QString())
                    << (info.error.isEmpty() ? QString() : "(" + info.error + ")");
  emit changed(info.toMap());
}

bool HdrCapabilityProbe::canTagHdr10() const
{
#ifdef ICEFIN_WAYLAND_CM
  if (!m_wl || !m_wl->cm) return false;
  const Wl* w = m_wl;
  auto has = [](uint32_t mask, uint32_t v) { return (mask >> v) & 1u; };
  return has(w->features, WP_COLOR_MANAGER_V1_FEATURE_PARAMETRIC) && has(w->features, WP_COLOR_MANAGER_V1_FEATURE_SET_LUMINANCES)
         && has(w->tfs, WP_COLOR_MANAGER_V1_TRANSFER_FUNCTION_ST2084_PQ) && has(w->prims, WP_COLOR_MANAGER_V1_PRIMARIES_BT2020)
         && has(w->intents, WP_COLOR_MANAGER_V1_RENDER_INTENT_PERCEPTUAL);
#else
  return false;
#endif
}

#ifdef ICEFIN_WAYLAND_CM
struct DescWait { int state = 0; QString error; };
static const wp_image_description_v1_listener kTagDesc = {
  [](void* data, wp_image_description_v1*, uint32_t, const char* msg) { if (auto* s = static_cast<DescWait*>(data)) { s->state = -1; s->error = QString::fromUtf8(msg); } },
  [](void* data, wp_image_description_v1*, uint32_t) { if (auto* s = static_cast<DescWait*>(data)) s->state = 1; }};

static bool chromaticityOk(double v) { return v > 0.0 && v < 1.0; }
#endif

QString HdrCapabilityProbe::tagSurface(QWindow* window, const SurfaceDescription& d)
{
#if defined(ICEFIN_WAYLAND_CM) && defined(ICEFIN_WL_SURFACE)
  if (!m_wl || !m_wl->cm) return "the compositor has no wp_color_manager_v1";
  if (d.kind == SurfaceDescription::Kind::Hdr10 && !canTagHdr10()) return "the compositor can't take an HDR10 description";
  Wl* w = m_wl;
  QPlatformNativeInterface* ni = QGuiApplication::platformNativeInterface();
  auto* s = ni && window ? static_cast<wl_surface*>(ni->nativeResourceForWindow("surface", window)) : nullptr;
  if (!s) return "the window has no wl_surface yet";
  if (w->surface && w->taggedSurface != s) {  // the window got a new surface (hidden and shown again)
    wp_color_management_surface_v1_destroy(w->surface);
    w->surface = nullptr;
  }
  if (!w->surface) {
    w->surface = wp_color_manager_v1_get_surface(w->cm, s);
    w->taggedSurface = s;
  }
  if (d.kind == SurfaceDescription::Kind::None) {
    wp_color_management_surface_v1_unset_image_description(w->surface);
    if (w->tag) wp_image_description_v1_destroy(w->tag);
    w->tag = nullptr;
  } else {
    auto* c = wp_color_manager_v1_create_parametric_creator(w->cm);
    wp_image_description_creator_params_v1_set_tf_named(c, WP_COLOR_MANAGER_V1_TRANSFER_FUNCTION_ST2084_PQ);
    wp_image_description_creator_params_v1_set_primaries_named(c, WP_COLOR_MANAGER_V1_PRIMARIES_BT2020);
    // PQ: max is min + 10000 whatever is sent; the reference white is where the compositor pass put SDR white.
    wp_image_description_creator_params_v1_set_luminances(c, 50 /* 0.005 */, 10000, uint32_t(std::max(d.referenceWhite, 1)));
    if ((w->features >> WP_COLOR_MANAGER_V1_FEATURE_SET_MASTERING_DISPLAY_PRIMARIES) & 1u) {
      bool prim = d.hasMasteringPrimaries;
      for (double v : d.masteringPrimaries) prim = prim && chromaticityOk(v);
      if (prim) {
        auto m = [&](int i) { return int32_t(qRound(d.masteringPrimaries[i] * 1e6)); };
        wp_image_description_creator_params_v1_set_mastering_display_primaries(c, m(0), m(1), m(2), m(3), m(4), m(5), m(6), m(7));
      }
      if (d.masteringMaxLuminance > 0 && d.masteringMaxLuminance <= 10000 && d.masteringMinLuminance >= 0
          && d.masteringMaxLuminance > d.masteringMinLuminance)
        wp_image_description_creator_params_v1_set_mastering_luminance(c, uint32_t(qRound(d.masteringMinLuminance * 10000)),
                                                                       uint32_t(d.masteringMaxLuminance));
    }
    if (d.maxCll > 0) wp_image_description_creator_params_v1_set_max_cll(c, uint32_t(std::min(d.maxCll, 10000)));
    if (d.maxFall > 0) wp_image_description_creator_params_v1_set_max_fall(c, uint32_t(std::min(d.maxFall, 10000)));
    wp_image_description_v1* desc = wp_image_description_creator_params_v1_create(c);
    DescWait wait;
    wp_image_description_v1_add_listener(desc, &kTagDesc, &wait);
    for (int i = 0; i < 5 && wait.state == 0; ++i) wl_display_roundtrip_queue(w->display, w->queue);
    if (wait.state != 1) {
      wp_image_description_v1_destroy(desc);
      const QString err = wait.error.isEmpty() ? QString("the compositor didn't answer") : wait.error;
      qWarning().noquote() << "Icefin display: the compositor refused the surface description" << d.summary() << "(" + err + ")";
      return err;
    }
    wp_image_description_v1_set_user_data(desc, nullptr);
    wp_color_management_surface_v1_set_image_description(w->surface, desc, WP_COLOR_MANAGER_V1_RENDER_INTENT_PERCEPTUAL);
    if (w->tag) wp_image_description_v1_destroy(w->tag);
    w->tag = desc;
  }
  wl_display_flush(w->display);
  m_tag = d;
  window->requestUpdate();  // the description applies with the surface's next commit
  qInfo().noquote() << "Icefin display: surface tagged" << d.summary();
  return {};
#else
  Q_UNUSED(window); Q_UNUSED(d);
  return "built without the color-management protocol or Qt's platform headers";
#endif
}

bool HdrCapabilityProbe::anyScreenHdr()
{
#ifdef ICEFIN_WAYLAND_CM
  if (!m_wl || !m_wl->cm) return m_info.hdr == DisplayInfo::Hdr::Yes;
  Wl* w = m_wl;
  for (QScreen* screen : QGuiApplication::screens()) {
    auto* scr = screen->nativeInterface<QNativeInterface::QWaylandScreen>();
    if (!scr || !scr->output()) continue;
    auto* out = wp_color_manager_v1_get_output(w->cm, scr->output());
    wl_proxy_set_queue(reinterpret_cast<wl_proxy*>(out), w->queue);
    const DisplayInfo keep = w->info;
    readOutputDescription(w, out);
    const bool hdr = w->state == 1 && hdrForTransfer(w->info.transfer, w->info.maxLuminance, w->info.referenceLuminance) == DisplayInfo::Hdr::Yes;
    qInfo().noquote() << "Icefin display: screen" << screen->name() << (hdr ? "HDR" : "SDR") << w->info.transfer
                      << QString("max %1 nits, reference %2").arg(w->info.maxLuminance).arg(w->info.referenceLuminance);
    w->info = keep;
    wp_color_management_output_v1_destroy(out);
    if (hdr) return true;
  }
  return false;
#else
  return m_info.hdr == DisplayInfo::Hdr::Yes;
#endif
}
}
