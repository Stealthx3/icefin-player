# mosaic: QA pass 2 (D40, D41)

Phase A, pass 2 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked as the control in the same run. Mosaic alone, 60 minutes a run, on the lab's second guest. Walk:
2026-11-27. Build: 3ac4c01ac61a20a4 (main with the engine fixes of #236 and #240). The walker is #241 (its first walk).
Theme: theme/mosaic dc9939a1, pass 1's fixes. Mosaic 198 + 28 findings (plain + Steam environment), 185 + 26 to triage
after the judged list. Continues `mosaic-1.md`.

Verdicts (211): real (theme) 23, real (engine) 38, walker 108, judged 33, unsure 2, coverage info 7. Of the 74 high, 66
are one walker cause (the mouse's Back after a pivot header), 6 are the playlist-permissions script error judged before,
1 is real (engine) and 1 is unsure.

The main result: a real engine bug that pass 1 blamed on the walker. The engine's arrow picking (`pick()`) took any
overlap into its beam and broke ties by page order. Mosaic scales the focused tile by 1.07, which grows past the gaps
between tiles, so every tile of the next row or column overlapped the focused one by a sliver and entered the beam with
the same distance. The first in page order won, and the grids are laid out column by column, so Right went to the top
tile of the next column and Down to the first overlapping tile: on the home, Right from "live tv" went to "music" and
Down from "collections" went to "shows". A pad never reached the home's movies, books, photos and settings tiles, nor the
settings pivot's Display, Home, Subtitles, Controls, Client settings, Change server and Exit, nor Schedule on the live tv
pivot (36 findings, every pad and keys run). It also cost a pad run about 7.5 minutes of failed direct tries (a ▼ ▶
loop between two tiles, 25 times per target). Pass 1's test that a pad reaches every home tile by arrows alone was never
added; it would have caught this.

## Coverage

| run | pass 1 screens | pass 2 screens | pass 1 required missing | pass 2 required missing |
|---|---|---|---|---|
| keys | 30 | 34 | 14 | 10 |
| Xbox | 30 | 33 | 14 | 10 |
| DualSense | 29 | 33 | 14 | 10 |
| Switch Pro | 29 | 33 | 14 | 10 |
| 8BitDo | 25 | 34 | 15 | 10 |
| Steam | 32 | 33 | 14 | 10 |
| mouse | 44 | 58 | 8 | 4 |

Every run ran out of budget, with 2 to 3 screens still queued (pass 1: the queue ran empty).

What #241 fixed: pads and keys now reach the movies, tvshows and playlists libraries, a series and the Playback,
Subtitles and Controls preferences. The pivot key works (a switch of pivot in place is seen as a change of screen), the
home's 11 tiles are elements in every pad report, `/playlists` is matched, "playback, quality, audio, skipping intros" is
opened, and the mouse reaches Search through its header.

Still missing on pads and keys (10): the preferences menu, books, home videos, Display, Home, an artist, a season, an
episode, a song and now playing. The first five follow from the engine bug above (the menu is reached only from the
home's settings tile, Display and Home only from the settings pivot's lower tiles). The rest is time: the guide's list
screens took 354 s, a playlist with `?ms=series` about 400 s, and the Playback page with the settings pivot's seven
failed tries 386 s. The song line is the pointer's way to the queue, and the guide's "Now playing" row and the capsule ♪
are not pressed by the walker. A season is a deck panel by design. An episode's page is through ≡ › "Open its page",
which a pad run never presses, and its row "More options…, add to a playlist, edit, …" was skipped 20 times by the
danger word `add to`.

Mouse (4 missing: Series, Season, Episode, Audio): it spent about 13 minutes clicking 69 pivot headers and checking Back
after each, and 5 more on 31 off-screen headers, and never reached a series.

## Findings fixed

Engine (PR #244, checked in the lab):
- [x] E-B, the beam needs a real overlap (unreachable-by-input, 36: the home's movies, books, photos and settings, the
      settings pivot's seven tiles, live tv's Schedule). A neighbour enters the beam only when it overlaps by more than a
      quarter of the smaller side, so a focus scale of a few percent no longer pulls the next row into it. Checked in the
      lab: Right from the bottom row now walks Movies, Books, Settings. Every themed screen uses `pick()`, so every
      theme's pass tests run on it.
- [x] E-K, the mouse's Back with the on-screen keyboard up closes only the keyboard (broken-back, 1, and a back-focus: on
      /search, "Change the search", the mouse's Back closed the keyboard and then left the screen). The mouse's Back
      holds the traversal for 400 ms when it closes the keyboard, as it does for the overlay's dialogs.

Theme (theme/mosaic, latest commit on the branch, "mosaic QA 2"):
- [x] T1, the guide's opener tab (back-focus, 1: Channels, Back, Guide). For a tab before Guide, the current tab
      overwrote the opener's. The opener wins now, so Back from the player or a tab focuses the tab left.
- [x] T2, the Guide tab after Back on Live TV lists (back-focus, 8: Guide, Go back, and a channel row on the mouse). The
      list screen remembers the tab that left it (the Guide category navigates away), and Back focuses it once.
- [x] T3, the panel's tabs say which is shown (dead-control, 10: the wide item panel's "Details" on ten screens). Tabs
      carry `role=tab` and `aria-selected` (this covers Play on and Watch together too).
- [x] T4, Back from the queue to the song line (back-focus, 4: /music, an album twice, a playlist). The song line files
      itself as the opener, so Back from /queue lights it while the song still plays.
- [x] The mouse's Back on a pivot returns to the home pivot (P1, broken-back, 66, F-P). A pivot switch adds no history
      entry, so the browser's Back left the home for the page before. The pivot's `levelBack()` returns to the home pivot
      as a pad's B does, with the engine's Back sound.
- [x] `levelBack` on the sign-in screens, as Orbit and Media Center (found while checking P1: the mouse's Back on a
      sign-in screen takes a level).

## Judged not Mosaic's, or the walker's

Walker (to fix on #242's follow-up, none in #241):
- W-PT, the pivot headers are tabs, not levels (P1 66, P2 31): a header click is a screen for the walker, which then
  presses Back; with the home's pivot switch adding no history, it left #/home. Try each header once per run, and no
  unpositioned finding for a tab whose tablist has a shown tab. The headers slide so the current one sits at the grid's
  left, and the others trail off both sides by design.
- W-GONE (U2 14, U3 12): the movies' seven posters and the now playing capsule's controls. The posters belong to the All
  movies tab and the snake's ◀ ▶ changed the tab in place; the capsule shows only while music plays, and the 15-s clips had
  ended. By the direct try they were gone, and the walker failed them in one second with no press made. A target that is
  not present is skipped, not flagged.
- W-CY (time): the direct try keeps the (focus, direction) pairs it pressed; a pair seen again is a cycle, and it gives
  up.
- W-HEAD (episode coverage): danger words apply to the label's head before the first comma, so "More options…, add to a
  playlist, …" is pressed; `favou?rite` skipped the "favourites" places (17), so it becomes `favou?rite(?!s\b)`.
- W-P: the dialog pass honours the shown-tab check (`aria-selected`, `aria-current`) before calling a row dead.
- W-N2 (dead-control, 1, keys: a song press): music playing makes the page "noisy", and a noisy page ignores DOM changes,
  so the "Playing E660" notice did not count. A new status element counts as in-place.
- W-LV (obscured, 4; dead-control, 1): after a Live TV row's press the dialog pass does not wait out the engine's live
  card (connecting), and the next clicks landed under it. Wait it out, close a failed card, and extend the late-player
  wait to "on now" and "watch".
- Fixed by #242: B4 (back-focus, 10): F3 refocuses the played channel and centres its row, and the walker keyed the
  cell by DOM row, so its old key named another channel's cell. #242 keys a guide cell by channel and programme.

Judged (six rules in `qa-judged.json`, doc `mosaic-2.md`):
- The mouse's Back after a pivot header (broken-back, `^/home · `): a pivot is a tab of the home, so the browser's Back
  leaves it. Until W-PT.
- The unpositioned pivot headers on the mouse (31): by design.
- The shown tab of the item panel (dead-control, `(dialog)`: Details, Images, Identify, Media info, Refresh): until T3
  and W-P both land.
- The now playing capsule's Previous, Play or pause, Next and Open Now playing on `/home · `: gone by the direct try.
  Until W-GONE.
- The movies' posters on a pad (unreachable-by-input, `/movies`): gone after the tab changed. Until W-GONE.
- "details of a Season" (required-missing): Mosaic shows a season as a panel of the Series deck. The rule filters
  nothing until the walker reports the required screens as their own kind.
- Two findings (the artist's Now playing, the book reader's Next) fall under existing `*` rules.

## Unsure

- S1 (script-error, high, mouse): `/details [Book]`, the reader's Full screen: "rejection: not granted". The book reader
  calls the Fullscreen API, the first press of it in any walk, and the stock control never reached the reader. It is the
  app shell's, not the theme's. Check in the lab: open a book, click Full screen, and see whether the web view grants the
  request (upstream's `src/ui/webview.qml` accepts it; check the current shell).
- D4 (dead-control, 1, mouse): `/mypreferencesdisplay` Localization (the engine's rail). The entry for the section
  already at the top scrolls nothing, and its focus move to the first field was not seen. Engine polish: `aria-current` on
  the shown section.

## For your review

What a person should look at on screen and listen to:
1. The home by pad: from the first tile, arrows only. Every tile is reached (movies, books, photos, settings included)
   and the active header stays "home". The same on the settings pivot (Display, Home, Subtitles, Controls, Client
   settings, Change server, Exit) and Live TV's Schedule. The focused tile's scale should still look right at the
   tile's edge.
2. The mouse's Back on a pivot (click "movies", mouse Back: the home pivot is lit), and with the on-screen keyboard up
   on Search (Back closes only the keyboard, and Search stays).
3. Live TV: Guide, Back, and a list tab's Back (the Guide tab lit); the played programme's cell after the player; the
   opener's tab when Back comes from Channels.
4. The item panel's tabs (Details, Images, …): the shown tab reads as shown.
5. Play a song, hover the song line, click it, and press the mouse's Back: the song line is lit.
6. Listen: music presses ("Playing …", "Shuffling …", "Instant mix from …" notices); "Nothing is playing" on the idle
   queue and "No options here" on an empty Options, each with the error sound.
7. A book: open it and click Full screen (S1): does the reader go full screen? The Localization entry on the
   Display preferences' rail (D4).

## mosaic-1.md rechecks, as closed by this walk

See `mosaic-1.md`: F1, F2, F4 to F8, F10 to F13 and F15, the engine's E1 and E-P, the mouse's Search, the walker's no
writes, and the two unsure groups on /queue's Shuffle and the guide's Matinee closed; F3 closed but for T1 (now fixed);
F9, F14, E-L, the episode's page, library coverage and Season and Episode details still open; the home-tile check failed
on the engine bug and is fixed in #244.

## To recheck in pass 3

Each is replayed in the lab on the build with the engine of #244, the theme's "mosaic QA 2" commit and the walker that
follows #242; tick when it holds.
- [ ] E-B: Mosaic's home, ▼ from collections goes to photos, ▶ from shows goes to photos, ◀ from music goes to recently
      added. Every tile is reachable by arrows on the home, settings and live tv pivots (a test in mosaic_pass.py's home
      group: arrows only, every tile, the header stays "home"). Every other theme's pass tests still pass on the new
      `pick()`.
- [ ] E-K: /search, "Change the search", mouse Back: the keyboard closes and /search stays.
- [ ] T1: Guide → Channels → Back: Channels is lit. Series → Back: Series is lit.
- [ ] T2: Series → Up → ▶ to Guide → OK → Back: the Guide tab is lit. Channels the same.
- [ ] T3: the wide panel's tabs have `aria-selected`; the walker's dialog pass honours it (W-P).
- [ ] T4: play Test Tones, hover the song line, click it, mouse Back: the song line is lit. With the song ended, the cell
      is focused as before.
- [ ] The mouse's Back on a pivot: click "movies", mouse Back: the home pivot; on the home it leaves as before.
- [ ] `levelBack` on the sign-in screens: the mouse's Back takes a level.
- [ ] Walker: pads and keys reach books, home videos, the preferences menu with its Display and Home pages, a season, an
      episode, an artist and a song, with no required-missing and budget to spare; the mouse reaches a series, and
      clicks each pivot header once.
- [ ] Carried from mosaic-1.md: F9 (Watch together with a group joined; needs a group made outside the walk), F14 (Music,
      Artists, Icefin Lab, mouse Back; the mouse opened no column level in this walk), E-L (hover a failed live card's
      Close), an episode's options open its own page (pad and mouse), the pad's shoulders still change panel (F6, E-P).
- [ ] S1 and D4 as above.

Mosaic's second pass is done; its third walks on the engine of #244 and the walker that follows #242.
