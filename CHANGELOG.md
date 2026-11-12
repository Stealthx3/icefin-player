# Changelog

All notable changes to Icefin Player are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Upstream merges are listed with the upstream version they bring in.

## [Unreleased]

### Added
- Media Center draws its own player controls over video: a title or the film's logo, chapter and end time, a seek bar with chapter marks, round glass transport buttons, a side panel for audio, subtitles, speed, aspect and repeat, playback info and a chapters strip; skip prompts and Up next appear in the same look. If a server plugin adds its own button or panel to the player, that video uses the web player's controls instead, with a short note saying why (also on request from the panel).
- Media Center: library screens for movies, TV, music, pictures, books, music videos and playlists, with sorts and filters along the top, a sideways grid with the glass focus, and genres as stacks of covers.
- Media Center's Home button and start screen corner show your server's own icon and name, loaded from the server.
- Media Center's settings: one list of everything with the focused entry described, This device (Client Settings) and your account's settings pages laid out as Media Center pages, each drop-down shown as ‹ value › that left and right step through.
- Media Center's slide show: the picture's name, date, album and its place in the show, the buttons together at the bottom right, and a slow pan and zoom (none with less motion). A picture in the library opens its folder's show from it. The book reader shows the book's title as a page title, with round buttons.
- Media Center: its own search (with a phone-style keypad), favourites, Live TV (guide, channels, recorded TV, scheduled and series recordings), now playing, lyrics and the play queue, and its own screens for choosing a server, adding one and signing in (with Quick Connect).
- Plaza on every screen but the server dashboard: lists, playlists, photos, books and the other libraries as Plaza screens with sort and filter; sign-in, servers, your profile and preferences, Quick Connect, now playing and lyrics in Plaza's frame and look; every dialog as a Plaza card; the on-screen keyboard for text fields; the music capsule on the home.
- A playlist's items can be moved on its details screen, with a controller (Menu, then up or down) or the mouse, in every theme.
- Plaza: move channels around the home. Hold or drag one with the mouse, or press Menu (X) on it with a controller, and drop it on another slot; the sides turn the page. The order is kept for each user.

### Changed
- Plaza has its own details page: the name pill and clock, tabs for each section, the framed art, one row of action pills, and Back and Home in the bar; albums and playlists show their tracks beside the art.
- Plaza: every genre, network and artist cell shows its name; Play all and Shuffle are buttons apart from the tabs; empty lists say what to do next.
- The theme no longer follows the account by default: each device keeps its own, so several devices on one account can use different themes at once. Client Settings -> Theme -> Sync Theme With Account turns syncing back on.

### Fixed
- Media Center: Backspace and Escape go back on every screen and close menus and dialogs; the arrows work on the settings pages it frames; the poster wall has Back and Home; closing More options returns to Media Center's details page instead of leaving jellyfin-web's.
- Opening a picture with a theme showed every item on the server in the slide show instead of the picture's folder.
- Plaza: opening Sort and filter or New playlist turned the whole window black.
- A page left open before playback (Select Server, for example) showed above the video.
- Plaza: the bottom row's channel name covered the clock; a series' episodes ran under the bar; Live TV logos were cropped; "1 seasons"; album favourites showed a resume time.
- Leaving full screen now tells the web client and media controls (MPRIS) the window is windowed again; the full-screen state used to stay on after the first time.

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
