# Usage Plan — Icefin Player
_Standard: TOKEN-USAGE-OPTIMIZATION-STANDARD v1 · Created 2026-11-07_

The main thread runs on whatever model the user picks (Opus today). It makes the design calls and
does the hard debugging. Mechanical and well-specified work is handed to pinned agents.

## Routing (A)
| Task type | Tier | Why |
|---|---|---|
| Upstream inventory ("where does X live", hook points, call sites) | haiku | read-only, only the conclusion matters |
| Build/test runs in the lab, log triage | haiku | run and report failures only |
| Boilerplate: branding renames, manifests, CI YAML, settings pages | sonnet | clear template, little ambiguity |
| Feature implementation in `src/icefin/`, `native/icefin/`, `qml/icefin/` | sonnet | default build work |
| Clone-theme packages (Phase 9) once the engine capabilities exist | sonnet | layout and token data from captures |
| Spikes 2.1–2.8, renderer and HDR design (Phase 5), router (6.2) | opus | novel, expensive to reverse |
| Audio passthrough/ELD/reservation logic (Phase 3) | opus → sonnet | opus designs, sonnet implements |
| Patched libmpv Vulkan render API (5.2) | opus | cross-project C, subtle lifetimes |
| Theme trust levels, log redaction, security review (11.2) | opus | security-sensitive |
| Rebase onto upstream (10.1), conflict resolution | opus | many modules at once |
| Docs, plan ticks, progress page, journal | haiku / main thread | scripted (`progress.mjs`) |
| Frontier tier | not planned | only if opus fails a spike twice; log it below |

## Agents (B)
Defined in `.claude/agents/`.
| Agent | Model | Tools | Used for |
|---|---|---|---|
| scout | haiku | Read, Grep, Glob | locating upstream code, hook points, dependency audits |
| runner | haiku | Bash (only `scripts/lab.sh`) | builds and tests in the lab; returns ≤ 30 lines of failures |
| implementer | sonnet | Read, Edit, Write, Grep, Glob | scoped edits to named files from a settled design |
| reviewer | opus | Read, Grep, Glob, Bash (git diff) | unanchored review of a diff against a SPEC section |

No more than 3 parallel agents per step. Parallel implementers are allowed only when they touch different feature branches.

## Tools (C)
| Tool | Path | Scope | Replaces |
|---|---|---|---|
| lab.sh | scripts/lab.sh | shared (verbatim) | hand-run virsh/ssh |
| progress.mjs | scripts/progress.mjs | shared (verbatim) | hand-written progress page |
| phone-alerts.mjs | scripts/phone-alerts.mjs | shared (verbatim) | — |
| postmortem.mjs | scripts/postmortem.mjs | shared (verbatim, added at project end) | — |
| hook-count | scripts/icefin/hook-count.sh | project | counting/auditing `ICEFIN-HOOK` lines by hand |
| theme-lint | scripts/icefin/theme-lint (Phase 8) | project | checking engine code for theme ids by eye |
| provision.sh | scripts/provision.sh | project | re-deriving guest packages |
| restack.sh | scripts/icefin/restack.sh | project | hand-rebasing the feature stack |

Watch list for future tools: summarizing Flatpak build logs, and diffing jellyfin-web device profiles.

## Pacing (D)
| Session | Covers | Size | Checkpoint |
|---|---|---|---|
| 1 | Bootstrap, standards, 1.2–1.6 scaffolding, first lab build | L | Phase 1 tasks ticked, progress page live |
| 2 | 1.7 servers in lab, 1.8 baseline (software part) | M | BASELINE-REPORT draft |
| 3–6 | Phase 2 spikes (opus), one or two spikes per session | M each | SPIKES.md entry per spike |
| later | one plan phase or sub-phase per session; reset the context between phases | S–M | tick + handoff note |

Long builds (Qt WebEngine Flatpak) run in the background in the lab. When one finishes, send a push.

## Context (E)
- Never read by default: `external/` (mpvqt), `resources/`, `bundle/`, `deployment/`, `debian/`, `pdf/`,
  `build*/`, `dependencies/`, `web-client/`, `.flatpak-builder/`, the Windows/macOS-only scripts in `scripts/`.
- On demand only: `docs/SPEC.md`, one section at a time (the section a task names); `ai-assets/*` (read the
  standard only when its process runs).
- Locate upstream code with grep before reading it; the key files are listed in `docs/HANDOFF.md` → Verified facts.
- CLAUDE.md line budget: 60.

## Log
- 2026-11-07: plan created.
- 2026-11-07: restack.sh written (task 1.2); the stack gained an `icefin/infra` bottom layer.

## Handoff
- 2026-11-07 (S2): Phase 1 tasks 1.1–1.6 done and pushed (stack tip `icefin/main`). Flatpak builds and runs in lab-icefin-main; GitHub icefin-flatpak CI's first run was still in progress at handoff.
- Next (S3): 1.7 — podman Jellyfin 10.11.x and 12.x servers in the lab plus regression plugins (read SPEC "Testing, CI and hardware lab" first); the hardware guest needs the user's OK for passthrough. Then 1.8 baseline (software rows only until hardware is attached).
- Open: hidden "Report as Jellyfin Desktop" setting (SPEC client identity) not built yet; libcec not in the Flatpak yet (Phase 3.7); other party's README.md / bootstrap-fork.sh / docs/github edits left uncommitted per user.
- Usage note: S2 ran long (L) as planned; the Flatpak provisioning retries were the main overrun.
