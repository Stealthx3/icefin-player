<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-banner-dark.png">
    <img alt="IceFin Player" src="docs/brand/readme-banner-light.png" width="100%">
  </picture>
</h1>

[![IceFin Player 1.0 progress. Click for the full tracker.](docs/progress/progress-bar.svg)](https://claude.ai/artifact/7SXtcWsFr8pe21DfQ4T7TU)

A themeable, HTPC-first Jellyfin client for Linux. IceFin Player is a fork of [Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop) (v2.0.0). It adds a full theme engine, improves HDR output and HDMI audio passthrough, a new vulkan renderer layer, applies GPU acceleration to more places to provide for a smoother experience, provides in-app diagnostics of target hardware so you know what your system is capable of before configuring it, first-class controller support, and ships as a Flatpak.

> **Status:** alpha ([v0.1.0-alpha.2](https://github.com/Stealthx3/icefin-player/releases/tag/v0.1.0-alpha.2)). The features are in, tested in the virtual lab; real hardware hasn't been tried by testers yet, and some themes are still being finished. Expect rough edges. Track progress in [`docs/PLAN.md`](docs/PLAN.md).

## What it will look like

These are design mock-ups of the 1.0 goals, not screenshots. Titles and artwork are placeholders.

<table>
  <tr>
    <td width="50%"><img src="docs/images/mockups/home-media-center.svg" alt="Home screen in the Media Center theme: a vertical category list with a focused horizontal strip of options and posters"></td>
    <td width="50%"><img src="docs/images/mockups/playback-hdr.svg" alt="HDR playback with on-screen controls, a plugin's Skip intro button over the video, and TrueHD Atmos passthrough status"></td>
  </tr>
  <tr>
    <td><b>Home, Media Center theme.</b> The 10-foot reference theme, fully driven by a controller or remote.</td>
    <td><b>HDR playback.</b> UI and video share one HDR surface, so controls and plugin overlays work over HDR10. Audio goes to the receiver bit-for-bit.</td>
  </tr>
  <tr>
    <td><img src="docs/images/mockups/capability-prompt.svg" alt="A dialog asking how to play a Dolby Vision profile 5 file: tone-map to HDR10, tone-map to SDR, or ask the server to transcode"></td>
    <td><img src="docs/images/mockups/theme-picker.svg" alt="Theme picker with eight themes: Media Center, Baseline, Harbor, Spark, Plum, Plaza, Orbit and Pivot"></td>
  </tr>
  <tr>
    <td><b>Capability prompt.</b> When a source can't be shown correctly, IceFin Player asks instead of playing wrong colors.</td>
    <td><b>Theme picker.</b> The reference theme plus seven clone themes, chosen per user and synced through Jellyfin.</td>
  </tr>
</table>

## Goals

| Goal | What "done" means |
| --- | --- |
| **Keep every server plugin working** | Anything that works in the Jellyfin web client works in IceFin Player, with or without a theme active. |
| **Total UI conversion through themes** | Themes can replace the whole 10-foot interface (layout, navigation, motion, colors, sounds) without code changes to the engine. |
| **HDR on modern Linux** | HDR10 and HLG reach the display on KDE Plasma, GNOME and Gamescope (Steam Deck Game Mode and similar). SDR displays get properly tone-mapped video. |
| **HDMI audio passthrough** | AC3, E-AC3, DTS, DTS-HD MA and TrueHD reach an AV receiver on PipeWire and ALSA. AC3, E-AC3 and DTS also work on PulseAudio, and JACK gets clean multichannel PCM. |
| **Controllers as a first-class input** | Every screen works with Xbox-style, PlayStation, Nintendo and Steam Deck controllers, inside and outside Steam. |
| **GPU acceleration everywhere** | Hardware video decode on AMD, Intel and NVIDIA, and a GPU-rendered UI. |
| **Flatpak as the production package** | One sandboxed package that installs alongside the official Jellyfin Desktop. |

## How it works

**Built on Jellyfin Desktop.** IceFin Player keeps upstream's stack: Qt 6, Qt WebEngine running the server's own jellyfin-web, and libmpv for playback. Because the server's web client still runs inside IceFin Player, server plugins keep working with no extra effort. IceFin Player's changes live in their own directories with small, marked hooks into upstream code, so the fork can follow upstream releases.

**A theme engine, not a skin.** A theme-agnostic engine runs on top of jellyfin-web: router, screen templates, focus and navigation models, transitions, sounds and design tokens. Themes are installable packages, mostly declarative (JSON, CSS, sounds, fonts and shader effects), validated before they load and limited by trust level. Each user's theme choice and color overrides sync through their Jellyfin account.

**One surface for UI and HDR video.** Qt Quick renders on Vulkan, and a patched libmpv draws video through libplacebo into the same surface as the interface. The whole window is composited in linear light and output as HDR10. It is tagged for the compositor through Wayland's color-management protocol, or through Gamescope's Vulkan path. The web player's own controls, skip buttons and plugin overlays therefore work over HDR video unchanged. Machines without usable Vulkan fall back to upstream's OpenGL path in SDR. When a source can't be shown correctly on a given system, IceFin Player asks the user what to do instead of showing a wrong picture.

**Audio that respects the receiver.** IceFin Player reads the receiver's supported formats from HDMI ELD data and decides passthrough per track. It sets up PipeWire and PulseAudio passthrough at runtime, and can take the HDMI device exclusively through the standard device-reservation protocol. If a device fails to open, it falls back to PCM instead of playing silence.

**Measured, not assumed.** A hardware self-test records what each GPU decodes, and IceFin Player uses the result for playback routing and for the device profile it sends the server. A physical lab (HDR TVs, an AV receiver, controllers, remotes) gates every release.

**Wayland-first.** IceFin Player targets Wayland desktops and Gamescope. Native X11 desktops are not supported, though the X11 code path remains for Gamescope.

## Planned features

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/brand/feature-icons/themes.svg"><img src="docs/brand/feature-icons/themes-on-light.svg" alt="" width="28" height="28" align="absmiddle"></picture> **Theme engine**
- Theme packages with design tokens, screen templates, motion presets, sounds and GPU shader backdrops
- Per-user theme, preset and color overrides synced through Jellyfin
- Settings screens generated from each theme's token schema
- Trust levels for themes: user-installed themes are declarative-only unless explicitly trusted
- Media Center reference theme inspired by the classic 10-foot media center look, with original art and sounds
- Layout themes that double as engine benchmarks, each with IceFin Player branding and original assets, released in stages: a theme joins the built-in set once it has been through the refinement pass ([`docs/themes/PIPELINE.md`](docs/themes/PIPELINE.md)), and the rest follow in later updates (packages waiting their turn live in [`themes-later/`](themes-later/)).
  - **Built in now**
    - **Baseline**: the stock Jellyfin look with every engine layer on, used as the control for plugin-compatibility testing
    - **Almanac**: a cable-guide look with an information pane over channel-like rows and a programme guide, modeled on the TiVo and cable guide layout
    - **Arcade**: a controller-first home with a wide hero, feed pills and a bar of button hints, modeled on the Steam Big Picture layout
    - **Harbor**: side menu with shelves of posters over the focused item's fanart, modeled on Kodi's Estuary layout
    - **Lumen**: a translucent tab bar that hides on scroll, a full-bleed top shelf and posters that lift and tilt, modeled on the Apple TV layout
    - **Mosaic** (formerly Pivot): large lowercase pivot headers over grids of flat and live tiles, modeled on the Xbox 360 Metro layout
    - **Orbit**: channels as rings of tiles receding behind a front tile, modeled on the Xbox 360 NXE layout
    - **Plaza**: pages of rounded channels with pointer navigation, modeled on the Wii Menu layout
    - **Tide**: a row of categories crossing a list of items over an animated wave, modeled on the PS3 XMB layout
  - **Coming in a later update**
    - **Marquee**: a top navigation bar and rows of titles with a widened focused card, modeled on the Netflix layout
    - **Plum**: a menu column beside a grid of large tiles, modeled on the Roku TV layout
    - **Spark**: a top bar, a hero carousel and long rows of 16:9 tiles, modeled on the Fire TV layout

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/brand/feature-icons/hdr.svg"><img src="docs/brand/feature-icons/hdr-on-light.svg" alt="" width="28" height="28" align="absmiddle"></picture> **Video and HDR**
- Single-surface Vulkan renderer for UI and video
- HDR10 and HLG output on KDE Plasma 6.4+, GNOME 48+ and Gamescope, windowed or full screen
- libplacebo tone mapping and Dolby Vision profile 5/8 handling
- HDR capability detection, with a status page explaining why HDR is or isn't active
- Capability prompt when the current system can't show a source correctly
- Smarter device profile: direct play whenever the client can decode or tone-map locally

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/brand/feature-icons/audio.svg"><img src="docs/brand/feature-icons/audio-on-light.svg" alt="" width="28" height="28" align="absmiddle"></picture> **Audio**
- Choice of PipeWire, PulseAudio, JACK or ALSA output
- Receiver capability detection from HDMI ELD
- Per-track passthrough decisions with sensible fallbacks
- Runtime PipeWire/PulseAudio passthrough setup and exclusive ALSA mode
- "Never silent" fallback, per-device audio delay, receiver volume over HDMI-CEC
- Audio test page for confirming formats on the receiver

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/brand/feature-icons/controller.svg"><img src="docs/brand/feature-icons/controller-on-light.svg" alt="" width="28" height="28" align="absmiddle"></picture> **Controllers and input**
- SDL3 gamepad support with standard mappings for current controllers
- Steam Input cooperation and a recommended Steam layout
- Correct on-screen button prompts per controller family
- Per-controller remapping and a Nintendo-layout option
- Keyboard, HDMI-CEC, LIRC and five-way remote navigation throughout

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/brand/feature-icons/quality.svg"><img src="docs/brand/feature-icons/quality-on-light.svg" alt="" width="28" height="28" align="absmiddle"></picture> **Performance and platform**
- Hardware decode self-test (VA-API, NVDEC, Vulkan Video) with a Hardware settings page
- GPU-rendered UI and GPU-accelerated web layer
- Gamescope mode for couch and Steam Deck use
- Flatpak with a signed repository, installable beside Jellyfin Desktop

## Roadmap

1.0 is planned in 12 phases (about 42 weeks of development): fork setup, platform spikes, audio, GPU and display, the single-surface renderer, playback routing, controllers, the theme engine, the clone themes, an upstream sync, hardening, and release. See [`docs/PLAN.md`](docs/PLAN.md) for tasks and [`docs/SPEC.md`](docs/SPEC.md) for the full design.

After 1.0, the plan is to become an independent fork of Jellyfin Desktop and then drop X11 entirely.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING](.github/CONTRIBUTING.md) and [`docs/BRANCHING.md`](docs/BRANCHING.md) for how branches, upstream merges and releases work.

## Installing

Not available yet. Releases will ship as a Flatpak from a signed IceFin Player repository, with Flathub to follow after 1.0.

## Relationship to Jellyfin

IceFin Player is an independent fork and is not affiliated with or endorsed by the Jellyfin project. It is built on [Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop) and works with any Jellyfin server, 10.11 and later.

The clone themes reproduce layouts and color schemes only. They contain no logos, icons, artwork, sounds, characters or proprietary fonts from Kodi, Amazon, Roku, Nintendo, Microsoft, Apple, Netflix, Sony, Valve or TiVo, and all product names belong to their owners.

## Credits

IceFin Player stands on a lot of open-source work:

- **[Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop)** by the Jellyfin project and its contributors: the client IceFin Player is forked from. Its web-client integration, mpv player, input, MPRIS and settings systems are the foundation everything here builds on.
- **Jellyfin Media Player** and, before it, **Plex Media Player**: the earlier projects Jellyfin Desktop grew out of, whose authors created the original Qt + mpv desktop client design.
- **[Jellyfin](https://jellyfin.org)** and **[jellyfin-web](https://github.com/jellyfin/jellyfin-web)**: the server and web client IceFin Player talks to and runs.
- **[mpv](https://mpv.io)**, **[libplacebo](https://code.videolan.org/videolan/libplacebo)** and **[FFmpeg](https://ffmpeg.org)**: playback, rendering and decoding.
- **[MpvQt](https://invent.kde.org/libraries/mpvqt)** (KDE) and **[Qt](https://www.qt.io)**: the UI framework and its mpv integration.
- **[Kodi](https://kodi.tv)** and the Estuary skin authors: the layout reference for the Harbor theme.

Upstream copyright notices are preserved in the source. Thank you to everyone who built the pieces IceFin Player depends on.

## License

GPL-2.0, as inherited from Jellyfin Desktop. See [`LICENSE`](LICENSE).
