// Icefin: the renderer choice and the shared Vulkan device (PLAN 5.1, SPEC "Rendering, playback routing and HDR" §1).
//
// Qt Quick runs on Vulkan or on the OpenGL fallback. On Vulkan, Icefin creates the one VkDevice that Qt Quick and,
// from 5.2, libplacebo share: every supported core feature enabled explicitly (libplacebo assumes some without
// checking) and the extensions both need, then hands it to the window with QQuickGraphicsDevice::fromDeviceObjects.
// The device is created from the window's own Vulkan instance (Qt's default instance), so nothing else changes in how
// the window is set up.
//
// Until the Vulkan video item exists (5.3), video plays only on the OpenGL path: Auto keeps OpenGL, the Vulkan choice
// is for development and hardware checks (the UI runs on Vulkan, video doesn't show), and the router keeps treating
// the system as the OpenGL fallback (vulkanVideoPath()).
#pragma once
#include <QString>
#include <QVariantMap>
#include <QList>
#include <QByteArray>
#include <vulkan/vulkan.h>

class QQuickWindow;
class QVulkanInstance;

namespace Icefin::Render
{
enum class RendererChoice { Auto, Vulkan, OpenGl };
// main.icefin_renderer: "auto" (default), "vulkan", "opengl"; anything else is Auto.
RendererChoice rendererChoiceFrom(const QString& setting);
// The decision itself: Auto takes Vulkan only once the Vulkan video path exists; an explicit Vulkan choice needs a
// usable Vulkan GPU; anything else is OpenGL.
bool useVulkan(RendererChoice choice, bool vulkanUsable, bool videoPath);
// True once video can play on the Vulkan path (5.3). Until then the router routes as the OpenGL fallback.
bool vulkanVideoPath();
// Reads the setting, probes Vulkan when it matters, and calls QQuickWindow::setGraphicsApi. Call after the
// QGuiApplication exists and before the main window is created.
void chooseGraphicsApi();

class VulkanDevice
{
public:
  static VulkanDevice& instance();
  // On the Vulkan backend: creates the shared device from the window's Vulkan instance and hands it to the window.
  // Call before the window's scene graph starts (QQmlApplicationEngine::objectCreated). False if the window isn't on
  // Vulkan or the device couldn't be made; Qt then creates its own device and the UI still runs.
  bool attach(QQuickWindow* window);
  bool ready() const { return m_device != VK_NULL_HANDLE; }
  // For logs, the Hardware page and tests: {device, driver, api, extensions[], features{...}}.
  QVariantMap info() const { return m_info; }

  // For libplacebo (5.2): the device, its queue, and exactly what was enabled.
  VkInstance vkInstance() const { return m_instance; }
  VkPhysicalDevice physicalDevice() const { return m_physical; }
  VkDevice device() const { return m_device; }
  uint32_t queueFamily() const { return m_family; }
  const VkPhysicalDeviceFeatures2* features() const { return &m_features; }
  const QList<QByteArray>& extensions() const { return m_extensions; }

private:
  VulkanDevice() = default;
  bool create(QVulkanInstance* inst);
  QVulkanInstance* m_ownInstance = nullptr;  // when the window had none yet (it lives as long as the app)
  VkInstance m_instance = VK_NULL_HANDLE;
  VkPhysicalDevice m_physical = VK_NULL_HANDLE;
  VkDevice m_device = VK_NULL_HANDLE;
  uint32_t m_family = 0;
  VkPhysicalDeviceFeatures2 m_features{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2};
  VkPhysicalDeviceVulkan11Features m_f11{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_1_FEATURES};
  VkPhysicalDeviceVulkan12Features m_f12{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES};
  VkPhysicalDeviceVulkan13Features m_f13{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES};
  QList<QByteArray> m_extensions;
  QList<const char*> m_extensionPtrs;
  QVariantMap m_info;
};

// Device extensions the shared device enables when present, in order: Qt needs the swapchain; libplacebo and the
// video path use the rest (DMA-BUF import of hardware-decoded frames, external semaphores, HDR metadata, push
// descriptors, Vulkan Video). minApi: the device API version an extension's dependencies need here.
struct WantedExtension { const char* name; uint32_t minApi; bool required; };
QList<WantedExtension> wantedDeviceExtensions();
// The extensions to enable from what the device offers, honouring minApi; empty if a required one is missing.
QList<QByteArray> pickDeviceExtensions(const QList<QByteArray>& available, uint32_t deviceApi);
}
