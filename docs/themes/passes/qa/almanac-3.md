# almanac: QA pass 3 (D40, D41)

Phase A, pass 3 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, 60 minutes a run.
Almanac alone, on lab guest 2. Walk: 2026-11-27. Build: 3ac4c01ac61a20a4 (main with the engine fixes of #236 and #240).
The stock control was reused from Mosaic's pass 2 on the same build (D47). The walker is #242 (with Baseline's second
pass). The theme files are pass 2's (commit 12b429a7). Almanac 62 + 4 findings (plain + Steam environment; pass 2: 111 +
24), 42 + 2 left to triage after the judged list. Continues `almanac-2.md`.

## Coverage

#242 recovered the hour. Pads and keys now reach 37 screens (pass 2: 21 to 22; stock: 30 to 31 for a pad, 37 for keys)
and explore 16 to 17 of them (pass 2: 9). The mouse reached 63 (pass 2: 47).

| time per run | pass 2 | pass 3 |
|---|---|---|
| failed direct tries | 18 min (26 of 38 failed) | 2.4 min (0 of 24) |
| "All ›" thrash ("no way to" plans) | 13 min | 4 min |
| the tab strip | 11 min | 17 min (130 presses, 7.8 s each) |
| collecting | 9 min | 24 min (about 1.5 min per explored screen) |

- Direct tries: fixed (24 of 24 worked in every pad and keys run).
- "All ›" levels: mostly fixed. Movies' All movies and Collections, Music's Songs and Playlists, Shows' All shows, Books'
  All books, the three Photos levels and the Series' "All ›, Season 1" are sub-screens now, and all 11 openers passed Back
  in every pad and keys run. What is left is the home's "All ›, Libraries" (about 4 minutes a run), which the level test
  still misses, so "Nothing up next", "Nothing in progress" and "Icefin Test Document" were never pressed on the home (W15).
- The settings entries: Display, Playback and Subtitles were reached by all 7 runs. "Home, which rows Home shows" was
  never pressed, the mouse included (W14).
- Where the hour goes now: the tab strip, 17 minutes a run (ten tabs on each of 13 screens). That is twice pass 2's,
  because twice as many screens are explored. Pressing a strip tab only on the first screen it appears on (W9) would give
  back about 15.7 minutes, enough for the 19 screens left in the queue.
- Required screens still missing (pads and keys: 4; mouse: 2):
  - details of a Season, all 7 runs: Almanac's design, not a gap. A series lists its seasons as rows, and "All ›, Season 1"
    opens the season's episodes in place (walked, 14 controls, Back true). The season's own page is reached only through
    an episode's options, which no pad opens (W16, W19).
  - details of a MusicArtist, the 6 non-mouse runs: walker. The album's "Icefin Lab, the artist" shares a kind with the
    Cast and crew entries, which went first, and round two never came. The mouse got there through Options (W9, W16).
  - preferences: home, all 7 runs: W14.
  - now playing, 6 runs: lab data (15-s songs).
- The guide (`/livetv`) was found in every pad and keys run through the Live TV rows but never explored (queued), and the
  Guide tab is never pressed. E1 and E2 have no pad evidence.

## Verdicts

44 findings: 16 real (theme), 8 unsure (likely the theme), 10 judged (not a bug), 1 already judged, 9 walker. Nothing
from the engine is new. None of them is in the stock control.
- Real (theme), medium:
  - R1 (10, mouse, broken-back): the mouse's Back opens a level's way out through a history traversal, and Almanac
    registered no `levelBack`, so Back left the screen from inside a level (the level openers on Movies, Shows, Books,
    Photos and a music artist). Pads and keys pop the level through their own Back (all 11 passed).
  - F12 (5 + 1, keys and pads, back-focus on /music): after Play all on Songs, music plays and /music puts a Now playing
    row first, so the reloaded list has one more row on top. The kept row index then lit the row above ("Icefin Lab"
    instead of the song).
- Unsure, likely the theme:
  - BF2 (4 + 1, mouse): Back from /queue to the song line while a song plays lands on the lit cell instead. Pass 2's F9
    did not hold; the candidate is the details page redrawing behind a return when a playing song changes the item, and
    `drawRows` taking focus.
  - BF3 (3, mouse): Back from the guide's player after a channel below row 0 lands on row 0's on-now cell. The guide
    files the played cell, but `onFocus` clears every opener, so a focus event between OK and the player loses it.
- Judged, 10: J7 (6, the library's own tab pressed inside its level goes to the top in place, so Back leaves the library;
  a pad does the same), J6 (3, an empty row's note answers with the error sound), J8 (1, Localization, the engine's
  settings hub).
- Walker, 9: W18 (2, a notice is not counted while a song plays) and the budget (7).

## Findings fixed

Theme (theme/almanac, commit 4fe3723a):
- [x] F14, the mouse's Back pops a level (R1, 10): `levelBack` on the grid (the library screens), the details deck, Live
      TV's rows and the sign-in screens. It pops without its own sound (the engine plays `back` when the hook was used)
      and returns false at a screen's root, where the traversal goes on as before.
- [x] F12, a reload keeps the lit row by name, not by index (back-focus, 6, /music): a row added above (Now playing) moves
      the rest, and the lit cell is found again by its label. The home, whose first row is Now playing while music plays,
      is covered by the same change.
- [x] F13, the song line keeps focus across a late redraw (BF2, candidate): a pointer-only control that held focus is
      focused again after the page redraws behind a return, unless a panel is open. A lab replay confirms it.
- [x] F15, the guide's played cell survives a focus move (BF3): a focus event in the grid no longer clears the filed
      cell, only a tab's opener. A stale cell opener is harmless (it is used only when Back returns to its own entry, and
      a tab press replaces it).

Engine: nothing new; E3 (#240) was in the build and not exercised (no channel failed).

Walker (the follow-up of #242):
- W9 (now the main one): a strip tab is pressed on the first screen it appears on, with every strip tab counted as a seed
  there (Guide included); later screens copy its outcome. About 15.7 minutes a pad and keys run.
- W14: `seed()` recognises the "Home, which rows Home shows" entry without making the Home tab a seed.
- W15: after an in-place press the level test rejects, if fewer than half of the screen's own keys remain, return to the
  screen before the next position (about 4 minutes a run).
- W16: the danger check reads a "More options..." label's head, so the options panel opens (its sub-line names "delete"),
  and its rows are filtered as usual.
- W17: a dialog showing "Lock this item" or "Lock title" rows is closed without clicking: the mouse still reaches the
  metadata editor through Media info's Details section and toggled 3 locks (unsaved, nothing written).
- W18: a new `[role=status]` text counts as a change under a noisy DOM.
- W19: "details of a Season" is also met by a Series sub-screen named for a season.
- Optional theme polish: name the wide panel's first section "Edit details" in itemmenu.js, and fix the stale "Tide:"
  header comments in itemmenu.js and np.js.

## Judged not Almanac's, or the walker's

Rules proposed for `qa-judged.json`, doc `almanac-3.md`:
- J6 (dead-control, 3, mouse: "Nothing here yet", "Nothing new", "Nothing up next"): an empty row's note is focusable so a
  pad can land on the row and read it, has no OK hint, and answers OK with the error sound only. The sound is for a
  person to judge (For your review).
- J7 (broken-back, 6, mouse): the tab of the library you are in, pressed inside one of its levels, goes to the library's
  top in place with no history entry, so Back then leaves the library, for every input. The rule's backreference keeps it
  to the library's own tab (another library's tab adds an entry, and its Back must still return), and it does not match
  R1's findings.
- W18's dead-control (2, mouse: Instant mix on an album, Shuffle on an artist): pressed while the lab's 15-s song plays, so
  the song line redraws every second and the notice the press shows is missed. Dropped with W18.
- J8 (`*`, Localization): the engine settings hub's first section link; the section is already at the top, so the click
  scrolls nothing, and a pad's press moves focus to the first field. The same finding is in Tide, Orbit and Mosaic.
- Already judged: the metadata reader's Next (the reader turns the page in its own frame).
- Not proposed: the budget's required screens (coverage), R1, F12, BF2 and BF3 (real or unsure, fixed above).

## Not done, for the user

- A music album's Cast and crew: "Icefin Lab" (AlbumArtist, Artist) opens a Person page, not the artist. Unsure whether
  that is right (stock's album page has no cast); the album's "Icefin Lab, the artist" does open the artist.
- The lab-only gaps still open: now playing for pads, F1 and F2 on a throttled server, E2, E3, F6.

## Rechecks of pass 2

Closed in this walk (details in `almanac-2.md`): F10 and F11. Open: F9 (failed, now F13), the coverage list (mostly), F1 and
F2 throttled, F6, E2, E3, and "no walker user writes" (held, with W17's gap). E1 is closed for the mouse (two programme
panels each stayed open about 50 s across a 30-s tick, Back returned to the cell), open for pads. Pass 1's F3 is reopened
as BF3.

## For your review

This is Almanac's last automated pass, and your review follows the end of the automated walks. These are what the walker
cannot judge. Look at them on screen, with the sounds on.

On screen:
1. Mouse Back inside a level (after F14), with a real mouse: Movies, All ›, Collections, mouse Back lands on Movies with
   "All ›, Collections" lit, with one back sound. A second press leaves Movies. At a library's top it leaves.
2. Back from the queue to the song line while a song plays (BF2, after F13): is the song line lit? Test Tones, Play all,
   click the song line within 10 seconds, mouse Back.
3. Guide: Back from a channel started on row 2 or lower (BF3, after F15): Harbour News' on-now cell, OK, wait for the
   player, Back. Is the played cell lit, not Harbour Lights? Try it with a pad and with the mouse.
4. Music while a song plays: the Now playing entry appears at the top of Music and Home and pushes the rows down when you
   come back. Check that the lit cell stays on what you left (F12), and whether the jump feels right. Music, the Songs
   row's Play all, Right to A440, OK, Back; then let the clip end and do it again.
5. Item options, Media info: the wide panel's first section, "Details", is the metadata editor with Save. Is the name
   clear? (Option: "Edit details".)
6. A music album's Cast and crew: "Icefin Lab" opens a Person page, not the artist. Is that right?
7. A Live TV start takes 7 to 8 seconds behind the "Connecting" card on the lab. Watch one start, then Back.

To listen to:
- OK or a click on an empty row's note ("Nothing new", "Nothing up next") plays the error sound (J6). Should a note be
  silent, or not a stop at all?
- One back sound on a mouse Back that pops a level (F14), and none doubled.

Almanac's third pass is done; its phase A walks are complete, and its review waits for the end of the automated walks.
