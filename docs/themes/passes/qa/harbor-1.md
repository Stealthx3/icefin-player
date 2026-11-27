# harbor: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked as the control (D47's reused control, Mosaic pass 2's from the same build). Harbor alone, 60
minutes a run, on the lab's third guest (new today). Walk: 2026-11-27. Build: 3ac4c01ac61a20a4 (main with engines #236
and #240). The walker was #242 with a jump-list fix. Harbor 223 + 39 findings (plain + Steam environment) to triage.
Continues `harbor-pre.md` (the pre-pass walk that fixed the home's Back focus and the mouse's reach).

Verdicts (262): real (theme) 224, real (engine) 1, walker 23, judged 14. Most of the theme count is a few causes
repeated across seven runs: the guide's opener and played cell (65), the deck heads (49 with the hover ones), the pointer
bar (33), Live TV's list screens (13), a scripted focus in a deck panel (18), music's play presses (13). High (12): 6
no-focus-indicator on the empty list's "Go back" button (one CSS line), 2 on the programme panel (walker timing), 1
broken-back (no `levelBack`), 2 broken-back on deck heads (judged), and 1 more "Go back" in the Steam run.

Harbor's kit is Mosaic's kit from before its QA: every shared file matches Mosaic's before its pass 1 (names aside). So
nearly every theme finding is one Mosaic's passes already traced, and the fix is the same port.

Coverage: keys and the five pad runs stopped at 24 screens each (identical sets), with 12 required screens missing
(search, the preferences menu, books, homevideos, Season, Episode, MusicArtist, the four preferences pages, now
playing). The mouse reached 47 (Mosaic 2: 33, 34 and 58). The cause is the walker, not Harbor (W-RAIL):
- Harbor's home is a menu column (the rail: Home, Live TV, Movies, Music, Shows, Books, Collections, Photos, Playlists,
  Search, Settings, Classic home) beside the content. A pad steps the rail with ▲ ▼ and a rail move draws its section.
- The walker's snake sweeps rows with ◀ ▶ and one ▼ each; on the rail it left after one or two entries (Live TV and
  Movies), then walked inside their levels. Music to Classic home were never focused.
- The unreached check then dropped all nine silently: six rail entries share their label with a home tile that was
  reached (the label rule), and Search, Settings and Classic home are scrolled out of view (the in-view test). Search
  and Settings are the only way to /search and the preference screens, so nine screens went missing with no finding.
A walker fix (W-RAIL) follows: a sweep down the opening column, the label rule only within one kind of control, and an
off-view control kept when a sibling in its list was reached. The mouse reached all twelve rail entries.

Smaller coverage causes: Books, Collections, Photos and Playlists all open `#/list?parentId=…`, so the walker keys them
as one screen (walker key, and a theme choice, F-L below); the guide was walked whole for 6 minutes and the PhotoAlbum's
photos one by one (both sampled in #242); an episode's page cannot be reached at all (F17); a season is a panel of the
Series deck (judged).

## Findings fixed

Theme (theme/harbor, b40367de): Mosaic's QA fixes ported to the shared kit, listed as the triage's F-items.
- [x] F1: play presses say what started (dead-control, 13: an album's songs and Shuffle, /music's Shuffle). They show
      "Playing …", "Shuffling …" and "Instant mix from …" in the notice.
- [x] F2: the pointer bar's Options always answers (dead-control, 2: the preferences menu, an empty Series list): "No
      options here" with the error sound.
- [x] F3: the guide remembers its opener tab and the played cell (back-focus, 65: Series, Channels, Recordings and
      Schedule after their screens, and the programme after the player). The tab strip answers while the channels load.
- [x] F4: Live TV's list screens come back as they were left (back-focus, 13: channels after the player, the category
      chosen in place, Guide → Back).
- [x] F5: the pointer bar and the song line follow the pointer (hover-no-focus, 33: Options, Play on, Watch together
      on 17 screens, "Now playing: …").
- [x] F6: the pointer's own ways are marked (unreachable-by-input, 36; hover-no-focus, 13; dead-control, 6): the deck
      heads and the season tabs are tabs with `aria-selected` and `data-icefin-pointer-only`, and so is the song line.
- [x] F7: ◀ ▶ along a Live TV list screen's tab bar passes over the Guide tab (unreachable-by-input, 6: Channels and
      Guide). OK on Guide opens it.
- [x] F8: ▼ from an empty list's tab reaches its button (unreachable-by-input, 2: "Go to All movies").
- [x] F9: the row for the chosen option says it is current; the options panel's tabs are tabs.
- [x] F10: Now playing's transport answers while idle (dead-control, 5): "Nothing is playing".
- [x] F11: content moving under a resting pointer doesn't take focus (back-focus, 5: the preferences menu's rows, a
      BoxSet's cards).
- [x] F12: a deck panel focused by any means is the one Back returns to (back-focus, 18: a Series' episodes, an
      artist's page).
- [x] F13: a replaced details level keeps its places (Subtitles, Off, then Back).
- [x] F14: the mouse's Back button pops an open level (broken-back, 1: a folder in /list). `levelBack()` is on every
      screen with in-place levels; on the home it closes the open info card.
- [x] F17: an episode's options open its own page ("Open its page"), so the Episode details are reachable.
- [x] F18 (Harbor's own): the empty list's "Go back" shows focus (no-focus-indicator, high, 6 + 1 in the Steam run).
      The `on` button was painted the same focused or not; it takes the ring now.

Engine:
- [x] D8: Item Details on the Display page does not mark a press where the page can't scroll (dead-control, 1). Fixed
      by #244 (the section rail marks the pressed section at once); not in this walk's build. #244's other part (the
      jump list) does not apply to Harbor: its screens handle the arrows themselves.

## Judged not Harbor's, or the walker's

Walker, fixed in #242's jump-list fix (not in this walk's build):
- U4 (14): the snake left Favourites or Studios shown, the 7 posters were not on the page for the direct try, and the
  failures came in one second with no press; no verdict now.
- Time: the guide's cells are capped at 3 a channel and 24 in all, and photos whose labels differ only by digits are
  sampled.

Walker, to fix in the walker that follows #242:
- W-RAIL: the coverage cause above.
- W-LIST: key `/list` by its `parentId` when a library tile or a rail entry opened it (if F-L is not taken).
- W-N (NF2, 2): the dialog pass pressed ▼ four times in two seconds and looked at the focus mid-move (Keep: all and
  Record on the DualSense and Switch Pro runs; Record reads as focused in the other six). It settles 300 ms first.
- W-HEAD (BB2, 2): a deck head is a tab of one details page, not a screen; the mouse's Back from it leaves the page.
  The pivot-tab rule extends to a tab whose outcome is a sub-screen of the same route.
- The judged-list matcher treats pad families as pad (walk_parallel, on the walker branch): a rule's `input` was
  matched against `pad-<family>` for most kinds, so the `/music` Shuffle rule never matched a pad (4 here).

Judged (rules proposed for `qa-judged.json`, doc `harbor-1.md`):
- Play all and Shuffle on a PhotoAlbum under the slideshow (dead-control, 7): jellyfin-web's slideshow covers the screen
  and has no controls.
- Media info's stream rows (dead-control, 2): text to read, focusable so a pad can scroll them.
- Play on's "Look again" (dead-control, 2): it asks the server for devices again and redraws the same panel when
  nothing new answers.
- A deck head's mouse Back (broken-back, 2): a view choice of one details page, no history entry.
- Two controls for one person (back-focus, 1: Icefin Lab, AlbumArtist and Artist): the `*` rule is widened for
  Harbor's comma labels.
- The `/music` Shuffle rule (dead-control, pad): a library's Shuffle fetches its items before it plays. With the
  matcher above it needs no widening for pads.
- Details of a Season (required-missing): Harbor shows a season as a panel of the Series deck.
- The 7 posters after DV P5 on a pad (unreachable-by-input): until a walk on #242 gives no verdict.

## Not done, for the user

- F-L, a choice: the home's Books, Collections, Photos and Playlists open a bare folder list (`#/list?parentId=…`).
  Mapping them to their own library screens (tabs, Sort and filter) would make "a books library" and "a homevideos
  library" reachable and keyed apart. Not taken; W-LIST covers the walker's side if the folders stay.

## For your review

Checks only a person can make, on the host with a real mouse, pad and speakers:
1. The home with a mouse: the wheel over the menu and over the shelves, hover and click the off-screen entries (Search,
   Settings, Classic home), Back to the same poster. The lab reached the off-view entries; the wheel over the shelves
   was not exercised.
2. The pointer bar on now playing (music), the guide and the sign-in screens, by eye.
3. The unstyled "OK choose Back" line top left on the inner screens and bottom left on the home: this walk had no
   screenshots to settle it.
4. The mouse's Back with an options panel open, through Qt's goBack: the panel closes either way; the screen stays only
   where Qt cancels the traversal.
5. On the home, Back with an info card open closes the card and the screen stays (`levelBack`).
6. By ear: Test Tones, Play all, 1. A440: a notice and the song (F1); an idle /queue's Next: "Nothing is playing" and
   the error sound (F10); the pointer bar's Options on the preferences menu: "No options here" with the error sound
   (F2).
7. `/livetv?hr=series` (empty), Down to "Go back": the ring shows (F18).

## Rechecks for pass 2

Theme, each checked in the lab on the next walk's build:
- [ ] F1: Test Tones, Play all, Shuffle, a song's Play and Instant mix, /music's Shuffle each show their notice.
- [ ] F2: Options on the preferences menu and an empty Series list shows "No options here".
- [ ] F3: Guide, Series tab, Back: Series is lit. An on-now cell on channel 7, the player, Back: that cell is lit.
- [ ] F4: Channels, a row, the player, Back: that row is lit. Guide, Channels, a channel, Back: Channels with it.
- [ ] F5: hover the pointer bar's Options, Play on and Watch together, and the song line: each takes the focus look.
- [ ] F6: the deck heads, the season tabs and the song line are not listed as unreachable or hover-no-focus; the head
      on show is not a dead control.
- [ ] F7: `?hr=series`, ◀ along the tabs: Guide is passed over and Channels is reached; OK on Guide opens it.
- [ ] F8: Movies, Favourites (empty), Down: "Go to All movies" is lit.
- [ ] F9: the options panel's chosen row says it is current.
- [ ] F10: /queue idle, Previous, Next and Repeat: "Nothing is playing".
- [ ] F11: the preferences menu, click Display, mouse Back: Display is lit.
- [ ] F12: a Series, focus an episode, Back from the player: the episode is lit.
- [ ] F13: a film, Subtitles, Off: focus stays on Subtitles.
- [ ] F14: a folder in /list, mouse Back: the folder pops and the screen stays. On the home, Back closes the open info
      card.
- [ ] F17: a Series' episode, Options, "Open its page": its page opens, from a pad and by the mouse.
- [ ] F18: `?hr=series` (empty), Down: the ring shows on "Go back".

Engine, with the next build:
- [ ] D8 (#244): the Display page, Item Details: the press marks the section at once.

Walker (the one that follows #242):
- [ ] Pads and keys reach every rail entry, Search and Settings included, and the preferences pages, with no
      required-missing and budget to spare (W-RAIL).
- [ ] The programme panel's Keep and Record read as focused (W-N); the deck heads' mouse Back is not tested as a screen
      (W-HEAD).

Harbor's first pass is done; its second walks on the engine of #244 and the walker that follows #242.
