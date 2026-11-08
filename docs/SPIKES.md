# Phase 2 spikes: go / no-go

One entry per spike (PLAN 2.1–2.8). A no-go on 2.1, 2.2 or 2.3 switches the plan to the two-window contingency
(SPEC "Contingency: two-window design"). Raw results and screenshots are in `docs/spikes/`.

## 2.1 Qt Quick on Qt's Vulkan backend with Qt WebEngine inside it: **GO (functional); confirm on GPU in 1.9**

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
(DMA-BUF into Vulkan). Re-run this spike on AMD, Intel and NVIDIA in the hardware lab (1.9) before Phase 5 ships;
a failure there is driver-specific and is handled by the OpenGL fallback (SPEC routing table), not a design no-go.
