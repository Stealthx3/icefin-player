# almanac: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked in the same run as the control. Almanac alone, 60 minutes a run, on lab guest 2 (a clone of
guest 1, the first walk on it). Walk: 2026-11-26. Build: ad21fa59e4c3bbe3. Almanac 111 + 14 findings (plain + Steam
environment), 104 + 13 left to triage after the judged list; the stock control 450 + 82. The pre-pass fixes are in
`almanac-pre.md`.

Coverage: 22 to 24 screens a pad or keys run, every run cut by the budget. No run reached the preferences menu
(Almanac's own Settings tab), the playlists library, a season, an episode, a song or the music details. Two causes:
walker faults, fixed in #234 (the keyboard test matched the engine's theme root, so a missed control was never retried;
"menu" in every Almanac tab's class made all tabs rank as settings, so Settings, the twelfth tab, fell to a per-kind
limit; a theme's own settings view now counts as the preferences menu), and Almanac's screens, which are large for a
60-minute run. Pass 2 walks on the fixed walker.

## Findings fixed

Theme (theme/almanac, e75580d8):
- [x] Focus lost after Back (focus-lost, 34: 27 on Live TV's guide, 7 on a series' details; stock has none). One
      cause: Back lands on a screen that rebuilds from the server before it focuses anything, here during a slow-server
      window (five pad runs on Live TV at once, channel starts taking 13 to 31 s). 31 of the 34 fall within two minutes.
      Fixed both ways, theme here and walker below (W3).
- [x] F1: the guide builds its strip from the cached views and focuses the opener tab at once on Back, before the
      channel list and the grid arrive; its arrows and Back work on the strip while the channels load.
- [x] F2: Back draws a screen kept in memory at once and refreshes behind it; a series' details build from the last
      fetched item while the server answers again.
- [x] F3: Back from the player to the guide focused the tab last opened (back-focus, 6: Search, Settings), because the
      guide's filed opener was never cleared. It is cleared when a cell takes focus or a programme is chosen, and the
      played cell is filed and focused on return.
- [x] F4: a later programme's panel opened over 2 s after OK (dead-control, 1): it waited for the programme and the
      recording defaults before it showed anything. It now shows at once from the programme the guide holds, and
      the defaults fill in when they arrive.
- [x] F5: Shuffle and Play from here on an album, an artist, a playlist and a series, and a song's Play, said nothing
      that showed (dead-control, 6, mouse): the music already played, or the series' shuffle (up to 2000 episodes)
      started the player 10 s later. They now say "Shuffling …" and "Playing …" in the notice, as Media Center.
- [x] F6: Options on the pointer line did nothing with a "Nothing here yet" cell lit or on Settings (dead-control, 2).
      On a details level it opens the page's item options; elsewhere it plays the error sound.
- [x] F7: Back from Choose a server focused the lit cell, not the server button (back-focus, 1): the button got its
      label only after the server answered. It carries it from the cache at creation.
- [x] F8: the "Now playing …; open the queue" line never took hover focus (hover-no-focus, 3). It follows the pointer
      now, like the pointer line's other buttons.
- [x] The idle Now playing notice says "Nothing is playing", as Tide's.

Engine (PR #236, not merged; checked in the lab with the next build):
- [ ] E1: the guide's current cell follows focus however it came (back-focus, 4): a cell focused by hover or by the
      engine never moved the grid's own position, so the 30-s redraw while a panel was open put focus on the first row
      at now. Also Tide's: gaps selectable, a level's mouse Back, settings focus on return.
- [ ] E2: Left from a programme that began before the window left focus on nothing (dead-control, 2; "at nothing" once
      in every keys and pad run, never in stock). The window now pages back without losing focus.

## Judged not Almanac's, or the walker's

Fixed in the walker (qa/7.6-walk), each found by tracing the run (#234 and #235):
- W1: Back to the home focused the same cell and was judged as lost (back-focus, 12): the home's eight-row window
  scrolls by whole rows, so the cell's path changed and the walker compared paths. It now finds the control again by
  path, then label, as its hover check does.
- W2: OK on an on-now programme starts the channel, and the engine's "Connecting to …" dialog was not a dialog to the
  walker (dead-control 6, broken-back 4, obscured 7): the next press went to the dialog, the walker read a level
  opened in place and pressed Back twice; the mouse then clicked seven controls under a "Couldn't start" dialog after
  the lab's server did not start a channel in 40 s. The channel dialog now counts, the walker waits while a channel
  connects before it calls a control dead, and closes a failed dialog with its Close button.
- W3: "nothing focused" held 250 ms was taken as settled. The walker now waits up to 4 s with nothing focused and
  reports focus-lost only if focus never comes (the theme's F1 and F2 remove the gap for users).
- W4: the mouse run's very first hover found no focus on Guide (hover-no-focus, 1): Almanac follows only a pointer that
  moves, and the first move has nothing to compare with. One warm-up move comes before the first judged hover.
- W5: "Watched ✓" was not on the walker's danger list. The mouse run had un-marked a show and a film for its own
  walker user. Walker users are copied from the lab admin at each walk's start, so nothing persisted, but walks must
  not write: "Watched ✓" and "Played ✓" are now dangerous.
- W6: a move that leaves nothing focused ("at nothing (did not move)") was not reported, and showed only as two dead
  Guide tabs (E2). It is now a focus-lost finding.
- Required screens not reached (budget; the preferences menu, the playlists library, a season, an episode, a song,
  the music details, Display, Home, Playback, Subtitles, Now playing): the walker faults and the budget above.

Judged:
- Shift+Tab (low, keys, 14, every screen): Almanac is a TV cable-guide theme; its rows and guide take the arrows, its
  cells are `tabIndex` -1, and Tab isn't one of its inputs. As Plaza and Media Center.
- "Now playing …; open the queue" clicked after the song ended (dead-control, mouse, 2): the lab's songs are 15-s
  clips, and the line hides when the song ends, here between the hover and the click (the finding's screenshot shows
  no song line). Clicked during a song it opens the queue.
- Play, Shuffle, Previous, Next and Repeat on /queue with nothing playing (dead-control, mouse, 5): the clip had ended.
  A rule for the /queue transport is not added: the idle transport now says "Nothing is playing".

## Rechecks for pass 2

Theme, each checked in the lab on the next walk's build:
- [ ] F1: throttle the server (or delay `getLiveTvChannels` by 3 s). Guide, Right to Movies, OK, Back: Movies is
      focused before the grid appears.
- [ ] F2: Shows, Icefin Test Show, the Guide tab, Back: the Guide tab is focused as the page shows, with a 3-s server
      delay.
- [ ] F3: Guide, Search tab, Back, OK on a programme that is on now, wait for the player, Back: focus is on that
      programme, not on Search.
- [ ] F4: a later programme's panel opens on OK within a frame, with the recording defaults filling in.
- [ ] F5: Test Tones, Play all, Shuffle shows "Shuffling Test Tones"; a series' Shuffle shows its notice at once.
- [ ] F6: a film, hover More like this' "Nothing here yet", click Options: the film's options open. Settings, Options:
      the error sound plays.
- [ ] F7: Settings, click the server line, mouse Back: the server line is focused.
- [ ] F8: play a song, hover the song line: it takes the lime focus look.
- [ ] The idle Now playing notice reads "Nothing is playing".

Engine (#236, with the next build):
- [ ] E1: hover Lab Notes on the guide, press Options, wait for a minute boundary plus 30 s, close the panel: Lab
      Notes keeps focus. With no panel, hover a cell and wait 30 s: focus stays.
- [ ] E2: Guide, Down to Northwind Sports, Right until the window starts after Match Night's start, Left onto it,
      Left again: the window pages back and focus stays in the grid; Back, the Guide tab, OK goes into the grid.

Walker:
- [ ] The preferences menu (Settings), the playlists library, a season, an episode, a song and the music details are
      reached by the keys and pad runs at 60 minutes.
- [ ] No walker user writes (a Watched ✓ press is skipped).

Almanac's first pass is done; its second walks on the fixed walker with the engine build from #236.
