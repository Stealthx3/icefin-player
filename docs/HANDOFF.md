# Handoff to Claude Code

**State (2026-11-07):** planning is complete; no code exists yet. This folder holds the plan, spec, decisions, standards and a bootstrap script. Next is Phase 1 in `docs/PLAN.md`.

## First session, in order
1. Read `CLAUDE.md`, `docs/DECISIONS.md` and `docs/PLAN.md`. Skim `docs/SPEC.md` headings only.
2. **Bring in upstream (task 1.1).** Run `scripts/bootstrap-fork.sh` on the host. It uses only git, no build. It initializes the repo, adds the `upstream` remote, checks out `v2.0.0` as `icefin/main` with the planning files kept, and creates `icefin/base`. Commit as the script prints.
3. **Apply the standards in `ai-assets/`** (each one says what to do on first use):
   1. `TOKEN-USAGE-OPTIMIZATION-STANDARD.md` → write `docs/USAGE-PLAN.md`.
   2. `VM-LAB-STANDARD.md` → choose VM vs LXC (Qt/WebEngine/Vulkan builds and HDR/audio hardware tests suggest a KVM VM with GPU and USB passthrough for hardware work; confirm with the standard's §2), write `docs/LAB.md`, `lab.env`, `scripts/lab.sh`.
   3. `PHONE-ALERTS-STANDARD.md` → install hooks, run the check, give the user the phone checklist.
   4. `PROGRESS-BAR-STANDARD.md` → `scripts/progress.mjs`, `progress.config.json`, publish the progress page from `docs/PLAN.md`, link it in `CLAUDE.md`.
   5. `POST-MORTEM-STANDARD.md` → `docs/postmortem/JOURNAL.md` already exists; append a line at the end of each session.
4. Continue with tasks 1.2 onward.

## Verified facts (2026-11-07)
- Upstream: https://github.com/jellyfin/jellyfin-desktop. Release tag `v2.0.0` = commit `1634d3d` (2025-12-14). `master` was at `3fa72e5`, version `2.1.0-pre1`.
- Upstream submodule: `external/mpvqt` (KDE MpvQt).
- Upstream CI (`.github/workflows/main.yml`) builds macOS, Windows and AppImage; the Flatpak manifest lives in Flathub's `org.jellyfin.JellyfinDesktop` repo.
- Key upstream files the plan hooks into: `src/main.cpp` (forces OpenGL today), `src/ui/webview.qml` (`MpvVideoItem` under a transparent `WebEngineView`, `nativeshell.js` injected at DocumentCreation), `src/player/PlayerComponent.cpp` (`audio-fallback-to-null=yes`, passthrough via `audio-spdif`), `native/nativeshell.js` (`getDeviceProfile`, `appName`), `src/input/InputSDL.cpp` (SDL2 raw joystick API), `native/updatePlugin.js`.

## Open questions for the user
- ~~App ID owner/domain~~ settled: D13 (`io.github.stealthx3.IcefinPlayer`). IceSuite branding?
- Rebase onto 2.1.0 early if it releases, or wait for the Phase 10 sync?
- Is HDR on NVIDIA a 1.0 requirement or best effort (after spike 2.8)?
- Is refresh-rate matching on KDE required for 1.0?
- When does the post-1.0 decoupling start?
- Minimum HTPC hardware for the performance budget?
- Confirm the bundled themes: Media Center and Baseline by default, the six others in the optional benchmark pack.

- **HLG acceptance row (spike 2.3):** KWin 6.3 and Mutter 48 don't accept the HLG transfer function on surfaces, so Icefin outputs HLG sources as PQ (HDR10). Change the acceptance row to "HLG sources play as HDR", or keep "TV reports HLG" as a target for compositors that add HLG later?

## Hardware the lab will need (Phase 1.7 / 11.1)
AMD, Intel and NVIDIA GPUs; an HDR10 TV, an HDR monitor and an SDR display; an AV receiver over HDMI (TrueHD, DTS-HD MA, E-AC3); controllers (Xbox Series pad, DualSense, Switch Pro, an 8BitDo pad, Steam Deck); a five-way remote and a Wii Remote with a sensor bar.
