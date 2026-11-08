// Spike 2.2: patched libmpv renders through libplacebo (gpu-next) into a VkImage on the Vulkan device Qt Quick
// uses, and the image is drawn as a scene-graph texture with no copies.
// Usage: spike-libmpv-vulkan FILE [--out result.json] [--seconds N]
// Prints one JSON line: device/feature setup, mpv video-params, frames rendered, and pixel checks on a window grab.
#include <QGuiApplication>
#include <QQuickWindow>
#include <QQuickItem>
#include <QQuickGraphicsDevice>
#include <QSGSimpleTextureNode>
#include <QSGRendererInterface>
#include <QVulkanInstance>
#include <QVulkanFunctions>
#include <unistd.h>
#include <clocale>
#include <QJsonObject>
#include <QJsonDocument>
#include <QJsonArray>
#include <QTimer>
#include <QFile>
#include <QImage>
#include <atomic>
#include <cstdio>
#include <vector>
#include <mpv/client.h>
#include <mpv/render.h>
#include <mpv/render_vk.h>

static QJsonObject R;
static VkPhysicalDevice gPhys = VK_NULL_HANDLE;
static VkDevice gDev = VK_NULL_HANDLE;
static uint32_t gFamily = 0;
static VkPhysicalDeviceFeatures2 gFeat{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2};
static VkPhysicalDeviceVulkan11Features gF11{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_1_FEATURES};
static VkPhysicalDeviceVulkan12Features gF12{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES};
static VkPhysicalDeviceVulkan13Features gF13{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES};
static std::vector<const char*> gExts;

// Create the one device both Qt and libplacebo use: every supported feature on, explicitly (SPEC rendering §1).
static bool createDevice(QVulkanInstance& inst) {
  auto vk = inst.functions();
  uint32_t n = 0; vk->vkEnumeratePhysicalDevices(inst.vkInstance(), &n, nullptr);
  std::vector<VkPhysicalDevice> devs(n); vk->vkEnumeratePhysicalDevices(inst.vkInstance(), &n, devs.data());
  if (!n) return false;
  gPhys = devs[0];
  VkPhysicalDeviceProperties props; vk->vkGetPhysicalDeviceProperties(gPhys, &props);
  R["device"] = props.deviceName;
  R["device_api"] = QString("%1.%2").arg(VK_VERSION_MAJOR(props.apiVersion)).arg(VK_VERSION_MINOR(props.apiVersion));
  uint32_t qn = 0; vk->vkGetPhysicalDeviceQueueFamilyProperties(gPhys, &qn, nullptr);
  std::vector<VkQueueFamilyProperties> qf(qn); vk->vkGetPhysicalDeviceQueueFamilyProperties(gPhys, &qn, qf.data());
  for (uint32_t i = 0; i < qn; ++i) if (qf[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) { gFamily = i; break; }
  gFeat.pNext = &gF11; gF11.pNext = &gF12; gF12.pNext = &gF13;
  auto getFeat2 = reinterpret_cast<PFN_vkGetPhysicalDeviceFeatures2>(inst.getInstanceProcAddr("vkGetPhysicalDeviceFeatures2"));
  getFeat2(gPhys, &gFeat);  // query supported = enable all supported
  R["timelineSemaphore"] = bool(gF12.timelineSemaphore); R["hostQueryReset"] = bool(gF12.hostQueryReset);
  // Extensions: swapchain for Qt plus whatever libplacebo can use, if present.
  uint32_t en = 0; vk->vkEnumerateDeviceExtensionProperties(gPhys, nullptr, &en, nullptr);
  std::vector<VkExtensionProperties> avail(en); vk->vkEnumerateDeviceExtensionProperties(gPhys, nullptr, &en, avail.data());
  for (const char* want : {VK_KHR_SWAPCHAIN_EXTENSION_NAME, "VK_KHR_external_memory_fd", "VK_KHR_external_semaphore_fd",
                           "VK_EXT_external_memory_dma_buf", "VK_EXT_image_drm_format_modifier", "VK_KHR_push_descriptor",
                           "VK_EXT_hdr_metadata", "VK_KHR_video_queue", "VK_KHR_video_decode_queue"})
    for (auto& a : avail) if (!qstrcmp(a.extensionName, want)) { gExts.push_back(want); break; }
  QJsonArray ex; for (auto e : gExts) ex.append(e); R["device_extensions"] = ex;
  float prio = 1.0f;
  VkDeviceQueueCreateInfo qci{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO, nullptr, 0, gFamily, 1, &prio};
  VkDeviceCreateInfo dci{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
  dci.pNext = &gFeat; dci.queueCreateInfoCount = 1; dci.pQueueCreateInfos = &qci;
  dci.enabledExtensionCount = uint32_t(gExts.size()); dci.ppEnabledExtensionNames = gExts.data();
  return vk->vkCreateDevice(gPhys, &dci, nullptr, &gDev) == VK_SUCCESS;
}

class MpvItem : public QQuickItem {
  Q_OBJECT
public:
  mpv_handle* mpv = nullptr;
  mpv_render_context* ctx = nullptr;
  VkImage img = VK_NULL_HANDLE; VkImageView view = VK_NULL_HANDLE; VkDeviceMemory mem = VK_NULL_HANDLE;
  VkImageLayout layout = VK_IMAGE_LAYOUT_UNDEFINED;
  QSize sz{640, 360};
  std::atomic<int> frames{0}; std::atomic<bool> dirty{true};
  QString file;
  MpvItem() { setFlag(ItemHasContents, true); }

  void initMpv() {
    mpv = mpv_create();
    mpv_set_option_string(mpv, "vo", "libmpv");
    mpv_set_option_string(mpv, "hwdec", "no");
    mpv_set_option_string(mpv, "loop-file", "inf");
    mpv_set_option_string(mpv, "audio", "no");
    mpv_set_option_string(mpv, "terminal", "yes");
    mpv_set_option_string(mpv, "msg-level", "all=warn,vo=info");
    mpv_initialize(mpv);
  }
  // Render thread, before Qt records its frame: same thread and queue as Qt, so queue access is serialized.
  void render() {
    auto ri = window()->rendererInterface();
    if (!ctx) {
      auto inst = static_cast<QVulkanInstance*>(ri->getResource(window(), QSGRendererInterface::VulkanInstanceResource));
      VkQueue q = *static_cast<VkQueue*>(ri->getResource(window(), QSGRendererInterface::CommandQueueResource));
      mpv_vulkan_init_params vp{};
      vp.instance = inst->vkInstance(); vp.physical_device = gPhys; vp.device = gDev;
      vp.graphics_queue = q; vp.graphics_queue_family = gFamily;
      vp.get_instance_proc_addr = reinterpret_cast<PFN_vkGetInstanceProcAddr>(inst->getInstanceProcAddr("vkGetInstanceProcAddr"));
      vp.features = &gFeat; vp.extensions = gExts.data(); vp.num_extensions = int(gExts.size());
      mpv_render_param p[] = {{MPV_RENDER_PARAM_API_TYPE, const_cast<char*>(MPV_RENDER_API_TYPE_VULKAN)},
                              {MPV_RENDER_PARAM_BACKEND, const_cast<char*>("gpu-next")},
                              {MPV_RENDER_PARAM_VULKAN_INIT_PARAMS, &vp}, {MPV_RENDER_PARAM_INVALID, nullptr}};
      int rc = mpv_render_context_create(&ctx, mpv, p);
      R["render_context"] = rc >= 0 ? "ok" : QString(mpv_error_string(rc));
      if (rc < 0) { ctx = nullptr; return; }
      mpv_render_context_set_update_callback(ctx, [](void* s) { static_cast<MpvItem*>(s)->dirty = true;
        QMetaObject::invokeMethod(static_cast<MpvItem*>(s), "update", Qt::QueuedConnection); }, this);
      createImage(inst);
      QByteArray f = file.toUtf8(); const char* cmd[] = {"loadfile", f.constData(), nullptr}; mpv_command_async(mpv, 0, cmd);
    }
    if (!dirty.exchange(false)) return;
    if (!(mpv_render_context_update(ctx) & MPV_RENDER_UPDATE_FRAME)) return;
    mpv_vulkan_fbo fbo{img, view, uint32_t(sz.width()), uint32_t(sz.height()), VK_FORMAT_R8G8B8A8_UNORM, layout,
                       VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL};
    mpv_render_param p[] = {{MPV_RENDER_PARAM_VULKAN_FBO, &fbo}, {MPV_RENDER_PARAM_INVALID, nullptr}};
    if (mpv_render_context_render(ctx, p) >= 0) { layout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL; frames++; }
  }
  void createImage(QVulkanInstance* inst) {
    auto df = inst->deviceFunctions(gDev); auto f = inst->functions();
    VkImageCreateInfo ici{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
    ici.imageType = VK_IMAGE_TYPE_2D; ici.format = VK_FORMAT_R8G8B8A8_UNORM; ici.extent = {uint32_t(sz.width()), uint32_t(sz.height()), 1};
    ici.mipLevels = 1; ici.arrayLayers = 1; ici.samples = VK_SAMPLE_COUNT_1_BIT; ici.tiling = VK_IMAGE_TILING_OPTIMAL;
    ici.usage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT
              | VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_STORAGE_BIT;
    ici.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    df->vkCreateImage(gDev, &ici, nullptr, &img);
    VkMemoryRequirements mr; df->vkGetImageMemoryRequirements(gDev, img, &mr);
    VkPhysicalDeviceMemoryProperties mp; f->vkGetPhysicalDeviceMemoryProperties(gPhys, &mp);
    uint32_t type = 0; for (uint32_t i = 0; i < mp.memoryTypeCount; ++i)
      if ((mr.memoryTypeBits & (1u << i)) && (mp.memoryTypes[i].propertyFlags & VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)) { type = i; break; }
    VkMemoryAllocateInfo ai{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO, nullptr, mr.size, type};
    df->vkAllocateMemory(gDev, &ai, nullptr, &mem); df->vkBindImageMemory(gDev, img, mem, 0);
    VkImageViewCreateInfo vci{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
    vci.image = img; vci.viewType = VK_IMAGE_VIEW_TYPE_2D; vci.format = VK_FORMAT_R8G8B8A8_UNORM;
    vci.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    df->vkCreateImageView(gDev, &vci, nullptr, &view);
  }
protected:
  QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData*) override {
    auto node = static_cast<QSGSimpleTextureNode*>(old);
    if (!img || !frames) return node;
    if (!node) {
      node = new QSGSimpleTextureNode;
      node->setTexture(QNativeInterface::QSGVulkanTexture::fromNative(img, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, window(), sz));
      node->setOwnsTexture(true);
    }
    node->setRect(boundingRect());
    node->markDirty(QSGNode::DirtyMaterial);
    return node;
  }
};

static QString prop(mpv_handle* m, const char* name) { char* s = mpv_get_property_string(m, name); QString r = s ? s : ""; mpv_free(s); return r; }

int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: %s FILE [--out json] [--seconds N]\n", argv[0]); return 2; }
  QString out; int secs = 8;
  for (int i = 2; i + 1 < argc; ++i) { if (!qstrcmp(argv[i], "--out")) out = argv[++i]; else if (!qstrcmp(argv[i], "--seconds")) secs = atoi(argv[++i]); }
  QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
  QGuiApplication app(argc, argv);
  std::setlocale(LC_NUMERIC, "C");  // libmpv requirement
  QVulkanInstance inst; inst.setApiVersion(QVersionNumber(1, 3));
  if (!inst.create()) { std::printf("{\"error\":\"vulkan instance\"}\n"); return 3; }
  if (!createDevice(inst)) { std::printf("{\"error\":\"vulkan device\"}\n"); return 3; }
  QQuickWindow win; win.setVulkanInstance(&inst);
  win.setGraphicsDevice(QQuickGraphicsDevice::fromDeviceObjects(gPhys, gDev, int(gFamily), 0));
  win.resize(640, 360); win.setColor(Qt::black);
  MpvItem item; item.file = argv[1]; item.setParentItem(win.contentItem()); item.setSize(QSizeF(640, 360));
  item.initMpv();
  QObject::connect(&win, &QQuickWindow::beforeRendering, &item, [&] { item.render(); }, Qt::DirectConnection);
  win.show();
  QTimer::singleShot(secs * 1000, &app, [&] {
    auto api = win.rendererInterface()->graphicsApi();
    R["qt"] = qVersion(); R["qpa"] = QGuiApplication::platformName();
    R["graphicsApi"] = api == QSGRendererInterface::Vulkan ? "vulkan" : "other";
    R["shared_device"] = *static_cast<VkDevice*>(win.rendererInterface()->getResource(&win, QSGRendererInterface::DeviceResource)) == gDev;
    R["frames_rendered"] = int(item.frames);
    R["video_params"] = QString("%1/%2/%3").arg(prop(item.mpv, "video-params/primaries"), prop(item.mpv, "video-params/gamma"), prop(item.mpv, "video-params/pixelformat"));
    R["vo"] = prop(item.mpv, "current-vo");
    QImage g = win.grabWindow();
    auto c = [&](double fx, double fy) { return g.pixelColor(int(g.width() * fx), int(g.height() * fy)); };
    QColor l = c(0.25, 0.5), r = c(0.75, 0.5);
    R["left_rgb"] = l.name(); R["right_rgb"] = r.name();
    R["red_green_ok"] = l.red() > 200 && l.green() < 60 && r.green() > 200 && r.red() < 60;
    R["nonblack"] = (l.red() + l.green() + l.blue() + r.red() + r.green() + r.blue()) > 60;
    R["ok"] = R["render_context"] == "ok" && R["shared_device"].toBool() && item.frames > 10 && R["nonblack"].toBool();
    QByteArray j = QJsonDocument(R).toJson(QJsonDocument::Compact);
    std::printf("%s\n", j.constData()); std::fflush(stdout);
    if (!out.isEmpty()) { QFile f(out); if (f.open(QIODevice::WriteOnly)) f.write(j); g.save(out + ".png"); }
    _exit(R["ok"].toBool() ? 0 : 1);  // skip teardown ordering for the spike
  });
  return app.exec();
}
#include "main.moc"
