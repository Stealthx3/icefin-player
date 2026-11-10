# Patched libmpv (PLAN 5.2)

Icefin bundles its own libmpv: **mpv `v0.42.0`** plus two patches that add a gpu-next libmpv render backend and a
**Vulkan render API on a host-supplied device** (`MPV_RENDER_API_TYPE_VULKAN`, `include/mpv/render_vk.h`). Qt Quick
and libplacebo share one `VkDevice` (`src/icefin/render/VulkanDevice`, PLAN 5.1); this API lets mpv render into an
image on that device (5.3). Proven in spike 2.2 (`docs/SPIKES.md`).

| Pin | Value |
|---|---|
| mpv | `v0.42.0`, `https://github.com/mpv-player/mpv/archive/refs/tags/v0.42.0.tar.gz`, sha256 `bcfebbfa2b65a6d88dc97ea18117831072373e38b5785a2afb874ed4df5070dd` |
| libplacebo (the patches need ≥ 7.387) | `v7.387.0`, commit `275f7dea27924cdd34ab2e6c20e448b6bc4fab65` |

Both pins match the Flatpak manifest (`flatpak/io.github.stealthx3.IcefinPlayer.yml`); bump them together.

| Patch | Author | Origin |
|---|---|---|
| `patches/0001` vo_libmpv: introduce 'gpu-next' render backend | sparks | mpv PR #16818 (open), via github.com/andrewrabert/mpv |
| `patches/0002` vo_libmpv: add Vulkan support to gpu-next backend | Andrew Rabert | github.com/andrewrabert/mpv `c9fd9b8` |

Rebase note: mpv 0.42 added `MPV_RENDER_PARAM_D3D11_INIT_PARAMS = 21` and `…_D3D11_FBO = 22`, so the new params are
renumbered: `BACKEND = 23`, `VULKAN_INIT_PARAMS = 24`, `VULKAN_FBO = 25`, `VULKAN_SYNC = 26` (Icefin bundles its own
libmpv, so the numbering only has to match the bundled header; `test_icefin_gpu` checks it). The meson header list
keeps `render_d3d11.h`. When upstream mpv merges a Vulkan render API (PRs #16818, #17828, #18607), switch to it and
drop these patches.

**Where it's built.**
- Flatpak: the `libmpv` module applies `patches/*.patch` to the pinned tarball.
- Lab guests: `external/mpv/build-lab.sh [PREFIX]` builds the pinned libplacebo and the patched libmpv into a prefix
  (default `~/mpv-icefin`); configure the app with `PKG_CONFIG_PATH=PREFIX/lib/x86_64-linux-gnu/pkgconfig` and run it
  with `LD_LIBRARY_PATH=PREFIX/lib/x86_64-linux-gnu`. CMake reports `Icefin: libmpv has the Vulkan render API` and
  defines `ICEFIN_MPV_VULKAN` when the headers have it.

Licensing follows mpv (LGPL-2.1+ for libmpv builds without GPL parts; GPL otherwise). Icefin is GPLv2.
