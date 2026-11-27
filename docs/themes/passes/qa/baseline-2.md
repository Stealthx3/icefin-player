# baseline: QA pass 2 (D40, D41)

Phase A, pass 2 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once. Walked 2026-11-27 on the lab's first guest: build 5b32846881478656
(main with the engine fixes of #236), 60 minutes a run, 7 runs, Baseline alone, against the stock control reused from
Tide's pass 2 on the same build (D47). The walker is #239. Baseline 116 + 24 findings (plain + Steam environment; pass 1:
221 + 36 to triage), 56 + 12 left to triage after the judged list. Continues `baseline-1.md`.

Baseline is stock's look (D31), so a finding stock shows too is stock's. Baseline's labels still carry the icon's
ligature text ("closeExit Application", "personProfile"); this mattered once this walk (the keys run, below).

## Coverage

Pads reached about 29 to 30 screens a run (pass 1: 24), keys 33 (26), mouse 44 (42). Every run was cut by the budget with
required screens unreached: the books and home-videos libraries, a season, an episode, a song, an album, an artist and
the now playing screen. The keys run also lost 20 of its 60 minutes to the quit below. The coverage question stays with
the user: whether the controller runs should split the app between them, as they all walk the same first screens.
Walker #242 ("stop wasting the hour") and the quit fix are meant to help; pass 3 measures it.

## The keys run quit the app (19 walk-errors, no crash)

The walker opened the settings menu's "Exit Application", which opens Baseline's exit question (Cancel focused as the
safe choice, then Exit). Its dialog sweep moved to Exit, and #239's reopen pressed Enter into the still open panel. The
panel took Enter for its focused row, Exit, and the app quit as told. The app log shows no crash, segfault, abort or
render-process line: it ends in ordinary lines at the minute of the Enter. Then the walker's recovery failed: with no app
to reconnect to, each queued screen waited 60 s and failed, one walk-error a minute (19), and `walk_parallel` only checks
for a missing app between runs, so no app-quit finding was recorded.

Not Baseline, not the engine, not the app. It is pass 1's W2 again (the Enter into an open panel, which then took "View
series" and "View artist"), seen on three runs this time. The denylist did not catch it: `\b(exit|quit)\b` finds no word
boundary in "closeExit Application", while the mouse run, whose rows are read without the ligature, skipped both rows.

Fixed or open:
- #241 (merged): `reopen` closes an open panel with Back first, so Enter cannot land in it. The dialog's rows "Exit" and
  "Cancel" are then skipped as dangerous.
- #242 (open PR): the exit rule catches "closeExit Application", and a run ends with one app-quit finding when the app is
  gone, so 19 findings and 20 minutes become one finding.
- Still open, optional: the label drops the text of `aria-hidden` descendants (pass 1 promised it). With the
  whole-word danger words, any ligature label slips past them the same way, and the keys run also opened the admin
  dashboard (read-only) because its entry is a button, not a link.

## Pass 1's fixes held

- F1, Back to the home finds its opener: 136 of 136 (pass 1: about 1 of 99). Keys 20 of 20, mouse 21 of 21, each pad 19
  of 19; every settings hub entry True in every run, so the hub now lands on its opener, which is better than stock's
  landing on Profile. No back-focus finding on the home in any run.
- F2, Tab and Shift+Tab: no shift-tab findings (pass 1: 15). The keys run's Tab sweep ends "controls reached 24, walk
  complete" on the home.
- F3, focus after an item action: a playlist's More, Play next, and More keeps focus (mouse). The renamed-switch case
  (Mark played becoming Watched) is not walked, as it is on the danger list.
- F4, OK on a guide gap: "No program information" then `/video`, twice (mouse).

## Findings fixed

None this pass: the findings are the walker's, bar the one below.

## Real, open for pass 3

- F5 (script-error, 2: Switch Pro, Steam): Play on a books folder (the lab's "Icefin Lab" folder). Baseline shows Play
  on any Folder (it leaves out only Person, MusicArtist, Studio and Genre), and on a folder of books jellyfin-web opens
  "Playback Error" (Got It). The rejection is logged on the next press after the walker closes the error:
  `rejection: undefined`. The pre-pass catch (`B.playWith` catching the play's rejection) does not cover this one. The
  Xbox run saw the same Playback Error without the rejection. Stock's page shows Play only where its playback manager can
  play the item, and the stock control never reached a Folder, so compare with stock first. Proposed fix: on a Folder,
  show Play only when its children include something playable (the page already loads them).

## Judged not Baseline's, or the walker's

Judged:
- J1 (dead-control, 2: mouse): the Media info rows on an episode and a movie ("720p H264 SDR · … · 1 Mbps, Video", "4K
  HEVC HDR · … · 12 Mbps, Video"). The rows list the streams to read; they are focusable so a pad can scroll them, and
  have no action, as stock's media info is text. Rule for Baseline. Optional: the wide panel's hint "OK choose" could
  drop on a row with no action.
- Pass 1's J4 (the hub lands on Profile) now matches nothing; keep the rule for stock parity or drop it.

Rules proposed for `qa-judged.json` (doc `baseline-2.md`), two of them stopgaps for the walker:
- `*`, dead-control, a `[Book]` dialog's `Next`: the PDF reader turns the page but the page is a canvas the digest does
  not read (the screenshots show page 1, then page 2).
- `*`, dead-control, keys and pads, `/music` `Shuffle`: a library's Shuffle fetches its items before it plays, and the bar
  comes after the walker's settle. Drop it once the walker waits for a DOM change.
- `baseline`, dead-control, the Media info stream rows (J1).

Walker (60 findings, in groups):
- WA (19, keys): the quit above. Root fixed in #241; the two gaps are #242's and the aria-hidden label.
- WB (6: keys, 8BitDo, Steam): a More panel's down sweep ended on its last row (View artist, View series), and #239's
  reopen pressed Enter into it; the page that opened is a fresh arrival (Play). Fixed in #241 (pass 1's W2).
- WC (1: mouse): a dialog closed by its own row was judged as a Back. Fixed in #241 (pass 1's W4).
- WD (7: every pad's Schedule, mouse's Select view, keys' `/list` More): Schedule changes the tab (a new hash, one empty
  tab to another), and Select view and More answer with a notice only. Not in #241 or #242: a changed `location.hash`
  and the text of `[role=status]` and `[role=alert]` should count (pass 1's W6).
- WE (12: Xbox, Steam): `/list` Sort by, Filter, More and `/tv` Upcoming, Genres, TV Networks; the row entered mid-row and
  swept one way, `direct_reach` ping-pongs. #241 sweeps both ways and #242 tries the other axis; the ping-pong itself is
  not yet a trigger. Recheck on the walker of #242.
- WF (3: keys): the client settings' three "on" switches, 25 Downs toward each. Likely fixed by #242 (give up a stuck
  direction and try the other axis).
- WG (3: DualSense, Switch Pro, 8BitDo): `/music` Shuffle fetches 300 items then plays; the slow-start wait ends on
  `/video` only. Let it also end on a DOM change (the bar), or use the rule above.
- WH (1: mouse): the PDF reader's Next, above.
- WI (1: Steam): after Back from the player the walker had put focus on episode 2 by script and pressed South, so the
  memo kept Shuffle. Avoided by #242 (the player's controls walked once a run). Optional theme hardening: record the
  focused control as the user's on `select` and `enter`.
- WK (7): the budget, see Coverage.

Unsure:
- U1 (back-focus, 1: mouse): On Now "Old Maps, 3:00 AM - 4:00 AM", with two cards reading the same. Either Baseline's memo
  found the twin or the walker's current-card test fell back to the first card with that label. To recheck: replay both
  cards and read the focused card's item id before and after the Back.
- U2 (hover-no-focus, 3: mouse; pass 1's U1): the now playing bar's song ("A440, Icefin Lab", on `/music` and an album) and
  On Now "Paper Boats". The bar's button goes when the 15-s clip ends; Paper Boats was hovered twice and focused once.
  Likely the walker's timing. Pass 1's replay is still needed.

Verdicts: real (theme) 2 (F5), walker 60, judged 2, unsure 4. No engine finding.

Not a finding, for the user (D31, stock 1:1), as pass 1 plus one: "Select view" on /music and the other grids only shows a
"Poster view" notice, and a `/list`'s "More" only shows a hint, where stock's open a choice of views and a menu. A
deliberate cut, or a gap to fill?

## Rechecks for pass 3

Each is replayed in the lab on the walker of #242.
- [ ] F5: still open when pass 3 walked (same theme files; 4 + 1 rejections). Stock's control opens the folder as a list,
      and its Play All gives the same "Playback Error" without a rejection. Fixed since (T1, theme/baseline 52502b79);
      missing: a replay showing no rejection and a film folder still playing (`baseline-3.md`).
- [x] The quit: closed. Pass 3 had no walk-error or app-quit in any run, and the mouse skipped "closeExit Application" as
      dangerous. Note: keys and pads never pressed it, so the keys case itself is not re-proven (carried to pass 3's list).
- [x] WD: closed for Select view and `/list` More (in-place on every run; keys `/list` More too). Schedule was not pressed
      from an empty tab in pass 3, so that case is carried.
- [x] WF: closed. No unreachable finding on the client settings' switches in pass 3.
- [ ] WE: `/list` Sort by, Filter, More are the theme's (T2, fixed in 52502b79, replay missing). `/tv` Upcoming, Genres, TV
      Networks are the walker's (the tab row is reachable; the greedy try cycled): W4 is meant to reach them.
- [ ] WG: not exercised in pass 3 (`/music` Shuffle was unpositioned on keys and pads; the mouse's case is judged).
- [ ] WI: not exercised (Series never reached); the same mechanism recurred as W-F.
- [ ] Coverage: open, worse (13 screens walked a run; the type seeds pressed library tabs and the walker never switched
      back). W1 to W5 are meant to fix it; needs a rerun.
- [ ] U1: recurred 3 times (W-H); likely the walker's twin-label test. Needs the replay by item id, or the W-H fix.
- [ ] U2: recurred as pass 3's U3 (Previous Track, 3 of 3). Needs the hover check by eye.
- [ ] F3, the renamed-switch gap: Mark played on a film keeps focus on the switch (by hand; the walker skips it).
- [ ] F1: a pad move right after the Back still wins (by eye; the walker judges before it moves).
- [ ] F4: the guide gap's own text, "Connecting to Icefin One", read.
- [ ] The now playing bar against stock's, from a pad screenshot with the bar and the hints up, and the side-by-side.
- [ ] Hover moves focus: by eye, next to stock.
- [ ] The mouse's Back with a panel open in the app itself: `xdotool click 8` on the lab display.

Baseline's second pass is done; its third walks on the walker of #242.
