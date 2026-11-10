/* Spike 2.8 (Gamescope part): which swapchain (format, colorSpace) pairs does Vulkan offer for an X11 window here?
 * Inside Gamescope the app is an XWayland client and HDR colour spaces come from Gamescope's WSI layer
 * (VkLayer_FROG_gamescope_wsi, Flathub's org.freedesktop.Platform.VulkanLayer.gamescope, ENABLE_GAMESCOPE_WSI=1).
 * Prints JSON: driver, whether that layer is present, and the pairs. Build: cc vkcs_xcb.c -lvulkan -lxcb */
#define VK_USE_PLATFORM_XCB_KHR
#include <vulkan/vulkan.h>
#include <xcb/xcb.h>
#include <stdio.h>
#include <string.h>
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
  xcb_connection_t *c = xcb_connect(NULL, NULL);
  if (!c || xcb_connection_has_error(c)) { puts("{\"error\":\"no X display\"}"); return 2; }
  xcb_screen_t *scr = xcb_setup_roots_iterator(xcb_get_setup(c)).data;
  xcb_window_t w = xcb_generate_id(c);
  xcb_create_window(c, XCB_COPY_FROM_PARENT, w, scr->root, 0, 0, 320, 180, 0, XCB_WINDOW_CLASS_INPUT_OUTPUT, scr->root_visual, 0, NULL);
  xcb_map_window(c, w); xcb_flush(c);
  uint32_t ln = 0; vkEnumerateInstanceLayerProperties(&ln, NULL);
  VkLayerProperties lp[64]; if (ln > 64) ln = 64; vkEnumerateInstanceLayerProperties(&ln, lp);
  int wsi = 0; for (uint32_t i = 0; i < ln; i++) if (strstr(lp[i].layerName, "gamescope")) wsi = 1;
  const char *ie[] = {"VK_KHR_surface", "VK_KHR_xcb_surface", "VK_EXT_swapchain_colorspace"};
  VkApplicationInfo ai = {VK_STRUCTURE_TYPE_APPLICATION_INFO, 0, "cs", 0, 0, 0, VK_API_VERSION_1_3};
  VkInstanceCreateInfo ici = {VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO, 0, 0, &ai, 0, 0, 3, ie};
  VkInstance inst; if (vkCreateInstance(&ici, 0, &inst)) { ici.enabledExtensionCount = 2; if (vkCreateInstance(&ici, 0, &inst)) { puts("{\"error\":\"instance\"}"); return 3; } }
  VkXcbSurfaceCreateInfoKHR xci = {VK_STRUCTURE_TYPE_XCB_SURFACE_CREATE_INFO_KHR, 0, 0, c, w};
  VkSurfaceKHR surf; if (vkCreateXcbSurfaceKHR(inst, &xci, 0, &surf)) { puts("{\"error\":\"surface\"}"); return 4; }
  uint32_t n = 4; VkPhysicalDevice pd[4]; vkEnumeratePhysicalDevices(inst, &n, pd);
  VkPhysicalDeviceDriverProperties dp = {VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_DRIVER_PROPERTIES};
  VkPhysicalDeviceProperties2 p2 = {VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PROPERTIES_2, &dp}; vkGetPhysicalDeviceProperties2(pd[0], &p2);
  uint32_t fc = 0; vkGetPhysicalDeviceSurfaceFormatsKHR(pd[0], surf, &fc, 0);
  VkSurfaceFormatKHR f[256]; if (fc > 256) fc = 256; vkGetPhysicalDeviceSurfaceFormatsKHR(pd[0], surf, &fc, f);
  printf("{\"driver\":\"%s %s\",\"gamescopeLayerListed\":%s,\"pairs\":[", dp.driverName, dp.driverInfo, wsi ? "true" : "false");
  for (uint32_t i = 0; i < fc; i++) printf("%s\"%d/%s(%d)\"", i ? "," : "", f[i].format, cs(f[i].colorSpace), (int)f[i].colorSpace);
  puts("]}");
  return 0;
}
