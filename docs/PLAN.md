# Icefin Player — Plan

Task tracker for Icefin Player 1.0. Tick a task (`- [ ]` → `- [x]`) in the same commit as the work.
Design detail for every task is in `docs/SPEC.md` (section names in brackets). Estimates are for one
developer; total about 42 weeks, or about 38 weeks if Phase 2 switches to the two-window contingency.

## Phase 1 — Fork setup and baseline (2 wks)
- [x] **1.1** Bring upstream jellyfin-desktop `v2.0.0` into this repo with `scripts/bootstrap-fork.sh` (keeps Icefin docs; sets up `upstream` remote and `icefin/base` tag)
- [x] **1.2** Create the feature-branch stack `brand, flatpak, audio, gpu, render, hdr, input, theme` and the nightly rebase-canary CI job [Fork, branding and upstream sync]
- [x] **1.3** Branding: binary/package `icefin-player`, display name Icefin Player, app ID, data/cache/log paths, `appName` in `nativeshell.js`, About page with upstream base version
- [x] **1.4** Add the `ICEFIN-HOOK` marker convention and a CI check that counts hook lines in upstream files
- [x] **1.5** Write `flatpak/` manifest from Flathub's `org.jellyfin.JellyfinDesktop`, new app ID; CI builds it and runs unit tests in the sandbox [Flatpak packaging]
- [x] **1.6** Remove update checks in Flatpak builds (`ICEFIN_FLATPAK` drops `updatePlugin.js`)
- [x] **1.7** Stand up the lab: guests per `docs/LAB.md`, containerized Jellyfin 10.11.x and 12.x servers with the regression plugins installed
- [x] **1.8** Baseline report: measure every acceptance goal against unmodified upstream v2.0.0 and write `docs/BASELINE-REPORT.md`
- [x] **1.9** Hardware lab: the HTPC tier (D16): `scripts/icefin/htpc.sh` (deploy from the lab repo, run in the TV session, HDR/passthrough probe, house rules), tested end to end on a stand-in guest
- [ ] **1.10** Hardware baseline on the HTPC: SSH access from the user, then the hardware rows of `docs/BASELINE-REPORT.md` (unattended rows done 2026-11-09, BASELINE-REPORT *Hardware rows*; open: the TV's HDR badge and the receiver's display, deferred to the user)
- [x] **1.11** Virtual AV tier (D18): `hda-hdmi-sink` QEMU device, nested client, ELD profiles, `matrix.py` rows for ELD, hotplug, bit-exact bitstreams and PCM [Testing, CI and hardware lab] (12/12 rows; ELD fixtures now the kernel's real text)

## Phase 2 — Platform spikes (4 wks)
- [x] **2.1** Spike: Qt Quick on Qt's Vulkan backend with Qt WebEngine working inside it
- [x] **2.2** Spike: patched libmpv rendering through libplacebo on Qt's shared Vulkan device
- [x] **2.3** Spike: HDR swapchain format and Wayland surface tagging on KWin and Mutter
- [x] **2.4** Spike: same renderer as a Gamescope XWayland client, HDR via Gamescope WSI, inside the Flatpak (GO: HDR10 swapchain through Flathub's gamescope VulkanLayer in a nested Gamescope and in Steam's game-mode UI on an RTX 4090, 2026-11-09; the HTPC re-run waits for the user's OK to install the extension there)
- [ ] **2.5** Spike: SDR UI brightness over HDR video (reference white) (not gating; inputs known (reference white 200 on KWin, Qt sdrWhiteLevel 200); the visual check runs with 5.8)
- [x] **2.6** Spike: runtime IEC958 format setting on PipeWire and PulseAudio; device reservation for exclusive ALSA (GO: built as 3.4 and 3.5; HDMI result in 3.8)
- [x] **2.7** Spike: `icefin-theme:` scheme vs jellyfin-web CSP; WebEngine Gamepad API exposure (Steam Input virtual pad visibility moved to 7.4)
- [x] **2.8** Spike: NVIDIA Vulkan HDR on Wayland (GO at swapchain level on an RTX 4090, KWin 6.6 Wayland and nested Gamescope with the WSI layer: HDR10 on a 10-bit swapchain; the driver doesn't tag the surface; `docs/SPIKES.md`)
- [x] **2.9** Write go/no-go per spike in `docs/SPIKES.md`; a no-go on 2.1–2.3 switches the plan to the two-window contingency (2.1–2.3 all go: Phase 5 stays single-surface; summary in `docs/SPIKES.md` 2.9)

## Phase 3 — Audio subsystem (4 wks)
- [x] **3.1** `audio.backend` setting (Auto, PipeWire, PulseAudio, JACK, ALSA) mapped to mpv `ao`; hide passthrough under JACK [Audio subsystem]
- [x] **3.2** ELD reader: map sink to ALSA card/device, parse `/proc/asound/card*/eld#*`, stale handling
- [x] **3.3** Per-track passthrough decision (user ∩ receiver ∩ backend; DTS core, LPCM fallbacks)
- [x] **3.4** Runtime IEC958 format setting via device-restore; WirePlumber drop-in fallback (`Iec958Formats`; the rule is offered to copy in Client Settings → Audio test; HDMI result checked in 3.8 on the HTPC)
- [x] **3.5** Exclusive ALSA with `org.freedesktop.ReserveDevice1` reservation
- [x] **3.6** Never-silent fallback replacing `audio-fallback-to-null` (PCM retry → release reservation → default device → notice)
- [x] **3.7** Per-device audio delay; CEC volume during passthrough; UI sounds muted during passthrough (CEC verified with the receiver in 3.8; UI sounds read `AudioState` from 8.5)
- [ ] **3.8** Audio test page; receiver run of every audio acceptance row (page done: Client Settings → Audio test, `tests/icefin/web/audio_test_page.py`; open: the receiver run on the HTPC)
- [ ] **3.9** Icefin in the avsim client: per-track decision against every sink profile's `expect` map, ELD re-read on hotplug, stale result in standby, never-silent fallback on unplug (`matrix.py --player icefin`). Known: a sink whose ELD stops at 48 kHz can't open E-AC-3's 192 kHz stream and mpv 0.40 stalls instead of failing, so the decision must pick PCM from the ELD

## Phase 4 — GPU and display (2 wks)
- [x] **4.1** Decoder self-test on bundled samples and Settings → Hardware page [GPU acceleration and display] (hardware results on real GPUs: 4.5)
- [x] **4.2** `hardwareDecoding` options: Auto (auto-safe), VA-API, NVDEC, Vulkan, Copy, Off; renderer shown on debug overlay (`src/icefin/gpu/Hwdec`; upstream values migrate)
- [x] **4.3** WebEngine GPU-rasterization check and `QTWEBENGINE_FORCE_USE_GBM=0` switch (Hardware page; Client Settings → Web GPU Buffers)
- [x] **4.4** Multi-display HDR probe re-run on output change; measure low-power (`dmabuf-wayland`) savings for post-1.0 (re-run done with 6.1; power on the HTPC: 45 W `gpu-next` vs 37 W `dmabuf-wayland` for 4K HDR10 HEVC, BASELINE-REPORT)
- [ ] **4.5** Confirm zero-copy hardware decode on AMD, Intel and NVIDIA inside the Flatpak (AMD done: zero-copy on Plasma; on Gamescope after the EGL-on-xcb fix; NVIDIA RTX 4090, driver 595.99.02: hardware decode of all four samples in the nightly Flatpak on Plasma Wayland and in Gamescope, but `nvdec-copy`, not zero-copy, 2026-11-09; real playback with Auto picked zero-copy NVDEC (`cuda` frames) and showed a black picture on the OpenGL renderer, so Auto now takes the copy path on NVIDIA until the Vulkan renderer (5.x); NVIDIA zero-copy on the Vulkan path since #62 (5.3), RTX 4090, 2026-11-10; the OpenGL path keeps copy mode; open: Intel)

## Phase 5 — Single-surface renderer (7 wks)
- [x] **5.1** Switch Qt Quick to the Vulkan backend; create the shared Vulkan device with explicit features [Rendering, playback routing and HDR] (`src/icefin/render/VulkanDevice`, setting `main.icefin_renderer`; Auto stays OpenGL until 5.3; on the RTX 4090 Qt Quick renders on the shared device with 13 extensions incl. DMA-BUF, DRM modifiers, HDR metadata and Vulkan Video decode; `renderer_choice.py`)
- [x] **5.2** Patched libmpv in `external/mpv` with a Vulkan render API; pin version; pass the compositor's target description (primaries, transfer, peak luminance, reference white from HdrCapabilityProbe) into the render call instead of relying on --target-colorspace-hint (D23) (done: mpv v0.42.0 + 2 patches, libplacebo v7.387.0, the Flatpak applies them, `external/mpv/build-lab.sh` for lab builds, `test_icefin_gpu` checks the API in the Flatpak build (#51); the compositor target as mpv's target-* options from `src/icefin/render/MpvTarget`, Icefin's `0003`, seen reaching mpv on the RTX 4090 (#54))
- [ ] **5.3** `VulkanVideoItem` replacing `MpvVideoItem` on the Vulkan path; DMA-BUF import of hwdec frames (done (#54): `src/icefin/render/VulkanVideo` draws mpv's gpu-next output into the scene graph on the shared device; Icefin's mpv `0004` hands the image back in its layout, `0005` scales with libplacebo's defaults instead of nearest; a GPU wait after each frame works around Qt WebEngine 6.11 freeing in-flight web frames (Xid 109 on NVIDIA); SDR and HDR10 play clean under validation on the RTX 4090 with copy-mode NVDEC and software decoding; zero-copy since #62 (Icefin's mpv `0006` loads mpv's hwdec interops on the shared device): NVDEC `cuda` frames, SDR 1280x720 nv12 and HDR10 3840x2160 p010, play clean under validation on the RTX 4090; open: VAAPI DMA-BUF import on AMD (HTPC, lab window) and Intel)
- [ ] **5.4** Linear-light compositing and HDR10 / extended-sRGB encode pass with mastering metadata; decide and record the colour space the web UI is blended in over video and the native backdrop (UI flattened in sRGB, or linear light with alpha compensation); re-run tests/icefin/themes/lab-contrast and the bundled theme suites on the Vulkan path (D23)
- [ ] **5.5** Wayland surface tagging via `wp_color_manager_v1`
- [ ] **5.6** X11/Gamescope backend with Vulkan HDR10 color space and `VK_EXT_hdr_metadata`
- [ ] **5.7** OpenGL fallback wiring (MpvQt) when Vulkan is unavailable
- [ ] **5.8** Verify HDR10/HLG signals on KWin, Mutter and Gamescope; jellyfin-web controls readable over video; 60 fps UI on lowest-spec HTPC; parity matrix on the HTPC against stock mpv 0.42 --vo=gpu-next --gpu-api=vulkan with the same files: HDR10, HLG, HDR10+, Dolby Vision 5 and 8, and 7 FEL; includes 2.5's visual reference-white check (D23)
- [ ] **5.9** Phase 5 exit review (D23): `docs/reviews/PHASE5-EXIT.md` answers: did the shared device hold on AMD, NVIDIA and Intel; did the patched render path reach parity with stock gpu-next; which D23 theme-engine items remain; the proposed scope of 6.7; whether the secondary playback windows (low-power dmabuf-wayland, mpv-native fallback) are worth carrying; upstream and mpv render-API PR status. The user signs off before 6.7 starts
- [ ] **5.10** Virtual HDR display: headless Weston 15+ with color management (built in the lab; Debian 13 ships 14), protocol log of the image description per routing row, in CI and the Virtual AV tier

## Phase 6 — Router, capability prompt and token engine (4 wks)
- [ ] **6.1** `HdrCapabilityProbe` (Wayland image description; Vulkan color spaces under X11) (Wayland done: `src/icefin/render/HdrCapabilityProbe`; open: the X11/Gamescope Vulkan colour-space path, with 5.6)
- [x] **6.2** `PlaybackRouter` implementing the routing table (`src/icefin/render/PlaybackRouter`; logs its decision at load until 6.3 acts on it)
- [x] **6.3** Capability prompt with per-device "remember" and Settings reset (`RouterComponent`, `native/icefin/capabilityPrompt.js`; reset in Client Settings → Hardware; "switch to Vulkan" appears with 5.1; asks once per play action, before cinema-mode intros, D21)
- [x] **6.4** Auto device profile replacing static force-transcode toggles (`native/icefin/deviceProfile.js`; the toggles stay as overrides; Vulkan HDR direct-play arrives with 5.x)
- [x] **6.5** `ThemeComponent` token loading and the web token engine, so controls and prompt are themed (the prompt reads `ThemeComponent::tokens()` when 6.3 lands; token set: `docs/themes/TOKENS.md`)
- [ ] **6.6** Verify every routing row; playback reports match upstream; DV5 on OpenGL raises the prompt
- [ ] **6.7** Client-side capability model (D23): one model fed by mpv (decoders, hwdec self-test, renderer features, libplacebo version), HdrCapabilityProbe and the ELD reader; drives PlaybackRouter, the Auto device profile and a read-only `icefinTheme.system` for themes. Blocked until 5.9; scope set there

## Phase 7 — Controller layer (2 wks)
- [x] **7.1** SDL3 `GamepadService` replacing `InputSDL` (build flag), hotplug, multiple pads, battery [Controller support] (`-DENABLE_SDL2=OFF -DICEFIN_SDL3=ON`, on in the Flatpak)
- [x] **7.2** Standard action map, per-controller remapping, Nintendo layout option (map `src/icefin/inputmaps/icefin-gamepad.json`; remap editor in Client Settings → Controllers)
- [x] **7.3** Glyph-family detection and button-prompt tokens (`data-icefin-glyphs`, `icefinTheme.glyph()`)
- [ ] **7.4** Steam Input handling, recommended Steam layout, duplicate-input guard (Steam desktop layout only); verify Steam Input's virtual pad visibility (from spike 2.7) (game mode checked 2026-11-09, nested on the workstation: only Steam Virtual Gamepad is visible, no duplicate; open: its glyph family reads "generic" because the Flatpak's private /tmp hides `SteamVirtualGamepadInfo`, the desktop-mode guard and the recommended layout; `docs/SPIKES.md` 2.8)
- [x] **7.5** Hide `navigator.getGamepads` from the page; Controllers settings page (Client Settings → Controllers)
- [ ] **7.6** Controller run of all screens inside and outside Steam

## Phase 8 — Theme-engine layer (5 wks)
- [x] **8.1** Baseline control theme first (stock jellyfin-web look, every engine layer on) [Benchmark clone themes] (bundled `themes/baseline`; pixel-identical to stock on jellyfin-web 10.12+; 10.11's older palette differs slightly, measured in `theme_baseline.py`)
- [x] **8.2** Three-way plugin runs in CI: engine off, Baseline, styled themes (runs in the lab: `tests/icefin/web/theme_plugins.py`; the plugin servers live there, not on GitHub Actions)
- [x] **8.3** Web runtime `native/icefin/themeEngine.js` appended to the injected shell script; `icefin-theme:` scheme [Theme-engine layer] (package format: `docs/themes/PACKAGE.md`)
- [x] **8.4** Native backdrop layer (QML shaders); measure transparent web-view cost (built: `qml/icefin/Backdrop.qml` under the web view (ICEFIN-HOOK), `src/icefin/theme/Backdrop` bakes theme GLSL with Qt ShaderTools or checks a `.qsb`, token-driven params with live palettes, hidden during video, user-theme shaders need trust; Tide's wave and Media Center's ribbons moved to it; `theme_backdrop.py`, unit tests; HTPC run 2026-11-10 (`htpc.sh web theme_backdrop.py`, jf12, 4K): every check passes, gradient through the page, 30 fps, GPU busy 5.5% on vs 0.2% hidden; a page that painted before the backdrop keeps stale pixels, so the page reloads once when a backdrop appears over a loaded page (user's call; #63, screens also wait for sign-in); fixed on the way: mpv's idle window taken for video (#56), stale Flatpak QML cache (#57), tests' connect race (#58); repaint probe for diagnosis (#61))
- [x] **8.5** Package validation and trust levels; per-user settings in DisplayPreferences; stand-down rule; UI sounds (silent while `Icefin::Audio::AudioState::uiSoundsMuted`) (schemas `docs/themes/schema/`; Client Settings → Theme picker; passthrough mute verified with the receiver in 3.8)
- [ ] **8.6** Media Center reference theme; benchmark checklist passes (first version bundled: `themes/media-center`, start strip, focus glow, ribbons on the native backdrop (8.4, CSS fallback), sounds, Now Playing inset; open: themed poster wall and details, the full checklist)
- [x] **8.7** Stable theme script API (D23): themes reach Icefin only through `ctx` and `window.icefinTheme` (add `ctx.play()` and `ctx.nowPlaying()`, reserve `icefinTheme.system`); bundled and benchmark themes migrated off `window.ApiClient` and `window.icefinPlaybackManager`; theme-lint rejects raw host globals in `themes/` (`icefinTheme.apiVersion` 1, also `ctx.canPlay()`, `ctx.move()` and `icefinTheme.ctx`; Media Center and all eleven clones migrated, `icefinTheme._engine` off-limits too; theme-lint rule 4; table in `docs/themes/PACKAGE.md`; `capability_prompt.py` checks `ctx.play` goes through the prompt)

## Phase 9 — Benchmark clone themes (15 wks)
- [ ] **9.1** Reference captures for the eleven targets
- [x] **9.2** Generic capabilities: 3D carousel, paged grid, live tiles, muted previews (`native/icefin/capabilities.js`; 60 fps on the lowest-spec HTPC checked with the clones)
- [x] **9.3** Generic capabilities: top bar and side rail, pivot headers, pointer-first mode, global overlay, low-motion profile (`icefinTheme.ui`, `docs/themes/PACKAGE.md`)
- [ ] **9.4** Harbor (Kodi Estuary layout) (built: `themes/harbor`; menu rail, shelves, fanart layer, info dialog, five-way navigation, `tests/icefin/web/theme_harbor.py`; open: layout and timing against the 9.1 reference captures)
- [ ] **9.5** Spark (Fire TV layout) (built: `themes/spark`; top bar, hero carousel with muted previews after a dwell (series preview their first episode), recycled 16:9 rows (nine tiles in the DOM for a 300-item row), hero shrinks when rows have focus, `tests/icefin/web/theme_spark.py`; open: layout and timing against the 9.1 reference captures)
- [ ] **9.6** Plum (Roku TV layout) (built: `themes/plum`; header with clock, menu column, grid of large tiles (three wide on Home with the libraries first, four posters in a library), theme-level low-motion cap, row-stepped grid with art loaded near the visible rows, `tests/icefin/web/theme_plum.py`; lab run passes 2026-11-09; open: layout and timing against the 9.1 reference captures)
- [ ] **9.7** Plaza (Wii Menu layout) (built: `themes/plaza`; paged 4×3 grid of rounded channel tiles with live previews, page arrows, bottom bar with clock, date and two round buttons, pointer-first, zoom into a channel screen (Menu, Start), light tokens, `tests/icefin/web/theme_plaza.py`; lab run passes 2026-11-09; open: layout and timing against the 9.1 reference captures)
- [ ] **9.8** Orbit (Xbox 360 NXE layout) (built: `themes/orbit`; vertical channel stack, each a 3D carousel receding in depth, parallax backdrop, guide panel over any screen via the global overlay, `tests/icefin/web/theme_orbit.py`; lab run passes 2026-11-09; open: layout and timing against the 9.1 reference captures)
- [ ] **9.9** Mosaic (Xbox 360 Metro layout) (built: `themes/mosaic`, id renamed from `pivot` so it can't collide with the engine's `ui.pivot`; large lowercase pivot headers, per-section grids of flat tiles in three sizes, live tiles, `tests/icefin/web/theme_mosaic.py`; lab run passes 2026-11-09; open: layout and timing against the 9.1 reference captures)
- [x] **9.11** Generic capabilities for Lumen and Marquee: focus parallax and highlight, translucent materials, expanding side rail, in-row card expansion (D19) [Benchmark clone themes] (`ui.parallax`, `ui.material` with `material.*` tokens and a frame-rate watch that falls back to opaque under 50 fps, side rail `collapsedWidth`, `ui.cardExpand`; `theme_capabilities.py`)
- [ ] **9.12** Lumen (Apple TV layout) (built: `themes/lumen`; frosted tab bar that hides once focus leaves it, full-bleed top shelf following the focused item, poster rows that lift and tilt with a moving highlight, `tests/icefin/web/theme_lumen.py`; open: layout and timing against the 9.1 reference captures)
- [ ] **9.13** Marquee (Netflix layout) (built: `themes/marquee`; icon rail that widens with labels on focus, billboard with a muted trailer after a dwell that shrinks the title, rows that jump by a page, cards that grow into an inline preview, `tests/icefin/web/theme_marquee.py`; open: layout and timing against the 9.1 reference captures)
- [x] **9.14** Generic capabilities for Almanac, Arcade and Tide: guide grid, on-screen keyboard, time-of-day palettes (D19) [Benchmark clone themes] (`ui.guideGrid`, `ui.keyboard`, `ui.timePalette` with `palettes.*` tokens, Live TV channels in `ui.mutedPreview`; `theme_capabilities.py`; lab Live TV data: `tests/icefin/servers/livetv.py`)
- [ ] **9.15** Almanac (TiVo / cable guide layout) (built: `themes/almanac`; Home and Live TV open a guide grid with channel numbers, a now line, an info pane and the focused channel live and muted in the corner, `tests/icefin/web/theme_almanac.py`; open: layout and timing against the 9.1 reference captures)
- [ ] **9.16** Arcade (Steam Big Picture layout) (built: `themes/arcade`; capsule shelves led by a hero capsule, a seven-wide library grid with sort and filter dialogs, a quick-access panel from the right over any screen, glyph button hints, the on-screen keyboard, `tests/icefin/web/theme_arcade.py`; open: layout and timing against the 9.1 reference captures)
- [ ] **9.17** Tide (PS3 XMB layout; needs the native backdrop, 8.4) (built: `themes/tide`; category icons crossing an item column at a fixed point, gradient colours by month and shade by time of day through `ui.timePalette`, the wave on the native backdrop (8.4; a web canvas when there's none), still under low motion, original line icons, `tests/icefin/web/theme_tide.py`; open: layout and timing against the 9.1 reference captures)
- [ ] **9.10** All clone acceptance lists pass (9.4–9.9, 9.12, 9.13, 9.15–9.17); lint finds no theme-specific engine code

## Phase 10 — Upstream sync (1 wk)
- [ ] **10.1** Merge upstream jellyfin-desktop 2.1.0 (or latest release) into `main` via `sync/upstream-<ver>` (`docs/BRANCHING.md`); full suite passes
- [ ] **10.2** Send generic fixes upstream (ELD, audio fallback, Flatpak CI, Wayland work)

## Phase 11 — Hardening and beta (2 wks)
- [ ] **11.1** Full hardware-lab matrix [Testing, CI and hardware lab]
- [x] **11.2** Log redaction check; security review of theme trust levels (`tests/icefin/web/log_redaction.py`, `docs/security/THEME-TRUST-REVIEW.md`; re-review with 8.4)
- [ ] **11.3** Beta on the nightly channel; no open P1 bugs

## Phase 12 — Release 1.0 (1 wk)
- [ ] **12.1** Stable Flatpak channel (signed self-hosted repo, `.flatpakrepo`/`.flatpakref`)
- [x] **12.2** Install docs (device approval, udev rules, WirePlumber note) and compatibility table (`docs/INSTALL.md`; the table is updated as hardware runs land)
- [ ] **12.3** Tag 1.0 with source published
