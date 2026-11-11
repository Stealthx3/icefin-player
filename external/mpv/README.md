# Patched libmpv (PLAN 5.2)

Icefin bundles its own libmpv: **mpv `v0.42.0`** plus patches that add a gpu-next libmpv render backend and a
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
| `patches/0003` vo_libmpv: gpu-next target colorspace and reference white | Icefin Player | Icefin's own (PLAN 5.2, D23) |
| `patches/0004` vo_libmpv: gpu-next Vulkan: hand the target back in target_layout | Icefin Player | Icefin's own (PLAN 5.3) |
| `patches/0005` vo_libmpv: gpu-next: scale with libplacebo's default filters | Icefin Player | Icefin's own (PLAN 5.3) |
| `patches/0006` vo_libmpv: gpu-next: map hardware frames through mpv's hwdec interops | Icefin Player | Icefin's own (PLAN 5.3) |
| `patches/0007` vo_libmpv: gpu-next: apply mpv's render options | Icefin Player | Icefin's own (PLAN 5.8) |

**Icefin's change to the carried diff (`0003`).** Rabert's commit builds the target colorspace only when `target-prim` or
`target-trc` is set, ignores `target-contrast` and `hdr-reference-white`, and logs the target once through a function
`static`. `0003` builds the target the way stock `vo_gpu_next` applies those options (each on its own, minimum
luminance from `target-contrast`), places SDR video at `hdr-reference-white`, and logs target changes at verbose
level. Icefin sets these options from the compositor's description (`src/icefin/render/MpvTarget`), so libplacebo
maps to the real display instead of a guess. Since `0005` it scales with libplacebo's defaults rather than `pl_filter_nearest`, which made scaled video jagged, and
since `0007` it applies mpv's own render options (below).

**Icefin's change to the carried diff (`0004`).** Rabert's Vulkan backend released the host's image to libplacebo,
rendered, destroyed the wrapper and called `pl_gpu_finish()`: the image stayed in libplacebo's last layout
(`TRANSFER_DST`) rather than `mpv_vulkan_fbo.target_layout`, and `MPV_RENDER_PARAM_VULKAN_SYNC` was never read. Qt then
sampled it in the wrong layout (Khronos validation `VUID-vkCmdDraw-None-09600`). `0004` adds an `unwrap_fbo` step that
holds the image in `target_layout` with `pl_vulkan_hold_ex`, signalling the host's semaphore if given, or else its
own timeline semaphore, which it waits for (5 s limit, logged). It also forwards libplacebo's messages at their own
levels; before, they reached mpv's log only at trace, so libplacebo errors were dropped.

**Icefin's change to the carried diff (`0006`).** The carried backend created hwdec devices but loaded no interop, so
hardware decoding on the Vulkan render API always fell back to copy mode. `0006` gives the Vulkan context mpv's own
`ra` on the same `pl_gpu` (`ra_create_pl`), loads the hwdec interops on it (all of them, or the one
`--gpu-hwdec-interop` names), passes `MPV_RENDER_PARAM_X11_DISPLAY` / `WL_DISPLAY` on for VAAPI as `libmpv_gpu.c` does,
and maps hardware frames through `ra_hwdec_mapper` the way `vo_gpu_next` does. Icefin passes its display
(`src/icefin/render/VulkanVideo`). Not covered: `hwdec=vulkan` (FFmpeg's Vulkan decoder needs a decode queue the
shared device doesn't create) and the Dolby Vision enhancement layer.

**Icefin's change to the carried diff (`0007`).** The carried backend rendered with libplacebo's default parameters,
so mpv's video options had no effect and the picture differed from stock `vo_gpu_next`, whose defaults differ from
libplacebo's (tone-mapping contrast recovery, peak-detection percentile, dither, debanding). `0007` builds a `pl_options`
from `gl_video_opts` every frame as `vo_gpu_next`'s `update_render_options` and `map_scaler` do, and sets uploaded
frames' colour space, rotation and chroma location as its `map_frame` does. Not mapped: the gpu-next-only options
(tone constants, delayed peak, border, blur, corner rounding, LUTs, user shaders, ICC) and the frame mixer. With
Icefin's compositor giving mpv stock's target for an SDR display, `tests/icefin/web/parity.py` measures the same frame
in Icefin and in stock mpv 0.42 `--vo=gpu-next --gpu-api=vulkan` within 0.3/255 on average (lab, lavapipe).

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
