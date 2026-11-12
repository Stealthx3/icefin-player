# Icefin Player

Fork of jellyfin-desktop v2.0.0 (Qt 6 + Qt WebEngine + jellyfin-web + libmpv), rebranded **icefin-player**. It adds a theme engine, a single-surface Vulkan HDR renderer, hardened HDMI audio passthrough, first-class controller support and verified GPU paths. It ships as a Flatpak; Linux, Wayland-first.

## Read first
- **Development is active** (unpaused by the user 2026-11-09). Work through PLAN continuously; ask only for decisions reserved to the user. No HTPC testing (D28): develop in the virtual lab, simulate hardware where it can be built, and leave real hardware to beta testers (`docs/BETA-CHECKLIST.md`).
- `docs/dev/HANDOFF.md`: current state and the first-session checklist. Start here.
- `docs/PLAN.md`: task tracker (source of truth for progress; tick boxes in the same commit as the work).
- `docs/SPEC.md`: full design. Read only the section a task names in brackets.
- `docs/DECISIONS.md`: settled decisions. Don't reopen them without the user.
- Plan doc (claude.ai, may be newer than SPEC): https://claude.ai/artifact/H95okuizWUjCofUumXG1Mo

## Standards (in `docs/standards/`, they apply to this project)
Copies of `/mnt/FileDrive/Business/Development/ai-assets` taken 2026-11-07. If the master copies change, ask the user before updating these.
- `VM-LAB-STANDARD.md`: all build/run/test happens in libvirt guests via `scripts/lab.sh`, watchable in virt-manager. Never build on the host.
- `PROGRESS-BAR-STANDARD.md`: progress page generated from `docs/PLAN.md`.
- `PHONE-ALERTS-STANDARD.md`: push alerts when the user is needed.
- `POST-MORTEM-STANDARD.md`: append one line per session to `docs/postmortem/JOURNAL.md`.

## Working setup
- Build/test only via scripts/lab.sh (see docs/LAB.md). Guests are watchable in virt-manager (`lab-icefin-main`).
- Agents: `.claude/agents/` (scout, runner, implementer, reviewer). The usage plan is dropped (D20).
- Theme passes (D29, D31): `docs/themes/PIPELINE.md`, driven by `scripts/icefin/theme-pass.sh` (one theme at a time; walks and theme tests on the workstation's installed Icefin, updated first).
- Progress page: https://claude.ai/artifact/7SXtcWsFr8pe21DfQ4T7TU (`node scripts/progress.mjs`, republish to the same URL after each task).
- Hardware (D28): no automated HTPC testing (the HTPC tier of D16 is retired; `scripts/icefin/htpc.sh` stays as history). Simulated hardware: `docs/dev/HARDWARE-SIMULATION.md`; real hardware: beta testers with `docs/BETA-CHECKLIST.md`.
- Phone alerts: see PHONE-ALERTS-STANDARD; hooks installed, check with node scripts/phone-alerts.mjs check.
- Branding assets: `/mnt/FileDrive/Personal/Projects/IceSuite/IceFin` (D15). App icon is the fin mark.
- Git workflow (D17, D29, `docs/BRANCHING.md`): trunk-based, plus a long-lived `theme/<id>` branch per bundled theme for its completeness pass (merge commits into `main`; engine work stays on `feat/` branches). Branch `feat/<task>-<topic>` (or `fix/`, `docs/`, `ci/`, `chore/`) from `main`, push, open a PR, squash-merge when `icefin-hooks` and `icefin-flatpak` pass. Upstream merges use `sync/upstream-<ver>` and a merge commit. Never force-push `main`; never commit to `upstream/master`.
- Repo: `origin` = github.com/Stealthx3/icefin-player (public), `upstream` = jellyfin/jellyfin-desktop (push disabled). App ID `io.github.stealthx3.IcefinPlayer` (D13).

## Hard rules
- Keep upstream rebasable until the post-1.0 decoupling: new code under `src/icefin/`, `native/icefin/`, `qml/icefin/`, `external/mpv/`, `flatpak/`, `themes/`. Upstream files get small hooks marked `// ICEFIN-HOOK: <reason>`. Every added line in an upstream file carries the marker (`#` / `//` / `<!-- -->` as the format allows), or sits right under a marker comment line; check with `scripts/icefin/hook-count.sh` (CI: icefin-hooks).
- The theme engine never references a theme by id or holds theme-specific values (CI lint).
- Clone themes copy layout, proportions, navigation, timing and colors only. Never copy logos, icons, artwork, sounds, characters (Miis, avatars), proprietary fonts or product names. Icefin branding everywhere. No Microsoft, Nintendo, Amazon or Roku assets.
- Never play a source with known-wrong colors silently: use the capability prompt.
- License GPLv2 (upstream). Keep upstream copyright notices.
- `org.jellyfin.*` IDs and the Jellyfin name are not ours to use for the app.
