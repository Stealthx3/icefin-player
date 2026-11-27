# orbit: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked in the same run as the control (D47's reused control, Almanac's from the same build). Orbit alone,
60 minutes a run, on lab guest 2. Walk: 2026-11-26. Build: ad21fa59e4c3bbe3. The walk was restarted once at the start
on the walker's settings-ranking fix (#234), because Orbit's guide uses the same tab kit as Almanac. Orbit 224 + 31
findings (plain + Steam environment) to triage. Continues `orbit-pre.md` (the pre-pass walk that made the home
reachable by mouse).

Verdicts (255): real (theme) 78, walker 71, judged 97, unsure 9.

Coverage: pads and keys 30 to 34 screens a run, cut by the budget; 7 required screens unreached (the playlists library,
a season, an episode, the Display, Playback and Subtitles preferences, Now playing). The mouse run ended after 12
screens with budget left (22 of its 60 minutes) and 21 required screens missing, a walker fault: it enumerated the
home before the pointer moved, so the pointer bar, which Orbit shows only after a pointer move, never joined its
controls, and it never turned the wheel, which is Orbit's way to its other channels. It spent the rest on Live TV's
four screens. Walker fixes W-A to W-I are being made in a follow-up PR (walker PR to follow); W-G (#238, merged)
anchored the played-switch danger rule. Pass 2 walks on the fixed walker.

## Findings fixed

Theme (theme/orbit, 015b97e7). Earlier today on this branch: the pre-walk fixes were merged in from a side branch (they
had no PR for nine days), main was merged in, and the Watch together row was fixed.
- [x] F1: play presses say what started (dead-control, 35: a song, an album's, an artist's and a playlist's Play all and
      Shuffle, the /music Shuffle). Music started with nothing on screen to say so, the same 15-s clips already playing.
      They show "Playing …", "Shuffling …" and "Instant mix from …" in the notice, as Almanac and Tide. A BoxSet's Play
      all and Shuffle (dead-control, 4) change in place with it.
- [x] F2: the pointer bar's Options always answers (dead-control, 2: Live TV's empty Schedule lists): "No options here"
      with the error sound when there is nothing to open.
- [x] F3: Back from the player focuses the played cell (back-focus, 5, mouse): the guide remounted on row 0 and kept the
      tab but not the cell. The played cell is filed and focused on return. A later programme's panel also shows at
      once from the programme the guide holds, as Almanac's F4.
- [x] F4: Live TV's list screens come back on the tab that was shown (back-focus, 2, mouse): Channels' Guide tab, and
      Series' Schedule with "Open the guide".
- [x] F5: the pointer bar follows the pointer (hover-no-focus, 7: Options, Play on, Watch together): its buttons take
      focus on a moving pointer, as Almanac's kit.
- [x] F6: the pointer's own ways are marked `data-icefin-pointer-only` (unreachable-by-input, 12): the channel titles
      on the home (a pad has the up and down arrows) and the Episodes panel's season tabs (a pad has the shoulders); the
      current season tab carries `aria-selected`. As Media Center's convention.
- [x] F7: the account on the home is reachable from a pad and keys (unreachable-by-input, 6): Up on the top channel
      focuses it instead of the error sound; A opens Choose a server; Down returns to the channel.
- [x] F8: Down from the tabs reaches an empty tab's button (unreachable-by-input, 9: Go back on Movies, TV and Books).
- [x] The idle Now playing notice says "Nothing is playing", as Tide's (not a finding this walk, the mouse never reached
      /queue; ported ahead of the next).
- [x] The wheel test in `theme_orbit.py`: a `WheelEvent` with `deltaY` 120 on the home moves the channel from 0 to 1;
      with Shift the ring's tile moves along by one.

Engine: none new. The programme-panel back-focus (unsure, below) rechecks against the engine's guide focus fix (#236,
merged).

## Judged not Orbit's, or the walker's

Walker, to fix in the follow-up PR (walker PR to follow), each found by tracing the run:
- W-A: the mouse's first collect came before any pointer move, so the pointer bar was opacity 0 and left out; the
  bar, tile 5 and the account were recorded later by the position re-enumeration but never tried (required-missing, 21).
  It moves the pointer twice before the first collect, and newly visible controls join the list.
- W-B: the mouse's dialog pass did not enumerate again after an in-place click (the blades: Library, You, Settings).
- W-C: a wheel probe on each mouse screen, replayed as a way to reach the controls it shows.
- W-D: a hover with no movement is ignored by Orbit's pointer-first kit (hover-no-focus, 2: the Schedule tab); the
  hover approaches from an offset. This is Almanac's first-move class.
- W-E: hovering a receding tile turns the ring by design, and the re-hover loop followed the sliding tile to tile 6
  (obscured, 1). It waits for a stable rectangle and stops when the control is focused.
- W-F: a late player start after a press that plays was read as nothing (dead-control, 4: a BoxSet's Play all and
  Shuffle, a home video).
- W-G: the played-switch danger rule over-matched Orbit's item labels ("· watched ✓") and would skip every played film;
  anchored in #238 (merged).
- W-H: the guide's cells are drawn per time window, so the mouse's cells are not the pad's elements; direct reach went
  the wrong way in the grid (unreachable-by-input, 21: Deep Water, Evening Report, Feature Presentation, Harbour Lights,
  Paper Boats, Small Worlds). It tries the other axis after a bounce and leaves guide cells out of the unreached check.
- W-I: a click on the shown tab redraws it in place and was taken as a level (broken-back, 2).
- Fixed by #235 (merged while this walk ran, so in its next walk): the connect card counts as a change (dead-control, 12: the home's
  Lab Notes and Match Night tiles press into "Connecting to …"), the current tab is no dead control (1), and "Watched ✓"
  is dangerous (broken-back, 3: a Series' details).
- Required screens not reached (budget; the playlists library, a season, an episode, the Display, Playback and
  Subtitles preferences, Now playing): the 60-minute budget at about 30 screens a run, and the mouse fault above.

Judged (rules proposed for `qa-judged.json`, doc `orbit-1.md`):
- J1, Shift+Tab (low, keys, 23, every screen): Orbit is a console dashboard and a TV theme; its channels, decks and
  guide take the arrows and a pad, every control is `tabIndex` -1 and nothing handles Tab. As Plaza, Media Center and
  Almanac, not Tide.
- J2, Play all and Shuffle on a PhotoAlbum under the slideshow (dead-control, 6): jellyfin-web's slideshow covers the
  screen and has no controls; the album's own Play all starts the slideshow already showing.
- J3, the current channel's title on the home (dead-control, mouse, 1): it brings its first tile back, and with that
  tile already in front there is nothing to change.
- J4, Live TV's tabs on a list screen (broken-back, mouse, 5): the tabs switch the view in place, as a library's pivot;
  the mouse's Back goes back in history, as a pad's Back does there.
- The slideshow's IMG_* entries (dead-control, 62) are covered by the existing rule for all themes (tide-1.md).
- `Failed to get playlist permissions` 404 on a playlist (script-error, 5 runs): jellyfin-web asks the server whether
  the signed-in user may edit the playlist, and the walker users are copies of the admin who made it; judged in Media
  Center's pass 3 and Tide's pass 1.
- Optional until W-H lands: a rule for unreachable-by-input on `/livetv`, since guide cells are drawn per time window.

## Not done, for the user

- An optional cue on the top channel that channels lie below: from the home's first channel nothing on screen shows it
  (the channels below have no visible title; the wheel and the pointer bar's Guide are the ways). The triage's idea is
  the nearest channel below as a faint clickable title under the ring. A design decision; check it against the clone
  target.

## Unsure

- The programme panel's back-focus on the guide (back-focus, 9: Lab Notes to Studio Sessions in four pad runs, Feature
  Presentation to Morning Brief, Tin Robots to Lab Notes, Kitchen Table to Morning Brief on keys). The same class as
  Almanac's E1 (the guide's current cell not following focus that did not come from its arrows). The result repeats
  across runs, which does not fit a random 30-s redraw, and the walker's panel pass places focus by script under the open
  panel. Recheck after the engine's guide focus fix (#236, merged): replay on a pad guide, arrows to a later programme,
  OK, Back with no row pressed; then once with a row pressed. If it holds, it is the engine's; if not, it is the walker's.

## Rechecks for pass 2

Theme, each checked in the lab on the next walk's build:
Checked against pass 2's walk (2026-11-27, `orbit-2.md`); what is ticked held, what is not says what is missing.

- [x] F1: Test Tones, Play all shows "Playing Test Tones"; Shuffle shows "Shuffling Test Tones"; a song's Play shows its
      notice; a BoxSet's Play all changes in place. (No dead-control on an album's, an artist's or a playlist's Play all
      or Shuffle, or on /music's Shuffle in 7 runs, pass 1: 35; a BoxSet's Play all reached /video. One gap: `/details
      [Audio]` Play is still silent, also in the stock control; carried to pass 3.)
- [x] F2: Live TV, Schedule (empty), click Options: "No options here" with the error sound. On a guide programme Options
      still opens its panel. (Options on the empty Schedule list answers in place in three mouse runs, not dead.)
- [ ] F3: Guide, a later row's on-now programme, wait for the player, Back: that cell is lit, not Harbour Lights. A later
      programme's panel opens on OK within a frame. (The played cell held: Copper Docs lit after Back. The panel half
      could not be tried: the lab's guide had no programme data. The remaining back-focus findings are the walker's, W-O.)
- [ ] F4: Live TV, Channels, the Guide tab, mouse Back: the Guide tab is lit. Series, Schedule tab, Open the guide, Back:
      Schedule's list with "Open the guide" focused. (The Guide tab held. The second half failed: the tab's zone was
      written only when a tab was chosen; fixed in 9f38bb3c, recheck in pass 3.)
- [x] F5: hover the pointer bar's Options, Play on and Watch together: each takes the focus look. (No hover-no-focus in
      the mouse run, pass 1: 7.)
- [ ] F6: the channel titles on the home and the season tabs are not listed as unreachable; a pad's shoulders still change
      season. (The titles held. The lab's show has one season, so the shoulders were not exercised.)
- [x] F7: home, Up on the top channel: the account is lit; A opens Choose a server; Down returns to live tv. (Steam: Up,
      the account, A opened /selectserver; no unreachable finding on any run. "Down returns to live tv" was not tried. The
      walk found the way back from Choose a server stuck; fixed in 9f38bb3c, recheck in pass 3.)
- [x] F8: Movies, Right to Continue watching (empty), Down: "Go back" is lit. (No unreachable "Go back", pass 1: 9; `/tv`'s
      Go back reached.)
- [ ] The idle Now playing notice reads "Nothing is playing" (Play, Shuffle, Previous, Next and Repeat on /queue). (Open:
      no run reached /queue.)
- [ ] The wheel test passes in `theme_orbit.py`. (Open: not run in this walk; the behaviour was seen, a wheel notch moved
      live tv to movies.)
- [ ] The Watch together row: names and count show. (Open: no other group was listed; the mouse's own group showed "You
      are in".)

Walker (the follow-up PR; pass 2 walked #239, and #241 and #242 carry the rest):
- [ ] The mouse reaches every channel (the wheel and the pointer bar's Guide) and the screens behind them: details,
      Search through the Media blade, every library, the preferences menu and its pages, Now playing; no
      required-missing with budget left. (Open: 26 screens, 17 missing with 26 minutes left; the Guide blades' rows are
      never tried and the wheel turns one notch. W-K, W-L and W-J in #242.)
- [ ] Pads and keys reach the playlists library, a season, an episode and the preferences' Display, Playback and
      Subtitles pages at 60 minutes. (Open: 7 missing in all 6 runs. #241 fixes the playlists route and the Display and
      Playback skips; the snake and the time are W-M and W-N in #242; a season and an episode needed Go to details,
      now in 9f38bb3c.)
- [ ] No walker user writes ("Watched ✓" and "Played ✓" are skipped, and a played film is not). (Watched is skipped in
      every run and played films opened normally, but the mouse pressed New group five times; #241 puts it on the danger
      list, to confirm on the next walk.)

Unsure group:
- [ ] The programme panel's back-focus, as above. (Open: not testable, no programme data in the lab's guide.)

Orbit's first pass is done; its second walks on the fixed walker.
