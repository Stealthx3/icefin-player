# QA process log

The log of IceFin Player's QA/QC phase (D38, D40 onward): how the process runs, what happened, what was changed and
why. It is kept for this project and as the starting point for QA on later projects, so the **Guide** holds what has
proved itself and the **Log** holds the evidence behind it.

**Keeping it:** after every QA session (and whenever the process changes), add a dated entry to the Log: what ran,
what it found, what was changed in the process and the lesson, if any. When a lesson holds beyond one theme, fold it
into the Guide in the same commit. Numbers go in the Metrics table. No private paths, addresses or names
(`docs/standards/PII-REDACTION-STANDARD.md`).

## Guide

What a QA effort on this kind of app needs, as learned here. Each point names the Log entries behind it.

**Shape of the plan**
- Pass the units under test (here: themes) one at a time through N continuous passes, then rounds over all of them.
  Every finding is fixed in its pass or carries a reason (D40, D41).
- Pair every walk with a control (stock Jellyfin-Web, the same walk with the engine off), so a finding the control
  also has is not the unit's (D41).
- Review the plan against the work every few days: what is done, what is merged, which boxes are unticked and which
  inputs are not really covered (2026-11-26, plan review).

**Infrastructure**
- Walk in disposable lab guests, not on the user's machine (D42): the walks can run unattended and the user's account
  is never touched.
- Run the inputs in parallel, each in its own app instance, display, debug port, server user and device filter (D44:
  about 6 hours a theme became about 85 minutes).
- Isolate parallel runs from each other completely: anything shared on the server (sessions, Watch together groups,
  play queues) lets one run act on another's screen (2026-11-26, re-walk 2).
- Load the unit under test from a folder, never rebuild for a change to it, so the binary and its control stay the
  same; walk the control once per binary (D47: it was half of every walk).
- Keep the lab busy: the next unit walks while the last one is triaged and fixed. Add a second guest when the host has
  room (D47): measure first (the main guest averaged about 5 of its 12 vCPUs over a day of walks), and check what a
  cloned guest carries over (network identity, servers not started at boot; `docs/LAB.md`).
- Run a long-lived helper on the host (a screen-lock hold) as a user service, not as a detached child of a tool's
  shell: that child died within the hour (2026-11-26, Tide and Almanac 1).
- Before blaming the host for a slow walk, compare presses per minute with an earlier walk: the walker's settle waits,
  not the CPU, set the pace (2026-11-26, Tide and Almanac 1: the same rate with two guests and two other projects'
  guests running, though half the guests' CPU time showed as steal).

**The walker**
- A synthetic input (DevTools events) skips the app's native path: plan a real-input check for anything the native
  layer handles (the mouse's Back button through Qt's event filter) (2026-11-26, plan review). In the lab, xdotool on
  the replay's own X display gives the real event; run the replay unbuffered (`python3 -u`) when a script waits on
  its output (2026-11-26, re-walk 3).
- Size the time budget from the required screens, not from the walk's length: a run that ends with required screens
  unreached is a coverage gap, even when its findings fall (2026-11-26, re-walk 3: 40 minutes left the same four
  screens unreached in every keys and pad run; walks now run 60).
- Read each run's coverage per input and required screen before its findings, and set it beside the control's runs: a
  run that ended with its queue empty and required screens missing is a walker fault until shown otherwise; a run cut
  by the budget is a budget question (2026-11-26, Tide and Almanac 1).
- Every pattern the walker matches on class names or roles is a guess about the page: check it against what the app and
  the units really use, and diff a changed pattern against recent walks' elements before shipping it (2026-11-26: the
  keyboard test matched the engine's own theme root; the settings ranking matched "menu" and "user" in almost every
  class).
- Wait for asynchronous states to settle before judging (a channel connecting, a row sliding, a pivot moving); judge a
  control by its first observation, not a repeat (2026-11-26, re-walk 2).
- A control the walker listed while hidden needs the click that shows it recorded as its way in (2026-11-26, re-walk 2:
  the mouse missed 14 required screens in every walk of a pass).
- Every walker fix is found by tracing a finding to its cause, and is re-checked by the next walk.

**Triage**
- Diff each walk against the last one: new, gone, unchanged.
- Trace every new finding before fixing anything; most are the walker's, and the real ones are often not where the
  finding points (2026-11-26: a "dead" Instant mix was a missing notice; dead player controls were another run's
  channel).
- Carry judged findings forward (`tests/icefin/web/qa-judged.json`): a walk lists only what is new (D47: 100 to 45).
- Close every recheck with evidence from a walk, or keep it open with what is missing. A recheck left unticked hid a
  real bug for ten days (2026-11-26, plan review: the pad never reached a book's Add to favorites).
- Check a fix made on one unit's branch on every unit that shares the code (2026-11-26: the Watch together fix reached
  six themes' branches and missed four), and check each unit's branch for work stranded on side branches before its
  walk (2026-11-26: three themes' pre-walk fixes sat on branches with no PR for nine days).

**Verification and release**
- Check a fix with a targeted replay in the lab (`tests/icefin/web/debug_seq.py`), and let the next pass be the full
  re-walk; one full verification re-walk after the last pass (D47).
- Merge each unit's fixes into main as soon as its passes end, and publish the build to testers.

**Working with the user**
- Decisions go to the phone and a decisions page while the work goes on; nothing blocks on a question (D40).
- A live status page, updated at every step and every long job's start and end; the user notices silence.
- Measure where the time goes before asking for more of it (2026-11-26, speed review).

## Log

**2026-11-16: QA starts (D40, D41).** 10 themes, 3 passes each, then 3 rounds (60 passes). Walks on the user's
workstation, serially: keys, mouse, five pad families, Steam shortcut and nested Gamescope, each with the stock
control. Plaza passes 1 and 2 the same day. Lesson: a walk of one theme with its control took about 6 hours.

**2026-11-17: paused** for the weekly usage limit, part-way through Plaza's pass 3 on the host.

**2026-11-21: resumed in the VM lab (D42), then in parallel (D44).** Plaza's pass 3 reran in the lab. The seven runs
now run at once, each with its own walker user: about 85 minutes a theme with its control. The same day: the lab's
disks moved to the VMDisks pool (D46) and the repository's history was rewritten to remove private values (D45),
which paused the work twice. Media Center passes 1 and 2 walked alongside Plaza's re-walks.

**2026-11-21 to 11-26: Plaza done; Media Center pass 3.** Plaza: 3 passes, merged into main (#221, #223), review
asked. Media Center pass 3: 150 + 20 findings. Real ones: the engine hid a theme's own notices under its screens
(#222), Books opened on an empty pivot, Live TV's connecting box stayed after the mouse's Back (#224), Instant mix
and music playlists started with nothing on screen. Walker faults found by tracing: hover judged by path alone, a
start-strip row reached by the wheel judged on the wrong level, a settings entry skipped as a view choice,
priorities that left Live TV unreached, one run joining another run's Watch together group, a channel judged before
it connected, a pivot judged while sliding, closed rows' tiles never reached. Three re-walks: 150 + 20, 130 + 16,
91 + 11, then a third.

**2026-11-26: plan review (the user asked).** Found: Media Center's fixes not in main; the test repo nine days
behind; the walker not in main (PLAN 11.7); the pipeline record still at Plaza pass 1; six rechecks never closed,
one of them a real bug (the engine's focus picker skipped a button the zoomed focused one overlaps: the pad never
reached a book's Add to favorites, #225); two inputs not really covered (the mouse's real Back button; Steam's
shortcut and Gamescope since D42). Lesson: the passes' docs were current, the process around them was not.

**2026-11-26: speed review (the user asked).** Half of every walk was the stock control walked again, because every
theme fix rebuilt the binary; Media Center alone took about 8.5 hours of walks; the lab idled during triage; triage
re-read findings already judged. The user chose all five speed-ups (D47): themes from a folder with the control
reused, the next walk started at once, a second guest, judged findings carried, and fewer full re-walks. Estimate:
the remaining QA from about 75 to about 20-25 hours of lab time.

**2026-11-26: Media Center re-walk 3; the real Back button.** 48 + 7 findings (from 91 + 11); with the judged list,
10 + 1 to triage, of which 7 were the budget. Coverage checked before reading the drop as progress: the keys and pad
runs reached what re-walk 2 reached, and the mouse's closed-row fix halved its unreached screens (14 to 7). One real
finding (the episode shown, pressed in its own season's row, did nothing; engine #229), two mouse Backs judged (start
strip rows and library pivots are not levels). The walk ran on the walker from before D47, so its triage list was
built afterwards from the reports. Checked in the lab with real input: #225 (Right walks a book's buttons through
Add to favorites) and the mouse's Back button through Qt's filter (one step back, not two; an open menu closes first).
Lesson: a lower count needs its coverage checked; and the budget must cover the required screens.

**2026-11-26: Media Center merged; the second guest; Tide and Almanac start.** Media Center's passes into main (#231)
and its review asked; the test repo got the build (0.1.0-alpha.2+qa3, shared with another project's publish on the
second guest, each in turn). The second guest took an hour, not 20 minutes: the clone booted with no address (its
network config named the original's MAC) and both guests' servers needed starting by hand, which a walk only shows by
waiting. Tide and Almanac's first passes then started at once, one per guest, at 60 minutes a run. Lesson: a cloned
guest is a new machine; check its identity and services before the first walk.

**2026-11-26: Tide and Almanac pass 1; two walker faults; stranded branches.** Both walked at once, one per guest, at
60 minutes a run. Coverage first: Tide reached 73 screens against stock's 191, Almanac 22 to 24 a pad run; no pad or
keys run reached a series' seasons, the music details or the preferences. Two walker faults, both a pattern match:
the keyboard test counted the engine's theme root (role=application) as an on-screen keyboard, so the walker never
retried a control its walk missed on any themed screen, Plaza's and Media Center's passes included (Tide's Shows
column: 3 of 8 entries reached); and the settings ranking matched "menu" in every Almanac tab's class, so Settings fell
to a per-kind limit. Both fixed (#234); the Orbit walk that had just started on the old walker was restarted. The host
looked overloaded (two other projects' guests too, half the guests' CPU as steal), but the press rate matched the
single-guest walks. Getting Orbit's branch ready showed Orbit's, Mosaic's and Arcade's pre-walk fixes on side branches
never merged, and the Watch together fix missing from four themes; both mended before those walks. Triage ran in
parallel, one agent a theme, verified before fixing: Tide 148 findings (69 the walker's; real: the trail's own step
did nothing, a picker sent focus to Play, idle controls said nothing, no notice on music, guide gaps, a level's mouse
Back, settings focus on return), Almanac 117 (34 focus-lost were one cause: Back to a screen that waits for the server
before it focuses, during a slow-server window). Fixes: both theme branches, engine #236, walker #235. The user asked
for screen locking off during the QA run. Lesson: the coverage check is triage's first step, and every class or role
pattern in the walker is a hypothesis about the page.

## Metrics

| Theme | Pass | Walk | Findings (theme + Steam run) | Notes |
|---|---|---|---|---|
| Plaza | 3 | pass 3 (lab) | 208 + 27 | rerun after the pause; stock had 225 + 33 |
| Plaza | 3 | re-walk 1 | 139 + 13 | |
| Plaza | 3 | re-walk 2 | 129 + 11 | |
| Media Center | 1 | pass 1 | 174 + 26 | 121 + 20 of them screens not reached |
| Media Center | 2 | pass 2 | 93 + 18 | |
| Media Center | 3 | pass 3 | 150 + 20 | 40-minute runs (pass 2 had 25) |
| Media Center | 3 | re-walk 1 | 130 + 16 | |
| Media Center | 3 | re-walk 2 | 91 + 11 | 45 left to triage with the judged list |
| Media Center | 3 | re-walk 3 | 48 + 7 | 10 + 1 to triage, 7 of them the 40-minute budget; 1 real (#229) |
| Tide | 1 | pass 1 | 154 + 12 | 137 + 11 to triage; coverage cut by the walker (73 screens, stock 191) |
| Almanac | 1 | pass 1 | 111 + 14 | 104 + 13 to triage; 22-24 screens a pad run |

Walk time: about 6 h a theme serially on the host (2026-11-16), about 85 min in parallel in the lab (D44), about
45 min expected with the control reused (D47).
