# baseline: QA pass 3 (D40, D41)

Phase A, pass 3 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once. Walked twice on 2026-11-27 on the lab's first guest, Baseline alone,
60 minutes a run, on walker #242. Continues `baseline-2.md`.

- First walk: it reached 16 screens on the pads (pass 2: 29). The walker gave each letter of stock's A to Z jump list its
  own direct try (68 a run, up to 30 s each). Fixed: one letter now stands for the list.
- Rerun, the one triaged here: build of main with the engine fixes of #240, its own stock control on the same build (D47),
  walker #242 with the jump-list fix. Baseline 54 + 12 findings to triage (plain + Steam environment), after the judged
  list.

Baseline is stock's look (D31), so a finding stock shows too is stock's. The theme under test is the same as pass 2's
(pass 2 fixed nothing), so F5 was still open when this walk ran.

## Coverage

Keys reached 20 screens, the mouse 36, the pads 21 to 26 (pass 2: 33, 44, 29 to 30). Every keys and pad run emptied its
round-one queue and spent its last 6 to 9 minutes in round two, with required screens missing: a season, an episode, a
song, an album, an artist (the pads), a series and the now playing screen. They ran out of screens to find, not of time.
Only 13 screens were walked a run; the report's higher count includes dialogs, `/video` and pages only visited.

Causes, all the walker's:
- Item-type seeds pressed Baseline's library tabs first ("Episodes", "Songs", "Albums", "Artists", "Collections"). A tab
  changes `?tab=` in the hash, which the screen key ignores, so the walker saw an in-place press and never switched back.
  The cards of the first tab (Icefin Test Show, Test Tones, the movies) were gone, and each queued card failed its
  navigates for about 100 s. That cost 8 to 13.5 minutes a run (keys `/movies` 425 s, `/music` 333 s; pads `/music` 363 to
  368 s). A jump-list letter left a filter behind too: after "A" the grid read "No items found".
- Stale Live TV programme cards: their labels carry the time ("Old Maps, 8:30 AM - 9:30 AM"), and from the half hour on
  the keys go stale. Round two spent 6 to 9 minutes a run on them, and the mouse pressed 168 of them (25.7 minutes).
- Pass 2's keys run did better (33 screens) because #239 had no type seeds.

Walker fixes W1 to W6 follow in the walker branch after #242:
- W1: put the hash back after an in-place press that changed it; rank tabs and letters after the cards.
- W2: skip a navigate to a card that is gone; sample programme cards like guide cells.
- W3: labels drop the text of `aria-hidden` descendants (promised since pass 1).
- W4: start a direct try from the nearest reached control.
- W5: count `/list?parentId=<library id>` as that library (Books and Home videos).
- W6: after 3 letters the jump list counts as walked.

Expected gain: pads about 32 screens, keys about 31, mouse about 40. The coverage question for the user stays open (the
controller runs walk the same first screens).

## Pass 1 and 2's fixes held

- No app quit, no walk-error, no crash in any run. The mouse skipped the settings menu's exit row (#242's exit rule).
  Keys and pads never pressed it, so the keys case itself is not re-proven.
- F1, Back to the home finds its opener: 197 of 198 (the one miss is a twin card, U3), plus 21 of 21 on Steam.
- F2: no shift-tab findings.
- Closed from pass 2's list: Select view and `/list` More count as in-place (keys `/list` More too); the client settings'
  switches are reached.

## Findings fixed

On `theme/baseline`, commit 52502b79:
- T1 (F5): a plain folder opens as stock's list, as this walk's stock control does, not as a details page. Its Play All
  gives the same "Playback Error" as stock's on a books folder.
- T2: Up from the first row of a list's grid reaches its toolbar (Sort by, Filter, More). Before, Up from the folder card
  landed on the header's Back, and Left from the A to Z letters landed on the card or Settings.

Both wait for a replay on the fixed walker (rechecks below).

## Real, open

None beyond the two above. No engine finding: T2 interacts with the engine's beam, but #244 does not change it.

## Judged not Baseline's, or the walker's

Rules for `qa-judged.json` (doc `baseline-3.md`):
- `baseline`, dead-control, mouse, `/details [MusicArtist]`, Instant Mix, Shuffle, Previous Track and the bar's song: the
  lab's two-song music on an artist page, pressed while it plays, Previous on the first song, or the bar's song as the
  15-s clip ends (as the album rule). Could instead widen the existing rule to `(MusicAlbum|MusicArtist|Playlist)`.
- `baseline`, back-focus, `/details [MusicArtist]`, ", Icefin Lab" after Back from `/queue`: the opener was the bar's
  song, and the clip ended.
- `baseline`, dead-control, any dialog, "Add the person": the item editor's button with no name typed plays the error
  sound and focuses the name field; the walker types nothing and should not be in the editor.
- `baseline`, dead-control, `/livetv` Recordings: the tab you are on (the pads reach Live TV through the home's
  Recordings), and a press on the shown tab does nothing, as stock's. Drop it once the theme marks its active tab with
  `aria-current="page"` (optional).

Walker (25 plain + 6 Steam, in groups):
- The budget (W-A, 6 + 1): see Coverage.
- W-B (5, keys): the now playing bar went before the direct tries and was called unreachable. Fixed in the walker.
- W-C (3 + 3, pads): `/tv` Upcoming, Genres, TV Networks. The tab row is reachable (Left from Select view, then
  Suggestions, then Shows); the greedy try cycled. Fixed in part; W4 reaches them.
- W-D (4 + 1, pads): `/movies` Shuffle pressed after the walker's "A", on an empty filtered grid. Fixed by W1.
- W-E (1, Xbox): a programme card started a channel ("Connecting to ..."). Fixed in the walker (it waits it out).
- W-F (1 + 1, DualSense, Steam): the walker put focus on More by script and pressed OK, so the memo kept Play (pass 2's
  WI). Optional theme hardening: record the focused control on `select` and `enter`.
- W-G (2, mouse): the item editor (below). Fixed in the walker.
- W-H (3, mouse): twin programme cards ("Small Worlds, 9:00 AM - 10:00 AM" twice) after a Back. Fix: judge back focus by
  the opener's item id.
- W-K: `also_in_control` dropped the item type and marked Baseline's folder rejection as in the control. Fix: match on the
  screen with its type.

Safety: the mouse reached the item editor (Media info's Details tab) and toggled 8 field locks. Save was skipped, so
nothing was written. The walker now stays out of the item editor.

Unsure, for an eye check (17 plain + 1 Steam):
- U1 (5 + 1: keys, 4 pads, Steam): Client Settings, the Colour scheme select. Down goes to Apply, and the finding says
  focused and unfocused look 0.04% apart, yet its shot shows a clear ring on the select. Either the measurement ran on the
  wrong state or the ring stayed while the engine's focus moved on. Not Baseline (the engine's page).
- U2 (1: mouse): the book reader's Full screen, `rejection: not granted`. First time seen; the app or the lab, not
  Baseline.
- U3 (3: mouse): the now playing bar's Previous Track hovered within 4 s of Back from Now Playing took no focus; other
  bar buttons did. The bar's 500-ms redraw or the Back memo may win over the hover.
- U4 (8: mouse): On Now cards on `/home` and Programs, 13 of 161 programme-card hovers (188 of 191 other controls
  worked); all on rows redrawn after each Back from `/video`. W2 makes these rare.

Verdicts: real (theme) 2 (T1, T2), walker 25 + 6, judged 5 + 1, unsure 17 + 1. No engine finding.

## Rechecks

Each is replayed in the lab on the walker with W1 to W6.
- [ ] T1: a books folder opens as stock's list; Play All gives stock's "Playback Error" and no rejection; a folder with
      films still plays.
- [ ] T2: from the first row of `/list`, Movies, Shows and Music, Up reaches Sort by, Filter and More; Up from the toolbar
      still reaches the tabs; Down from the toolbar returns to the grid.
- [ ] The quit: keys run reaches the settings menu's exit row and skips it (not exercised this walk).
- [ ] WE: `/tv` Upcoming, Genres and TV Networks are reached (W4).
- [ ] Schedule from an empty tab counts as in-place (not pressed this walk).
- [ ] WG: `/music` Shuffle on keys and pads, positioned now that W1 keeps the grid unfiltered.
- [ ] WI: Back from the player on a series lands on the episode pressed (Series never reached).
- [ ] Coverage: the required screens are reached at 60 minutes on every run (W1 to W5).
- [ ] W-H: both "Small Worlds" and "Old Maps" cards, judged by item id before and after the Back.
- [ ] U3: hover Previous Track at once after Back from Now Playing, by eye.

## For your review (a person, on screen and by ear)

Baseline's last automated pass leaves these to eyes and ears:
1. Client Settings, Colour scheme (U1): focus it and press Down. The ring should leave it and land on Apply, and the
   scheme should not change. Check with a pad and with keys.
2. Books, Icefin Lab (T1): it should open stock's list with Play All and Shuffle. Play All gives a "Playback Error" as
   stock's does.
3. A list with a pad (T2): from the folder card press Up. Can Sort by, Filter and More be reached? Same from the first row
   of Movies, Shows and Music.
4. Now playing bar (U3): come back from Now Playing, hover Previous Track at once, and see whether the ring follows.
   Compare the whole bar with stock's (open since pass 2).
5. Home On Now (U4, W-H): hover programme cards, including the two "Small Worlds". Back from a channel should land on the
   card you opened.
6. Book reader Full screen with the mouse (U2): it goes full screen and comes back, with no error.
7. By ear:
   - focus, navigate, select, back and error sounds on keys, a pad and the mouse;
   - the error sound on "Add the person" with an empty name;
   - silence on Shuffle over an empty filtered grid (stock's behaviour unknown here);
   - Live TV's connecting card and the sound when it fails or plays.
8. Carried from pass 2, by hand:
   - Mark played on a film keeps focus on the switch (F3);
   - a pad move right after Back wins (F1);
   - the guide gap's "Connecting to Icefin One" text (F4);
   - hover moves focus next to stock;
   - the mouse's real Back button with a panel open (`xdotool click 8`).

Not a finding, for the user (D31, stock 1:1), carried from pass 2: "Select view" on the grids only shows a "Poster view"
notice, and a `/list`'s "More" only shows a hint, where stock's open a choice of views and a menu.

Baseline's third pass is done; its phase A walks are complete, and its review waits for the end of the automated walks.
