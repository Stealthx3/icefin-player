// Icefin: video on the Vulkan path (PLAN 5.3, SPEC "Rendering, playback routing and HDR" §2).
//
// When Qt Quick runs on Vulkan, MpvVideoItem draws through this instead of MpvQt's OpenGL framebuffer: libmpv (the
// patched build in external/mpv) renders through libplacebo into a VkImage on Icefin's shared device (VulkanDevice,
// 5.1), on Qt's render thread before Qt records its frame (same thread, same queue), and the image is shown as a
// scene-graph texture, with no copies. Built only with the patched libmpv (ICEFIN_MPV_VULKAN).
//
// With the compositor on (5.4, Compositing.h), mpv renders in linear light into an RGBA16F image and the item draws
// nothing itself: the image is handed out as a texture (VideoTexture in QML) and Compositor.qml blends the UI over it.
// Without it (no Qt ShaderTools, or ICEFIN_COMPOSITOR=0), the item draws an RGBA8 image mpv encoded for the display.
// Not yet: MPV_RENDER_PARAM_VULKAN_SYNC semaphores (libmpv waits on the host until mpv's frame is done).
#pragma once
#include <QObject>
#include <QQuickItem>
#include <QSize>
#include <QSGTextureProvider>
#include <atomic>

class QQuickWindow;
class QSGTexture;
class QSGNode;
class MpvController;
struct mpv_handle;
struct mpv_render_context;

namespace Icefin::Render
{
// True when this build can show video on the Vulkan path (patched libmpv present).
bool vulkanVideoCompiled();

// The video image as a texture for the compositor (render thread).
class VideoTextureProvider : public QSGTextureProvider
{
  Q_OBJECT
public:
  QSGTexture* texture() const override { return m_texture; }
  void setTexture(QSGTexture* t);  // takes ownership, deletes the previous one
  ~VideoTextureProvider() override;
private:
  QSGTexture* m_texture = nullptr;
};

// QML: the active video image as a texture source (Compositor.qml's ShaderEffect).
class VideoTexture : public QQuickItem
{
  Q_OBJECT
public:
  bool isTextureProvider() const override { return true; }
  QSGTextureProvider* textureProvider() const override;
};

class VulkanVideo : public QObject
{
  Q_OBJECT
public:
  // item: the video item (MpvVideoItem); mpv: its handle. The render context is made on the first frame.
  VulkanVideo(QQuickItem* item, mpv_handle* mpv);
  // For MpvVideoItem: a VulkanVideo when Qt Quick runs on Vulkan and this build has the patched libmpv, else null
  // (the item keeps MpvQt's OpenGL path). Emits the item's ready() once mpv's render context exists.
  static VulkanVideo* createFor(QQuickItem* item, MpvController* controller);
  ~VulkanVideo() override;
  // From the item's updatePaintNode (render thread, sync phase).
  QSGNode* updatePaintNode(QSGNode* old);
  int framesRendered() const { return m_frames; }
  // The image of the video item that renders for the compositor (null when none).
  static VideoTextureProvider* activeProvider();

Q_SIGNALS:
  // The render context exists: the item hands its mpv controller to the player (as MpvQt's OpenGL path does).
  void ready();

private:
  void attachWindow(QQuickWindow* w);
  void applyTarget();  // the compositor's description as mpv's target-* options (5.2, D23)
  void readHdrMetadata();  // the video's HDR10 static metadata for the surface description (5.5)
  void render();  // Qt's beforeRendering, render thread
  bool createContext();
  bool ensureImage(const QSize& size);
  void destroyImage();
  struct Vk;
  Vk* m_vk = nullptr;
  QQuickItem* m_item = nullptr;
  mpv_handle* m_mpv = nullptr;
  mpv_render_context* m_ctx = nullptr;
  QQuickWindow* m_window = nullptr;
  QSize m_size;
  QByteArray m_lastTarget;
  bool m_composite = false;  // decided with the first image: the compositor is on
  VideoTextureProvider* m_provider = nullptr;
  bool m_imageChanged = false;
  std::atomic<bool> m_dirty{true};
  std::atomic<int> m_frames{0};
};
}
