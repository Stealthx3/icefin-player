# Icefin Player

Fork of jellyfin-desktop v2.0.0 (Qt 6 + Qt WebEngine + jellyfin-web + libmpv), rebranded **icefin-player**. It adds a theme engine, a single-surface Vulkan HDR renderer, hardened HDMI audio passthrough, first-class controller support and verified GPU paths. It ships as a Flatpak; Linux, Wayland-first.

## Read first
- `docs/HANDOFF.md`: current state and the first-session checklist. Start here.
- `docs/PLAN.md`: task tracker (source of truth for progress; tick boxes in the same commit as the work).
- `docs/SPEC.md`: full design. Read only the section a task names in brackets.
- `docs/DECISIONS.md`: settled decisions. Don't reopen them without the user.
- Plan doc (claude.ai, may be newer than SPEC): https://claude.ai/artifact/H95okuizWUjCofUumXG1Mo

## Standards (in `ai-assets/`, they apply to this project)
Copies of `/mnt/FileDrive/Business/Development/ai-assets` taken 2026-11-07. If the master copies change, ask the user before updating these.
- `VM-LAB-STANDARD.md`: all build/run/test happens in libvirt guests via `scripts/lab.sh`, watchable in virt-manager. Never build on the host.
- `TOKEN-USAGE-OPTIMIZATION-STANDARD.md`: `docs/USAGE-PLAN.md` before substantive work.
- `PROGRESS-BAR-STANDARD.md`: progress page generated from `docs/PLAN.md`.
- `PHONE-ALERTS-STANDARD.md`: push alerts when the user is needed.
- `POST-MORTEM-STANDARD.md`: append one line per session to `docs/postmortem/JOURNAL.md`.

## Working setup
- Build/test only via scripts/lab.sh (see docs/LAB.md). Guests are watchable in virt-manager (`lab-icefin-main`).
- Usage plan and agents: `docs/USAGE-PLAN.md`, `.claude/agents/` (read the Handoff note at session start).
- Progress page: https://claude.ai/artifact/7SXtcWsFr8pe21DfQ4T7TU (`node scripts/progress.mjs`, republish to the same URL after each task).
- Phone alerts: see PHONE-ALERTS-STANDARD; hooks installed, check with node scripts/phone-alerts.mjs check.
- Branding assets: `/mnt/FileDrive/Personal/Projects/IceSuite/IceFin` (D15). App icon is the fin mark.
- Repo: `origin` = github.com/Stealthx3/icefin-player (public), `upstream` = jellyfin/jellyfin-desktop (push disabled). App ID `io.github.stealthx3.IcefinPlayer` (D13).

## Hard rules
- Keep upstream rebasable until the post-1.0 decoupling: new code under `src/icefin/`, `native/icefin/`, `qml/icefin/`, `external/mpv/`, `flatpak/`, `themes/`. Upstream files get small hooks marked `// ICEFIN-HOOK: <reason>`.
- The theme engine never references a theme by id or holds theme-specific values (CI lint).
- Clone themes copy layout, proportions, navigation, timing and colors only. Never copy logos, icons, artwork, sounds, characters (Miis, avatars), proprietary fonts or product names. Icefin branding everywhere. No Microsoft, Nintendo, Amazon or Roku assets.
- Never play a source with known-wrong colors silently: use the capability prompt.
- License GPLv2 (upstream). Keep upstream copyright notices.
- `org.jellyfin.*` IDs and the Jellyfin name are not ours to use for the app.
