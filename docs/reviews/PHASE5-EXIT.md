# Phase 5 exit review

_PLAN 5.9 (D23) · written 2026-11-11 · sign-off: the user (below) before 6.7 starts_

Phase 5 built the single-surface renderer: Qt Quick on a shared Vulkan device, mpv rendering through libplacebo into
it, a compositor that blends the web UI over the video and encodes SDR, HDR10 or scRGB, the surface tagged as HDR on
Wayland and through the Vulkan colour space under Gamescope, and an OpenGL fallback. D23 asked six questions at this
gate. The short answers:

| Question | Answer |
|---|---|
| Did the shared device hold on AMD, NVIDIA and Intel? | On NVIDIA, yes. On AMD, only the UI half has run. Intel is untested. |
| Did the patched render path reach parity with stock gpu-next? | Yes for SDR, HDR10 and HLG, in the lab. Dolby Vision and HDR10+ are unverified. |
| Which theme-engine items are still open? | Two of five: the capability source for themes (6.7) and disc menus (Phases 7–9). |
| What scope should 6.7 have? | The capability model with three consumers: the router, the Auto device profile and `icefinTheme.system`. |
| Are the secondary playback windows worth carrying? | Not before 1.0. Drop the mpv-native window; revisit the low-power window after 1.0. |
| Where do upstream and the mpv render-API PRs stand? | Upstream has `v2.1.0-pre1`. All three mpv PRs are still open, and #16818 has changes requested. |

## 1. Did the shared device hold on AMD, NVIDIA and Intel?

**NVIDIA RTX 4090** (driver 595.99.02, KWin 6.6 Wayland, the Flatpak): yes, across the whole path.

- **UI:** Qt Quick renders on Icefin's shared device with 13 extensions (5.1).
- **Video:** mpv renders into it through gpu-next (5.3), with zero-copy NVDEC through Icefin's mpv `0006` (#62). SDR and 4K HDR10 play clean under Khronos validation.
- **HDR:** HDR10 output with the surface tagged on KWin (5.5), which the user checked by eye, and an HDR10 swapchain in a nested Gamescope (5.6).
- **One hang, worked around:** Qt WebEngine 6.11 frees web frames that are still in flight (NVIDIA Xid 109). Icefin works around it by waiting for the GPU after each frame (#54). The cost of that wait is unmeasured on slow GPUs.

**AMD** (the HTPC, RADV): partly.

- **What ran:** Qt Quick on Vulkan with Qt WebEngine (spike 2.1), and Qt's HDR10 swapchain on RADV (2.3, re-checked on Plasma 6.8).
- **What hasn't:** the shared device with mpv's video, the compositor, VAAPI zero-copy into Vulkan (5.3) and HDR output to the TV. HTPC access was blocked (SSH), and D25 moved those rows to 11.1.

**Intel:** no hardware in the lab. Untested.

**Lavapipe** (the lab VM, software Vulkan) runs everything, and every lab test uses it:

- the compositor and the theme suites (20/20 on Vulkan);
- the parity matrix;
- the virtual HDR display (5.10, Weston 16);
- the OpenGL fallback (5.7).

**Verdict:** the design holds wherever it has run. That is one real GPU vendor, which is not enough to make Vulkan the Auto choice.

**Recommendation:** keep Auto on OpenGL (`autoPicksVulkan()` stays false). Vulkan stays the opt-in "Vulkan (experimental)" choice until the video path has run on the HTPC's AMD GPU: playback, VAAPI zero-copy, HDR to the TV and 60 fps UI. Intel follows when hardware is available. If Vulkan breaks while starting, 5.7 restarts on OpenGL, so opting in is safe.

## 2. Did the patched render path reach parity with stock gpu-next?

**Yes, for what can be measured without real sample files.** `tests/icefin/web/parity.py` compares Icefin with stock mpv 0.42 (`--vo=gpu-next --gpu-api=vulkan`):

- stock mpv was built in the lab against the same libplacebo (v7.387.0) and FFmpeg (7.1.5);
- both show the same frame, on lavapipe, in a 1280×720 window, with the same target;
- Icefin's UI layer is hidden for the comparison.

| Film (lab, `make-media.sh`) | Before (mean of 255) | After (mean of 255) | 99th percentile |
|---|---|---|---|
| SDR H.264 | 6.0 / 1.0 / 5.9 | 0.01 / 0.22 / 0.02 | 1 |
| HDR10 HEVC, tone-mapped to SDR | 5.6 / 4.2 / 6.2 | 0.14 / 0.29 / 0.23 | 1 |
| HLG HEVC, tone-mapped to SDR | 13.3 / 13.4 / 13.2 | 0.13 / 0.27 / 0.23 | 1 |

The two gaps the matrix found are fixed (#70):

1. **mpv's render options were ignored.** The backend we carry used libplacebo's defaults. Icefin's mpv `0007` maps mpv's options as `vo_gpu_next` does.
2. **A linear SDR target made libplacebo treat the display as HDR.** Black came out lifted and HLG got the wrong display gamma. For an SDR display, mpv now renders to stock's target and the compositor decodes it.

On the RTX 4090, the compositor's picture matches the old direct path to within 0.2/255.

Not covered:

- **Peak detection:** compared off in both players. On a paused frame it depends on how many times each player rendered the frame (HLG differs by ~12/255 with it on). During playback both run it every frame.
- **Dolby Vision 5 and 8, HDR10+:** no real sample files in the lab, so moved to 11.1 (D25).
- **Dolby Vision 7 FEL:** the backend we carry has no enhancement-layer path (`0006` maps the base layer only). The router already plays profile 7 from its HDR10 base layer and offers a server transcode for the full grade (6.3). FEL must not be advertised in the device profile until it renders.
- **mpv's gpu-next-only options:** tone constants, delayed peak, border, blur, corner rounding, LUTs, user shaders, ICC and the frame mixer stay at libplacebo's defaults (`0007`).
- **Sync semaphores:** still to do. `0004` hands the image back with a host wait on its own timeline semaphore; Icefin doesn't pass `MPV_RENDER_PARAM_VULKAN_SYNC` yet.
- **A bug in the carried code, found while writing this review:** an uninitialised colour-temperature member gave an occasional one-frame white-point shift. It was reported on mpv #16818 and is fixed by `0008` (#71).

## 3. Which theme-engine items are still open?

From the case study's "Theme engine impact" table:

| Item | Status |
|---|---|
| UI blended over video and the backdrop (visual) | **Done.** D24, blended like a browser: the compositor matches the old picture, and the contrast check plus all 20 theme suites pass on Vulkan (5.4). |
| Undocumented host globals (latent API break) | **Done.** 8.7: `ctx.play()`, `ctx.nowPlaying()`; the bundled themes are migrated; lint rule 4. |
| A capability source for themes (additive) | **Open, in 6.7.** `icefinTheme.system` is reserved (8.7); nothing feeds it yet. |
| Disc menus and more prompt options (engine-side) | **Open, not started.** Path 3, Phases 7–9. |
| Secondary playback windows (behaviour, if shipped) | **Not built.** See question 5. |

Theme package schema 1 and theme API v1 needed no breaking change.

## 4. What scope should 6.7 have?

**Proposed scope:**

- **One model:** a `CapabilityModel` under `src/icefin/`, built at startup and refreshed when something changes (display, sink, renderer). It brings together facts Icefin already collects in separate places:
  - decoders, from the decoder self-test (4.1);
  - hwdec interops, from mpv after `0006`;
  - renderer state: Vulkan or OpenGL, compositor, output encoding, HDR output and tag, and the fallback reason;
  - the libplacebo and mpv versions;
  - the display (`HdrCapabilityProbe`, 6.1);
  - the HDMI sink's ELD (3.2).
- **Three consumers:**
  - `PlaybackRouter`, through a `System` assembled from the model;
  - the Auto device profile (6.4), which states only what this machine plays correctly: no Dolby Vision 7 FEL, and HDR only where HDR output or tone mapping is real;
  - `icefinTheme.system`: read-only data plus a `changed` event, added within API v1 (additive; PACKAGE.md documents it).
- **Diagnostics:** the Hardware page and the debug overlay read the same model.
- **Tests:** unit tests for the model and the profile; `capability_prompt.py` and the routing rows re-run.
- **Out of scope:** disc menus, DoP, secondary windows, and new `theme.json` fields (schema 1 stays).

**Size:** about 1–1.5 weeks.

## 5. Are the secondary playback windows worth carrying?

- **Low-power full-screen window** (`dmabuf-wayland`).
  - **For:** it saves about 8 W on the HTPC (45 W vs 37 W, 18%) for 4K HDR10 (4.4).
  - **Against:** it gives up what the single surface exists for. jellyfin-web's controls, theme overlays and Now Playing insets would be hidden during playback, HDR goes through a different path, and Gamescope allows only one window.
  - **Recommendation:** not before 1.0. After 1.0, reconsider it as an opt-in, router-gated mode if HTPC power matters.
- **mpv-native gpu-next fallback window.**
  - **Against:** 5.7 now covers drivers where the shared device fails: Icefin restarts on OpenGL. The user also wants to drop OpenGL eventually for a Vulkan-only build. A second Vulkan-based window doesn't help with a broken Vulkan driver.
  - **Recommendation:** drop it from the plan. When OpenGL goes (a post-1.0 decision), decide then what replaces the fallback.

## 6. Where do upstream and the mpv render-API PRs stand?

Checked 2026-11-11.

- **Upstream jellyfin-desktop (the Qt line):**
  - active: last push 2026-11-09, not archived;
  - tagged `v2.1.0-pre1` (bugfix prerelease) on 2026-11-03;
  - 10.1 (`sync/upstream-2.1.0`) can follow when 2.1.0 is final;
  - Icefin has not sent generic fixes upstream yet (10.2).
- **Jellium Desktop:** not re-checked. Its licence and how it composites are still open (case study).
- **mpv #16818**, "vo_libmpv: introduce 'gpu-next' render backend" (sparks):
  - open, draft, changes requested;
  - last activity 2026-09-16: a review comment reporting the colour-adjustment bug that `0008` fixes.
- **mpv #17828**, "[RFC] libmpv: Libplacebo renderer backend": open, last updated 2026-06-16.
- **mpv #18607**, "[RFC] vo_libmpv: add gpu-next OpenGL render API": open, last updated 2026-10-13.
- **What Icefin carries:** eight mpv patches. Two are from the gpu-next and Vulkan-API work (0001 sparks, 0002 Andrew Rabert). Six are Icefin's: target description, image layout, scalers, hwdec interop, render options, colour adjustment. The risk the case study named stands: nothing has merged upstream, so Icefin maintains this alone.

**Recommendation (path 4):** offer Icefin's fixes back on #16818, with the user's approval since it is posted under their account:
- the layout hand-back (`0004`);
- the hwdec interop (`0006`);
- the option mapping (`0007`);
- confirmation of the colour-adjustment fix (`0008`).

That shares the upkeep and is the cheapest way to cut the patch count later.

## Also found in Phase 5

- **Qt WebEngine 6.11 and Vulkan:** it frees web frames still in flight, so Icefin waits for the GPU after every frame on the Vulkan path (#54). Worth reporting to Qt with the stack trace.
- **HDR toggle needs a restart:** Qt fixes the swapchain format when the window is created, so turning HDR on or off on the display applies after a restart (5.5).
- **X11 / Gamescope has no luminance values:** Vulkan reports none there, so Icefin uses Qt's defaults (1000 nits, SDR white 200). A nested Gamescope also decides HDR exposure at startup from the output its window lands on (5.6).
- **`flatpak kill` leaks helpers:** it leaves a Qt WebEngine helper sandbox behind each time. The lab scripts now quit Icefin gracefully (#68).
- **Still open in Phase 5:**
  - 5.3: VAAPI zero-copy on AMD and Intel (in 11.1);
  - 5.10: the protocol test in CI. GitHub Actions has neither the lab's servers nor a Weston 15+ build; the rows without a film could run there later.

## For sign-off

1. Phase 5 exits, and 6.7 starts with the scope in question 4.
2. Auto stays on OpenGL until the Vulkan video path has run on AMD (the HTPC); Vulkan stays the opt-in choice.
3. Secondary windows: none before 1.0. The mpv-native fallback window leaves the plan; the low-power window is revisited after 1.0.
4. D11 (decoupling) keeps its post-1.0 timing. 10.1 merges upstream 2.1.0 when it is final.
5. Icefin's mpv fixes are offered on mpv #16818, posted only with the user's go-ahead.
