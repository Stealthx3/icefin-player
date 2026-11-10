// Icefin: video on the Vulkan path (PLAN 5.3, SPEC "Rendering, playback routing and HDR" §2).
//
// When Qt Quick runs on Vulkan, MpvVideoItem draws through this instead of MpvQt's OpenGL framebuffer: libmpv (the
// patched build in external/mpv) renders through libplacebo into a VkImage on Icefin's shared device (VulkanDevice,
// 5.1), on Qt's render thread before Qt records its frame (same thread, same queue), and the image is shown as a
// scene-graph texture, with no copies. Built only with the patched libmpv (ICEFIN_MPV_VULKAN).
//
// Not yet: rendering into an RGBA16F linear target for the HDR compositor (5.4; this uses RGBA8 sRGB, so on the
// Vulkan path the router tone-maps HDR to SDR), MPV_RENDER_PARAM_VULKAN_SYNC semaphores (libmpv falls back to
// pl_gpu_finish, which blocks the render thread until mpv's frame is done).
#pragma once
#include <QObject>
#include <QSize>
#include <atomic>

class QQuickItem;
class QQuickWindow;
class QSGNode;
class MpvController;
struct mpv_handle;
struct mpv_render_context;

namespace Icefin::Render
{
// True when this build can show video on the Vulkan path (patched libmpv present).
bool vulkanVideoCompiled();

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

Q_SIGNALS:
  // The render context exists: the item hands its mpv controller to the player (as MpvQt's OpenGL path does).
  void ready();

private:
  void attachWindow(QQuickWindow* w);
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
  bool m_imageChanged = false;
  std::atomic<bool> m_dirty{true};
  std::atomic<int> m_frames{0};
};
}
