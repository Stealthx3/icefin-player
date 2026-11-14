# Fixes and features to offer upstream (PLAN 10.2)

Icefin's changes that would help [jellyfin/jellyfin-desktop](https://github.com/jellyfin/jellyfin-desktop), the working
list for 10.2. Nothing is sent without the user's go-ahead on the text. Under D33 Icefin merges nothing from
upstream before 1.0; offering fixes the other way is unaffected.

**How the list was made (2026-11-13).** Every generic fix in Icefin's history and changelog, checked against all open
upstream issues (368) and pull requests (30), the PRs merged and issues closed since v2.0.0 (December 2025), and
upstream `master`'s code for each area. A fix leaves the list only when an upstream PR (open or merged) or `master`'s
code already covers it; an open issue without a PR keeps it, and that issue is the one to reference. Recheck before
sending: upstream moves.

## Fixes

| # | Fix | The bug in upstream | Upstream reference | Icefin source | Size |
|---|---|---|---|---|---|
| 1 | IR remote presses stop repeating | `InputLIRC` sends each press as a key-down and never a key-up (lircd sends no release), so `InputComponent`'s auto-repeat (on by default) starts after 650 ms and never stops: one press runs to the end of a row | Issue [#574](https://github.com/jellyfin/jellyfin-desktop/issues/574), no PR | `src/icefin/input/Lirc.{h,cpp}`, hook in `src/input/InputLIRC.cpp`; #144; test `tests/icefin/web/lirc_remote.py` | Small |
| 2 | No crash on logout in the Flatpak | Chromium aborts the app (SIGTRAP, core dump) when Qt WebEngine's D-Bus connection to the Flatpak portal drops through xdg-dbus-proxy, as at logout | None | `src/icefin/system/DBusGuard.cpp`; #130; test `dbus_drop.py` | Small |
| 3 | No black picture with hardware decoding on NVIDIA | "Hardware decoding: enabled" maps to mpv's zero-copy `auto`; on NVIDIA with Qt Quick on OpenGL the video plays with sound and a black picture (RTX 4090, Plasma Wayland) | None | `src/icefin/gpu/Hwdec.cpp` (`auto-copy-safe` when NVIDIA and OpenGL); #39 | Small |
| 4 | A hardware-decoding change during playback doesn't break the picture | `updateVideoConfiguration` applies the new `hwdec` to the running video; the picture goes white until restart | None | `deferHwdecChange` in `src/icefin/gpu/Hwdec.cpp`, hooks in `PlayerComponent`; #44; test `hwdec_setting.py` | Small |
| 5 | Audio never fails silently | `audio-fallback-to-null=yes` with no notice: a failed or busy output plays on in silence; with passthrough on, a failed bitstream open stalls. Icefin catches the null output, tries PCM, then the default device, then plays on with an on-screen notice | Related issues [#503](https://github.com/jellyfin/jellyfin-desktop/issues/503), [#449](https://github.com/jellyfin/jellyfin-desktop/issues/449); no PR (#1331 fixes a different config bug) | `src/icefin/audio/Fallback.{h,cpp}`; #133; Virtual AV rows `fallback-*` | Medium |
| 6 | No double presses with Steam open on the desktop | Steam's desktop layout turns pad presses into keys as well, so each press acts twice | None | `src/icefin/input/DuplicateGuard.{h,cpp}`; #143 | Medium: Icefin's SDL3 layer to upstream's `InputSDL` |
| 7 | No update prompt in Flatpak builds | Flatpak users are pointed at GitHub downloads; Flathub handles their updates | Issue [#1318](https://github.com/jellyfin/jellyfin-desktop/issues/1318) and open PR [#1320](https://github.com/jellyfin/jellyfin-desktop/pull/1320) fix the check itself, not the Flatpak case: complementary | `DISABLE_UPDATE_CHECK` under `ICEFIN_FLATPAK`, `nativeshell.js` plugin list; commit `990147d` | Small |

## Features

| # | Feature | Upstream reference | Icefin source | Size |
|---|---|---|---|---|
| 8 | HDMI passthrough decided from the receiver's ELD: per-track bitstream or PCM, the ELD's rate and channel limits (E-AC-3 needs 192 kHz stereo, TrueHD and DTS-HD 192 kHz on 8 channels), a receiver in standby (D32), exclusive ALSA reservation | Possibly [#338](https://github.com/jellyfin/jellyfin-desktop/issues/338) (TrueHD stereo silent); open PR #1316 is a different S/PDIF change | `src/icefin/audio/` (`Eld`, `Passthrough`, `AudioPolicy`, `DeviceReservation`); #126, #127; Virtual AV tier | Large |
| 9 | Nintendo button layout (A/B and X/Y swapped for Nintendo pads) | Issue [#958](https://github.com/jellyfin/jellyfin-desktop/issues/958), no PR | `applyNintendoLayout` in `src/icefin/input/GamepadNames.cpp` | Medium: SDL3 to SDL2 |
| 10 | Flatpak build and unit tests in CI, a bundle per commit | None (Flathub owns upstream's manifest) | `.github/workflows/icefin-flatpak.yml`, `flatpak/` | Medium |
| 11 | HDR output on Wayland (`wp_color_manager_v1` surface tagging) and X11/Gamescope (`VK_EXT_hdr_metadata`) | None (open PR #1311 is a Windows D3D11 renderer) | `src/icefin/render/` on Icefin's Vulkan renderer and patched libmpv | Very large: a design to share more than a patch |

## Not offered

- **Duplicates.** Full-screen state not reset on leaving full screen: open PR
  [#1281](https://github.com/jellyfin/jellyfin-desktop/pull/1281) fixes the same comparison (issue #1085). The debug
  screen's dropped-frame counter: `master` already reads `frame-drop-count`. The first-load `nativeshell.js` race:
  upstream merged its own fix (#1236), which Icefin carries.
- **Icefin-only.** Theme fixes; Steam virtual-pad glyph families (Icefin's SDL3 layer); Dolby Vision 5 direct play
  (it relies on Icefin's renderer); the Hardware page's HDR Output reason.

Suggested first: 1 to 4, each small and a bug in upstream's own code; 1 already has an issue to reference.
