# Theme refinement pipeline

How a bundled theme goes from "its home and details look like the target" to **complete**: every screen, dialog and
player state drawn by the theme, with jellyfin-web left only on the server dashboard (D30). Plaza's pass (PLAN
9.41–9.44) and Media Center's (9.46) worked this out by hand; this page is that process made repeatable (PLAN 9.47,
decision D31).

## Rules
- **One theme at a time** (the user, 2026-11-12). `scripts/icefin/theme-pipeline.json` holds the queue: `active`
  (in a pass now), `queue` (next, alphabetical by the user's choice), `done`, `control` (themes never refined; none today). `theme-pass.sh start`
  refuses a theme while another is active; `--force` only on the user's word. The user says when the next pass starts.
- **Jellyfin-Web is the control; Baseline is the reference** (the user, 2026-11-12). The stock web client (the
  Jellyfin-Web choice, the engine off) is the pure control and is never changed. Baseline re-implements that stock
  layout with the theme engine and its capabilities; it goes through its own pass like the other themes, and it is
  where every plugin's themed UI is built first: because Baseline's layout is the stock one, Baseline against
  Jellyfin-Web shows whether the engine's version of a plugin works and loses nothing. Only then is the plugin carried
  to the other themes (see *Plugins* below).
- **Walks and theme tests run on the workstation** (the user, 2026-11-12), against the installed Icefin Player
  Flatpak, the user's own profile and their own server (`tests/icefin/web/host.py`):
  - **the player is updated from the test repository before every run** (the user), and the run records the version
    and commit it walked;
  - one host run at a time (a lock), and never while the user has Icefin open;
  - the theme's files come from its worktree (`ICEFIN_THEME_PATH`, read-only); the engine is the installed build, so
    engine changes reach a walk once they are merged and published to the test repository;
  - the user's theme, preset and scheme are put back when the run ends;
  - nothing on the server changes: dialogs open and close without saving, nothing is created, Delete is never
    opened, playback runs a few seconds;
  - captures go through DevTools (the page). `--screen` adds what the screen shows, Icefin's window only, kept only
    when its title bar is Icefin's (privacy: the user may switch windows during a run).
  - Engine work before it is merged still builds and tests in the lab (`docs/LAB.md`, VM-LAB-STANDARD).
- **Two review gates, both the user's** (the user, 2026-11-12): the mock-ups before anything is built, and the built
  screens before the merge to `main`.
- Clone rules hold throughout (CLAUDE.md): layout, proportions, navigation, timing and colours only; no logos, icons,
  artwork, sounds, fonts or product names of the target. The engine stays theme-agnostic (theme lint).
- **Themes first** (the user, 2026-11-14): other development waits until every theme in the queue is done.

## The measure
Two guides set what "complete" and "good" mean in a pass (the user, 2026-11-14):
- **The completeness checklist** (`docs/themes/CHECKLIST.md`, made from everything Plaza does). Each pass copies it to
  `docs/themes/passes/<theme>.md` at Start. Every item is ticked when the theme does it **in its own look** and a
  test checks it, or carries the user's reason for leaving it out. The walk finds the screens; the checklist finds
  everything a walk can't see (input, motion, effects, sounds, robustness). Mock-ups cover the checklist's open items
  as well as the walk's gaps, and Verify needs the checklist done.
- **The six principles of UX animation** (timing, easing, spatial orientation, directing focus, visual continuity,
  clarity; [Adobe, 2019](https://blog.adobe.com/en/publish/2019/06/19/designing-animation-six-principles-using-animation-ux),
  also the checklist's section 3). Each motion in a pass is judged against them:
  - **timing**: quick but readable, short enough to keep up with a held D-pad (most moves 120–450 ms); the target's
    signature moves keep their own length;
  - **easing**: nothing moves at constant speed; entries decelerate, exits accelerate;
  - **spatial orientation**: things leave and arrive by where they went or came from (a page turn travels the way of
    the press, a closed card shrinks back into its item);
  - **directing focus**: motion only where the user should look (the focus, a new arrival, a state change);
    decoration stays still or loops slowly behind;
  - **visual continuity**: what stays across two screens stays in place (the frame, the item that opened the screen),
    rather than everything clearing and coming back;
  - **clarity**: one thing at a time (staggered or overlapped, never everything at once), and every motion has a
    stated purpose: a motion without one is cut.
  Mock-ups that change motion say each motion's purpose, length and easing; the pass's polish test measures them, low
  motion included.

## Stages

| # | Stage | Command / where | Output | Done when |
|---|---|---|---|---|
| 1 | **Start** | `scripts/icefin/theme-pass.sh start <theme>` | `theme/<theme>` in its worktree, `main` merged in, the theme marked active | the worktree is clean and current |
| 2 | **Walk** | `theme-pass.sh walk <theme>` (workstation) | `build-walk/<theme>/<stamp>/`: screenshots, `index.html` contact sheet, `coverage.json`; `docs/themes/coverage/<theme>.md` gap list | every inventory entry walked or skipped with a reason |
| 3 | **Mock-ups** | a design canvas named "&lt;Theme&gt; Screens" | one artboard per gap, from the walk's screenshots, `docs/themes/references/<theme>.json`, the theme's tokens and the target's public material (`clone-theme-references`) | every gap has an artboard |
| 4 | **Gate 1: the user reviews the mock-ups** | comments on the canvas; phone alert | the approved canvas; changes asked for are made on it first | the user approves |
| 5 | **Build** | on `theme/<theme>` (short `feat/` branches from it for large pieces); engine needs on `feat/` branches into `main` | the theme's files, a host test `tests/icefin/web/<theme>_pass.py` (on `host.py`), PLAN task text | the host test passes |
| 6 | **Verify** | `theme-pass.sh walk <theme>` again | the coverage with no gaps (or each one listed with the user's reason), no failing checks | 0 gaps, 0 failing checks, `icefin-hooks` checks pass locally (contrast, lint, sounds, schemas, coverage) |
| 7 | **Gate 2: the user reviews the built screens** | the walk's screenshots beside the mock-ups on the canvas (a "Built" page) | the user's go, or fixes and back to 6 | the user approves |
| 8 | **Merge** | `theme-pass.sh merge <theme> <task>` | a pull request from `merge/<theme>-<task>`, merged with a **merge commit** (D29); then the build published to the test repository and the progress page | merged and published |
| 9 | **Done** | `theme-pass.sh done <theme>` | the theme off `active`; the next in the queue named to the user | the user starts the next pass |

`theme-pass.sh status` shows the queue and, for every theme, its branch against `main`, its worktree and its last walk.

## Plugins
Plugin UI a themed screen must draw (MediaSegments and Intro Skipper skips, up next, SyncPlay, Home Screen Sections,
and whatever else the 9.45 archive or the theme API gains) follows its own track:
1. Engine: what the theme needs from the plugin, through the theme API (a `feat/` branch into `main`).
2. **Baseline first**, on `theme/baseline`: the plugin drawn in the stock layout, then walked and compared with the
   Jellyfin-Web choice (the control) screen by screen: the same functions, in the same places.
3. The other themes: in each theme's pass (or a short `theme/<id>` follow-up for themes already done), the plugin in
   that theme's look. `screens.json` gains the plugin's entries so every walk covers them.

## The walk
`tests/icefin/web/theme_walk.py` visits every entry of `tests/icefin/web/screens.json` (home, libraries, details of
every type, settings, sign-in, the dashboard, music, the item menu and its dialogs, pickers, header menus, player
controls and their menus) and records what draws each one:

| State | Meaning | Gap? |
|---|---|---|
| `theme` | the theme's own screen, overlay or player controls | no |
| `framed` | jellyfin-web's page inside the theme's frame (`ui.stockChrome`) | yes (D30) |
| `restyled` | jellyfin-web's dialog or player controls in the theme's tokens only (9.38, `ui.osd`, or the 9.45 fallback) | yes |
| `stock` | jellyfin-web as it is | yes |
| `dashboard` | the server dashboard, left stock | no (a gap if the theme touches it) |
| `missing` | the walk found no way to open it | yes: the theme lacks the entry point |
| `skipped` | nothing in the library to fill it (no books, say) | no; listed |

Every drawn entry also runs the checks every theme owes everywhere: something has focus (a controller can start),
nothing focusable runs past the window's sides. Script errors are listed as warnings (the server and its plugins
throw too). A dialog opens by the engine's own control first, then the theme's control by its readable name (text or
`aria-label` matching the entry's `text`), then jellyfin-web's: **a theme's entry points carry a readable name**, so a
control the walk can't name is `missing`, which is a real finding (screen readers can't name it either). A screen the inventory lacks is added to
`screens.json` (every theme's next walk then covers it).

## Coverage
`scripts/icefin/theme-coverage.py` keeps each theme's last walk in `docs/themes/coverage/<theme>.json` (committed on
its theme branch with the work), writes the gap list `<theme>.md` and the matrix `docs/themes/coverage/README.md`
(every theme against every group). `--check` in CI keeps the generated files in step.
