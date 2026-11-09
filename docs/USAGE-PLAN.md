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
| avsim.sh / matrix.py | tests/icefin/avsim/ | project | checking passthrough and ELD handling on the HTPC for every change (D18) |

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
- On demand only: `docs/SPEC.md`, one section at a time (the section a task names); `docs/standards/*` (read the
  standard only when its process runs).
- Locate upstream code with grep before reading it; the key files are listed in `docs/dev/HANDOFF.md` → Verified facts.
- CLAUDE.md line budget: 60.

## Log
- 2026-11-07: plan created.
- 2026-11-07: restack.sh written (task 1.2); the stack gained an `icefin/infra` bottom layer.
- 2026-11-09: Virtual AV tier (D18): nested client with the `hda-hdmi-sink` QEMU device; audio rows run there first, the HTPC confirms.
- 2026-11-08: stacked branches retired for trunk-based `main` (D17); restack.sh removed. Progress script also writes the README bar (`docs/progress/progress-bar.svg`).

## Handoff
- 2026-11-07 (S2b): Phase 1 done except 1.9 (hardware lab, needs passthrough OK). Spikes 2.1, 2.2, 2.3, 2.7 done (docs/SPIKES.md); 2.4, 2.5, 2.6, 2.8 need hardware; 2.9 waits on them. Stack tip `icefin/main` = `icefin/theme`; lower layers frozen until a force push is approved (BRANCHES.md).
- Done since: 3.1, 3.2, 3.3, 3.5, 3.6 (src/icefin/audio, tests/icefin/unit). Next: 3.4 IEC958 device-restore (needs PipeWire sink with IEC958 formats; HDMI hardware to verify), 3.7 per-device delay, then Phase 4/6 software logic. Run `scripts/icefin/hook-count.sh` after committing and without a pipe.
- Open for the user: the HLG acceptance row (HANDOFF). Resolved since: lab hardware and a newer Plasma/Gamescope base are covered by the HTPC tier (D16); force pushes for restacks are moot under D17.
- Usage note: spikes ran in the main thread (opus) as planned; lab-side failures (deps, sandbox, D-Bus) were the main overrun. Keep greps narrow.
- 2026-11-08 (S3): HTPC tier (D16): `scripts/icefin/htpc.sh` + `tests/icefin/htpc/` (probe, configs, stand-in guest `lab-icefin-htpcsim`); end-to-end play on the stand-in matched the baseline (0 differences). Development paused by the user after this. Next when resumed: user enables sshd on the HTPC and fills `tests/icefin/htpc/htpc.env`, then `htpc.sh doctor`, `deploy`, 1.10, then 2.4–2.6, 2.8 on the HTPC.
- 2026-11-08 (S3b): HTPC setup kit (`scripts/icefin/htpc-kit.sh`, `tests/icefin/htpc/kit/`). Paused for the GitHub restructuring by Claude Cowork: brief in `docs/dev/GITHUB-RESTRUCTURE.md`; on resume, do its hand-back steps first.
- 2026-11-08 (S3c): hand-back after the restructuring (D17): archive and upstream tags pushed, `icefin/main` → `main`, old branches deleted, `main` protected (checks `hooks`, `flatpak`), repo settings set, local clone reset. All work now goes through PRs (`docs/BRANCHING.md`). Paused: next on "continue" is 1.10 (needs the HTPC kit run on the HTPC), then 2.4–2.6, 2.8 on the HTPC.
- 2026-11-08 (S4): resumed. 1.10 waits on the user running the HTPC kit (no `htpc.env` yet). Did 3.7: `src/icefin/audio/DeviceDelay` (delays per device in `state.icefin_audio_delays`), `AudioState` (bitstream flag → CEC volume routing in InputComponent, UI-sound mute for 8.5); `tests/icefin/web/audio_delay_device.py`. Fixed qrc_resources.cpp not rebuilding on Icefin resource changes. Next: 1.10 once SSH works, else Phase 4/6 software logic (4.1, 4.2).
- 2026-11-08 (S4b): user OK to build the theme engine during HTPC quiet hours. Done 6.5: `src/icefin/theme/` (Tokens, ThemePackage, ThemeComponent on the WebChannel as `theme`), `native/icefin/tokenEngine.js` + `jellyfin-web.css` adapter (10.12+ `--jf-palette-*`, 10.11 restated rules), `themes/TOKENS.md`, `scripts/icefin/theme-lint.sh` in icefin-hooks CI, fixtures `tests/icefin/themes/`, `tests/icefin/web/theme_tokens.py` (15/15 on both servers). `htpc.sh build` now refuses anything but a clean main (the HTPC installs from `~/fp-repo`). Next: 8.3 (themeEngine.js, `icefin-theme:` scheme), 8.1 Baseline, 8.5; 8.4 backdrop waits for 5.1.
- 2026-11-08 (S4c): 8.3: `icefin-theme:` scheme (`ThemeScheme`, registered in main.cpp, served on the view profile from webview.qml), `native/icefin/themeEngine.js` (assets, overlay router, focus engine; inputPlugin.js hook + desktop-mode keys), user themes limited to fonts/images/sounds until 8.5, `themes/PACKAGE.md`, `tests/icefin/web/theme_runtime.py` (26/26 on jf1011 and jf12, TV and desktop modes; TV keys proven to go through InputComponent). Lab: xdotool added to provision.sh.
- 2026-11-08 (S4d): 8.1: bundled `themes/baseline` (qrc `/icefin-themes`), optional tokens with fallbacks so a theme can reproduce stock exactly, adapter Part 2 aligned with 10.12+ semantics; theme docs moved to `docs/themes/`. `tests/icefin/web/theme_baseline.py`: 0 px difference on 4 pages on jf12; 10.11 reports its palette deltas (0.2-8.8 %). Lab: python3-pil in provision.sh. Next: 8.5, then 8.2 (needs the plugin runs), 8.4 after 5.1.
- 2026-11-08 (S4e): 8.5 part 1 (box stays open): shared schemas `docs/themes/schema/` + `scripts/icefin/theme-schemas.py` in CI, CssSanitizer for user stylesheets, script/SVG trust bound to a package content hash, stand-down handshake (`window.icefinPluginRuntime`). `tests/icefin/web/theme_trust.py` 20/20 on both servers. Part 2 next: per-user settings in DisplayPreferences, theme picker in Client Settings, UI sounds (needs Qt Multimedia: not in the lab yet).
- 2026-11-08 (S4f): 8.5 done: per-user choice cached in `state.icefin_theme` and synced via `native/icefin/themeSync.js` to DisplayPreferences (`usersettings`, client `icefin-player`, `icefin.theme`, newest wins), Client Settings → Theme section (picker + Theme Sounds), UI sounds via QSoundEffect (Qt Multimedia hook in QtConfiguration.cmake; `qt6-multimedia-dev` in provision.sh), sounds in the stand-down handshake. `tests/icefin/web/theme_sync.py` 13/13 on both servers; full theme regression green. Theme engine left: 8.2 (plugin runs), 8.4 (after 5.1), 8.6 (Media Center).
- 2026-11-09 (S5): on the user's request (development otherwise paused): Virtual AV tier (D18, PLAN 1.11): `tests/icefin/avsim/` (hda-hdmi-sink QEMU device, nested client, ELD profiles, IEC 61937 verifier, matrix 12/12). ELD fixtures regenerated from the kernel. Added 3.9 (Icefin in the avsim client) and 5.9 (virtual HDR display, needs Weston 15+). Next on "continue": unchanged (1.10, then 2.4–2.6, 2.8 on the HTPC); 3.9 once 3.4 lands.
