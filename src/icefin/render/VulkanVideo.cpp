#include "VulkanVideo.h"
#include <QDebug>
#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QSGSimpleTextureNode>
#include <QSGTexture>
#include <MpvController>
#ifdef ICEFIN_MPV_VULKAN
#include <QVulkanDeviceFunctions>
#include <QVulkanFunctions>
#include <QVulkanInstance>
#include <mpv/client.h>
#include <mpv/render.h>
#include <mpv/render_vk.h>
#include "VulkanDevice.h"
#include "MpvTarget.h"
#include "HdrCapabilityProbe.h"
#include "Compositing.h"
#include "RouterComponent.h"
#include <QSGTexture>
#if __has_include(<rhi/qrhi.h>)
#include <rhi/qrhi.h>
#define ICEFIN_VIDEO_RHI 1
#endif
#endif

namespace Icefin::Render
{
static VulkanVideo* s_active = nullptr;

void VideoTextureProvider::setTexture(QSGTexture* t)
{
  if (t == m_texture) return;
  delete m_texture;
  m_texture = t;
  Q_EMIT textureChanged();
}

VideoTextureProvider::~VideoTextureProvider() { delete m_texture; }

VideoTextureProvider* VulkanVideo::activeProvider() { return s_active ? s_active->m_provider : nullptr; }

QSGTextureProvider* VideoTexture::textureProvider() const
{
  if (auto* p = VulkanVideo::activeProvider()) return p;
  static VideoTextureProvider* none = new VideoTextureProvider;  // no video item on the Vulkan path: no texture
  return none;
}

VulkanVideo* VulkanVideo::createFor(QQuickItem* item, MpvController* controller)
{
  if (!vulkanVideoCompiled() || !controller || QQuickWindow::graphicsApi() != QSGRendererInterface::Vulkan) return nullptr;
  auto* v = new VulkanVideo(item, controller->mpv());
  // MpvAbstractItem::ready() tells MpvVideoItem the player can use mpv, as MpvQt's OpenGL renderer does.
  QObject::connect(v, &VulkanVideo::ready, item, [item] { QMetaObject::invokeMethod(item, "ready", Qt::QueuedConnection); });
  return v;
}

#ifdef ICEFIN_MPV_VULKAN
bool vulkanVideoCompiled() { return true; }

struct VulkanVideo::Vk
{
  QVulkanInstance* inst = nullptr;
  QVulkanDeviceFunctions* df = nullptr;
  VkDevice dev = VK_NULL_HANDLE;
  VkImage image = VK_NULL_HANDLE;
  VkImageView view = VK_NULL_HANDLE;
  VkDeviceMemory memory = VK_NULL_HANDLE;
  VkImageLayout layout = VK_IMAGE_LAYOUT_UNDEFINED;
  QList<const char*> extensions;
};
static constexpr VkFormat kDirectFormat = VK_FORMAT_R8G8B8A8_UNORM;        // encoded for the display by mpv
static constexpr VkFormat kCompositeFormat = VK_FORMAT_R16G16B16A16_SFLOAT;  // linear light for the compositor (5.4)

VulkanVideo::VulkanVideo(QQuickItem* item, mpv_handle* mpv) : QObject(item), m_vk(new Vk), m_item(item), m_mpv(mpv)
{
  m_provider = new VideoTextureProvider;
  s_active = this;
  connect(item, &QQuickItem::windowChanged, this, &VulkanVideo::attachWindow);
  attachWindow(item->window());
  connect(&HdrCapabilityProbe::instance(), &HdrCapabilityProbe::changed, this, &VulkanVideo::applyTarget, Qt::QueuedConnection);
  connect(&RouterComponent::Get(), &RouterComponent::compositorChanged, this, &VulkanVideo::applyTarget, Qt::QueuedConnection);
  qInfo() << "Icefin video: Vulkan path (patched libmpv, gpu-next on the shared device)";
}

VulkanVideo::~VulkanVideo()
{
  // The item goes before MpvQt destroys the mpv handle; the GPU must be done with the image and mpv's resources.
  if (m_vk->dev) m_vk->df->vkDeviceWaitIdle(m_vk->dev);
  if (m_ctx) mpv_render_context_free(m_ctx);
  if (s_active == this) s_active = nullptr;
  m_provider->deleteLater();  // its texture wraps the image: dropped first
  m_provider->setTexture(nullptr);
  destroyImage();
  delete m_vk;
}

void VulkanVideo::attachWindow(QQuickWindow* w)
{
  if (m_window == w) return;
  if (m_window) disconnect(m_window, nullptr, this, nullptr);
  m_window = w;
  if (w) connect(w, &QQuickWindow::beforeRendering, this, &VulkanVideo::render, Qt::DirectConnection);
}

bool VulkanVideo::createContext()
{
  VulkanDevice& d = VulkanDevice::instance();
  auto* ri = m_window->rendererInterface();
  auto* inst = static_cast<QVulkanInstance*>(ri->getResource(m_window, QSGRendererInterface::VulkanInstanceResource));
  auto* queue = static_cast<VkQueue*>(ri->getResource(m_window, QSGRendererInterface::CommandQueueResource));
  auto* dev = static_cast<VkDevice*>(ri->getResource(m_window, QSGRendererInterface::DeviceResource));
  if (!inst || !queue || !dev) { qWarning() << "Icefin video: no Vulkan resources from Qt Quick"; return false; }
  if (!d.ready() || *dev != d.device()) {
    // libplacebo needs to know exactly what the device enables; only Icefin's own device says so.
    qWarning() << "Icefin video: Qt Quick isn't on Icefin's shared Vulkan device; no video on the Vulkan path";
    return false;
  }
  m_vk->inst = inst;
  m_vk->dev = d.device();
  m_vk->df = inst->deviceFunctions(m_vk->dev);
  m_vk->extensions.clear();
  for (const QByteArray& e : d.extensions()) m_vk->extensions << e.constData();

  mpv_vulkan_init_params vp{};
  vp.instance = inst->vkInstance();
  vp.physical_device = d.physicalDevice();
  vp.device = d.device();
  vp.graphics_queue = *queue;
  vp.graphics_queue_family = d.queueFamily();
  vp.get_instance_proc_addr = reinterpret_cast<PFN_vkGetInstanceProcAddr>(inst->getInstanceProcAddr("vkGetInstanceProcAddr"));
  vp.features = d.features();
  vp.extensions = m_vk->extensions.data();
  vp.num_extensions = int(m_vk->extensions.size());
  // The display connection, for mpv's VAAPI interop to open a VA display on (Icefin's mpv 0006 maps hardware frames
  // into Vulkan without a copy). CUDA needs nothing.
  mpv_render_param display{MPV_RENDER_PARAM_INVALID, nullptr};
  if (auto* wl = qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>(); wl && wl->display())
    display = {MPV_RENDER_PARAM_WL_DISPLAY, wl->display()};
#if QT_CONFIG(xcb)
  else if (auto* x11 = qGuiApp->nativeInterface<QNativeInterface::QX11Application>(); x11 && x11->display())
    display = {MPV_RENDER_PARAM_X11_DISPLAY, x11->display()};
#endif
  mpv_render_param params[] = {{MPV_RENDER_PARAM_API_TYPE, const_cast<char*>(MPV_RENDER_API_TYPE_VULKAN)},
                               {MPV_RENDER_PARAM_BACKEND, const_cast<char*>("gpu-next")},
                               {MPV_RENDER_PARAM_VULKAN_INIT_PARAMS, &vp},
                               display,
                               {MPV_RENDER_PARAM_INVALID, nullptr}};
  const int rc = mpv_render_context_create(&m_ctx, m_mpv, params);
  if (rc < 0) {
    qWarning() << "Icefin video: mpv's Vulkan render context failed:" << mpv_error_string(rc);
    m_ctx = nullptr;
    return false;
  }
  mpv_render_context_set_update_callback(m_ctx, [](void* self) {
    auto* v = static_cast<VulkanVideo*>(self);
    v->m_dirty = true;
    QMetaObject::invokeMethod(v->m_item, "update", Qt::QueuedConnection);
  }, this);
  qInfo() << "Icefin video: mpv renders through gpu-next on the shared Vulkan device";
  QMetaObject::invokeMethod(this, &VulkanVideo::applyTarget, Qt::QueuedConnection);
  Q_EMIT ready();
  return true;
}

void VulkanVideo::applyTarget()
{
  if (!m_mpv) return;
  const MpvOptions opts = m_composite ? mpvLinearTargetOptions(compositorState(), HdrCapabilityProbe::instance().current())
                                      : mpvTargetOptions(HdrCapabilityProbe::instance().current(), vulkanHdrOutput());
  QByteArray summary;
  for (const auto& o : opts) {
    const int rc = mpv_set_property_string(m_mpv, o.first.constData(), o.second.constData());
    if (rc < 0) qWarning().noquote() << "Icefin video: mpv rejected" << o.first + "=" + o.second << mpv_error_string(rc);
    summary += o.first + "=" + o.second + " ";
  }
  if (summary != m_lastTarget) qInfo().noquote() << "Icefin video: mpv target" << summary.trimmed();
  m_lastTarget = summary;
}

bool VulkanVideo::ensureImage(const QSize& size)
{
  if (size.isEmpty()) return false;
  if (m_vk->image && size == m_size) return true;
  if (m_vk->image) m_vk->df->vkDeviceWaitIdle(m_vk->dev);  // a resize: in-flight frames may still sample the old one
  m_provider->setTexture(nullptr);
  destroyImage();
  VulkanDevice& d = VulkanDevice::instance();
  VkImageCreateInfo ici{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
  ici.imageType = VK_IMAGE_TYPE_2D;
  ici.format = m_composite ? kCompositeFormat : kDirectFormat;
  ici.extent = {uint32_t(size.width()), uint32_t(size.height()), 1};
  ici.mipLevels = 1;
  ici.arrayLayers = 1;
  ici.samples = VK_SAMPLE_COUNT_1_BIT;
  ici.tiling = VK_IMAGE_TILING_OPTIMAL;
  ici.usage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_TRANSFER_SRC_BIT
              | VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_STORAGE_BIT;
  ici.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
  if (m_vk->df->vkCreateImage(m_vk->dev, &ici, nullptr, &m_vk->image) != VK_SUCCESS) { m_vk->image = VK_NULL_HANDLE; return false; }
  VkMemoryRequirements mr;
  m_vk->df->vkGetImageMemoryRequirements(m_vk->dev, m_vk->image, &mr);
  VkPhysicalDeviceMemoryProperties mp;
  m_vk->inst->functions()->vkGetPhysicalDeviceMemoryProperties(d.physicalDevice(), &mp);
  uint32_t type = UINT32_MAX;
  for (uint32_t i = 0; i < mp.memoryTypeCount; ++i)
    if ((mr.memoryTypeBits & (1u << i)) && (mp.memoryTypes[i].propertyFlags & VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)) { type = i; break; }
  VkMemoryAllocateInfo ai{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO, nullptr, mr.size, type};
  if (type == UINT32_MAX || m_vk->df->vkAllocateMemory(m_vk->dev, &ai, nullptr, &m_vk->memory) != VK_SUCCESS) { destroyImage(); return false; }
  m_vk->df->vkBindImageMemory(m_vk->dev, m_vk->image, m_vk->memory, 0);
  VkImageViewCreateInfo vci{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
  vci.image = m_vk->image;
  vci.viewType = VK_IMAGE_VIEW_TYPE_2D;
  vci.format = ici.format;
  vci.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
  if (m_vk->df->vkCreateImageView(m_vk->dev, &vci, nullptr, &m_vk->view) != VK_SUCCESS) { destroyImage(); return false; }
  m_vk->layout = VK_IMAGE_LAYOUT_UNDEFINED;
  m_size = size;
  m_imageChanged = true;
  m_frames = 0;  // nothing to show until mpv has drawn into the new image
  m_dirty = true;
  return true;
}

void VulkanVideo::destroyImage()
{
  if (!m_vk || !m_vk->df) return;
  if (m_vk->view) m_vk->df->vkDestroyImageView(m_vk->dev, m_vk->view, nullptr);
  if (m_vk->image) m_vk->df->vkDestroyImage(m_vk->dev, m_vk->image, nullptr);
  if (m_vk->memory) m_vk->df->vkFreeMemory(m_vk->dev, m_vk->memory, nullptr);
  m_vk->view = VK_NULL_HANDLE;
  m_vk->image = VK_NULL_HANDLE;
  m_vk->memory = VK_NULL_HANDLE;
}

QSGNode* VulkanVideo::updatePaintNode(QSGNode* old)
{
  auto* node = static_cast<QSGSimpleTextureNode*>(old);
  if (!m_window || m_window->rendererInterface()->graphicsApi() != QSGRendererInterface::Vulkan) return node;
  if (!m_ctx && !createContext()) return node;
  const QSize px = (m_item->size() * m_window->effectiveDevicePixelRatio()).toSize();
  if (!m_vk->image && !m_size.isValid()) {
    const bool composite = compositorState().active;  // set when the window was attached, before the first frame
    if (composite != m_composite) {
      m_composite = composite;
      QMetaObject::invokeMethod(this, &VulkanVideo::applyTarget, Qt::QueuedConnection);
    }
    qInfo() << "Icefin video:" << (m_composite ? "linear RGBA16F for the compositor (5.4)" : "RGBA8 encoded for the display");
  }
  if (!ensureImage(px)) { delete node; return nullptr; }
  if (m_composite) {
    // The compositor draws the video; the item draws nothing. The image goes out as a texture once mpv drew into it.
    delete node;
#ifdef ICEFIN_VIDEO_RHI
    if (m_frames > 0 && (m_imageChanged || !m_provider->texture())) {
      QRhi* rhi = m_window->rhi();
      QRhiTexture* t = rhi ? rhi->newTexture(QRhiTexture::RGBA16F, m_size) : nullptr;
      if (t && t->createFrom({quint64(m_vk->image), VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL})) {
        m_provider->setTexture(m_window->createTextureFromRhiTexture(t, QQuickWindow::TextureHasAlphaChannel));
        m_imageChanged = false;
      } else {
        delete t;
        qWarning() << "Icefin video: can't hand the video image to the compositor";
      }
    }
#endif
    return nullptr;
  }
  if (m_frames == 0) { delete node; return nullptr; }  // the image has no frame yet: show nothing (the window is black)
  if (!node || m_imageChanged) {
    if (!node) node = new QSGSimpleTextureNode;
    node->setTexture(QNativeInterface::QSGVulkanTexture::fromNative(m_vk->image, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, m_window, m_size));
    node->setOwnsTexture(true);
    m_imageChanged = false;
  }
  node->setRect(m_item->boundingRect());
  node->markDirty(QSGNode::DirtyMaterial);
  return node;
}

void VulkanVideo::render()
{
  if (!m_ctx || !m_vk->image) return;
  if (!m_dirty.exchange(false)) return;
  if (!(mpv_render_context_update(m_ctx) & MPV_RENDER_UPDATE_FRAME)) return;
  mpv_vulkan_fbo fbo{};
  fbo.image = m_vk->image;
  fbo.image_view = m_vk->view;
  fbo.width = uint32_t(m_size.width());
  fbo.height = uint32_t(m_size.height());
  fbo.format = m_composite ? kCompositeFormat : kDirectFormat;
  fbo.current_layout = m_vk->layout;
  fbo.target_layout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
  mpv_render_param params[] = {{MPV_RENDER_PARAM_VULKAN_FBO, &fbo}, {MPV_RENDER_PARAM_INVALID, nullptr}};
  if (mpv_render_context_render(m_ctx, params) >= 0) {
    m_vk->layout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    if (m_frames++ == 0) {
      qInfo() << "Icefin video: first frame on the Vulkan path" << m_size;
      QMetaObject::invokeMethod(m_item, "update", Qt::QueuedConnection);  // show it next frame
    }
  }
}
#else
bool vulkanVideoCompiled() { return false; }
struct VulkanVideo::Vk {};
VulkanVideo::VulkanVideo(QQuickItem* item, mpv_handle* mpv) : QObject(item), m_item(item), m_mpv(mpv) {}
VulkanVideo::~VulkanVideo() = default;
void VulkanVideo::attachWindow(QQuickWindow*) {}
bool VulkanVideo::createContext() { return false; }
bool VulkanVideo::ensureImage(const QSize&) { return false; }
void VulkanVideo::destroyImage() {}
QSGNode* VulkanVideo::updatePaintNode(QSGNode* old) { return old; }
void VulkanVideo::render() {}
void VulkanVideo::applyTarget() {}
#endif
}
