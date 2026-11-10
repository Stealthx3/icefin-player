# Baseline report: jellyfin-desktop v2.0.0

_PLAN 1.8 · measured 2026-11-07 in `lab-icefin-main` (KVM, no GPU or audio hardware) · hardware rows: PLAN 1.10_

This report measures each acceptance goal in SPEC "Goals and acceptance criteria" against **unmodified
upstream v2.0.0** (`1634d3d`, built from source in the lab) and Flathub's `org.jellyfin.JellyfinDesktop`.
Where a row needs hardware the VM doesn't have (GPU, HDR display, receiver, controllers), the report gives
the static evidence from the v2.0.0 source and leaves the measurement to task 1.10 on the HTPC tier. Icefin 0.1.0 (Phase 1:
branding, Flatpak, update-check removal) is measured alongside, to confirm Phase 1 changed nothing it shouldn't.

Raw results: `docs/baseline/*.json` (from `tests/icefin/web/session_play.py`). Compare any two with
`tests/icefin/web/compare_runs.py`.

## Lab setup

| Item | Value |
|---|---|
| Servers | Jellyfin 10.11.11 (`jf1011`) and 12.4.0 (`jf12`), rootless podman, `tests/icefin/servers/` |
| Plugins | Playback Reporting, Trakt, LDAP, Intro Skipper, File Transformation, Home Screen Sections, Plugin Pages, JavaScript Injector, SSO. 9/9 active on 10.11; 8/9 on 12.4 (SSO has no 12.x build) |
| Media | Synthetic test patterns and tones (`make-media.sh`): SDR H.264/AAC + SRT, HDR10 HEVC + AC-3 5.1, HLG HEVC + E-AC-3 5.1, TrueHD + DTS, AV1 + Opus, a 2-episode show with a shared intro, music with synced lyrics |
| Clients | upstream v2.0.0 (native, Release), Flathub `org.jellyfin.JellyfinDesktop` (reports `2.0.0-dev`, Qt 6.11), Icefin 0.1.0 (native Debug and Flatpak, Qt 6.8 / 6.11) |
| Displays | Xvfb (X11) and headless Weston with the GL renderer (Wayland), llvmpipe |
| Method | The harness connects the client to a server over DevTools, logs in, has the server send PlayNow by remote control, lets it play 40 s, sends Stop, then reads what the server recorded: session identity, play method, Activity Log and Playback Reporting rows |

## Results

| Goal | Upstream v2.0.0 | Evidence | Icefin 0.1.0 |
|---|---|---|---|
| **Keep all server plugins working** | **Pass (engine off).** DirectPlay, Activity Log `VideoPlayback`/`VideoPlaybackStopped`, one Playback Reporting row on both servers | `upstream-jf1011.json`, `upstream-jf12.json` | **Identical** to upstream on both servers except the intended client name and version (`compare_runs.py`: 0 unexpected differences). Baseline and styled-theme runs wait for Phases 8–9 |
| **Flatpak as the production package** | Not upstream's (Flathub owns its manifest; upstream CI builds macOS, Windows, AppImage) | SPEC Baseline | **Pass so far.** Builds in GitHub CI (`icefin-flatpak`, green) and the lab; installs beside Flathub's upstream with separate app IDs and data dirs (`~/.var/app/<id>/data/icefin-player` vs `…/jellyfin-desktop`); the harness passes inside both Flatpaks on both servers |
| **HDMI passthrough on every sound system** | **Fails "never silent".** With no audio device, mpv fell back to `AO: [null]` with no notice to the user. Passthrough itself is `audio-spdif` with per-codec toggles; no backend choice, no receiver detection | `PlayerComponent.cpp:119` (`audio-fallback-to-null=yes`), `:1235`, `:1270`; run log of `upstream-jf1011` | Same as upstream (Phase 3). Receiver rows: **1.10** |
| **HDR on KWin, GNOME and Gamescope** | **Fails by design.** Qt Quick is forced onto OpenGL and video is MpvQt `vo=libmpv`, so there is no HDR output path | `main.cpp:167` (`setGraphicsApi(OpenGL)`) | Same (Phases 2 and 5). TV rows: **1.10** |
| **Correct picture or an honest choice** | **Fails by design.** Direct-plays everything unless a static force-transcode toggle is set (e.g. `force_transcode_dovi`); nothing checks what the display path can show | `nativeshell.js:67` | Same (Phase 6) |
| **GPU decode and UI rendering** | Not measurable in the VM (no GPU: llvmpipe, `hwdec` unavailable). `hardwareDecoding` maps to `auto` / `auto-copy` only | `PlayerComponent.cpp:1455–1457` | **1.10** |
| **Theme engine** | **Fails.** No theme engine | — | Phases 6, 8, 9 |
| **Controller support** | Not measurable in the VM. SDL2 raw joystick API with per-model maps | `InputSDL.cpp:23, 211` | **1.10**, Phase 7 |
| **Wayland-first** | **Pass (functional).** Native and Flathub builds connect, play and report correctly as Wayland clients on headless Weston | `wl-upstream-jf1011.json`, `wl-fp-upstream-jf1011.json` | **Pass**, native and Flatpak (`wl-icefin-…`, `wl-fp-icefin-…`). Refresh-rate matching on Wayland: none upstream (`src/display/` has X11 XRandR only) |

## Findings

1. **First-load injection race (upstream v2.0.0 bug, fixed in Icefin).** v2.0.0 registers the injected
   `nativeshell.js` on the view. After the cross-origin jump from the bundled find-server page to the server,
   the new renderer often lacks it: jellyfin-web starts without `NativeShell`, uses its HTML player and
   registers the device as "Jellyfin Web". It reproduced 3/3 in the Icefin Flatpak (slower startup) and
   never in the native builds. Upstream fixed it in `cabddc6` (2.1.0-pre1), and Icefin carries that fix as a
   marked backport. A second, smaller effect: a WebEngine profile that ran a broken build kept failing until
   its storage was cleared. Only lab installs are affected, but the plugin suite always starts clean.
2. **Playback Reporting needs about 20 s of playback.** The plugin starts a timer at play start and records
   the play only if the same item is still playing when it fires. Shorter test plays leave no row, so the
   harness plays 40 s by default.
3. **The Playback Reporting duration is the timer, not the play time.** A 40 s play recorded `PlayDuration`
   20 with both upstream and Icefin. It's the same on both clients, so the comparison is still valid.
4. **SSO has no Jellyfin 12 build**, so the 12.x web-login row can't run until the plugin catches up.
5. **Flatpak runs need a D-Bus session**, because Chromium's sandbox inside a Flatpak spawns through the portal.
   `--config-dir` doesn't reset WebEngine storage either. Both are handled in the harness and noted in `docs/LAB.md`.

## Hardware rows (task 1.10, HTPC tier)

_Measured 2026-11-09 00:10–01:40 Pacific, unattended, on the HTPC (D16): Bazzite 45, kernel 7.2, AMD RX 9070 XT
(RADV / radeonsi, VA-API), Hisense 55005N on HDMI-A-2 (3840×2160), Denon AVR-S660H on the TV's eARC. Icefin 0.1.0
Flatpak from `main` @ `6f069d7` (upstream behaviour: Phases 3, 5 and 6 aren't merged yet). Raw files: `build-htpc/`
(not committed)._

| Goal | Gamescope (Steam game mode, XWayland) | Plasma 6.8.2 Wayland |
|---|---|---|
| **Keep all server plugins working** | SDR rows on jf1011 and jf12: 0 differences from the lab baseline (`compare_runs.py`); identity, Activity Log and Playback Reporting as in the lab | Same, 0 differences (jf12; jf1011 on the re-run, see finding 6) |
| **HDR on KWin, GNOME and Gamescope** | Output already HDR10 (PQ, BT2020_RGB, 16 bpc) while idle, from Steam; HDR10/HLG content is tone-mapped to SDR by the app and composited into it. HDR_OUTPUT_METADATA never changes with content; HLG is never signalled | Same: KWin HDR on (PQ, max CLL 0); no per-content signalling. As expected for upstream; Phase 5 |
| **HDMI passthrough on every sound system** | Defaults (passthrough off): every codec decoded to stereo PCM through PipeWire (`AO: [pipewire] stereo`); ALSA HDMI held by PipeWire at 48 kHz 6 ch S32_LE; no IEC958 non-audio state | Same |
| **GPU decode** | Hardware decode on every play, 4K HDR HEVC Main10 included, but `vaapi-copy`: under Qt's xcb GLX contexts mpv's VA-API interop isn't available. With `QT_XCB_GL_INTEGRATION=xcb_egl` the same build gets zero-copy `vaapi` (fixed in 4.5) | Zero-copy `vaapi` (`vaapi[nv12]` / `vaapi[p010]`) |
| **UI rendering (WebEngine on the GPU)** | Spike 2.1 on RADV: Vulkan and OpenGL scenes with WebEngine, both correct | Same |
| **Controller support** | Not run (7.6) | Not run |

**GPU power, 4K HDR10 HEVC looped, audio off (Plasma, `/app/bin/mpv` from the Flatpak):** idle 13 W; `vo=gpu-next`
45 W (repeat 45 W); `vo=dmabuf-wayland` 37 W. dmabuf-wayland saves about 8 W (18 %) on this GPU (PLAN 4.4).

6. **Display hotplug leaves playback paused.** The first play after switching to Plasma stalled at 0 s: mpv opened,
   then Qt logged "There are no outputs - creating placeholder screen" (the TV re-handshaking after login) and the
   player stayed paused until stopped. The immediate re-run was clean. Upstream behaviour; tracked for Phase 5's
   output-change handling.
7. **Still open on the hardware:** the TV's HDR badge and the receiver's format display (need a person; deferred to
   the user's hand-off), passthrough rows (Phase 3 build), the DTS track of the TrueHD/DTS clip (harness can't select
   it yet), frame-drop counts, GNOME (no GNOME session on the HTPC), Intel and NVIDIA.

## Still to measure (task 1.10, HTPC tier)

The receiver formats on PipeWire, PulseAudio, JACK and exclusive ALSA; HDR10 and HLG signalling on Plasma,
GNOME and Gamescope; 4K HDR HEVC and AV1 hardware decode with frame drops on AMD, Intel and NVIDIA; WebEngine
GPU rasterization; UI frame rate on the lowest-spec HTPC; every controller inside and outside Steam. These need
the HTPC tier (D16, `scripts/icefin/htpc.sh`): `htpc.sh play` repeats this report's runs on the HTPC and
`htpc.sh probe` records the HDR signal and passthrough state. PLAN 1.10.
