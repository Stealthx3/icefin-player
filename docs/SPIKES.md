# Phase 2 spikes: go / no-go

One entry per spike (PLAN 2.1–2.8). A no-go on 2.1, 2.2 or 2.3 switches the plan to the two-window contingency
(SPEC "Contingency: two-window design"). Raw results and screenshots are in `docs/spikes/`.

## 2.1 Qt Quick on Qt's Vulkan backend with Qt WebEngine inside it: **GO (functional); confirm on GPU in 1.10 (HTPC tier)**

_2026-11-07 · `src/icefin/spikes/2.1-webengine-vulkan/` · lab-icefin-main, Mesa lavapipe (software Vulkan 1.4)_

**Question.** Does a `WebEngineView` render inside a Qt Quick scene running on the Vulkan RHI backend, with a
transparent page background so a layer below it (the future video item) shows through?

**Test.** A QML window with a blue rectangle (video stand-in) under a transparent `WebEngineView`. The page paints
its left half green and leaves the right half transparent. After load, the spike grabs the window and checks
the requested graphics API was used, the left half is green and the right half is blue.

| Qt | Platform | API | Page renders | Transparent over QML |
|---|---|---|---|---|
| 6.8.2 (Debian) | X11 (Xvfb) | Vulkan | yes | yes |
| 6.8.2 | X11 | OpenGL (control) | yes | yes |
| 6.8.2 | Wayland (headless Weston) | Vulkan | yes | yes |
| 6.8.2 | Wayland | OpenGL | yes | yes |
| 6.11.3 (KDE 6.11 + WebEngine BaseApp, the Flatpak runtime) | X11 | Vulkan | yes | yes |
| 6.11.3 | X11 | OpenGL | yes | yes |
| 6.11.3 | Wayland | Vulkan | yes | yes |
| 6.11.3 | Wayland | OpenGL | yes | yes |

The real jellyfin-web 10.11 sign-in page also renders correctly in the Vulkan scene (checked by screenshot in the lab, `2.1-jfweb-vulkan.json`; not stored, it shows Jellyfin branding).

**Verdict.** Go. Qt WebEngine works under the Vulkan backend on both Qt versions Icefin ships against, on X11 and
Wayland, with the transparency the single-surface design needs.

**Open risk.** The software rasterizer doesn't exercise the GPU texture-import path Chromium uses on real GPUs
(DMA-BUF into Vulkan). Re-run this spike on AMD, Intel and NVIDIA in the hardware lab (1.10 (HTPC tier)) before Phase 5 ships;
a failure there is driver-specific and is handled by the OpenGL fallback (SPEC routing table), not a design no-go.

## 2.2 Patched libmpv rendering through libplacebo on Qt's shared Vulkan device: **GO (functional); confirm on GPU and hwdec in 1.10 (HTPC tier) / 4.5**

_2026-11-07 · `src/icefin/spikes/2.2-libmpv-vulkan/` · lab-icefin-main, Mesa lavapipe_

**Question.** Can libmpv render with gpu-next (libplacebo) into an image on the same `VkDevice` Qt Quick renders with,
so video becomes a scene-graph texture with no copies?

**Patch.** mpv has no Vulkan render API (mpv PRs #16818, #17828 and #18607 are open). Two commits from
github.com/andrewrabert/mpv (a jellyfin-desktop developer's fork, used by upstream's experimental
`libmpv-vulkan-gpu-next-wayland-hdr` branch) apply onto mpv 0.42.0 with one trivial conflict (enum numbering). They're
kept in `patches/` with authorship and form the starting point for 5.2. They need libplacebo ≥ 7.387 (Debian 13
has 7.349; the Flatpak already builds 7.387).

**Test.** The spike creates the Vulkan 1.3 device itself, with every supported feature on (timeline semaphores and
host query reset included) and the external-memory/DMA-BUF extensions where present. It hands the device to Qt
with `QQuickGraphicsDevice::fromDeviceObjects`, creates libmpv's render context on it, and renders each mpv frame
into a `VkImage` on Qt's render thread before Qt's own pass (same thread, same queue). The image is wrapped with
`QSGVulkanTexture::fromNative`. Window grabs check the pixels.

| Platform | Source | Frames in 10 s | Result |
|---|---|---|---|
| X11 | SDR H.264, half red, half green, 30 fps | 301 | exact colours (`#fd0000` / `#00fe00`), shared device confirmed |
| Wayland (headless Weston) | same | 287 | exact colours |
| X11 | HDR10 HEVC 4K (`bt.2020/pq/yuv420p10`) | 201 | mpv sees PQ/BT.2020; libplacebo tone-maps to SDR |
| Wayland | same | 175 | same |

(HDR frame counts are below 24 fps because a 4K HEVC 10-bit software decode is running on a VM CPU.)

**Verdict.** Go. The shared-device architecture works: one device, created by Icefin, used by Qt and libplacebo.

**Open items for Phase 5.**
- Use `MPV_RENDER_PARAM_VULKAN_SYNC` semaphores instead of the patch's `pl_gpu_finish` fallback, which blocks the render thread.
- Hardware decode into the shared device (DMA-BUF import, Vulkan Video) is untested; it needs a GPU (1.10 (HTPC tier) / 4.5).
- Render into an RGBA16F target in linear light for the HDR compositor (5.4); the spike used RGBA8 sRGB.
- Prior art: upstream's experimental branch takes a different route, a separate Vulkan Wayland **subsurface** for
  mpv under an OpenGL Qt window, tagged with `wp_color_manager_v1`. That's useful reference for 2.3 and the
  contingency, but it isn't the D4 single-surface design.

## 2.3 HDR swapchain format and Wayland surface tagging on KWin and Mutter: **GO (protocol level), with design notes; TV signalling in 1.10 (HTPC tier)**

_2026-11-07 · `src/icefin/spikes/2.3-hdr-surface/` (`cmprobe.c`, `vkcolorspaces.c`) · KWin 6.3.6 and Mutter 48.7 headless in lab-icefin-main_

**What each compositor supports** (`cmprobe`, `wp_color_manager_v1`):

| | KWin 6.3.6 | Mutter 48.7 |
|---|---|---|
| Features | parametric, set_primaries, set_luminances, set_mastering_display_primaries, extended_target_volume, windows_scrgb | parametric, set_primaries, set_tf_power, set_luminances |
| Transfer functions | gamma22, ext_linear, srgb, **st2084_pq** | bt1886, gamma22, gamma28, ext_linear, srgb, **st2084_pq** |
| HLG | **no** | **no** |
| Render intents | perceptual, relative, absolute, relative_bpc | perceptual |
| PQ/BT.2020 description with HDR10 mastering metadata, set on a surface | accepted | accepted (no mastering-metadata feature, so MaxCLL/mastering are dropped) |
| Also offers | `frog_color_management_factory_v1`, scRGB description | — |

**Vulkan swapchain colour spaces for a Wayland surface** (`vkcolorspaces`):

| Mesa | KWin | Mutter |
|---|---|---|
| 25.0.7 (Debian 13) | SRGB_NONLINEAR only | SRGB_NONLINEAR only |
| 26.2.5 (Flatpak GL.default 25.08) | + HDR10_ST2084, EXTENDED_SRGB_LINEAR, DISPLAY_P3, DOLBYVISION | + HDR10_ST2084, BT2020_LINEAR, DOLBYVISION |

**Qt.** Qt 6.11.3 (the Flatpak runtime) with `QSG_RHI_HDR=hdr10` creates an HDR10 swapchain on Vulkan and PQ-encodes the
scene (SDR white level 200, max 1000 nits). In these headless sessions, though, Mesa did **not** attach an image
description to the surface: the protocol trace shows capability queries but no `get_surface` or `set_image_description`.

**Verdict.** Go. Both target compositors accept HDR10 (PQ, BT.2020) surface descriptions, and Qt plus the Flatpak's
Mesa can produce a PQ-encoded swapchain. Design consequences for Phase 5:
1. **Icefin tags the surface itself** (SPEC §5 already says so). Before 5.5 ships, check on real hardware whether Mesa
   also tags HDR swapchains: the protocol allows one `wp_color_management_surface_v1` per surface, so only one of
   them can. The fallback is to render PQ into a pass-through/sRGB-colour-space swapchain and tag manually.
2. **HLG is output as PQ.** Neither compositor accepts the HLG transfer function, so libplacebo converts HLG sources
   to PQ. The acceptance row "the TV reports HLG for HLG sources" can't be met on these compositors (see the open
   question in HANDOFF).
3. **Mutter drops mastering metadata** (no `set_mastering_display_primaries`), so the TV gets Mutter's own
   metadata; MaxCLL can still be expressed through `set_luminances`.
4. **KWin 6.3 is below the Plasma 6.4+ target.** Re-run `cmprobe` on Plasma 6.4+ (a newer lab base or the HTPC).
5. The TV/monitor actually switching to HDR10 is a hardware check (1.10 (HTPC tier)).

## 2.4 Same renderer as a Gamescope XWayland client, HDR via Gamescope WSI, inside the Flatpak: **BLOCKED (needs a GPU) → 1.10 (HTPC tier)**

_2026-11-07_ Gamescope 3.16.17 builds in the lab, and Flathub's `org.freedesktop.Platform.VulkanLayer.gamescope//25.08`
(the WSI layer the Flatpak would use) installs. But Gamescope's headless backend refuses software Vulkan: it requires
`VK_EXT_physical_device_drm`, which lavapipe doesn't offer. The spike command is ready in this entry's history
(`gamescope --backend headless --hdr-enabled --hdr-debug-force-output -- flatpak … QSG_RHI_HDR=hdr10 ENABLE_GAMESCOPE_WSI=1`).
It runs as soon as the lab has a real GPU: passthrough, a virtio-gpu Venus guest, or the HTPC.

## 2.7 `icefin-theme:` scheme vs jellyfin-web CSP; Gamepad API in WebEngine: **GO**; Steam Input part moved to 7.4

_2026-11-07 · `src/icefin/spikes/2.7-scheme-csp-gamepad/` · Qt 6.8.2_

**Theme scheme.** A C++ `QWebEngineUrlSchemeHandler` serves `icefin-theme://` stylesheets, scripts and images. The
probe injects each into the loaded page and checks it took effect:

| Page | CSP | Flag `ContentSecurityPolicyIgnored` | img | css | script | blob: css | fetch() |
|---|---|---|---|---|---|---|---|
| jellyfin-web 10.11.11 | none sent | off / on | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✗ / ✗ |
| jellyfin-web 12.4.0 | none sent | off / on | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✗ / ✗ |
| strict proxy page (`default-src 'self'`) | strict | off | ✗ | ✗ | ✗ | ✗ | ✗ |
| strict proxy page | strict | on | ✓ | ✓ | ✓ | ✗ | ✗ |

Decisions for Phase 8: register `icefin-theme` with `SecureScheme | CorsEnabled | ContentSecurityPolicyIgnored`, and
add `FetchApiAllowed` if the theme runtime needs `fetch()`. The SPEC's fallback, in-page `blob:` URLs, does **not**
survive a strict CSP, so the scheme with that flag is the primary path and blob: isn't a real fallback.

**Gamepad API.** A virtual Xbox 360 pad (uinput, `virtual_pad.py`) pressing A:

| Shim (hide `navigator.getGamepads`) | `gamepadconnected` fires | `getGamepads()` |
|---|---|---|
| off | yes | `["Microsoft X-Box 360 pad (STANDARD GAMEPAD …)"]` |
| on | **yes** | `[]` |

WebEngine exposes pads to the page, so without the shim jellyfin-web's gamepad-to-key code would double every press,
as the SPEC predicted. The getter shim works, but the connect/disconnect events still reach the page, so task 7.5
also stops those events at capture. Only a focused page sees pads (a Chromium rule). The lab now runs Debian's full
kernel for `/dev/uinput`.

**Steam Input** virtual-pad visibility needs Steam, so it moves to 7.4 (Steam Input handling) on the Deck or HTPC.
