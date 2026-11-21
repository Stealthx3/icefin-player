# plaza: QA pass 3 (D40, D41)

Phase A, pass 3 of 3. Started on the host on 2026-11-17 (build qa2), stopped part-way at the user's pause, and rerun
from the start in the VM lab on 2026-11-21 (D42) as a parallel walk (D44): `walk_parallel.py`, the seven runs (keys,
mouse, Xbox, DualSense, Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each in its own IceFin seeing only its own
pad, each walker user a copy of the lab's admin, against stock Jellyfin-Web walked on the same build. Build: main with
engine #206, theme/plaza a6bb0fb5. Report: lab `~/walks/plaza-qa3-par3` (stock 225 + 33 findings; Plaza 208 + 27, of
which 198 + 27 not in the control). The Steam shortcut and nested Gamescope are host-only and not part of a lab walk
(D42).

Two walker faults showed first and were fixed before this walk (qa/7.6-walk): a fresh walker user saw another home (no
history, no settings), so the users now start as copies of the admin; and reopening the app after the control lost
`start_x`, so no theme ran.

## Findings fixed

Engine (fix/qa3-plaza-engine, PR #215), each reproduced and checked in the lab:
- [x] Back to jellyfin-web's home inside Plaza (back-focus, 40: Books, Movies, Shows, Music, Photos, Playlists,
      Collections and a book, in every keys and pad run): focus landed on the first tile, Live TV. jellyfin-web's TV
      layout autofocuses a returning page's first card before the engine looks, and the focus listener recorded it
      over the control used. For 2.5 s after a navigation only a focus that follows the user's own move is remembered,
      and the first look is at 400 ms. Back from Books and from a book now returns to them within 0.8 s.
- [x] A folder of books offered Play and Shuffle, and neither did anything (dead-control, script error
      `rejection: undefined`): a container shows them only when it holds video or audio.
- [x] The song already playing, pressed on its album (dead-control in all six runs): it now opens Now playing.
- [x] A book's cover on its framed details page stopped the remote, unmarked, with nothing to press (dead-control and
      no-focus-indicator, 5 runs each): an unfocusable `.cardBox` counts only for a card with an action or an item.
- [x] `PlayerMedia: Error in updateQueueState: player cannot be null` while a book reader opened (script errors, 3):
      the queue update asks for the player's state only when there is a player.

Plaza (theme/plaza c475751b):
- [x] A books library's list offered Play all and Shuffle, and they did nothing (dead-control, 4 each): a list with
      nothing that plays drops both.
- [x] Focused, Play all and Shuffle looked the same as unfocused (no-focus-indicator, 5): the action tabs' always-on
      ring overrode the focus glow; they now glow like every other tab.
- [x] Back from the player to a list landed on the first card, not Play all or Shuffle (back-focus, 4): the grid drawn
      after Back no longer takes the focus Back put on a tab.
- [x] Back from an episode or the player to a series landed on the first row (back-focus, 3), and Back from an
      episode's details on the first row's Details button (3): the season no longer focuses its first row when Back
      has a row to restore, and each Details button carries its episode.
- [x] Back from an artist to an album focused the other card for the same person (Album artist for Artist): between
      two controls for one item, the same label wins. Back focus also waits up to 8 s for a screen that loads in
      several requests (the series takes four), and any input still stops it.

## Judged not Plaza's, or the walker's

- Book playback's `playbackstart` timeouts and `Invalid page request` (script errors, 4): the book reader opens and
  pages (checked: chapter text, page arrows, the reader's own controls); jellyfin-web's playback manager waits for an
  event a book reader doesn't send.
- Hover not moving focus on jellyfin-web's pages inside Plaza (hover-no-focus, 21, low): left as it is. Tried: with
  hover moving focus there, jellyfin-web's TV-layout row scroller centres the focused card, so a card slid out from
  under a resting pointer (hover on Music ended focused on Shows). The pointer keeps jellyfin-web's own hover look
  on those pages; every Plaza screen stays pointer-first.
- The book cards on the classic home showed no focus look to the walker (no-focus-indicator, 10): focused directly,
  the card gets Plaza's glow at once (computed box-shadow and the pz-glow animation). The walker's pixel check
  disagrees; rechecked in the overall rounds.
- Pressing a tab or a choice that is already the selected one (Season 1 with one season, the image editor's Poster
  tab, search's All), the sort's label changing after a sort ("A–Z" became "Year ↑ · 2 filters": the same control),
  and the filter switches, which toggle (dead-control and back-focus): no fault.
- "Live TV" in the channel card's dialog pass (dead-control, 4): the walker labels the dialog step with the dialog's
  title.
- Mouse back-focus on Live TV channels and an artist's albums: the pointer rests where it was, and pointer-first focus
  follows it (as in pass 2).
- Shift+Tab not going back (13, low): Plaza is a TV theme; Tab isn't one of its inputs (arrows are), and stock has the
  same on its pages.
- Required screens not reached by one run (6: the Steam run's details pages and two preference pages): the other runs
  reached them; one run's budget.
- Play on a photo (dead-control, keys only): it opens jellyfin-web's slideshow (checked); a timing miss.

## Verified

Re-walk 1 (lab `~/walks/qa-plaza3v-mc1`, walked together with Media Center's pass 1; build main with #215, theme/plaza
c475751b): Plaza 139 + 13 findings (from 208 + 27). Gone: Back to the classic home's rows and to a book, the book cover
stop, Play all and Shuffle on a books list and their focus look, a folder's Play, the Details buttons' Back, the
artist's Back. The song playing, pressed on its album, opens Now playing (checked in the trace).

Found by the re-walk, and fixed:
- [x] Back from the player to a series (5 pad runs), to a list after Play all or Shuffle (keys, mouse) and to a video's
      details (keys) still landed on the first row or on Back: jellyfin-web opens the player with `history.pushState`,
      which fires neither popstate nor hashchange, so the screen left was never filed. Back focus also listens to the
      Navigation API's `currententrychange` (a replace at the same address carries the entry over). Checked in the lab:
      Back from E2's playback returns to E2 within 0.8 s (theme/plaza).
- [x] A book reader's Full screen threw `not granted` (mouse): Qt WebEngine refuses the page Fullscreen API unless the
      web view turns it on; it now does, and a window already full screen stays so when the page leaves it (engine,
      PR #216). Playing a video doesn't take the page full screen (checked).

Judged, from the re-walk:
- The next song pressed on an album while another plays (dead-control, 4): it starts (the Now playing chip and the bold
  row show it, in the finding's own screenshot); the walker's change check missed the chip.
- A book reader's Previous on the first page (5): nothing comes before it; stock jellyfin-web is the same (stock walk).
- The home's `icefin` slot (6): the empty slot, as judged in passes 1 and 2.
- One-run back-focus leftovers on the classic home (Steam run: a book, Photos; keys: Music) and a person's More (keys):
  rechecked in re-walk 2.
- `Timed out while waiting for 'ready' event! Seeking…` on Now playing's Open Music (2 pad runs): jellyfin-web's own
  wait on a resumed song in the lab's software audio; the song plays.
- Mouse dead-controls on the filters dialog (In progress, Not watched yet) and an artist's Overview and Now playing
  chip: the filters toggle, and Overview was the tab shown. The chip opened Now playing on its first press (trace); by
  the second the song had ended, the chip was gone and the walker's click landed on Overview, which had moved under
  the pointer.

Re-walk 2 (lab `~/walks/qa-plaza3v2-mc2`, walked together with Media Center's pass 2; build main with #216 and #217,
theme/plaza dd1c9070): Plaza 129 + 11 findings (from 139 + 13). Gone: the reader's Full screen error, Back from
an artist's details and the Live TV channel's Back (mouse). Nothing new but Shift+Tab
and hover on two Now playing chips (judged as before).

The Back-focus findings left are the walker's, each traced and replayed in the lab:
- Back from the player to a series, a list (Play all, Shuffle) and a video's details (5 pad runs, keys): no Back was
  pressed. The walker records the player's controls with right ×5, down ×3, left ×5; the clip ended part-way (the test
  episodes are 33 and 38 s, and the walker users resume where the admin stopped), the player went back by itself, and
  Plaza focused the episode (replayed: E2). The presses still to come then moved the focus to the header's Back. The
  walker now stops recording when the player has gone back (qa/7.6-walk).
- Back to the classic home's Music, Photos and a book, focus on the tile before (keys, 3 pad runs): the walker placed
  the focus on the tile by script, not by a press, two seconds after Back from the tile before; for 2.5 s after a Back
  the engine keeps what opened the next screen unless the user has moved (#215), so the scripted focus wasn't kept.
  Replayed with presses: Back lands on the tile opened. The walker now waits out that window before a scripted
  placement.

Pass 3 is complete: every finding is fixed or judged. Next, the user's review of Plaza (screens and audio, D41).
