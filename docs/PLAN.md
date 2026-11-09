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

## Phase 2 — Platform spikes (4 wks)
- [x] **2.1** Spike: Qt Quick on Qt's Vulkan backend with Qt WebEngine working inside it
- [x] **2.2** Spike: patched libmpv rendering through libplacebo on Qt's shared Vulkan device
- [x] **2.3** Spike: HDR swapchain format and Wayland surface tagging on KWin and Mutter
- [x] **2.4** Spike: same renderer as a Gamescope XWayland client, HDR via Gamescope WSI, inside the Flatpak (GO: HDR10 swapchain in game mode with Flathub's gamescope VulkanLayer and `xdg-run/gamescope-0` access, #32)
- [ ] **2.5** Spike: SDR UI brightness over HDR video (reference white)
- [ ] **2.6** Spike: runtime IEC958 format setting on PipeWire and PulseAudio; device reservation for exclusive ALSA
- [x] **2.7** Spike: `icefin-theme:` scheme vs jellyfin-web CSP; WebEngine Gamepad API exposure (Steam Input virtual pad visibility moved to 7.4)
- [ ] **2.8** Spike: NVIDIA Vulkan HDR on Wayland
- [ ] **2.9** Write go/no-go per spike in `docs/SPIKES.md`; a no-go on 2.1–2.3 switches the plan to the two-window contingency

## Phase 3 — Audio subsystem (4 wks)
- [x] **3.1** `audio.backend` setting (Auto, PipeWire, PulseAudio, JACK, ALSA) mapped to mpv `ao`; hide passthrough under JACK [Audio subsystem]
- [x] **3.2** ELD reader: map sink to ALSA card/device, parse `/proc/asound/card*/eld#*`, stale handling
- [x] **3.3** Per-track passthrough decision (user ∩ receiver ∩ backend; DTS core, LPCM fallbacks)
- [x] **3.4** Runtime IEC958 format setting via device-restore; WirePlumber drop-in fallback (`Iec958Formats`; the rule is offered to copy in Client Settings → Audio test; HDMI result checked in 3.8 on the HTPC)
- [x] **3.5** Exclusive ALSA with `org.freedesktop.ReserveDevice1` reservation
- [x] **3.6** Never-silent fallback replacing `audio-fallback-to-null` (PCM retry → release reservation → default device → notice)
- [x] **3.7** Per-device audio delay; CEC volume during passthrough; UI sounds muted during passthrough (CEC verified with the receiver in 3.8; UI sounds read `AudioState` from 8.5)
- [ ] **3.8** Audio test page; receiver run of every audio acceptance row (page done: Client Settings → Audio test, `tests/icefin/web/audio_test_page.py`; open: the receiver run on the HTPC)

## Phase 4 — GPU and display (2 wks)
- [x] **4.1** Decoder self-test on bundled samples and Settings → Hardware page [GPU acceleration and display] (hardware results on real GPUs: 4.5)
- [x] **4.2** `hardwareDecoding` options: Auto (auto-safe), VA-API, NVDEC, Vulkan, Copy, Off; renderer shown on debug overlay (`src/icefin/gpu/Hwdec`; upstream values migrate)
- [x] **4.3** WebEngine GPU-rasterization check and `QTWEBENGINE_FORCE_USE_GBM=0` switch (Hardware page; Client Settings → Web GPU Buffers)
- [x] **4.4** Multi-display HDR probe re-run on output change; measure low-power (`dmabuf-wayland`) savings for post-1.0 (re-run done with 6.1; power on the HTPC: 45 W `gpu-next` vs 37 W `dmabuf-wayland` for 4K HDR10 HEVC, BASELINE-REPORT)
- [ ] **4.5** Confirm zero-copy hardware decode on AMD, Intel and NVIDIA inside the Flatpak (AMD done: zero-copy on Plasma; on Gamescope after the EGL-on-xcb fix; open: Intel and NVIDIA)

## Phase 5 — Single-surface renderer (7 wks)
- [ ] **5.1** Switch Qt Quick to the Vulkan backend; create the shared Vulkan device with explicit features [Rendering, playback routing and HDR]
- [ ] **5.2** Patched libmpv in `external/mpv` with a Vulkan render API; pin version
- [ ] **5.3** `VulkanVideoItem` replacing `MpvVideoItem` on the Vulkan path; DMA-BUF import of hwdec frames
- [ ] **5.4** Linear-light compositing and HDR10 / extended-sRGB encode pass with mastering metadata
- [ ] **5.5** Wayland surface tagging via `wp_color_manager_v1`
- [ ] **5.6** X11/Gamescope backend with Vulkan HDR10 color space and `VK_EXT_hdr_metadata`
- [ ] **5.7** OpenGL fallback wiring (MpvQt) when Vulkan is unavailable
- [ ] **5.8** Verify HDR10/HLG signals on KWin, Mutter and Gamescope; jellyfin-web controls readable over video; 60 fps UI on lowest-spec HTPC

## Phase 6 — Router, capability prompt and token engine (4 wks)
- [ ] **6.1** `HdrCapabilityProbe` (Wayland image description; Vulkan color spaces under X11) (Wayland done: `src/icefin/render/HdrCapabilityProbe`; open: the X11/Gamescope Vulkan colour-space path, with 5.6)
- [x] **6.2** `PlaybackRouter` implementing the routing table (`src/icefin/render/PlaybackRouter`; logs its decision at load until 6.3 acts on it)
- [x] **6.3** Capability prompt with per-device "remember" and Settings reset (`RouterComponent`, `native/icefin/capabilityPrompt.js`; reset in Client Settings → Hardware; "switch to Vulkan" appears with 5.1)
- [x] **6.4** Auto device profile replacing static force-transcode toggles (`native/icefin/deviceProfile.js`; the toggles stay as overrides; Vulkan HDR direct-play arrives with 5.x)
- [x] **6.5** `ThemeComponent` token loading and the web token engine, so controls and prompt are themed (the prompt reads `ThemeComponent::tokens()` when 6.3 lands; token set: `docs/themes/TOKENS.md`)
- [ ] **6.6** Verify every routing row; playback reports match upstream; DV5 on OpenGL raises the prompt

## Phase 7 — Controller layer (2 wks)
- [x] **7.1** SDL3 `GamepadService` replacing `InputSDL` (build flag), hotplug, multiple pads, battery [Controller support] (`-DENABLE_SDL2=OFF -DICEFIN_SDL3=ON`, on in the Flatpak)
- [x] **7.2** Standard action map, per-controller remapping, Nintendo layout option (map `src/icefin/inputmaps/icefin-gamepad.json`; remap editor in Client Settings → Controllers)
- [x] **7.3** Glyph-family detection and button-prompt tokens (`data-icefin-glyphs`, `icefinTheme.glyph()`)
- [ ] **7.4** Steam Input handling, recommended Steam layout, duplicate-input guard (Steam desktop layout only); verify Steam Input's virtual pad visibility (from spike 2.7)
- [x] **7.5** Hide `navigator.getGamepads` from the page; Controllers settings page (Client Settings → Controllers)
- [ ] **7.6** Controller run of all screens inside and outside Steam

## Phase 8 — Theme-engine layer (5 wks)
- [x] **8.1** Baseline control theme first (stock jellyfin-web look, every engine layer on) [Benchmark clone themes] (bundled `themes/baseline`; pixel-identical to stock on jellyfin-web 10.12+; 10.11's older palette differs slightly, measured in `theme_baseline.py`)
- [x] **8.2** Three-way plugin runs in CI: engine off, Baseline, styled themes (runs in the lab: `tests/icefin/web/theme_plugins.py`; the plugin servers live there, not on GitHub Actions)
- [x] **8.3** Web runtime `native/icefin/themeEngine.js` appended to the injected shell script; `icefin-theme:` scheme [Theme-engine layer] (package format: `docs/themes/PACKAGE.md`)
- [ ] **8.4** Native backdrop layer (QML shaders); measure transparent web-view cost
- [x] **8.5** Package validation and trust levels; per-user settings in DisplayPreferences; stand-down rule; UI sounds (silent while `Icefin::Audio::AudioState::uiSoundsMuted`) (schemas `docs/themes/schema/`; Client Settings → Theme picker; passthrough mute verified with the receiver in 3.8)
- [ ] **8.6** Media Center reference theme; benchmark checklist passes (first version bundled: `themes/media-center`, start strip, focus glow, CSS ribbons, sounds, Now Playing inset; open: native ribbon backdrop (8.4), themed poster wall and details, the full checklist)

## Phase 9 — Benchmark clone themes (15 wks)
- [ ] **9.1** Reference captures for the eleven targets
- [x] **9.2** Generic capabilities: 3D carousel, paged grid, live tiles, muted previews (`native/icefin/capabilities.js`; 60 fps on the lowest-spec HTPC checked with the clones)
- [x] **9.3** Generic capabilities: top bar and side rail, pivot headers, pointer-first mode, global overlay, low-motion profile (`icefinTheme.ui`, `docs/themes/PACKAGE.md`)
- [ ] **9.4** Harbor (Kodi Estuary layout) (built: `themes/bench/harbor` in the opt-in benchmark pack, Client Settings → Benchmark Themes; menu rail, shelves, fanart layer, info dialog, five-way navigation, `tests/icefin/web/theme_harbor.py`; open: layout and timing against the 9.1 reference captures)
- [ ] **9.5** Spark (Fire TV layout)
- [ ] **9.6** Plum (Roku TV layout)
- [ ] **9.7** Plaza (Wii Menu layout)
- [ ] **9.8** Orbit (Xbox 360 NXE layout)
- [ ] **9.9** Pivot (Xbox 360 Metro layout)
- [ ] **9.11** Generic capabilities for Lumen and Marquee: focus parallax and highlight, translucent materials, expanding side rail, in-row card expansion (D19) [Benchmark clone themes]
- [ ] **9.12** Lumen (Apple TV layout)
- [ ] **9.13** Marquee (Netflix layout)
- [ ] **9.14** Generic capabilities for Almanac, Arcade and Tide: guide grid, on-screen keyboard, time-of-day palettes (D19) [Benchmark clone themes]
- [ ] **9.15** Almanac (TiVo / cable guide layout)
- [ ] **9.16** Arcade (Steam Big Picture layout)
- [ ] **9.17** Tide (PS3 XMB layout; needs the native backdrop, 8.4)
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
