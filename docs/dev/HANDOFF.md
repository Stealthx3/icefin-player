> **2026-11-11: D28.** No HTPC testing any more. The goal is a feature-complete Icefin built and checked in the virtual lab, with simulated hardware where it can be built (`docs/dev/HARDWARE-SIMULATION.md`); real hardware goes to beta testers (`docs/BETA-CHECKLIST.md`). The HTPC notes below are history.

# Handoff to Claude Code

> **2026-11-08: GitHub restructuring done (D17), admin steps done by Claude Code the same day** (`docs/dev/GITHUB-RESTRUCTURE.md` → *Result*). Wait for the user to say continue; next up is PLAN 1.10, then the HTPC tasks. From now on all work goes through pull requests into `main` (`docs/BRANCHING.md`). The first-session list below is history.

**State (2026-11-07):** planning is complete; no code exists yet. This folder holds the plan, spec, decisions, standards and a bootstrap script. Next is Phase 1 in `docs/PLAN.md`.

## First session, in order
1. Read `CLAUDE.md`, `docs/DECISIONS.md` and `docs/PLAN.md`. Skim `docs/SPEC.md` headings only.
2. **Bring in upstream (task 1.1).** Run `scripts/bootstrap-fork.sh` on the host. It uses only git, no build. It initializes the repo, adds the `upstream` remote, checks out `v2.0.0` as `icefin/main` with the planning files kept, and creates `icefin/base`. Commit as the script prints.
3. **Apply the standards in `docs/standards/`** (formerly `ai-assets/`) (each one says what to do on first use):
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
- ~~Confirm the bundled themes~~ settled: D22 (every theme is built in).

- **HLG acceptance row (spike 2.3):** KWin 6.3 and Mutter 48 don't accept the HLG transfer function on surfaces, so Icefin outputs HLG sources as PQ (HDR10). Change the acceptance row to "HLG sources play as HDR", or keep "TV reports HLG" as a target for compositors that add HLG later?

## HTPC tier (D16): connected 2026-11-08
- HTPC `192.168.2.131`, user `htpc`, Bazzite 45 `bazzite-deck` (game mode by default; Plasma via desktop mode), kernel 7.2.
- AMD RX 9070 XT (Navi 48) on `card1-HDMI-A-2` → Hisense 55005N TV. The Denon AVR-S660H is on the TV's eARC/ARC
  (user, 2026-11-08), so the HTPC sees the TV's ELD (HISENSE): AC-3, E-AC-3, DTS, DTS-HD and LPCM, but no TrueHD.
  Passthrough rows are limited to what the TV forwards. TrueHD can't be bitstreamed on this setup, so the
  per-track decision should send PCM, which is the expected result. Check DTS-HD MA on the receiver's display. A
  receiver in the HDMI chain would be needed for the TrueHD row.
- `htpc.sh doctor` OK, `deploy` OK. The house rules held off the first probe while a game was running.
- Quiet hours (user, 2026-11-08): TV off-limits 10:00–midnight Pacific (`HTPC_QUIET_HOURS=10-00`); tests run 00:00–10:00.
- Session switching (user, 2026-11-08): allowed (`HTPC_ALLOW_SESSION_SWITCH=1`), and **only** inside the lab window
  (00:00–10:00) for the Plasma rows. `session plasma` enforces the house rules. Always run `session gamescope` afterwards;
  it skips the quiet-hours check so it can always restore game mode.

## Hardware the lab will need (Phase 1.7 / 11.1)
AMD, Intel and NVIDIA GPUs; an HDR10 TV, an HDR monitor and an SDR display; an AV receiver over HDMI (TrueHD, DTS-HD MA, E-AC3); controllers (Xbox Series pad, DualSense, Switch Pro, an 8BitDo pad, Steam Deck); a five-way remote and a Wii Remote with a sensor bar.
