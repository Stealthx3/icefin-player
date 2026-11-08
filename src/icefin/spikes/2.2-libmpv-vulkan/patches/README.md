# mpv patches (spike 2.2 → task 5.2)

Applied on top of mpv `v0.42.0`. They add a gpu-next libmpv render backend and a Vulkan render API on a
host-supplied device (`MPV_RENDER_API_TYPE_VULKAN`, `include/mpv/render_vk.h`).

| Patch | Author | Origin |
|---|---|---|
| 0001 vo_libmpv: introduce 'gpu-next' render backend | sparks | mpv PR #16818 (open), via github.com/andrewrabert/mpv |
| 0002 vo_libmpv: add Vulkan support to gpu-next backend | Andrew Rabert | github.com/andrewrabert/mpv `c9fd9b8` |

Rebase note: mpv 0.42 added `MPV_RENDER_PARAM_D3D11_INIT_PARAMS = 21` and `…_D3D11_FBO = 22`, so the new params are
renumbered: `BACKEND = 23`, `VULKAN_INIT_PARAMS = 24`, `VULKAN_FBO = 25`, `VULKAN_SYNC = 26` (Icefin bundles its own
libmpv, so the numbering only has to match the bundled header). The meson header list keeps `render_d3d11.h`.
Licensing follows mpv (LGPL-2.1+ for libmpv builds without GPL parts; GPL otherwise). Icefin is GPLv2.
