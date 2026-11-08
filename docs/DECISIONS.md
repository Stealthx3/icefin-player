# Decisions

All decisions made with the user during planning on 2026-11-07 (Cowork session). Add new ones at the bottom with a date.

| # | Date | Decision | Choice | Notes |
|---|---|---|---|---|
| D1 | 2026-11-07 | Build approach | Fork jellyfin-desktop at tag `v2.0.0` (commit `1634d3d`) | Chosen over a server-side theme plugin and over a client built from scratch. The theme package format stays compatible with a future server plugin. |
| D2 | 2026-11-07 | Name | `icefin-player`, display name Icefin Player | App ID owner/domain still open (see HANDOFF). |
| D3 | 2026-11-07 | Theme engine | Theme-agnostic engine; Media Center (last Windows Media Center look, original assets only) is the reference theme | Engine may not contain theme ids or theme-specific values. |
| D4 | 2026-11-07 | HDR architecture for 1.0 | Single Vulkan surface (UI + video) on Wayland, with an X11 fallback used by Gamescope's XWayland | Two-window design is the contingency if Phase 2 spikes 2.1–2.3 fail (about 38 weeks instead of 42). |
| D5 | 2026-11-07 | Display servers | Wayland-first: native X11 desktops unsupported and untested; X11 code kept for the Gamescope fallback | Upstream X11 files stay to keep rebases clean. |
| D6 | 2026-11-07 | Sources a path can't show correctly | Show the user the options available on their system and let them choose (capability prompt) | Main case: Dolby Vision 5/8 on the OpenGL fallback. |
| D7 | 2026-11-07 | Phase order | Token engine built in Phase 6 with the router, so controls and prompt are themed from the start | |
| D8 | 2026-11-07 | Controllers | Primary goal: SDL3 gamepad API, Steam Input cooperation, Xbox-style (XInput-layout) pads | Replaces upstream's per-model joystick maps. |
| D9 | 2026-11-07 | Benchmark themes | Seven clone themes, all required for 1.0, final names: Baseline (stock jellyfin-web; plugin-compatibility control), Harbor (Kodi Estuary), Spark (Fire TV), Plum (Roku TV), Plaza (Wii Menu), Orbit (Xbox 360 NXE), Pivot (Xbox 360 Metro) | Icefin branding, original assets. Baseline and Media Center bundled by default (pending confirmation); others in an optional benchmark pack. |
| D10 | 2026-11-07 | Plugin compatibility testing | Three-way runs: engine off, Baseline, each styled theme | Baseline failure = engine bug; styled-only failure = theme gap. |
| D11 | 2026-11-07 | Long term (after 1.0) | Decouple from upstream completely (hard fork), then drop X11 | X11 can go only once Gamescope runs Icefin reliably as a native Wayland client. |
| D12 | 2026-11-07 | Packaging | Flatpak only; self-hosted signed repo first, Flathub after 1.0 | |
| D13 | 2026-11-07 | App ID | `io.github.stealthx3.IcefinPlayer` | Owner = GitHub account Stealthx3. Resolves the D2 open point. |
| D14 | 2026-11-07 | Repository | Public GitHub repo `Stealthx3/icefin-player` as `origin`; `upstream` = jellyfin/jellyfin-desktop | Default branch `icefin/main`. |
