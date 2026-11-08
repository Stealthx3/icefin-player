/* Spike 2.3: what does the compositor support for wp_color_manager_v1, and does it accept an HDR10 (PQ/BT.2020)
 * and an HLG image description on a surface? Prints one JSON object. Build: see build.sh. */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <wayland-client.h>
#include "color-management-v1-client-protocol.h"

static struct wl_compositor *comp; static struct wl_output *out; static struct wp_color_manager_v1 *cm;
static unsigned feats, tfs, prims, intents; static int done_caps;
static const char *TF[] = {"", "bt1886","gamma22","gamma28","st240","ext_linear","log_100","log_316","xvycc","srgb","ext_srgb","st2084_pq","st428","hlg"};
static const char *PR[] = {"", "srgb","pal_m","pal","ntsc","generic_film","bt2020","cie1931_xyz","dci_p3","display_p3","adobe_rgb"};
static const char *FE[] = {"icc_v2_v4","parametric","set_primaries","set_tf_power","set_luminances","set_mastering_display_primaries","extended_target_volume","windows_scrgb"};

static void cm_intent(void *d, struct wp_color_manager_v1 *m, uint32_t v) { intents |= 1u << v; }
static void cm_feature(void *d, struct wp_color_manager_v1 *m, uint32_t v) { feats |= 1u << v; }
static void cm_tf(void *d, struct wp_color_manager_v1 *m, uint32_t v) { tfs |= 1u << v; }
static void cm_prim(void *d, struct wp_color_manager_v1 *m, uint32_t v) { prims |= 1u << v; }
static void cm_done(void *d, struct wp_color_manager_v1 *m) { done_caps = 1; }
static const struct wp_color_manager_v1_listener cm_l = {cm_intent, cm_feature, cm_tf, cm_prim, cm_done};

static void reg_global(void *d, struct wl_registry *r, uint32_t name, const char *iface, uint32_t ver) {
  if (!strcmp(iface, wl_compositor_interface.name)) comp = wl_registry_bind(r, name, &wl_compositor_interface, 4);
  else if (!strcmp(iface, wl_output_interface.name) && !out) out = wl_registry_bind(r, name, &wl_output_interface, 2);
  else if (!strcmp(iface, wp_color_manager_v1_interface.name)) { cm = wl_registry_bind(r, name, &wp_color_manager_v1_interface, 1); wp_color_manager_v1_add_listener(cm, &cm_l, NULL); }
}
static void reg_remove(void *d, struct wl_registry *r, uint32_t n) {}
static const struct wl_registry_listener reg_l = {reg_global, reg_remove};

/* image description ready / failed */
static int desc_state; static char desc_msg[256];
static void d_failed(void *d, struct wp_image_description_v1 *x, uint32_t cause, const char *msg) { desc_state = -1; snprintf(desc_msg, sizeof desc_msg, "%u:%s", cause, msg); }
static void d_ready(void *d, struct wp_image_description_v1 *x, uint32_t id) { desc_state = 1; }
static const struct wp_image_description_v1_listener d_l = {d_failed, d_ready};

/* information events (for the output's / preferred description) */
static char info[512];
#define APPEND(...) do { size_t L = strlen(info); snprintf(info + L, sizeof info - L, __VA_ARGS__); } while (0)
static void i_done(void *d, struct wp_image_description_info_v1 *i) {}
static void i_icc(void *d, struct wp_image_description_info_v1 *i, int32_t fd, uint32_t s) { APPEND("icc "); }
static void i_prim(void *d, struct wp_image_description_info_v1 *i, int32_t a, int32_t b, int32_t c, int32_t e, int32_t f, int32_t g, int32_t h, int32_t k) { APPEND("primaries "); }
static void i_primn(void *d, struct wp_image_description_info_v1 *i, uint32_t p) { APPEND("prim=%s ", p < 11 ? PR[p] : "?"); }
static void i_tfp(void *d, struct wp_image_description_info_v1 *i, uint32_t e) { APPEND("tf_power=%u ", e); }
static void i_tfn(void *d, struct wp_image_description_info_v1 *i, uint32_t t) { APPEND("tf=%s ", t < 14 ? TF[t] : "?"); }
static void i_lum(void *d, struct wp_image_description_info_v1 *i, uint32_t mn, uint32_t mx, uint32_t ref) { APPEND("lum=%u..%u ref=%u ", mn, mx, ref); }
static void i_tprim(void *d, struct wp_image_description_info_v1 *i, int32_t a, int32_t b, int32_t c, int32_t e, int32_t f, int32_t g, int32_t h, int32_t k) {}
static void i_tlum(void *d, struct wp_image_description_info_v1 *i, uint32_t mn, uint32_t mx) { APPEND("target_lum=%u..%u ", mn, mx); }
static void i_cll(void *d, struct wp_image_description_info_v1 *i, uint32_t v) {}
static void i_fall(void *d, struct wp_image_description_info_v1 *i, uint32_t v) {}
static const struct wp_image_description_info_v1_listener i_l = {i_done, i_icc, i_prim, i_primn, i_tfp, i_tfn, i_lum, i_tprim, i_tlum, i_cll, i_fall};

static const char *describe(struct wl_display *dpy, struct wp_image_description_v1 *desc) {
  desc_state = 0; info[0] = 0;
  wp_image_description_v1_add_listener(desc, &d_l, NULL);
  wl_display_roundtrip(dpy);
  if (desc_state != 1) return "not ready";
  struct wp_image_description_info_v1 *inf = wp_image_description_v1_get_information(desc);
  wp_image_description_info_v1_add_listener(inf, &i_l, NULL);
  wl_display_roundtrip(dpy);
  return info;
}

static const char *try_param(struct wl_display *dpy, struct wl_surface *s, struct wp_color_management_surface_v1 *cs, uint32_t tf, int hdr10) {
  if (!(tfs & (1u << tf))) return "tf unsupported";
  struct wp_image_description_creator_params_v1 *c = wp_color_manager_v1_create_parametric_creator(cm);
  wp_image_description_creator_params_v1_set_tf_named(c, tf);
  wp_image_description_creator_params_v1_set_primaries_named(c, WP_COLOR_MANAGER_V1_PRIMARIES_BT2020);
  if (hdr10 && (feats & (1u << WP_COLOR_MANAGER_V1_FEATURE_SET_MASTERING_DISPLAY_PRIMARIES))) {
    /* BT.2020 mastering display, 0.0001..1000 cd/m², MaxCLL 1000, MaxFALL 400 (values x1e6 / x1e4 per protocol) */
    wp_image_description_creator_params_v1_set_mastering_display_primaries(c, 708000, 292000, 170000, 797000, 131000, 46000, 312700, 329000);
    wp_image_description_creator_params_v1_set_mastering_luminance(c, 1, 1000);
    wp_image_description_creator_params_v1_set_max_cll(c, 1000);
    wp_image_description_creator_params_v1_set_max_fall(c, 400);
  }
  struct wp_image_description_v1 *d = wp_image_description_creator_params_v1_create(c);
  desc_state = 0; wp_image_description_v1_add_listener(d, &d_l, NULL);
  wl_display_roundtrip(dpy);
  if (desc_state != 1) { static char b[300]; snprintf(b, sizeof b, "description failed %s", desc_msg); return b; }
  wp_color_management_surface_v1_set_image_description(cs, d, WP_COLOR_MANAGER_V1_RENDER_INTENT_PERCEPTUAL);
  wl_surface_commit(s);
  wl_display_roundtrip(dpy);
  int err = wl_display_get_error(dpy);
  return err ? "protocol error on set_image_description" : "accepted";
}

int main(void) {
  struct wl_display *dpy = wl_display_connect(NULL);
  if (!dpy) { printf("{\"error\":\"no wayland display\"}\n"); return 2; }
  struct wl_registry *r = wl_display_get_registry(dpy);
  wl_registry_add_listener(r, &reg_l, NULL);
  wl_display_roundtrip(dpy); wl_display_roundtrip(dpy);
  if (!cm) { printf("{\"wp_color_manager_v1\":false}\n"); return 1; }
  printf("{\"wp_color_manager_v1\":true,\"features\":[");
  for (int i = 0, f = 1; i < 8; ++i) if (feats & (1u << i)) { printf("%s\"%s\"", f ? "" : ",", FE[i]); f = 0; }
  printf("],\"tf\":[");
  for (int i = 1, f = 1; i < 14; ++i) if (tfs & (1u << i)) { printf("%s\"%s\"", f ? "" : ",", TF[i]); f = 0; }
  printf("],\"primaries\":[");
  for (int i = 1, f = 1; i < 11; ++i) if (prims & (1u << i)) { printf("%s\"%s\"", f ? "" : ",", PR[i]); f = 0; }
  printf("],\"intents\":%u", intents);
  if (out) {
    struct wp_color_management_output_v1 *co = wp_color_manager_v1_get_output(cm, out);
    printf(",\"output_description\":\"%s\"", describe(dpy, wp_color_management_output_v1_get_image_description(co)));
  }
  struct wl_surface *s = wl_compositor_create_surface(comp);
  struct wp_color_management_surface_feedback_v1 *fb = wp_color_manager_v1_get_surface_feedback(cm, s);
  printf(",\"preferred\":\"%s\"", describe(dpy, wp_color_management_surface_feedback_v1_get_preferred(fb)));
  struct wp_color_management_surface_v1 *cs = wp_color_manager_v1_get_surface(cm, s);
  printf(",\"hdr10_pq_bt2020\":\"%s\"", try_param(dpy, s, cs, WP_COLOR_MANAGER_V1_TRANSFER_FUNCTION_ST2084_PQ, 1));
  printf(",\"hlg_bt2020\":\"%s\"", wl_display_get_error(dpy) ? "skipped" : try_param(dpy, s, cs, WP_COLOR_MANAGER_V1_TRANSFER_FUNCTION_HLG, 0));
  if (!wl_display_get_error(dpy) && (feats & (1u << WP_COLOR_MANAGER_V1_FEATURE_WINDOWS_SCRGB))) {
    struct wp_image_description_v1 *d = wp_color_manager_v1_create_windows_scrgb(cm);
    desc_state = 0; wp_image_description_v1_add_listener(d, &d_l, NULL); wl_display_roundtrip(dpy);
    printf(",\"scrgb\":\"%s\"", desc_state == 1 ? "ready" : "failed");
  }
  printf(",\"protocol_error\":%d}\n", wl_display_get_error(dpy));
  return 0;
}
