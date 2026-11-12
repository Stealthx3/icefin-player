# Changelog

All notable changes to Icefin Player are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Upstream merges are listed with the upstream version they bring in.

## [Unreleased]

### Added
- Plaza: move channels around the home. Hold or drag one with the mouse, or press Menu (X) on it with a controller, and drop it on another slot; the sides turn the page. The order is kept for each user.

### Changed
- The theme no longer follows the account by default: each device keeps its own, so several devices on one account can use different themes at once. Client Settings -> Theme -> Sync Theme With Account turns syncing back on.

## [0.1.0-alpha.2] - 2026-11-12

### Added
- Client Settings as a themed page in every theme with a settings area: a list of its sections, and every control, drop-downs included, usable with a remote or controller.
- Live TV: a connecting dialog while a channel starts, and an error notice with the reason, Try again and Close when it can't.
- Player controls sized for the screen: twice the size on a 4K display at 100% desktop scaling, Client Settings -> Video -> Player Controls Size, and Couch Mode (larger controls, thicker focus, controller hints kept), switched on by hand or for TV-sized displays and Gamescope.
- A signed Flatpak test repository on GitHub Pages (docs/INSTALL.md).

### Fixed
- Skip buttons (MediaSegments, Intro Skipper) were covered by the player controls: they now sit above them, reachable with Up.
- Theme sounds were silent when the desktop's notification sounds were muted: they play on Icefin's own stream now.
- Plaza: the Collections channel shows random collections, and the menus' clock moved into the channel name pill, where nothing covers it.

## [0.1.0-alpha.1] - 2026-11-11

First alpha. Everything below is tested in the virtual lab (`docs/LAB.md`); testers' hardware comes next (`docs/BETA-CHECKLIST.md`).

### Added
- Theme engine: themed screens over jellyfin-web, design tokens, colour schemes (a dark scheme for every theme, usable with any theme), UI sounds, a native backdrop, a stable theme script API, package validation and trust levels, and a theme manager in Client Settings with a live preview and install from file.
- Themes: Baseline, the Media Center reference theme, and eleven layout themes (Harbor, Spark, Plum, Plaza, Orbit, Mosaic, Lumen, Marquee, Almanac, Arcade, Tide), each with themed details pages, player controls and a settings area (Client settings, Classic View, Server Settings).
- Vulkan renderer: UI and video on one surface, linear-light compositing, HDR10 and HLG output on Wayland (colour management) and Gamescope, an OpenGL fallback, and a capability prompt instead of wrong colours.
- Audio: backend choice (PipeWire, PulseAudio, JACK, ALSA), receiver detection from the HDMI ELD, per-track passthrough decisions, runtime bitstream formats, exclusive ALSA with device reservation, a never-silent fallback, per-device delay and an audio test page.
- GPU: decoder self-test and a Hardware page, hardware decoding options, zero-copy decode, a client-side capability model and an automatic device profile.
- Controllers: SDL3 with hotplug, a standard action map, per-controller remapping, a Nintendo layout option and glyph detection.
- Fork of jellyfin-desktop v2.0.0, rebranded Icefin Player (`io.github.stealthx3.IcefinPlayer`).
- Flatpak manifest and CI build.
- Audio subsystem work (Phase 3): backend selection, receiver detection, passthrough decisions and fallbacks. See `docs/PLAN.md` for task-level status.
- Contributor docs: `.github/` community files, `docs/BRANCHING.md`, this changelog.

### Changed
- Repository moved to a trunk-based layout: default branch `main`, pull requests into `main`, an `upstream/master` mirror, and namespaced upstream tags (`upstream/v*`).

### Upstream base
- jellyfin-desktop v2.0.0 (`1634d3d`).

[Unreleased]: https://github.com/Stealthx3/icefin-player/compare/v0.1.0-alpha.2...HEAD
[0.1.0-alpha.2]: https://github.com/Stealthx3/icefin-player/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/Stealthx3/icefin-player/releases/tag/v0.1.0-alpha.1
