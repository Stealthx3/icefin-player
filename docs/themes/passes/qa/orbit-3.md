# orbit: QA pass 3 (D40, D41)

Phase A, pass 3 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, 60 minutes a run.
Orbit alone, on lab guest 1. Walk: 2026-11-27. Build: 5b32846881478656 (main with the engine fixes of #236). The stock
control was reused from Tide's pass 2 on the same build (D47). The walker is #242, in its first walk (the multi-notch
wheel, the Guide blades' rows, direct reach that switches axis, the shared tab strip and the way back out of a level's
identity, the player walked once, guide cells keyed by channel and programme). The theme files are pass 2's (commit
9f38bb3c). Orbit 122 + 27 findings (plain + Steam environment; pass 2: 109 + 25), 31 + 10 left to triage after the
judged list. Continues `orbit-2.md`.

Environment: the lab's Live TV guide has programme data again ("Harbour Lights ... until 5:30 AM"), so the guide items
could be tried. Live tiles relabel at programme boundaries (5:00, 5:30), and that broke some walker keys (W-V below).

## Coverage

#242 recovered the walks: the mouse reached 58 screens (pass 2: 26) and pads and keys reached 32 to 36, missing 3
required screens (pass 2: 7).
- The mouse's wheel turned six notches, so Movies, Music, Shows, Books, Collections and Photos were opened from the home
  (pass 2: live tv and movies only). The Guide blades' rows were tried through their blades: Library (Live TV to
  Playlists, `/playlists`), You (Profile, `/userprofile`) and Settings (Client Settings, Controls, Server dashboard);
  in pass 2 every row had no outcome.
- Direct reach no longer stalls: 22 direct reaches in the Xbox run, the failures in under half a second, and no
  `/livetv` tab was unreachable (pass 2: 3). Tab clicks read "a shown tab redrew in place; not a level", and no spurious
  "Go to ..." levels remain. The player was walked once ("walked already" six or seven times a run), so Live TV came last
  instead of eating the first 15 minutes. The guide cell keys held: no "No information" back-focus (pass 2: 6).
- Gained: every preference page (Display, Playback, Subtitles, Controls) and the playlists library. Lost, by design: the
  levels "/books > Go to All books", "/music > Go to Albums" and "/music > Icefin Lab, 1 items" (a way back is no longer a
  level's identity), and `/livetv?or=schedule|series`, which now comes last and was cut by the budget.
- Still missing:
  - Season and Episode (all 7 runs): walker. Orbit's only route is the options (≡), Go to details; the walker never
    presses the menu on an entry (W-Q).
  - Now playing (keys and the five pads): lab data (15-s songs) and the walker's order. The mouse reached `/queue`
    through the song line.
  - The mouse's Series and MusicArtist: walker (the Series tile's label was read before the list drew, and its "· 1
    seasons" is never matched; the artist's controls sit on a deck panel the mouse had moved off, W-T). The mouse then
    spent 28 minutes on the guide's cells (24 plays) and never explored the `?or=` tab screens.
- Not in #242: the ring (W-J). The mouse's home has 17 unpositioned receding tiles, with no wrong-tile clicks this time.

## Verdicts

41 findings: 27 walker (16 unreachable, 7 budget, 2 back-focus, 2 dead-control), 3 real (theme), 8 real (engine, low),
3 judged, 0 unsure.
- Theme, real: B1 (3, mouse, broken-back, medium). Opening a folder pushes a level in place with no history entry, and the
  mouse's Back is a history traversal, so Back on Photos' day folders left the library for `/books`. A pad's B pops the
  level. Orbit's screens had no `levelBack`, the hook the engine has offered since #236.
- Engine, real: R1 (8: Item Details in all 7 runs, Localization on the mouse). The Display page's section rail does
  nothing visible on the last or first section. Same as Tide pass 2's U2.
- Walker, 27 (to the follow-up of #242): `/movies` and `/books` tiles under another tab (16, U-T: the snake left
  Favourites or Studios shown and the direct try ran with the tile off the page), the budget (7), a live tile's relabel
  at a programme boundary (2, back-focus, L2) and a live tile pressed while it connects (1, L1), and the guide's Watch
  together row after Play on (1, W2).
- Judged, 3: Media info's stream rows (J1, mouse).

## Findings fixed

Theme (theme/orbit, commit 25169b17):
- [x] B1, the mouse's Back pops a level (broken-back, 3, mouse, medium): `levelBack` on the library views (views.js) and
      the details deck (details.js). The engine leaves the traversal alone while an overlay or a dialog is up, plays the
      back sound itself, and goes on to the traversal at a screen's root.
- [x] B2 remainder, leaving the account is remembered (back-focus, low): returning from the account to a channel writes the
      memory, so account, A, Choose a server, B, Down, a tile, the player, Back no longer lands on the account.
- [x] F1 gap, a song's own Play says so: `/details [Audio]` Play shows "Playing <song>" in the notice, as Play all and
      Shuffle do (it was silent in 6 runs, filtered by the control).

Engine (main, PR #244):
- [x] R1, the Display page's section rail answers at once: the chosen section is marked and the navigate sound plays as the
      press arrives, whether or not the section can scroll. It comes with the arrows' beam fix from Mosaic pass 2.
      Item Details' checkboxes are still to be tried by a pad (For your review).

Walker (the follow-up of #242, none of these in the walk):
- W-Q: the menu press (≡, Start, the mapped key; the mouse's hover then Options) on one entry of each kind on details
  screens, so Season and Episode are seen through Go to details.
- W-Q2: the dialog pass notices a row that swapped the dialog (title changed) and replays the opener.
- W-R: the "nothing" branch waits out a live tile's connecting card and treats a "· until H:MM" tile as one that plays.
- W-S: a direct try at an element that is not on the page first replays the tab it was collected under, or skips it.
- W-T: `seed()` reads item-type words after the comma ("· 1 seasons"), a failed `MouseDriver.focus` leaves a trace line,
  and a control on a hidden deck panel is brought in through its panel.
- W-V: keys that survive a relabel (live tiles by channel number, the account by its class).
- W-J (open since pass 2) and W-M's rest (the prefs menu's snake still turns at Display).
- Time: sample one or two slideshow photos a signature (about 5 minutes a pad run), and in round 2 try unreached seeds
  before every guide cell. Danger list: the "Lock ..." toggles in Edit details, in case a theme saves on change.

## Judged not Orbit's, or the walker's

Rules proposed for `qa-judged.json`, doc `orbit-3.md`; each is dropped when its walker fix lands:
- J-1 (dead-control on a dialog, 3, mouse): Media info's video row ("4K HEVC ... 3840×2160 ..."). The stream rows are text,
  focusable so a pad can scroll them, with no action; OK does nothing, as in stock. Baseline's rule covers the same rows,
  but the walker's 60-character label cut drops the ", Video" its pattern needs.
- J-2 (unreachable-by-input, pads, `/movies` and `/books` tiles): Orbit's library tabs follow a pad's focus; the walker's
  snake left another tab shown and its direct try ran with the tile off the page. Keys reached all of them, and a pad
  reaches them from All movies. Dropped with W-S.
- J-3 (dead-control, mouse, "Watch together..." in the guide's Media blade): "Play on..." before it swaps the guide for the
  Play on panel, and the walker clicks the next row's point on that panel. The code opens the Watch together tab as
  intended. Dropped with W-Q2.
- Not proposed: R1 (real, fixed in the engine), B1 (real, fixed), L1 and L2 (W-R and W-V are small, and a rule would hide a
  dead live tile), and the budget's coverage gaps.
- Carried (already judged): the slideshow's IMG_* entries, a PhotoAlbum's Play all and Shuffle under the slideshow,
  `Failed to get playlist permissions` on a playlist, and the pass 2 rules.

## Not done, for the user

- The cue on the top channel that channels lie below (pass 1) is still a design decision.
- The account's label reads "<user> on this server" until the server name loads, then "on <server>"; an optional polish
  is to set it again when the name arrives (a screen reader would announce the change).

## Rechecks of pass 2

Closed in this walk (details in `orbit-2.md`): BB1, U2, T1, and no walker user writes. Open: B3 (the Live TV lists were not
explored), Go to details (W-Q), the guide for pads, the carried items, and the resting pointer. S1 and BF1 were not
reproduced (Instant mix 17 times and Shuffle 7 times, no error and no back-focus); W2 is the walker's.

## For your review

This is Orbit's last automated pass, and your review follows the end of the automated walks. These are what the walker
cannot judge. Look at them on screen, with the sounds on.

On screen:
1. Mouse Back in a library level (B1, after the fix): Photos, a day, the mouse's Back button. Photos stays with the day
   lit; a second press leaves for the previous page. Music, Artists, Icefin Lab, Back returns to Artists.
2. Season and episode details (pass 2's fix, unwalked): Shows, Icefin Test Show, Season 1, ≡, Go to details opens the
   season's page; an episode's ≡, Go to details opens the episode's. Back returns to the row. Try it with a pad, and with
   the mouse (hover the episode, then the bar's Options).
3. Display preferences, the section rail (after #244): Item Details and Localization now show the chosen section at once.
   Can a pad reach and toggle the Item Details checkboxes at all? If not, the reachability bug applies to every theme.
4. Account memory: Home, Up, the account, A, B, Down, A on a live tile, the player, Back. Is the tile lit, not the account?
5. Live tile press feedback: A on a live tile. Does the connect card appear at once? Under load the walker saw no change
   for 4 seconds.
6. Guide by pad (no pad run reached it): the grid, a later programme, its panel, Back. Then play a channel, Back: the
   played cell is lit.
7. Live TV list screens (B3): Series, Schedule, Open the guide, Back: "Open the guide" is lit.
8. The resting pointer on the ring: hover tile 2 of live tv and keep still. Does the ring hold?

To listen to:
- A song's Play on `/details [Audio]`: it plays, and the notice says "Playing <song>".
- The rail press on Display preferences: a navigate sound on every press.
- Orbit's sounds on the guide blades and the connect card. No walk can judge these.

Orbit's third pass is done; its phase A walks are complete, and its review waits for the end of the automated walks.
