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
- [ ] **1.10** Hardware baseline on the HTPC: SSH access from the user, then the hardware rows of `docs/BASELINE-REPORT.md`

## Phase 2 — Platform spikes (4 wks)
- [x] **2.1** Spike: Qt Quick on Qt's Vulkan backend with Qt WebEngine working inside it
- [x] **2.2** Spike: patched libmpv rendering through libplacebo on Qt's shared Vulkan device
- [x] **2.3** Spike: HDR swapchain format and Wayland surface tagging on KWin and Mutter
- [ ] **2.4** Spike: same renderer as a Gamescope XWayland client, HDR via Gamescope WSI, inside the Flatpak
- [ ] **2.5** Spike: SDR UI brightness over HDR video (reference white)
- [ ] **2.6** Spike: runtime IEC958 format setting on PipeWire and PulseAudio; device reservation for exclusive ALSA
- [x] **2.7** Spike: `icefin-theme:` scheme vs jellyfin-web CSP; WebEngine Gamepad API exposure (Steam Input virtual pad visibility moved to 7.4)
- [ ] **2.8** Spike: NVIDIA Vulkan HDR on Wayland
- [ ] **2.9** Write go/no-go per spike in `docs/SPIKES.md`; a no-go on 2.1–2.3 switches the plan to the two-window contingency

## Phase 3 — Audio subsystem (4 wks)
- [x] **3.1** `audio.backend` setting (Auto, PipeWire, PulseAudio, JACK, ALSA) mapped to mpv `ao`; hide passthrough under JACK [Audio subsystem]
- [x] **3.2** ELD reader: map sink to ALSA card/device, parse `/proc/asound/card*/eld#*`, stale handling
- [x] **3.3** Per-track passthrough decision (user ∩ receiver ∩ backend; DTS core, LPCM fallbacks)
- [ ] **3.4** Runtime IEC958 format setting via device-restore; WirePlumber drop-in fallback
- [x] **3.5** Exclusive ALSA with `org.freedesktop.ReserveDevice1` reservation
- [x] **3.6** Never-silent fallback replacing `audio-fallback-to-null` (PCM retry → release reservation → default device → notice)
- [x] **3.7** Per-device audio delay; CEC volume during passthrough; UI sounds muted during passthrough (CEC verified with the receiver in 3.8; UI sounds read `AudioState` from 8.5)
- [ ] **3.8** Audio test page; receiver run of every audio acceptance row

## Phase 4 — GPU and display (2 wks)
- [x] **4.1** Decoder self-test on bundled samples and Settings → Hardware page [GPU acceleration and display] (hardware results on real GPUs: 4.5)
- [x] **4.2** `hardwareDecoding` options: Auto (auto-safe), VA-API, NVDEC, Vulkan, Copy, Off; renderer shown on debug overlay (`src/icefin/gpu/Hwdec`; upstream values migrate)
- [x] **4.3** WebEngine GPU-rasterization check and `QTWEBENGINE_FORCE_USE_GBM=0` switch (Hardware page; Client Settings → Web GPU Buffers)
- [ ] **4.4** Multi-display HDR probe re-run on output change; measure low-power (`dmabuf-wayland`) savings for post-1.0
- [ ] **4.5** Confirm zero-copy hardware decode on AMD, Intel and NVIDIA inside the Flatpak

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
- [ ] **6.1** `HdrCapabilityProbe` (Wayland image description; Vulkan color spaces under X11)
- [x] **6.2** `PlaybackRouter` implementing the routing table (`src/icefin/render/PlaybackRouter`; logs its decision at load until 6.3 acts on it)
- [ ] **6.3** Capability prompt with per-device "remember" and Settings reset
- [ ] **6.4** Auto device profile replacing static force-transcode toggles
- [x] **6.5** `ThemeComponent` token loading and the web token engine, so controls and prompt are themed (the prompt reads `ThemeComponent::tokens()` when 6.3 lands; token set: `docs/themes/TOKENS.md`)
- [ ] **6.6** Verify every routing row; playback reports match upstream; DV5 on OpenGL raises the prompt

## Phase 7 — Controller layer (2 wks)
- [ ] **7.1** SDL3 `GamepadService` replacing `InputSDL` (build flag), hotplug, multiple pads, battery [Controller support]
- [ ] **7.2** Standard action map, per-controller remapping, Nintendo layout option
- [ ] **7.3** Glyph-family detection and button-prompt tokens
- [ ] **7.4** Steam Input handling, recommended Steam layout, duplicate-input guard (Steam desktop layout only); verify Steam Input's virtual pad visibility (from spike 2.7)
- [ ] **7.5** Hide `navigator.getGamepads` from the page; Controllers settings page
- [ ] **7.6** Controller run of all screens inside and outside Steam

## Phase 8 — Theme-engine layer (5 wks)
- [x] **8.1** Baseline control theme first (stock jellyfin-web look, every engine layer on) [Benchmark clone themes] (bundled `themes/baseline`; pixel-identical to stock on jellyfin-web 10.12+; 10.11's older palette differs slightly, measured in `theme_baseline.py`)
- [ ] **8.2** Three-way plugin runs in CI: engine off, Baseline, styled themes
- [x] **8.3** Web runtime `native/icefin/themeEngine.js` appended to the injected shell script; `icefin-theme:` scheme [Theme-engine layer] (package format: `docs/themes/PACKAGE.md`)
- [ ] **8.4** Native backdrop layer (QML shaders); measure transparent web-view cost
- [x] **8.5** Package validation and trust levels; per-user settings in DisplayPreferences; stand-down rule; UI sounds (silent while `Icefin::Audio::AudioState::uiSoundsMuted`) (schemas `docs/themes/schema/`; Client Settings → Theme picker; passthrough mute verified with the receiver in 3.8)
- [ ] **8.6** Media Center reference theme; benchmark checklist passes

## Phase 9 — Benchmark clone themes (8 wks)
- [ ] **9.1** Reference captures for the six targets
- [ ] **9.2** Generic capabilities: 3D carousel, paged grid, live tiles, muted previews
- [ ] **9.3** Generic capabilities: top bar and side rail, pivot headers, pointer-first mode, global overlay, low-motion profile
- [ ] **9.4** Harbor (Kodi Estuary layout)
- [ ] **9.5** Spark (Fire TV layout)
- [ ] **9.6** Plum (Roku TV layout)
- [ ] **9.7** Plaza (Wii Menu layout)
- [ ] **9.8** Orbit (Xbox 360 NXE layout)
- [ ] **9.9** Pivot (Xbox 360 Metro layout)
- [ ] **9.10** All clone acceptance lists pass; lint finds no theme-specific engine code

## Phase 10 — Upstream sync (1 wk)
- [ ] **10.1** Merge upstream jellyfin-desktop 2.1.0 (or latest release) into `main` via `sync/upstream-<ver>` (`docs/BRANCHING.md`); full suite passes
- [ ] **10.2** Send generic fixes upstream (ELD, audio fallback, Flatpak CI, Wayland work)

## Phase 11 — Hardening and beta (2 wks)
- [ ] **11.1** Full hardware-lab matrix [Testing, CI and hardware lab]
- [ ] **11.2** Log redaction check; security review of theme trust levels
- [ ] **11.3** Beta on the nightly channel; no open P1 bugs

## Phase 12 — Release 1.0 (1 wk)
- [ ] **12.1** Stable Flatpak channel (signed self-hosted repo, `.flatpakrepo`/`.flatpakref`)
- [ ] **12.2** Install docs (device approval, udev rules, WirePlumber note) and compatibility table
- [ ] **12.3** Tag 1.0 with source published
