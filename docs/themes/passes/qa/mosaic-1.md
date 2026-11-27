# mosaic: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked as the control (D47's reused control, Almanac's from the same build). Mosaic alone, 60 minutes a
run, on the lab's second guest. Walk: 2026-11-26/27. Build: ad21fa59e4c3bbe3. The walker carried #234, #235 and #238, and
the walk was restarted once at its start for #238 (the played-switch rule). Mosaic 446 + 71 findings (plain + Steam
environment) to triage. Continues `mosaic-pre.md` (the pre-pass walk that gave the home a place tile for every library).

Verdicts (517): real (theme) 372, real (engine) 18, walker 106, judged 11, unsure 10. Most of the theme count is a few
causes repeated across six runs: Live TV's list screens (68), the deck heads (109 with the song line and the pointer
bar), music's play presses (35), the pointer bar (37), the guide's opener and played cell (28).

Coverage: every pad and keys run ended with an empty queue and 14 to 15 required screens unreached (no movies, tvshows,
books or playlists library, no preferences menu). The mouse reached 44 screens. The cause is the walker, not Mosaic
(W-P1 to W-P3, W-L and W-S in the triage):
- W-P1: on Mosaic's home, Left or Right at a grid's edge switches the pivot in place on the same route, so the walker's
  screen key did not change and it took the switch for an ordinary move; the snake ran off the home pivot at every row
  and never stepped on its movies, shows, books, playlists, photos and settings tiles.
- Every library pivot's first tile carried the same key (`latest`), so a step from one library pivot to the next read as
  "did not move" and the row ended there.
- W-P2, W-P3: a pad enumerated only after both snakes, with the collections pivot on screen, so the home's other tiles
  never became elements to try; and the walker never pressed the shoulders (LB/RB), Mosaic's real pivot keys.
- W-L: the playlists library was matched by `^/list`; Mosaic's route is `#/playlists`.
- W-S: the preferences entries ("Display, how it looks: language, dates, the pages") were skipped by the "persists a
  view choice" check, and "Playback, quality, audio, skipping intros" by DANGER's `pin`, which matched "skipping".

All of it is fixed in walker PR #241 (not merged yet: Mosaic's pass 2 walk is its test).

## Findings fixed

Theme (theme/mosaic, dc9939a1):
- [x] F1: play presses say what started (dead-control, 35: an album's, a playlist's and an artist's Play all and
      Shuffle, a song's Play, Instant mix, the /music Shuffle). Music started with nothing on screen to say so, the same
      15-s clips already playing. They show "Playing …", "Shuffling …" and "Instant mix from …" in the notice, as
      Almanac and Orbit.
- [x] F2: the pointer bar's Options always answers (dead-control, 3: the preferences menu, an empty Movies tab, an empty
      Series list): "No options here" with the error sound when there is nothing to open.
- [x] F3: the guide remembers its opener tab and the played cell (back-focus, 28: 21 on the tabs, 7 on a programme).
      Back from Channels, Schedule or Series focuses that tab, and Back from the player focuses the programme played, as
      Almanac's F3. A later programme's panel also shows at once from the programme the guide holds.
- [x] F4: Live TV's list screens come back as they were left (back-focus, 68: channels 2 to 9 after the player, and the
      category chosen in place). The column is kept per history entry, and the Guide category never holds the memory.
- [x] F5: the pointer bar and the song line follow the pointer (hover-no-focus, 37: Options, Watch together, Play on,
      "Now playing: …").
- [x] F6: the pointer's own ways are marked (unreachable-by-input, 84; hover-no-focus, 17; dead-control, 9): the details
      deck heads and the Series' season tabs are tabs carrying `aria-selected` and `data-icefin-pointer-only` (a pad has
      ◀ ▶ and the shoulders), and so is the song line (a pad has the guide's Now playing row). The head already shown no
      longer reads as dead. As Media Center's convention.
- [x] F7: ◀ ▶ along a Live TV list screen's tab bar no longer leaves the screen (unreachable-by-input, 26): the Guide
      category is marked as leaving, so the arrows move past it and OK opens it. Recordings, Schedule and Series are
      reachable from Channels.
- [x] F8: Down from the tabs reaches an empty list's button (unreachable-by-input, 3: "Open the guide"), as Orbit's F8.
- [x] F9: the row for the group you are in says it is current (dead-control, 5: Watch together).
- [x] F10: Now playing's transport answers while idle (dead-control, 3: Previous, Next, Repeat): "Nothing is playing",
      as Almanac.
- [x] F11: content moving under a resting pointer doesn't take focus (back-focus, 18: the pointer's Back button on
      /movies, /homevideos and a BoxSet). A tile takes the pointer only on a real move, as the engine does.
- [x] F12: a deck panel focused by any means is the one Back returns to (back-focus, 28: a BoxSet's cards, an album's
      Play all, a PhotoAlbum). A panel focused by hover or by script now records itself in the level.
- [x] F13: a replaced details level keeps its places (back-focus, 7: Subtitles, Off, then Back lands on Subtitles, not
      Play).
- [x] F14: the mouse's Back button pops an open level (broken-back, 1: Music, Artists, Icefin Lab, mouse Back). Each
      column screen implements `levelBack()`. It needs #236 in the build.
- [x] F15: library pivots' live tiles name their library (coverage; "latest, Movies"), so a screen reader says which
      library it is and the walker's keys stop colliding.
- [x] An episode's options open its own page (the triage's U-SE): the episode entry had a details hook nothing called.
      It is wired through the options panel, so the episode's page is reachable. The Season and Episode details no
      longer count as screens Mosaic lacks.

Engine:
- [x] E1: the guide's cell follows focus however it came (back-focus, 16: Tin Robots, Morning Brief and others after a
      panel closed, keys and five pads). In #236 (merged, not in this walk's build).
- [ ] E-P: the pivot headers are tabs (coverage: the mouse could not see Search, the pivot headers being bare divs).
      In #240.
- [ ] E-L: the live card's buttons follow the pointer (hover-no-focus, 1: Close on "Couldn't start"). In #240.

## Judged not Mosaic's, or the walker's

Walker, to fix in #241 (not merged), each found by tracing the run:
- W-P1 to W-P3, W-L and W-S: the coverage causes above (about 45 of the 54 required-missing findings).
- W-D: a press on a control placed by script in the deck's other panel slides the deck, and the walker recorded the
  new panel's controls as a level (broken-back, 12: an album's 2. E660, a playlist's Shuffle, Instant mix). It takes it
  as the same level when half of the controls are already known.
- W-O: the engine's failed live card ("Couldn't start") covered the screen and the mouse clicked under it (obscured, 2).
  A failed card counts as a dialog and is closed with its Close button.
- W-N: a focus snapshot taken before a stepper's look settled (no-focus-indicator, 3: Keep on the programme panel; the
  finding's own shot shows it lit). It waits 200 ms after a move.
- W-G: DANGER lacked "new group"; the mouse started SyncPlay groups, so every later Watch together dialog showed "You
  are in". Added, so walks stay read-only.
- Fixed by #239 (not in this walk's build): the slow player start after a press that plays (dead-control, 2: a BoxSet's
  Play all), the first pointer event after a load (hover-no-focus, 2: Home's Settings, Music's Genres), and the guide's
  cells left out of the unreached check (unreachable-by-input, 40).

Judged (rules proposed for `qa-judged.json`, doc `mosaic-1.md`):
- Shift+Tab (low, keys, 1, /livetv): Mosaic is a pad-first console dashboard; its tiles, decks and guide take the
  arrows and a pad, every control is `tabIndex` -1 and nothing handles Tab. As Plaza, Media Center, Almanac and Orbit.
- Play all and Shuffle on a PhotoAlbum under the slideshow (dead-control, 6): jellyfin-web's slideshow covers the screen
  and has no controls; the album's own Play all starts the slideshow already showing.
- "Now playing: …; open the queue" clicked after the song ended (dead-control, mouse, 3): the lab's songs are 15-s
  clips, and the line hides when the song ends, here between the hover and the click. Clicked during a song it opens the
  queue.
- The book reader's Next (dead-control, 1; for all themes): the reader turns the page inside its own frame, which the
  walker's change check does not see (the screenshots show page 1, then page 2).
- Not added: a rule for details of a Season or an Episode. The episode page is reachable now (see the fixes).

## Not done, for the user

- Nothing reserved for the user this pass.

## Unsure

- /queue's Shuffle, second click (broken-back, 1, mouse): it was followed by a history step back to the artist, the
  entry before /queue. Nothing in Mosaic navigates on Shuffle; it may be a late second traversal of the mouse's Back, or
  a click-through on the idle transport. Replay: play the album, open the queue, wait for the clip to end, click Shuffle
  twice, with the Navigation API's `navigate` events logged.
- Matinee on the guide (focus-lost, 1, keys): the window paged back with no cell lit after five Left presses. It fits
  the engine's E2 (Left from a long programme, fixed in #236), or the panel's late open, which F3 now covers. Recheck
  with #236.
- Season and Episode details (required-missing, 8, mouse and three pads): a season is a panel of the Series deck and OK
  on an episode plays it. With the episode's options now opening its own page, recheck that the walker reaches both.

## Rechecks for pass 2

Theme, each checked in the lab on the next walk's build. Checked by pass 2's walk (`mosaic-2.md`, 2026-11-27):
- [x] F1: Test Tones, Play all shows "Playing Test Tones"; Shuffle shows "Shuffling Test Tones"; a song's Play and
      Instant mix show their notices; /music's Shuffle shows its notice. Closed: no dead Play all, Shuffle or Instant
      mix in 7 runs (pass 1: 35); song rows are in-place in 15 of 17 and the other is walker noise (the page was noisy
      while music played).
- [x] F2: the preferences menu, click Options: "No options here" with the error sound. On a details deck Options still
      opens the item's options. Closed: Options answers in place on the mouse (pass 1: 3 dead). The sound is a by-ear
      check.
- [ ] F3: Guide, Schedule tab, Back: Schedule is lit. A later row's on-now programme, wait for the player, Back: that
      cell is lit. A later programme's panel opens on OK within a frame. Open, one gap: Series → Back passes and the
      panel opens at once, but Channels → Back landed on Guide (the current tab overwrote the opener's; T1, fixed in
      pass 2). The played cell is refocused; the misses were the walker's row keys (fixed by #242).
- [x] F4: Channels, row 5, the player, Back: row 5 is lit. Schedule (mouse), click Channels, a channel, Back: Channels
      with that channel. Closed for rows: no back-focus on channel rows after the player (pass 1: 49). The Guide tab's own
      Back is T2 (fixed in pass 2).
- [x] F5: hover the pointer bar's Options, Play on and Watch together, and the song line: each takes the focus look.
      Closed: no hover-no-focus finding (pass 1: 37).
- [x] F6: the deck heads, the season tabs and the song line are not listed as unreachable or hover-no-focus; a pad's
      shoulders still change panel; the head already shown is not a dead control. Closed, except the pad's shoulders,
      not exercised (pass 1: 102 findings, now none).
- [x] F7: Channels, Up, Right twice: Recordings opens; Right again: Schedule. OK on Guide opens the guide. Closed: pads
      reach Recordings in the list's tab bar, and its screen is in every pad report.
- [x] F8: an empty list, Down from the tabs: "Open the guide" is lit. Closed: ▼ from the tabs reaches "Go back" and "Go
      to All movies".
- [ ] F9: Watch together with a group joined: the row says it is current. Open, not exercised: no group was made (#241
      skips "new group"), so the row never showed.
- [x] F10: /queue idle, Previous, Next and Repeat: "Nothing is playing". Closed for Previous (in-place on the mouse); Next
      and Repeat were not pressed.
- [x] F11: a film, move the pointer to another tile's place, mouse Back: the film is lit. Closed: no back-focus on
      /movies, /homevideos or BoxSet tiles after the mouse's Back (pass 1: 18).
- [x] F12: BoxSet details, focus a card in "in this collection", OK, Back: the card is lit. Closed: no BoxSet, album or
      PhotoAlbum back-focus (pass 1: 28).
- [x] F13: a film, Subtitles, Off: focus stays on Subtitles. Closed, weakly: "Subtitles, Off" opened its panel on Switch
      Pro and there is no back-focus on Subtitles.
- [ ] F14: Music, Artists, Icefin Lab, mouse Back: back on Artists (needs #236 in the build). Open, not exercised: the
      mouse opened no column level in this walk.
- [x] F15: each library pivot's live tile reads "latest, <library>". Closed: the reports show "latest, Music", "latest,
      Books", "latest, Photos" and the rest.
- [ ] An episode's options open its own page, from a pad and by the mouse. Open: pads never press ≡ and "More options…"
      was denylisted (W-HEAD); the mouse never reached a series (the pivot headers took its budget).

Engine, with the next build:
- [x] E1 (#236): hover a guide cell, press Options, wait for a minute boundary plus 30 s, close the panel: the cell keeps
      focus. A programme reached by script, OK, Back: that programme is lit, not another. Closed: no back-focus after a
      programme panel closed (pass 1: 16).
- [x] E-P (#240): the pivot headers are tabs: the mouse reaches Search; a pad's shoulders still page. Closed for the
      mouse (Search is reached through its header, and the headers are now walker screens, with P1 and P2 as a side
      effect). The pad's shoulders were not exercised.
- [ ] E-L (#240): hover the live card's Close: it takes the focus look. Open, not exercised: no failed live card in this
      walk.

Walker (#241, once it lands):
- [ ] Pads and keys reach every library (movies, tvshows, books, playlists) and the preferences menu with its Display,
      Home, Playback and Subtitles pages at 60 minutes, with no required-missing and budget to spare. Open: movies,
      tvshows and playlists, and the Playback, Subtitles and Controls pages are reached; books, home videos, the
      preferences menu, Display and Home are not (engine bug E-B, fixed in #244, then time).
- [x] The mouse reaches Search through the pivot header. Closed (E-P).
- [ ] A pad reaches every home place tile by arrows alone (movies, shows, books, playlists, photos, settings) without
      leaving the home pivot. Failed: real engine bug (movies, books, photos and settings unreachable), fixed in engine
      PR #244.
- [x] No walker user writes ("Watched ✓", "Played ✓" and "new group" are skipped). Closed: Watched, Mark as watched,
      favourites, Record and New playlist were all skipped, and no group was made. Only plays, which change play state.

Unsure groups:
- [x] /queue's Shuffle, as above. Closed, not reproduced: Shuffle pressed again was in-place, with no broken-back from
      /queue.
- [x] The guide's Matinee focus-lost, as above. Closed, not reproduced: no focus-lost finding in 7 runs.
- [ ] Season and Episode details reached, as above. Open: a season is a deck panel by design (the judged rule), and the
      episode needs W-HEAD and a mouse run that reaches a series.

Mosaic's first pass is done; its second walks on the walker of #241 with the engine of #240.
