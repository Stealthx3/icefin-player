#include "VulkanDevice.h"
#include <QDebug>
#include <QQuickGraphicsDevice>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QVulkanFunctions>
#include <QVulkanInstance>
#include <QVersionNumber>
#include <vector>
#include "settings/SettingsComponent.h"
#include "VulkanVideo.h"
#include "Compositing.h"
#include "HdrCapabilityProbe.h"
#include "RouterComponent.h"
#include <QGuiApplication>
#if __has_include(<rhi/qrhi.h>)
#include <rhi/qrhi.h>
#define ICEFIN_DEVICE_RHI 1
#endif
// Qt's swapchain handle for VK_EXT_hdr_metadata (5.6): QRhi has no public accessor, so Qt's private QVkSwapChain.
#if defined(ICEFIN_DEVICE_RHI) && __has_include(<QtGui/private/qrhivulkan_p.h>)
#include <QtGui/private/qrhivulkan_p.h>
#define ICEFIN_QVK_SWAPCHAIN 1
#endif
#include <memory>

namespace Icefin::Render
{
RendererChoice rendererChoiceFrom(const QString& setting)
{
  if (setting == "vulkan") return RendererChoice::Vulkan;
  if (setting == "opengl") return RendererChoice::OpenGl;
  return RendererChoice::Auto;
}

bool useVulkan(RendererChoice choice, bool vulkanUsable, bool videoPath)
{
  switch (choice) {
    case RendererChoice::OpenGl: return false;
    case RendererChoice::Vulkan: return vulkanUsable;
    case RendererChoice::Auto: return vulkanUsable && videoPath;
  }
  return false;
}

bool vulkanVideoPath() { return vulkanVideoCompiled(); }
bool autoPicksVulkan() { return false; }   // 5.8 parity, D23
bool vulkanHdrOutput()
{
  const CompositorState& cs = compositorState();
  return cs.active && cs.output == OutputEncoding::Hdr10 && cs.tagged;
}

QList<WantedExtension> wantedDeviceExtensions()
{
  const uint32_t v12 = VK_API_VERSION_1_2, v13 = VK_API_VERSION_1_3;
  return {
    {VK_KHR_SWAPCHAIN_EXTENSION_NAME, VK_API_VERSION_1_0, true},
    {"VK_KHR_external_memory_fd", VK_API_VERSION_1_1, false},
    {"VK_KHR_external_semaphore_fd", VK_API_VERSION_1_1, false},
    {"VK_EXT_external_memory_dma_buf", VK_API_VERSION_1_1, false},
    {"VK_EXT_image_drm_format_modifier", v12, false},  // needs image_format_list (core 1.2)
    {"VK_EXT_queue_family_foreign", VK_API_VERSION_1_1, false},
    {"VK_KHR_push_descriptor", VK_API_VERSION_1_1, false},
    {"VK_EXT_hdr_metadata", VK_API_VERSION_1_0, false},
    {"VK_KHR_video_queue", v13, false},  // needs synchronization2 (core 1.3)
    {"VK_KHR_video_decode_queue", v13, false},
    {"VK_KHR_video_decode_h264", v13, false},
    {"VK_KHR_video_decode_h265", v13, false},
    {"VK_KHR_video_decode_av1", v13, false},
  };
}

QList<QByteArray> pickDeviceExtensions(const QList<QByteArray>& available, uint32_t deviceApi)
{
  QList<QByteArray> out;
  bool videoQueue = false;
  for (const WantedExtension& w : wantedDeviceExtensions()) {
    const bool usable = available.contains(QByteArray(w.name)) && deviceApi >= w.minApi;
    if (!usable) {
      if (w.required) return {};
      continue;
    }
    const QByteArray n(w.name);
    if (n.startsWith("VK_KHR_video_decode") && !videoQueue) continue;  // decode extensions need video_queue
    if (n == "VK_KHR_video_queue") videoQueue = true;
    out << n;
  }
  return out;
}

// Tests only: ICEFIN_RENDERER_ALLOW_SOFTWARE=1 accepts a CPU Vulkan device (the lab VM's lavapipe), so the shared
// device path runs without a GPU.
static bool allowSoftware() { return qEnvironmentVariableIntValue("ICEFIN_RENDERER_ALLOW_SOFTWARE") == 1; }

static bool probeVulkan(QString* why)
{
  QVulkanInstance inst;
  inst.setApiVersion(QVersionNumber(1, 2));
  if (!inst.create()) { *why = "no Vulkan instance (no driver?)"; return false; }
  QVulkanFunctions* f = inst.functions();
  uint32_t n = 0;
  f->vkEnumeratePhysicalDevices(inst.vkInstance(), &n, nullptr);
  std::vector<VkPhysicalDevice> devs(n);
  f->vkEnumeratePhysicalDevices(inst.vkInstance(), &n, devs.data());
  for (VkPhysicalDevice d : devs) {
    VkPhysicalDeviceProperties p;
    f->vkGetPhysicalDeviceProperties(d, &p);
    if (p.apiVersion >= VK_API_VERSION_1_2 && (p.deviceType != VK_PHYSICAL_DEVICE_TYPE_CPU || allowSoftware())) return true;
  }
  *why = n ? "no Vulkan 1.2 GPU (software rasterizer only)" : "no Vulkan devices";
  return false;
}

void chooseGraphicsApi()
{
  const QVariant v = SettingsComponent::readPreinitValue(SETTINGS_SECTION_MAIN, "icefin_renderer");
  // ICEFIN_RENDERER (auto/vulkan/opengl) overrides the setting, for test suites that start from a fresh config.
  const QString env = qEnvironmentVariable("ICEFIN_RENDERER");
  const QString setting = !env.isEmpty() ? env : v.isValid() && !v.isNull() ? v.toString() : QString("auto");
  const RendererChoice choice = rendererChoiceFrom(setting);
  bool usable = false;
  QString why;
  const bool autoVulkan = vulkanVideoPath() && autoPicksVulkan();
  if (choice == RendererChoice::Vulkan || (choice == RendererChoice::Auto && autoVulkan)) usable = probeVulkan(&why);
  const bool vulkan = useVulkan(choice, usable, autoVulkan);
  QQuickWindow::setGraphicsApi(vulkan ? QSGRendererInterface::Vulkan : QSGRendererInterface::OpenGL);
  if (vulkan)
    qInfo().noquote() << "Icefin renderer: Vulkan (setting" << setting + ")"
                      << (vulkanVideoPath() ? QString("- video on the Vulkan path (gpu-next, SDR output until 5.4/5.5)")
                                            : QString("- this build has no Vulkan video path (patched libmpv missing): video doesn't show"));
  else if (choice == RendererChoice::Vulkan)
    qWarning().noquote() << "Icefin renderer: Vulkan chosen but not usable (" + why + "), using OpenGL";
  else
    qInfo().noquote() << "Icefin renderer: OpenGL (setting" << setting + (choice == RendererChoice::Auto ? ", Auto keeps OpenGL until the parity checks, 5.8)" : ")");
}

VulkanDevice& VulkanDevice::instance()
{
  static VulkanDevice d;
  return d;
}

bool VulkanDevice::attach(QQuickWindow* window)
{
  if (!window || QQuickWindow::graphicsApi() != QSGRendererInterface::Vulkan) return false;
  if (m_device != VK_NULL_HANDLE) return true;
  // Qt gives a Vulkan QQuickWindow its default instance only when the scene graph starts, which is too late to build
  // a device from it. So Icefin makes the instance, as Qt's default would (newest API, the swapchain colour-space
  // extension HDR needs), and sets it on the window now: on xcb and Wayland the VkSurface is created only at
  // scene-graph start, from whatever instance the window has then.
  QVulkanInstance* inst = window->vulkanInstance();
  if (!inst) {
    m_ownInstance = new QVulkanInstance;
    // At most 1.3: Qt's bundled VulkanMemoryAllocator asserts on a newer instance version (seen with Mesa's 1.4).
    const QVersionNumber v = m_ownInstance->supportedApiVersion();
    m_ownInstance->setApiVersion(QVersionNumber::compare(v, QVersionNumber(1, 3)) > 0 ? QVersionNumber(1, 3) : v);
    QByteArrayList ext;
    for (const char* e : {"VK_EXT_swapchain_colorspace", "VK_KHR_get_surface_capabilities2"})
      if (m_ownInstance->supportedExtensions().contains(QByteArray(e))) ext << e;
    m_ownInstance->setExtensions(ext);
    if (!m_ownInstance->create()) {
      qWarning() << "Icefin renderer: couldn't create the Vulkan instance (" << int(m_ownInstance->errorCode()) << "); Qt creates its own";
      delete m_ownInstance;
      m_ownInstance = nullptr;
      return false;
    }
    window->setVulkanInstance(m_ownInstance);
    inst = m_ownInstance;
  }
  if (!create(inst)) return false;
  window->setGraphicsDevice(QQuickGraphicsDevice::fromDeviceObjects(m_physical, m_device, int(m_family), 0));
  // The single-surface compositor (5.4): on with the Vulkan video path unless switched off or not built.
  CompositorState& cs = compositorState();
  cs.blend = uiBlendFromName(qEnvironmentVariable("ICEFIN_UI_BLEND"), UiBlend::Srgb);
  if (qEnvironmentVariable("ICEFIN_COMPOSITOR") == "0") cs.reason = "ICEFIN_COMPOSITOR=0";
  else if (!vulkanVideoPath()) cs.reason = "no Vulkan video path in this build";
  else if (!compositorCompiled()) cs.reason = "built without Qt ShaderTools or the RHI headers";
  else {
    QString err;
    cs.shaderUrl = compositorShaderUrl(&err);
    cs.active = !cs.shaderUrl.isEmpty();
    cs.reason = cs.active ? "Vulkan video path" : err;
  }
  // HDR output (5.5): an HDR10 swapchain when the window's display is HDR and the compositor can be told what the
  // surface holds. Qt reads the format once, when the scene graph makes the swapchain, so it is decided here; HDR
  // turned on or off on the display later applies after a restart. main.icefin_hdr_output: auto (default) or off;
  // ICEFIN_HDR_OUTPUT overrides it.
  const QVariant hv = SettingsComponent::readPreinitValue(SETTINGS_SECTION_MAIN, "icefin_hdr_output");
  QString hdrSetting = qEnvironmentVariable("ICEFIN_HDR_OUTPUT");
  if (hdrSetting.isEmpty()) hdrSetting = hv.isValid() && !hv.isNull() ? hv.toString() : QString("auto");
  if (!cs.active) cs.hdrReason = "the compositor is off";
  else if (hdrSetting == "off") cs.hdrReason = "HDR output is off in the settings";
  else if (!QGuiApplication::platformName().startsWith("wayland")) {
    // X11 / Gamescope (5.6): no protocol to ask; the Vulkan surface decides. Qt makes an HDR10 swapchain only when the
    // surface offers HDR10_ST2084 (Gamescope's WSI layer, HDR on) and an SDR one otherwise.
    window->setProperty("_qt_sg_hdr_format", QByteArray("hdr10"));
    cs.hdrRequested = true;
    cs.hdrReason = "X11: HDR10 if the Vulkan surface offers it";
  }
  else {
    HdrCapabilityProbe& probe = HdrCapabilityProbe::instance();
    probe.attach(window);  // probes the window's screen now, before the swapchain exists
    if (!probe.anyScreenHdr()) cs.hdrReason = "no display is in HDR";
    else if (!probe.canTagHdr10()) cs.hdrReason = "the compositor can't take an HDR10 surface description";
    else {
      window->setProperty("_qt_sg_hdr_format", QByteArray("hdr10"));
      cs.hdrRequested = true;
      cs.hdrReason = "HDR display";
    }
  }
  qInfo().noquote() << "Icefin renderer: HDR output" << (cs.hdrRequested ? "requested" : "off") << "(" + cs.hdrReason + ")";
  QMetaObject::invokeMethod(&RouterComponent::Get(), "refreshCompositor", Qt::QueuedConnection);
  // Once the scene graph is up, confirm Qt renders with this device rather than one of its own.
  QObject::connect(window, &QQuickWindow::sceneGraphInitialized, window, [this, window] {
    auto* ri = window->rendererInterface();
    auto* dev = ri ? static_cast<VkDevice*>(ri->getResource(window, QSGRendererInterface::DeviceResource)) : nullptr;
    const bool shared = dev && *dev == m_device;
    m_info["qtUsesSharedDevice"] = shared;
#ifdef ICEFIN_DEVICE_RHI
    // The compositor encodes for the swapchain Qt made (QSG_RHI_HDR picks HDR10 or scRGB; SDR otherwise).
    if (QRhiSwapChain* sc = window->swapChain()) {
      const QRhiSwapChain::Format f = sc->format();
      compositorState().output = f == QRhiSwapChain::HDR10 ? OutputEncoding::Hdr10
                                 : f == QRhiSwapChain::HDRExtendedSrgbLinear ? OutputEncoding::ScRgb : OutputEncoding::Sdr;
      if (!QGuiApplication::platformName().startsWith("wayland")) {
        // X11 / Gamescope (5.6): the swapchain Qt made is the display's answer; Vulkan gives no luminances, so these
        // are Qt's defaults (1000 nits, SDR white 200).
        const QRhiSwapChainHdrInfo hi = sc->hdrInfo();
        const int maxNits = hi.limitsType == QRhiSwapChainHdrInfo::LuminanceInNits ? qRound(hi.limits.luminanceInNits.maxLuminance) : 1000;
        const int white = hi.sdrWhiteLevel > 0 ? qRound(hi.sdrWhiteLevel) : 200;
        const bool hdr10 = f == QRhiSwapChain::HDR10;
        QMetaObject::invokeMethod(&HdrCapabilityProbe::instance(), [hdr10, maxNits, white] {
          HdrCapabilityProbe::instance().setFromSwapchain(hdr10, maxNits, white);
          compositorState().hdrReason = hdr10 ? "the Vulkan surface offers HDR10" : "the Vulkan surface offers no HDR10 colour space";
        }, Qt::QueuedConnection);
      }
      QMetaObject::invokeMethod(&RouterComponent::Get(), "refreshCompositor", Qt::QueuedConnection);
    }
#endif
    if (shared) qInfo() << "Icefin renderer: Qt Quick renders on the shared Vulkan device";
    else qWarning() << "Icefin renderer: Qt Quick is not on the shared Vulkan device";
  }, Qt::DirectConnection);
  // HDR10 static metadata on X11 / Gamescope (5.6): VK_EXT_hdr_metadata on Qt's swapchain, which Gamescope passes to
  // the display. Set again when the swapchain is recreated (resize) or the video's metadata changes. Wayland carries
  // it in the surface description instead (5.5).
#ifdef ICEFIN_QVK_SWAPCHAIN
  if (m_extensions.contains("VK_EXT_hdr_metadata") && !QGuiApplication::platformName().startsWith("wayland")) {
    auto gdpa = reinterpret_cast<PFN_vkGetDeviceProcAddr>(inst->getInstanceProcAddr("vkGetDeviceProcAddr"));
    auto setHdr = gdpa ? reinterpret_cast<PFN_vkSetHdrMetadataEXT>(gdpa(m_device, "vkSetHdrMetadataEXT")) : nullptr;
    if (setHdr) {
      struct Last { VkSwapchainKHR sc = VK_NULL_HANDLE; VideoHdrMetadata m; bool sent = false; };
      auto last = std::make_shared<Last>();
      const VkDevice dev = m_device;
      QObject::connect(window, &QQuickWindow::beforeRendering, window, [window, setHdr, dev, last] {
        if (compositorState().output != OutputEncoding::Hdr10) return;
        auto* qsc = static_cast<QVkSwapChain*>(window->swapChain());
        if (!qsc || qsc->sc == VK_NULL_HANDLE) return;
        const VideoHdrMetadata m = videoMetadataSnapshot();
        if (last->sent && last->sc == qsc->sc && last->m == m) return;
        VkHdrMetadataEXT md{VK_STRUCTURE_TYPE_HDR_METADATA_EXT};
        // Unknown mastering display: the BT.2020 container with D65, and the display's peak.
        double p[8] = {0.708, 0.292, 0.170, 0.797, 0.131, 0.046, 0.3127, 0.3290};
        if (m.hasPrimaries) for (int i = 0; i < 8; ++i) p[i] = m.primaries[i];
        md.displayPrimaryRed = {float(p[0]), float(p[1])};
        md.displayPrimaryGreen = {float(p[2]), float(p[3])};
        md.displayPrimaryBlue = {float(p[4]), float(p[5])};
        md.whitePoint = {float(p[6]), float(p[7])};
        md.maxLuminance = float(m.maxLuminance > 0 ? m.maxLuminance : 1000);
        md.minLuminance = float(m.minLuminance > 0 ? m.minLuminance : 0.005);
        md.maxContentLightLevel = float(m.maxCll);
        md.maxFrameAverageLightLevel = float(m.maxFall);
        VkSwapchainKHR sc = qsc->sc;
        setHdr(dev, 1, &sc, &md);
        qInfo().noquote() << QString("Icefin renderer: HDR metadata on the swapchain: mastering %1-%2 nits%3, MaxCLL %4, MaxFALL %5")
                                 .arg(md.minLuminance).arg(md.maxLuminance).arg(m.hasPrimaries ? ", mastering primaries" : ", BT.2020 container")
                                 .arg(m.maxCll).arg(m.maxFall);
        *last = {sc, m, true};
      }, Qt::DirectConnection);
    }
  }
#endif
  // Qt WebEngine 6.11 workaround: during the scene-graph sync its NativeSkiaOutputDevice::swapFrame() frees the
  // previous web frame's imported VkImage at once (vkDestroyImage + vkFreeMemory), while Qt Quick may still have a
  // frame in flight that samples it. Validation: VUID-vkDestroyImage-image-01000 from libQt6WebEngineCore; on NVIDIA
  // it hangs the GPU (Xid 109). It also frees them from render jobs Qt runs between frames. Waiting for Qt's queue
  // to go idle at the end of each frame means nothing in flight still uses that image when either runs (no GPU work
  // is submitted between a frame's end and the next sync). Costs the CPU/GPU overlap of one frame; Vulkan path only.
  // ICEFIN_VULKAN_NO_SYNC_WAIT=1 skips it.
  if (!qEnvironmentVariableIsSet("ICEFIN_VULKAN_NO_SYNC_WAIT")) {
    QVulkanDeviceFunctions* df = inst->deviceFunctions(m_device);
    QObject::connect(window, &QQuickWindow::afterFrameEnd, window, [window, df] {
      auto* ri = window->rendererInterface();
      auto* queue = ri ? static_cast<VkQueue*>(ri->getResource(window, QSGRendererInterface::CommandQueueResource)) : nullptr;
      if (queue && *queue) df->vkQueueWaitIdle(*queue);
    }, Qt::DirectConnection);
    qInfo() << "Icefin renderer: waiting for the GPU after each frame (Qt WebEngine frees web frames early)";
  }
  qInfo().noquote() << "Icefin renderer: shared Vulkan device on" << m_info.value("device").toString()
                    << "(" + m_info.value("driver").toString() + ", Vulkan " + m_info.value("api").toString() + ")"
                    << m_extensions.size() << "device extensions:" << m_info.value("extensions").toStringList().join(' ');
  return true;
}

bool VulkanDevice::create(QVulkanInstance* inst)
{
  QVulkanFunctions* f = inst->functions();
  m_instance = inst->vkInstance();
  uint32_t n = 0;
  f->vkEnumeratePhysicalDevices(m_instance, &n, nullptr);
  std::vector<VkPhysicalDevice> devs(n);
  f->vkEnumeratePhysicalDevices(m_instance, &n, devs.data());
  // A discrete GPU first, then an integrated one; Qt's own override (QT_VK_PHYSICAL_DEVICE_INDEX) still wins.
  int pick = -1, score = -1;
  bool ok = false;
  const int forced = qEnvironmentVariableIntValue("QT_VK_PHYSICAL_DEVICE_INDEX", &ok);
  for (int i = 0; i < int(n); ++i) {
    VkPhysicalDeviceProperties p;
    f->vkGetPhysicalDeviceProperties(devs[i], &p);
    if (p.apiVersion < VK_API_VERSION_1_2) continue;
    const int s = ok && forced == i ? 100 : p.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU ? 3
                : p.deviceType == VK_PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU ? 2 : p.deviceType == VK_PHYSICAL_DEVICE_TYPE_CPU ? 0 : 1;
    if (s == 0 && !allowSoftware()) continue;
    if (s > score) { score = s; pick = i; }
  }
  if (pick < 0) { qWarning() << "Icefin renderer: no Vulkan 1.2 device for the shared device; Qt creates its own"; return false; }
  m_physical = devs[pick];

  VkPhysicalDeviceProperties props;
  f->vkGetPhysicalDeviceProperties(m_physical, &props);
  const uint32_t api = props.apiVersion;
  uint32_t qn = 0;
  f->vkGetPhysicalDeviceQueueFamilyProperties(m_physical, &qn, nullptr);
  std::vector<VkQueueFamilyProperties> qf(qn);
  f->vkGetPhysicalDeviceQueueFamilyProperties(m_physical, &qn, qf.data());
  bool found = false;
  for (uint32_t i = 0; i < qn; ++i)
    if ((qf[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) && (qf[i].queueFlags & VK_QUEUE_COMPUTE_BIT)) { m_family = i; found = true; break; }
  if (!found) { qWarning() << "Icefin renderer: no graphics+compute queue; Qt creates its own device"; return false; }

  // Every supported core feature on, explicitly, except robustBufferAccess (bounds checks nobody here needs, at a
  // cost on some drivers). The 1.3 struct only when the device is 1.3.
  m_features.pNext = &m_f11;
  m_f11.pNext = &m_f12;
  m_f12.pNext = api >= VK_API_VERSION_1_3 ? static_cast<void*>(&m_f13) : nullptr;
  m_f13.pNext = nullptr;
  auto getFeatures2 = reinterpret_cast<PFN_vkGetPhysicalDeviceFeatures2>(inst->getInstanceProcAddr("vkGetPhysicalDeviceFeatures2"));
  getFeatures2(m_physical, &m_features);
  m_features.features.robustBufferAccess = VK_FALSE;

  uint32_t en = 0;
  f->vkEnumerateDeviceExtensionProperties(m_physical, nullptr, &en, nullptr);
  std::vector<VkExtensionProperties> avail(en);
  f->vkEnumerateDeviceExtensionProperties(m_physical, nullptr, &en, avail.data());
  QList<QByteArray> available;
  for (const auto& a : avail) available << QByteArray(a.extensionName);
  m_extensions = pickDeviceExtensions(available, api);
  if (m_extensions.isEmpty()) { qWarning() << "Icefin renderer: the device has no swapchain extension; Qt creates its own device"; return false; }
  m_extensionPtrs.clear();
  for (const QByteArray& e : m_extensions) m_extensionPtrs << e.constData();

  const float priority = 1.0f;
  VkDeviceQueueCreateInfo qci{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO, nullptr, 0, m_family, 1, &priority};
  VkDeviceCreateInfo dci{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
  dci.pNext = &m_features;
  dci.queueCreateInfoCount = 1;
  dci.pQueueCreateInfos = &qci;
  dci.enabledExtensionCount = uint32_t(m_extensionPtrs.size());
  dci.ppEnabledExtensionNames = m_extensionPtrs.data();
  const VkResult r = f->vkCreateDevice(m_physical, &dci, nullptr, &m_device);
  if (r != VK_SUCCESS) {
    qWarning() << "Icefin renderer: vkCreateDevice failed (" << int(r) << "); Qt creates its own device";
    m_device = VK_NULL_HANDLE;
    return false;
  }

  VkPhysicalDeviceDriverProperties drv{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_DRIVER_PROPERTIES};
  VkPhysicalDeviceProperties2 p2{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PROPERTIES_2, &drv};
  auto getProps2 = reinterpret_cast<PFN_vkGetPhysicalDeviceProperties2>(inst->getInstanceProcAddr("vkGetPhysicalDeviceProperties2"));
  getProps2(m_physical, &p2);
  QStringList exts;
  for (const QByteArray& e : m_extensions) exts << QString::fromLatin1(e);
  m_info = {
    {"device", QString::fromUtf8(props.deviceName)},
    {"driver", QString::fromUtf8(drv.driverName) + " " + QString::fromUtf8(drv.driverInfo)},
    {"api", QString("%1.%2").arg(VK_API_VERSION_MAJOR(api)).arg(VK_API_VERSION_MINOR(api))},
    {"extensions", exts},
    {"features", QVariantMap{{"timelineSemaphore", bool(m_f12.timelineSemaphore)},
                             {"hostQueryReset", bool(m_f12.hostQueryReset)},
                             {"synchronization2", api >= VK_API_VERSION_1_3 && m_f13.synchronization2},
                             {"shaderInt64", bool(m_features.features.shaderInt64)},
                             {"samplerYcbcrConversion", bool(m_f11.samplerYcbcrConversion)}}},
  };
  return true;
}
}
