# baseline: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin. Walked 2026-11-26 on
the lab's first guest: build ad21fa59e4c3bbe3, 60 minutes a run, 7 runs, Baseline alone, against the stock control
reused from Tide's walk on the same build (D47). The walker had #234's keyboard-test fix, not yet the settings-ranking
fix or #235. Baseline 221 + 36 findings (plain + Steam environment) to triage, 257 in all. Continues `baseline-pre.md`
(the pre-pass walk).

Baseline is stock's look (D31), so a finding stock shows too is stock's. One thing changes how the control reads this
walk: Baseline's labels carry the icon's ligature text ("personProfile", "devices_otherClient Settings",
"music_noteE6600:15"). The icon span is `aria-hidden`, but the walker's label is `textContent`, so findings stock has
too were not matched as in the control (J4, J5). The walker drops the text of `aria-hidden` descendants in the follow-up.

## Coverage

Pads reached about 24 screens a run, keys 26, mouse 42. Every run was cut by the budget with up to 10 required screens
unreached: a books and a home-videos library, a season, a song, an artist, some of the preferences pages. Causes: the
walker faults of #234's neighbours (the settings ranking; Baseline's ligature labels also hurt the "settings word"
ranking: "tvDisplay", "homeHome") and the budget. The coverage question is with the user: whether the controller runs
should split the app between them, as they all walk the same first 24 screens now. Pass 2 walks on the fixed walker.

## Findings fixed

Theme (theme/baseline, c8a990e4):
- [x] F1: Back to the home finds its opener (back-focus, 99, every run: on the home, every opener (cards, Live TV
      buttons, the header's Settings and Search, rows) landed on SyncPlay; on /userprofile the header's Settings and
      Search landed on nothing, on /search Settings on Search). `B.backFocus` recorded every engine focus into the
      history entry's memo, the screen's own arrival focus included: on Back the engine mounts the home and focuses its
      first control (SyncPlay) before the home's data arrives, and that overwrote the opener. `popstate` and
      `hashchange` both ran the restore, so the second read took SyncPlay as the target. It now records only the user's
      focus for a moment after a route change, and does not read the memo again while a restore for the same entry is
      pending. Other screens already restored (back_ok True on the libraries, Live TV and every details page).
- [x] F2: Tab and Shift+Tab step through the screen's controls in page order, as stock's page does (shift-tab, keys,
      15, every screen walked): every Baseline control is `tabIndex` -1 and nothing mapped Tab, so Tab moved nothing and
      Shift+Tab "did not move". A panel keeps its own keys.
- [x] F3: focus kept after an item-menu action (back-focus, mouse, 1: an album's More, then Play next, focus on Play).
      A successful action reloads the details page, which drew it again and focused Play. The refresher gives the
      focused control back after the redraw, so More stays focused. One gap remains: a control that renames itself
      (Mark played becoming Watched) is not found by its label and falls back to Play.
- [x] F4: OK on a guide gap plays the channel (dead-control, mouse, 1: "No program information"): the hint said
      "OK watch" but the engine dropped a gap's press and `onSelect` ignored gaps. The guide passes `selectGaps` (engine
      #236, merged) and a gap watches the channel.

## Judged not Baseline's, or the walker's

Judged:
- J1 (dead-control, 21: keys, mouse, every pad): the tab you are on, /livetv Series and Programs, /tv Shows, /music
  Albums, /movies Movies. A press on the selected tab does nothing, as stock's. Rule for Baseline.
- J2 (dead-control, 8): the header's Settings on /mypreferencesmenu (7) and Search on /search (1): the page you are on.
  Rule for Baseline.
- J3 (dead-control, 8, mouse): music pressed while the same 2-song music already plays (Instant Mix, Shuffle, the
  first song), Previous Track on the first song, and the bar's song pressed as the 15-s clip ended (the bar goes with
  it). Stock's album has the same dead presses for keys and every pad. Baseline is stock here, so no notice is added
  (Tide's and Media Center's notices are their themes' choices). Rule for Baseline.
- J4 (back-focus, 9: all 7 runs): the settings menu lands on its first entry (Profile) after Back from Client
  Settings, Display or Search. Stock's lands on Profile after Back from every entry. Not matched as in the control
  only because of the ligature label. F1 probably fixes Baseline's too (the same mechanism), which would be better than
  stock; the rule then matches nothing. Rule for Baseline.
- J5 (script-error, 7: all 7 runs): `[userprofile] Unexpected null page reference` on /mypreferencesmenu's Profile.
  jellyfin-web's own profile page logs it under any theme, and the stock control logs it on its Profile in every run.
  Closes the pre-pass's open question. Rule for every theme.
- J6 (back-focus, 3: Xbox, 8BitDo, Steam): an album's "E660, Icefin Lab", the now playing bar's song, after Back from
  /queue landed on Play. The 15-s clip ended during the round trip, so the bar and its button were gone and the page's
  own arrival took Play. Rule for Baseline.

Fixed in the walker (follow-up walker PR; none of these is in #235):
- W1 (back-focus, 6): a series' episode whose label carries the clock ("Ends at 10:24 PM", then 10:28) was found again
  by #235's label match. Optional: strip clock times from labels.
- W2 (broken-back, back-focus, 2: keys): `dialog_pass` called `reopen()` while Baseline's item panel was still open
  after the down sweep, and the Enter pressed into the open panel took its last row, "View series". The walker now
  closes the dialog with Back before the up sweep, and `reopen` refuses while the screen is still the dialog.
- W3 (back-focus, 2: Xbox, Switch Pro): `stop_play()` raced the next press at the budget's last minute: More was judged
  while the player was still up. The walker waits for the route to leave /video first.
- W4 (back-focus, 1: mouse): a dialog closed by its own row (View artist) was judged as a Back. Back-focus is judged
  only when the walker's own Back closed the dialog.
- W5 (broken-back, 1: mouse): Tide's W3 again, the player closing itself on a collection with the Back on its way; the
  same wait after `stop_play()`.
- W6 (dead-control, 8): Schedule and Genres changed the tab (a new hash, from one empty tab to another) and Select view
  showed its "Poster view" notice at the end of a long screen; the digest saw nothing. A changed `location.hash` and the
  text of `[role=status]` and `[role=alert]` now count.
- W7 (hover-no-focus, 6: mouse): the engine takes a pointer event at the last coordinates as a resting pointer, by
  design; the hub's entries were hovered at the point of the previous click, and the first hover of the run had nothing
  to compare with. The walker moves away first, with one warm-up move.
- W8 (unreachable-by-input, 43): the tab row swept leftward only, so the tabs right of the entry (Upcoming, Genres,
  TV Networks, Episodes; Album artists to Genres on /music) and the toolbar's right side were never reached, and
  `direct_reach` ping-ponged between the A-Z strip and the first card. It tries the other axis on a return to a key seen
  in the attempt, and the snake sweeps a row both ways. The letters below A are unreachable in stock's control too.
- W9 (budget, 7): the required screens not reached, see Coverage.
- W10: the played button labelled plain "Watched" was missing from the danger list (it changed the walker user's played
  marks on the Test Show and Collection pages: keys and every pad once, the mouse twice). Walker users are copied from
  the lab admin at each walk's start, so nothing persists, but walks must not write: a bare "Watched" and "Played" are
  now dangerous.

Unsure:
- U1 (hover-no-focus, 9: mouse): the now playing bar's buttons (/music Previous, Pause, Stop; an album's song, Previous,
  Pause, Stop, Next; a playlist's Pause). The same buttons took hover focus at other times, so hover works on the bar.
  Likely timing: the bar is attached again by a 500-ms timer after each screen draws and slides in over 0.2 s, and one
  hover that lands before it is in place focuses nothing. Not judged. To recheck: hover a bar button 2 s after the bar is
  up, during a song, and read `.bl-npbar .icefin-focused`.

Verdicts: real (theme) 116 (F1 99, F2 15, F3 1, F4 1), walker 76, judged 56, unsure 9. No engine finding.

Not a finding, for the user (D31, stock 1:1): "Select view" on /music and the other grids only shows a "Poster view"
notice; stock's opens a choice of views (Poster, Poster card, Thumb, List). A deliberate cut, or a gap to fill?

## Rechecks for pass 2

Theme, each checked in the lab on the next walk's build:
- [x] F1: keys and a pad, Home, Movies, Back: focus on Movies. Home, header Settings, Back: on Settings. Home, an
      album in a row, Back: on that album. The settings menu, Client Settings, Back: on Client Settings. /search,
      Settings, Back: on Settings. Closed in pass 2: home back_ok 136 of 136 (keys 20, mouse 21, each pad 19), every
      hub entry True, /search and /userprofile True. Missing: "a pad move right after the Back still wins" (the
      walker judges before it moves; by eye, carried to pass 3).
- [x] F2: keys on the home, Tab five times, Shift+Tab twice: focus goes forward five controls and back two. On a
      details page Tab reaches Play, the other buttons, then the rows. Closed in pass 2: no shift-tab findings
      (pass 1: 15); the keys Tab sweep ends "controls reached 24, walk complete" and its restore path uses Tab.
- [ ] F3: an album, More, Play next: the panel closes and More stays focused. Mark played on a film: focus stays on the
      switch (the gap above: it may fall back to Play, to look at). Half closed in pass 2: a playlist's More, Play
      next, More kept focus (mouse). Missing: Mark played on a film (the walker skips it; by hand).
- [x] F4: the guide, a gap, OK: "Connecting to Icefin One". Closed in pass 2: OK on "No program information" reached
      `/video`, twice (mouse). The text itself was not read.

Pre-walk rechecks (`baseline-pre.md`), still open:
- [x] Back focus across the board: re-walk after F1, home back_ok True. Closed in pass 2: home 136 of 136; the
      other False back_ok are the walker's (WB, WC, WI) and one unsure (U1).
- [ ] The now playing bar against stock's, from a pad screenshot with the bar and the hints up, and the side-by-side.
      Missing: the pad screenshot and the side-by-side (the walk does not make them).
- [ ] Hover moves focus: by eye, next to stock. Missing: the eye check (the walk's 3 hover-no-focus are pass 2's U2).
- [ ] The mouse's Back with a panel open in the app itself: `xdotool click 8` on the lab display. Missing: the walker
      still sends the CDP button.

Walker:
- [ ] The books and home-videos libraries, a season, a song, an artist and the preferences pages are reached at 60
      minutes (the coverage question, with the user). Missing: every run hit the budget again; pads reached 29 to 30
      screens (24), keys 33 (26), mouse 44 (42), and the keys run lost 20 minutes to the quit.
- [x] No walker user writes (a bare "Watched" press is skipped). Closed in pass 2 for played and favourites (Watched,
      Mark played and Add to favorites all skipped). The keys run did quit the app and opened the dashboard
      (read-only): see baseline-2.md.
- [ ] U1 replayed as above. Missing: not replayed; it is pass 2's U2 and still unsure.

Baseline's first pass is done; its second walks on the fixed walker.
