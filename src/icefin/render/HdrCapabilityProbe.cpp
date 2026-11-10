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
#endif

namespace Icefin::Render
{
QVariantMap DisplayInfo::toMap() const
{
  return {{"hdr", hdr == Hdr::Yes ? "yes" : hdr == Hdr::No ? "no" : "unknown"}, {"transfer", transfer}, {"primaries", primaries},
          {"maxLuminance", maxLuminance}, {"referenceLuminance", referenceLuminance}, {"source", source}, {"error", error}};
}

DisplayInfo::Hdr hdrForTransfer(const QString& tf, int maxLuminance, int referenceLuminance)
{
  if (tf == "st2084_pq" || tf == "hlg") return DisplayInfo::Hdr::Yes;
  if (tf.isEmpty()) return DisplayInfo::Hdr::Unknown;
  if (maxLuminance > 0 && referenceLuminance > 0 && maxLuminance * 2 >= referenceLuminance * 3) return DisplayInfo::Hdr::Yes;
  return DisplayInfo::Hdr::No;
}

HdrCapabilityProbe& HdrCapabilityProbe::instance() { static HdrCapabilityProbe p; return p; }

void HdrCapabilityProbe::attach(QWindow* window)
{
  if (!window || m_window == window) return;
  m_window = window;
  connect(window, &QWindow::screenChanged, this, [this] { qInfo() << "Icefin display: window moved to another screen, probing again"; probe(); });
  probe();
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
};

static const wl_registry_listener kRegistry = {
  [](void* data, wl_registry* r, uint32_t name, const char* iface, uint32_t version) {
    auto* w = static_cast<HdrCapabilityProbe::Wl*>(data);
    if (!strcmp(iface, wp_color_manager_v1_interface.name))
      w->cm = static_cast<wp_color_manager_v1*>(wl_registry_bind(r, name, &wp_color_manager_v1_interface, std::min(version, 1u)));
  },
  [](void*, wl_registry*, uint32_t) {}};

static const wp_color_manager_v1_listener kCm = {
  [](void*, wp_color_manager_v1*, uint32_t) {}, [](void*, wp_color_manager_v1*, uint32_t) {},
  [](void*, wp_color_manager_v1*, uint32_t) {}, [](void*, wp_color_manager_v1*, uint32_t) {}, [](void*, wp_color_manager_v1*) {}};

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
  [](void* data, wp_image_description_info_v1*, uint32_t, uint32_t mx, uint32_t ref) {
    auto* w = static_cast<HdrCapabilityProbe::Wl*>(data); w->info.maxLuminance = int(mx); w->info.referenceLuminance = int(ref); },
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
        if (m_wl->cm) wp_color_manager_v1_add_listener(m_wl->cm, &kCm, m_wl);
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
        w->state = 0; w->info = DisplayInfo(); w->infoDone = false;
        wp_image_description_v1* desc = wp_color_management_output_v1_get_image_description(w->out);
        wp_image_description_v1_add_listener(desc, &kDesc, w);
        for (int i = 0; i < 5 && w->state == 0; ++i) wl_display_roundtrip_queue(w->display, w->queue);
        if (w->state == 1) {
          wp_image_description_info_v1* inf = wp_image_description_v1_get_information(desc);
          wp_image_description_info_v1_add_listener(inf, &kInfo, w);
          for (int i = 0; i < 5 && !w->infoDone; ++i) wl_display_roundtrip_queue(w->display, w->queue);
        }
        wp_image_description_v1_destroy(desc);
        info.transfer = w->info.transfer;
        info.primaries = w->info.primaries;
        info.maxLuminance = w->info.maxLuminance;
        info.referenceLuminance = w->info.referenceLuminance;
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
}
