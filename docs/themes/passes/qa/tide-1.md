# tide: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44). Walked 2026-11-26 on lab guest 1: build
ad21fa59e4c3bbe3, 60 minutes a run, 7 runs (keys, mouse, Xbox, DualSense, Switch Pro, 8BitDo, Steam Virtual Gamepad),
Tide alone, against stock Jellyfin-Web walked in the same run (D47's reused control). Report: lab `~/walks/qa-tide1`
(Tide 154 + 12 findings, 137 + 11 left to triage after the judged list; the stock control 491 + 91). Continues
`tide-pre.md` (the pre-pass walk that made the home reachable).

How to read Tide's screenshots: Tide draws its wave with the native backdrop under a transparent page, and the capture
paints transparent as white. Most Tide `finding_*.png` look blank or washed out (white text on white), so they say
little except where something opaque is up (the panel, the "Connecting to …" card, jellyfin-web's slideshow). The
findings were judged from the traces and each report's JSON.

## Coverage

Tide reached 73 screens against stock's 191. No pad or keys run reached a series' seasons and episodes, the music
details (album, artist, song) or the preferences' pages in depth. Cause: two walker faults, both fixed in #234:
the engine's theme root has `role=application` and the walker's keyboard test matched it, so its direct try at missed
controls never ran on themed screens (Tide's entries more than a few steps from the fixed point are drawn off-screen by
design); and the settings ranking. This pass covers what the walk reached; pass 2 walks on the fixed walker, and the
required screens it missed (budget 5, required-missing 22) are its first measure.

## Findings fixed

Theme (theme/tide, commit 0a2cc447 and the `levelBack` commit after it):
- [x] F1, "Back to <the level shown>" on /livetv, /movies, /music, /tv, /books, /homevideos, /list, /boxsets,
      /userprofile, every /details and their opened levels (dead-control, mouse, 22): the screen's own step in the trail
      was drawn as a button and returned at once. It is a label now (`aria-current`, no "Back to", no click); the step
      below it still pops a level.
- [x] F2, choosing in a details picker (Version, Audio, Subtitles) sent focus to Play (back-focus, 6, every keys and pad
      run): `replaceTop` rebuilt the level with no focus. It keeps the focused index now; the same holds for Favourite
      and Mark as watched.
- [x] F3, the pointer line's Options on an empty level, a folder entry and a guide gap did nothing, silently
      (dead-control, mouse, 4): it says "No options here" with the error sound, as a pad's ≡ gets its "no".
- [x] F4, Now playing's Shuffle and Previous with nothing playing did nothing (dead-control, mouse, 2): the page says
      "Nothing is playing" while idle.
- [x] F5, music started with nothing on screen to say so: Play all, Shuffle and a song on a playlist (dead-control, 10;
      obscured, 1): music presses show a notice ("Playing …", "Shuffling …", "Instant mix from …"), as Media Center's
      re-walk 2 fix. A song pressed while it already plays is covered by the same notice.
- [x] F6, the guide's gaps did nothing on OK (dead-control, all 7 runs): the guide passes `selectGaps`, so a press on
      "No information" watches the channel (needs the engine's `selectGaps`, below).
- [x] levelBack for the mouse's Back button (broken-back, mouse, 11; below with engine #236): Tide's columns are levels.
- [x] The Watch together row (names and count) fixed earlier on the branch (commit 9c287793); the walked files predate it.

Engine (PR #236, not merged; checked in the lab with the next build):
- [ ] Guide gaps selectable: the guide's grid dropped a gap's click before the theme's `onSelect`; a theme opts in with
      `selectGaps`, the others keep today's behaviour. The guide's current cell now follows focus, and Left from a long
      programme keeps focus.
- [ ] A level's mouse Back (`levelBack` through the Navigation API): decided as a fix, not a judgement. The mouse's
      Back button is the web view's history traversal, and Tide's levels have no history entries, so it left the whole
      screen from a level (/home > Channels and Photos, /tv > Continue watching, Genres, Next up and Networks, an
      album's Cast and crew, an artist's Appears on). Tide's columns are real levels with a trail and a Back, unlike
      Media Center's pivots (judged in media-center-3.md), and #204 already gives the overlay the same treatment. A
      screen that has a level to pop takes the traversal and pops it; at a screen's root the traversal goes on.
- [ ] Settings screens focus the control they were left from (back-focus, mouse, 9): the hub and the preference pages
      focused their first control on every mount, so Back from the profile page landed on "Client settings" and Back from
      a sibling page on the first field, not the tab that left.

## Judged not Tide's, or the walker's

Fixed in the walker (PR #235), each found by tracing the run:
- W1, Live TV's Channels (Icefin One, Harbour News) dead on every run (dead-control, 11): the press works, the finding's
  own screenshot shows "Connecting to Icefin One". The engine's connect card was not in the walker's change digest, so
  the press was judged "nothing". It now counts, and the `connecting` wait applies.
- W2, "Back to <level>" (a trail step below the top) and "Go back ›" (an empty column's way) judged broken-back (15:
  mouse 7, DualSense 2, Switch Pro 2, Steam 4): both controls are themselves a Back. The walker took the level it had
  gone back to as a new sub-screen and pressed Back again, which left the screen. The levels were empty by the lab's
  data (no genres or series timers; every movie played, so Recently added and Continue watching are empty). A control
  that is itself a Back, or a fall in the screen's level depth, is no opener.
- W3, Play all and Shuffle on the 3-clip collection (broken-back, 4): the clips play a few seconds and the player closes
  itself; the walker's Back 10 s later left the collection, or judged Back on the player. It rechecks the route before a
  Back from /video, skips the check when the player closed itself, and waits out a late player start.
- W4, Shift+Tab on /mypreferencesmenu, /boxsets, /home > Days and the guide (shift-tab, keys, 4): Tide takes Tab on
  its column screens (▼ ▲), and these four have one control for Tab (one entry, or tab-index -1 controls), so Tab moves
  nothing. The walker judged Shift+Tab after 3 presses though Tab reached one control. It now checks Shift+Tab only after
  Tab reached two or more distinct controls.
- W5, the Play on panel's "Play on" tab, no focus look (no-focus-indicator, 3): the current tab's focus is a glow
  (`text-shadow`) over its `.on` look; the walker's style snapshot didn't compare it and its pixel fallback didn't set
  the overlay's focus class. It now snapshots `textShadow` and `fontWeight` and marks focus on overlay elements. The
  glow on the current tab is subtle: to look at by eye in the overlay rounds.
- W6, the preference pages' own tab (dead-control, mouse, 4: Controls, Display, Playback, Subtitles): the tab for the
  page you are on (`aria-selected=true`) does nothing by design. A control with `aria-selected=true` or `aria-current`
  that changes nothing is no finding.
- W7, the Watch together entry unpositioned at the budget's end (keys, 1): a Tide entry more than a few steps from the
  fixed point is drawn off-screen by design; keys and pads reach it by moves, as the walker now does.
- W8, required screens not reached (budget 5, required-missing 22): the two faults under Coverage.
- A dialog's list takes only controls inside the dialog: the photo slideshow's "dialog" listed Tide's own entry under
  it (J1 below).
- Almanac's fixes, in the same PR: wait for focus on a slow server; an opener redrawn at another path; "Watched ✓" on
  the danger list.

Judged:
- The photo slideshow on /home > Days (dead-control, 5: keys, Xbox, DualSense, 8BitDo, Steam; element `IMG_103`): the
  "dialog" is jellyfin-web's slideshow, which has no controls and takes no focus (stock the same: no rows). The one row
  the walker listed is Tide's own column entry under it, and OK on it opens the photo already shown. Rule in
  `qa-judged.json` (all themes).
- The preference page's own tab (dead-control, mouse, 4): the page you are on. No rule: the walker no longer reports a
  current tab (W6).
- Shift+Tab is NOT judged theme-wide for Tide: unlike Plaza and Media Center, Tide takes Tab on its column screens (▼ ▲,
  checked: 8 Tabs and a Shift+Tab on a playlist, no finding). The four false ones are W4's.
- The empty column's "Go back ›" and a trail step as broken-back: no rule, the walker no longer tests Back from a way
  back (W2).
- `Failed to get playlist permissions` 404 on a playlist (script error): jellyfin-web asks the server whether the
  signed-in user may edit the playlist; the walker users are copies of the admin who made it, and the server answers 404
  for a user not on its list, as judged in Media Center's pass 3.

## Unsure

- The preference page's script errors when the mouse leaves by its tab (script-error, mouse, 2): Display → Playback,
  `Cannot read properties of null (reading 'classList')`, and Playback → Subtitles, `Cannot set properties of null
  (setting 'innerHTML')`. The likely cause is jellyfin-web's page controller querying its view while the form is still
  moved into the themed host (the engine's settings hub appends the form to its host and restores it on unmount); the
  stock control's pages are never moved and don't show it. Not judged and not fixed. To recheck in pass 2: replay
  Display → Playback and Playback → Subtitles with the rejection's `reason.stack` recorded (Runtime.exceptionThrown); if
  the stack runs through the hub's mount or unmount, it is the engine's and gets a fix; if it is jellyfin-web's own
  controller, judge it. Also check that a value changed just before the tab press is saved (reload and look).

## To recheck in pass 2

Each is replayed in the lab on the engine build from #236 and the fixed walker; tick when it holds.
Triaged after pass 2 (tide-2.md): the ticked ones held; the others carry to pass 3.
- [x] F1: mouse on #/movies: the library's own icon in the trail has no "Back to Movies" label and the walker doesn't
      list it. Open Collections: "Back to Movies" (the step below) still pops to the library, and "Collections" (the top)
      is a label. On a movie's details the poster in the trail is a label.
      Held: no "Back to <self>" finding in any run (pass 1: 22); "Back to Movies" on Collections and "Back to Test
      Tones" on an album's Cast and crew pop their level.
- [x] F2: keys, a movie's details → Down to Subtitles → Enter → Enter on "Off" → focus is on Subtitles. Then Down to "Add
      to favourites" → Enter → focus stays on "Favourite ✓".
      Held for the picker: Subtitles → Off leaves no back-focus on keys, Xbox and DualSense (pass 1: 6). Favourite and
      Mark as watched are on the walker's denylist: still to check by hand (carried).
- [ ] F3: mouse, #/movies → Studios (empty) → Options shows "No options here" with the error sound. On a movie entry
      Options still opens its panel.
      Open: not exercised; the pointer line's Options was unpositioned for the mouse on the screens that had it.
- [ ] F4: mouse, #/queue with nothing playing → Shuffle shows "Nothing is playing". With a song playing, Previous goes
      back.
      Open: still dead on the mouse (5 findings); the idle test never fired because the engine's state is not null
      when idle. Fixed in pass 2's commit; to replay.
- [x] F5: keys on Icefin Mix: Play all, then E660, then Shuffle; each shows a notice under the clock.
      Held on keys and pads (Xbox: Play all, E660, Shuffle, A440 all in-place; pass 1: dead). The mouse's Shuffle on a
      playlist was the details' facts block taking the click (fixed in pass 2).
- [x] F6: keys, #/livetv?td=guide, OK on "No information" → "Connecting to Icefin One" (the walker sees the card now,
      W1).
      Held: OK on a gap connects and plays the channel. New in pass 2: Back from the player lost the row (fixed).
- [x] Engine, settings: pad, Settings › Your profile and preferences, then Back → "Your profile and preferences"
      focused. Display → Playback tab, then Back → the Playback tab focused.
      Held on the mouse: every hub and preference-tab opener returns focus to itself (pass 1: 9). The pad replay is
      still to do: pads did not reach the profile link (U1 in tide-2.md).
- [ ] Engine, the guide: the current cell follows focus, and Left from a long programme keeps focus.
      Open: the lab's guide has no programmes (every cell is a gap), so a long programme can't be tested. Needs guide
      data in the lab or a check by hand.
- [x] levelBack: real input (the native Back button skips DevTools): xdotool `click 8` on the lab's display. Shows →
      Genres → mouse Back → back on Shows' column with Genres focused; a second mouse Back leaves #/tv. Also /home >
      Channels, an album's Cast and crew and an artist's Appears on. At a screen's root the button leaves as before.
      Held through DevTools: no broken-back on any level (pass 1: 11). Real input, 2026-11-26 in a build of #236:
      Shows → Genres → xdotool `click 8` came back to Shows' column on #/tv; one press arrives as two back traversals,
      and the engine now drops the second (it had gone two entries back, to the sign-in page).
- [ ] Watch together row: names and count show (commit 9c287793).
      Open: no group existed but the walker's own, which showed only "You are in". Needs a group made by another user.
- [ ] The walker (#234, #235): Tide reaches a series' seasons and episodes, an album, an artist, a song, Display
      preferences and Now playing on keys and pad runs; the walker's own fixes (W1 to W7) leave no finding of those kinds.
      Open: every run still missed a series, season, episode and song (five more walker faults, tide-2.md); W1 to W7
      left no finding of their kinds.
- [ ] U1, as above.
      Open: the same error came back in the other direction (Subtitles → Playback); the stack is not recorded yet.
- [ ] The overlay's focus look on the current "Play on" tab, by eye (W5).
      Open: a human check, not done.

Tide's first pass is done; its second walks on the fixed walker with the engine build from #236.
