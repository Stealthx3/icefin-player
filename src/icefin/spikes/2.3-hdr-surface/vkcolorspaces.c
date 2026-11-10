/* Spike 2.3: which swapchain (format, colorSpace) pairs does the Vulkan WSI offer for a Wayland surface here?
 * Prints JSON with the driver and the HDR-relevant pairs. Build: cc vkcolorspaces.c -lvulkan -lwayland-client */
#define VK_USE_PLATFORM_WAYLAND_KHR
#include <vulkan/vulkan.h>
#include <wayland-client.h>
#include <stdio.h>
#include <string.h>
static struct wl_compositor *comp;
static void g(void *d, struct wl_registry *r, uint32_t n, const char *i, uint32_t v) { if (!strcmp(i, "wl_compositor")) comp = wl_registry_bind(r, n, &wl_compositor_interface, 4); }
static void rm(void *d, struct wl_registry *r, uint32_t n) {}
static const struct wl_registry_listener rl = {g, rm};
static const char *cs(VkColorSpaceKHR c) {
  switch (c) { /* names from vulkan.h's own enum, not hand-typed numbers */
  case VK_COLOR_SPACE_SRGB_NONLINEAR_KHR: return "SRGB_NONLINEAR"; case VK_COLOR_SPACE_DISPLAY_P3_NONLINEAR_EXT: return "DISPLAY_P3_NONLINEAR";
  case VK_COLOR_SPACE_EXTENDED_SRGB_LINEAR_EXT: return "EXTENDED_SRGB_LINEAR"; case VK_COLOR_SPACE_DISPLAY_P3_LINEAR_EXT: return "DISPLAY_P3_LINEAR";
  case VK_COLOR_SPACE_DCI_P3_NONLINEAR_EXT: return "DCI_P3_NONLINEAR"; case VK_COLOR_SPACE_BT709_LINEAR_EXT: return "BT709_LINEAR";
  case VK_COLOR_SPACE_BT709_NONLINEAR_EXT: return "BT709_NONLINEAR"; case VK_COLOR_SPACE_BT2020_LINEAR_EXT: return "BT2020_LINEAR";
  case VK_COLOR_SPACE_HDR10_ST2084_EXT: return "HDR10_ST2084"; case VK_COLOR_SPACE_DOLBYVISION_EXT: return "DOLBYVISION";
  case VK_COLOR_SPACE_HDR10_HLG_EXT: return "HDR10_HLG"; case VK_COLOR_SPACE_ADOBERGB_LINEAR_EXT: return "ADOBERGB_LINEAR";
  case VK_COLOR_SPACE_ADOBERGB_NONLINEAR_EXT: return "ADOBERGB_NONLINEAR"; case VK_COLOR_SPACE_PASS_THROUGH_EXT: return "PASS_THROUGH";
  case VK_COLOR_SPACE_EXTENDED_SRGB_NONLINEAR_EXT: return "EXTENDED_SRGB_NONLINEAR"; default: return "other"; } }
int main(void) {
  struct wl_display *dpy = wl_display_connect(NULL); if (!dpy) { puts("{\"error\":\"no display\"}"); return 2; }
  struct wl_registry *r = wl_display_get_registry(dpy); wl_registry_add_listener(r, &rl, NULL); wl_display_roundtrip(dpy);
  struct wl_surface *s = wl_compositor_create_surface(comp);
  const char *ie[] = {"VK_KHR_surface", "VK_KHR_wayland_surface", "VK_EXT_swapchain_colorspace"};
  VkApplicationInfo ai = {VK_STRUCTURE_TYPE_APPLICATION_INFO, 0, "cs", 0, 0, 0, VK_API_VERSION_1_3};
  VkInstanceCreateInfo ici = {VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO, 0, 0, &ai, 0, 0, 3, ie};
  VkInstance inst; if (vkCreateInstance(&ici, 0, &inst)) { ici.enabledExtensionCount = 2; if (vkCreateInstance(&ici, 0, &inst)) { puts("{\"error\":\"instance\"}"); return 3; } }
  VkWaylandSurfaceCreateInfoKHR wci = {VK_STRUCTURE_TYPE_WAYLAND_SURFACE_CREATE_INFO_KHR, 0, 0, dpy, s};
  VkSurfaceKHR surf; vkCreateWaylandSurfaceKHR(inst, &wci, 0, &surf);
  uint32_t n = 4; VkPhysicalDevice pd[4]; vkEnumeratePhysicalDevices(inst, &n, pd);
  VkPhysicalDeviceDriverProperties dp = {VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_DRIVER_PROPERTIES};
  VkPhysicalDeviceProperties2 p2 = {VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PROPERTIES_2, &dp}; vkGetPhysicalDeviceProperties2(pd[0], &p2);
  uint32_t fc = 0; vkGetPhysicalDeviceSurfaceFormatsKHR(pd[0], surf, &fc, 0);
  VkSurfaceFormatKHR f[256]; if (fc > 256) fc = 256; vkGetPhysicalDeviceSurfaceFormatsKHR(pd[0], surf, &fc, f);
  printf("{\"driver\":\"%s %s\",\"pairs\":[", dp.driverName, dp.driverInfo);
  for (uint32_t i = 0; i < fc; ++i) printf("%s\"%d/%s(%d)\"", i ? "," : "", f[i].format, cs(f[i].colorSpace), (int)f[i].colorSpace);
  puts("]}");
  return 0;
}
