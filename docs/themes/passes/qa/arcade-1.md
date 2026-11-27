# arcade: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked as the control (D47's reused control, Mosaic pass 2's from the same build). Arcade alone, 60
minutes a run, on the lab's second guest. Walk: 2026-11-27. Build: 3ac4c01ac61a20a4 (main with engines #236 and #240).
The walker was #242 with a jump-list fix. Arcade 280 + 49 findings (plain + Steam environment) to triage. Continues
`arcade-pre.md` (the pre-pass walk that made the home's pills open every library).

Verdicts (329): real (theme) 228, real (engine) 1, walker 44, judged 6, unsure 22, lab 32, coverage info 5. Most of the
theme count is a few causes repeated across six runs: the guide's opener and played cell (21), Live TV's list screens
(32), the deck heads (48), the pointer line's buttons (51), music's play presses (13).

Arcade's kit is Mosaic's kit from before its QA, like Harbor's: guide.js, details.js, data.js, np.js and interim.js are
identical to Mosaic's before its pass 1 (names aside), and the other kit files differ by a few lines. So nearly every
theme finding is one Mosaic's passes already traced, and the fix is the same port. Two theme faults are Arcade's own
CSS (A1, A2).

Coverage: the home's pills open every library, so keys, Xbox, Switch Pro, 8BitDo and Steam each reached 33 screens
(Mosaic 2: 33 and 34; Harbor 1: 24). The mouse reached 50. Missing on those runs: Season (a deck panel by design),
Episode (no way to its page: F17), MusicArtist (never pressed, the per-kind limit), the preferences home (walker, fixed
in #242's jump-list fix) and now playing (15-s clips; Arcade's pad way is quick access's "Open Now playing", shown only
while audio plays). The mouse never reached a Movie or a Series (A1: the pointer's line covered the library's tab strip)
nor a Season or an Episode (A2: the deck's heads under the panels). It also spent 21.6 minutes on one main menu
walked on 19 screens (W-MM, walker).

The DualSense run reached 2 screens. The app saw the virtual pad as "PS5 Controller" (SDL's mapping database, through
its evdev path) instead of "DualSense Wireless Controller" (SDL's HID driver), so Cross arrived as Menu (the action of
the pad's West button): on a tile it opened the item's options, Circle did not act as Back, and every later press met
the stuck panel (32 findings, 7 high). It is a lab condition right after the guest's reboot: later walks on the same
guests see the right name. The triage's reading, two walks sharing one guest, was wrong: the third guest, a copy of the
second, still reports the second's device name. A walker check of the pad's name follows (one finding instead of 32
when the name is not the expected one); pass 2 re-walks the pad.

## Findings fixed

Theme (theme/arcade, 656c6b78): Mosaic's QA fixes ported to the shared kit, listed as the triage's F-items.
- [x] F1: play presses say what started (dead-control, 13: an album's songs and Shuffle, /music's Shuffle, a
      playlist's and a BoxSet's Play all). They show "Playing …", "Shuffling …" and "Instant mix from …" in the notice.
- [x] F2: the pointer line's Options always answers (dead-control, 4: /tv, /books, the preferences menu, an empty
      Series list): "No options here" with the error sound.
- [x] F3: the guide remembers its opener tab and the played cell (back-focus, 21: Channels, Series, Recordings and
      Schedule after their screens, and the programme after the player).
- [x] F4: Live TV's list screens come back as they were left (back-focus, 32: channels after the player, the category
      chosen in place, Guide → Back). The column is kept per history entry; the Guide category never holds the memory.
- [x] F5: the pointer line's buttons and the song line follow the pointer (hover-no-focus, 51: Menu, Options, Play on,
      Watch together on 17 screens, "Now playing: …").
- [x] F6: the pointer's own ways are marked (unreachable-by-input, 48; the shown head's dead-control): the deck heads
      and the season tabs are tabs with `aria-selected` and `data-icefin-pointer-only` (a pad has ◀ ▶ and the shoulders).
- [x] F7: ◀ ▶ along a Live TV list screen's tab bar passes over the Guide tab (unreachable-by-input, 12: Recordings,
      Schedule and Series were behind it). OK on Guide opens it.
- [x] F8: ▼ from an empty list's tab reaches its button (unreachable-by-input, 4: "Go to All movies", "Go back").
- [x] F9: the row for the chosen option says it is current (`aria-current`); the options panel's tabs are tabs.
- [x] F10: Now playing's transport answers while idle (dead-control, 5): "Nothing is playing".
- [x] F11: content moving under a resting pointer doesn't take focus (back-focus, 3: the preferences menu's rows).
- [x] F12: a deck panel focused by any means is the one Back returns to (back-focus, 17: a BoxSet's Play all and
      Shuffle, a Series' episodes, a PhotoAlbum).
- [x] F14: the mouse's Back button pops an open level (broken-back, 1: Photos, Nov 12). Each column screen implements
      `levelBack()`.
- [x] F17: an episode's options open its own page ("Open its page"), so the Episode details are reachable.

Theme, Arcade's own:
- [x] A1: the pointer's line covered the tab strip (dead-control, 2: Genres, Upcoming; and the mouse never reached a
      Movie or a Series page). The old rule placing it at 7.6vh on screens with tabs outranked the frame's, so the line
      sat over the centred tabs. It stays in the top bar beside the clock now.
- [x] A2: the section heads sat under the panels (obscured, 6: Book, PhotoAlbum, Playlist and BoxSet decks; no other
      deck section was ever clicked by the mouse). The deck pivot draws above the panels now.

Engine:
- [x] E1: Item Details on the Display page does not mark a press where the page can't scroll (dead-control, 1). Fixed
      by #244 (the section rail marks the pressed section at once); not in this walk's build. #244's other part (the
      jump list) does not apply to Arcade: the home, every column and deck, and the guide take the arrows themselves.

## Judged not Arcade's, or the walker's

Walker, fixed in #242's jump-list fix (not in this walk's build):
- W2 (16): the snake left Favourites shown and the posters were not on the page for the direct try; no verdict now.
- W3 (19): the main menu's Quick access row closes the menu and opens quick access; the walker took it for a dead
  control and its next click closed the new panel.

Walker, to fix in the walker that follows #242:
- W-MM: a dialog whose title and rows equal one already walked is walked once per run (the mouse's 21.6 minutes).
- W-GOT (W1, 6): a photo day shown twice on the home (the hero shelf and the pill's feed) was reached once, then tried
  again with another pill's feed shown.
- W-V: the home's account button is keyed by its text, which changes once the server's name is known; pads never press
  it.
- B2 (1): a programme panel opened late and the walker's second click closed it; the mouse's Back came during the close.
- B3 (1): a two-film queue of 0-minute clips moved to film 2 as Back was pressed.

Judged (rules proposed for `qa-judged.json`, doc `arcade-1.md`):
- Play all and Shuffle on a PhotoAlbum under the slideshow (dead-control, 5): jellyfin-web's slideshow covers the screen
  and has no controls; the album's own Play all starts the slideshow already showing.
- Media info's stream rows (dead-control, 1): text to read, focusable so a pad can scroll them; OK does nothing.
- A photo day shown in the hero shelf and again in the pill's feed shelf (unreachable-by-input, 6): the walker reached
  the first copy and opened it; drop with W-GOT.
- Details of a Season (required-missing): Arcade shows a season as a panel of the Series deck, not a screen of its own.

## Not done, for the user

- Nothing reserved for the user this pass. Optional polish left: the programme panel shown at once, then filled
  (B2's window), and the account button's label redrawn when the server's name arrives.

## Unsure

- The playback stall (S1, 21: Playlist Play all, A440 and E660 in five runs, the photo folder's video, the mouse's
  Playlist and BoxSet Play all and Shuffle): no playback at all. In every run the folder's video ends with "playing
  next track" and a second session start with no "playing url"; every later play logs a session start and nothing else
  until a "playbackstop … no active player" 3 to 9 minutes on. Unsure whether the app or jellyfin-web is at fault; the
  theme calls the same play entry as every theme. A lab replay of the triage's recipe on stock did not reproduce it:
  the video played to its end and the next play started at once. The slideshow step did not open there, and the
  server re-choice was not tried. Open. With F1's notices the walker will count these presses as in place, so the stall
  goes unseen: replay it by hand.
- jellyfin-web's Playback page on 8BitDo (S2, 1, script-error): "Cannot read properties of null (reading
  'classList')" as the page loaded. The same press in five other runs and in Harbor's walk: no error. A race in
  jellyfin-web's own page; replay Controls → Playback ten times, and if it repeats under stock, add a `*` rule.

## For your review

Checks only a person can make, on the host with a real mouse, pad and speakers:
1. With a real mouse: Movies, then All movies, Collections and Studios (the line stays in the top bar beside the clock
   and each tab switches); a collection's "in this collection" and a film in it (A1, A2). Photos, Nov 12, the mouse's
   Back pops the day (F14).
2. Pad: Guide, Series tab, Back: Series is lit. A channel's on-now cell on row 3, the player, Back: that cell is lit
   (F3).
3. Pad: a Live TV list, Up, Right: Guide is passed over and Recordings opens; OK on Guide opens it (F7). Movies,
   Favourites (empty), Down: "Go to All movies" is lit (F8).
4. Pad: Home, What's new pill, Down, Right twice: reaches 2026-05-02.
5. By ear: Test Tones, Play all, 1. A440: a notice and the song (F1); an idle /queue's Next: "Nothing is playing" and
   the error sound (F10); the pointer line's Options on /books: "No options here" with the error sound (F2).
6. The mouse's Back through Qt's goBack with an options panel open (the panel closes either way; the screen stays only
   where Qt cancels it), and the home's redraw after Back from playback, no flicker.
7. Replay the stall (S1) once and the Playback page error (S2) ten times, by hand.

## Rechecks for pass 2

Theme, each checked in the lab on the next walk's build:
- [ ] F1: Test Tones, Play all, Shuffle, a song's Play and Instant mix, /music's Shuffle each show their notice.
- [ ] F2: Options on /books, /tv, the preferences menu and an empty Series list shows "No options here".
- [ ] F3: Guide, Schedule tab, Back: Schedule is lit. A later row's on-now programme, the player, Back: that cell is
      lit.
- [ ] F4: Channels, row 5, the player, Back: row 5 is lit. Guide, Channels, a channel, Back: Channels with that channel.
- [ ] F5: hover the pointer line's Menu, Options, Play on, Watch together and the song line: each takes the focus
      look.
- [ ] F6: the deck heads, the season tabs and the song line are not listed as unreachable or hover-no-focus; a pad's
      shoulders still change panel.
- [ ] F7: a list's tab bar, Up, Right twice: Recordings opens; OK on Guide opens the guide.
- [ ] F8: an empty list, Down from the tabs: its button is lit.
- [ ] F9: the options panel's chosen row says it is current.
- [ ] F10: /queue idle, Previous, Next and Repeat: "Nothing is playing".
- [ ] F11: the preferences menu, click Display, mouse Back: Display is lit.
- [ ] F12: BoxSet details, focus Shuffle, Back from a film: the card is lit.
- [ ] F14: Photos, Nov 12, mouse Back: back on Photos.
- [ ] F17: a Series' episode, Options, "Open its page": its page opens, from a pad and by the mouse.
- [ ] A1: Movies, move the pointer, click All movies, Collections, Studios, Genres; Series, Upcoming: each switches
      the tab. The mouse reaches a Movie and a Series page.
- [ ] A2: a collection, click "in this collection": the films show, and a click on one opens it. The mouse reaches a
      Season panel and an Episode.

Engine, with the next build:
- [ ] E1 (#244): the Display page, Item Details: the press marks the section at once.

Walker (the one that follows #242):
- [ ] The DualSense run checks the pad's name first and walks all the screens the other pads do (33).
- [ ] Pads reach the home's account button, the preferences home and MusicArtist; the mouse spends no 20 minutes on
      one main menu (W-MM).

Unsure groups:
- [ ] S1, the playback stall, replayed with the slideshow step and the server re-choice. Open.
- [ ] S2, the Playback page error, replayed ten times on stock and on Arcade. Open.

Arcade's first pass is done; its second walks on the engine of #244 and the walker that follows #242.
