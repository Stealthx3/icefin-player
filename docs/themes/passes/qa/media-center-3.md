# media-center: QA pass 3 (D40, D41)

Phase A, pass 3 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked on the same build. Media Center alone, 40 minutes a run (pass 2 had 25). Build: main with #220,
theme/media-center 84318e20. Report: lab `~/walks/qa-mc3` (Media Center 150 + 20 findings, 141 + 19 not in the control;
pass 2 had 93 + 18). Pass 2's fixes are checked in `media-center-2.md`, Verified.

## Findings fixed

Engine (#222):
- [x] Play, Shuffle and Instant mix on an album, an artist and a playlist did nothing that showed (dead-control, every
      run): Media Center says "Playing …" in its notice, and the notice was in the page but hidden. While a themed
      screen shows, the engine hides everything at the top of `<body>` that isn't Icefin's (server plugins put UI
      there), a theme's own included. An element a theme marks `data-icefin-layer` stays. Checked: the notice is
      visible after Play on an album. The same rule hid Media Center's pad hint bar and poster flight, Plaza's toast
      and flight and Tide's flights; each is marked on its branch.

Theme (theme/media-center):
- [x] The book library opened on "continue reading" with nothing begun: "Nothing here yet." (and the pivot pressed
      did nothing, dead-control, every keys and pad run). A first pivot that comes back empty gives way to the next.
      Checked: Books opens on title with both books.
- [x] Hover not focusing Play on and Watch together on the start strip (hover-no-focus, mouse): there they are the
      pointer's own buttons, and now marked so (`data-icefin-pointer-only`), like the row titles.

## Judged not Media Center's, or the walker's

Fixed in the walker (qa/7.6-walk), each found by tracing the run:
- Hover not focusing the Movies wall's posters, its sort pivots and Live TV's tabs (hover-no-focus, mouse): replayed
  in the lab, each hover focuses (a poster after Back, once and again 2 s later). The wall was re-sorted (year, date
  added), which moves a poster to another path, and the walker judged by path alone. It now finds the control again
  by path, then label.
- The start strip's rows below the screen and their tiles "outside the viewport" (unpositioned, mouse), and Back from
  an opened row leaving the home (broken-back, mouse): the walker brought a row in by clicking the row before, which
  opened that row, took it for a lost screen and pressed Back. The wheel moves the strip a row a notch; the walker
  now turns it first, and a row opened in place is the way in. A closed row's tiles are hidden (opacity 0), not
  outside the viewport.
- Required screens not reached by the keys and pad runs at 40 minutes (budget: a season, an episode, a song, an
  artist, Display preferences, Now playing): every run reached a series at about 19 minutes and spent the rest on
  libraries found earlier. The walker now explores first the screens that lead to item types not seen yet (a series
  for its seasons, an album for its songs and artist), then required routes not yet explored.

Judged:
- Back on the start screen asks to close IceFin (keys, pad) or, with the mouse's Back button, goes back in history
  (the app's own mapping, as on every page): the start strip's rows are not levels, so Back doesn't close a row.
- The Steam run's Back from a Live TV tile ending on "Close IceFin Player?" with a channel connecting over it (once):
  the press on the tile opened the channel's page at once when replayed with keys (Solstice Arts); the channel that
  connected was another, started late under the walker's Backs. Rechecked in the overall rounds.
- Choose… (wallpaper), "play on" in the Watch together panel, the book reader's Previous on its first page and Play
  on a photo album (dead-control): as in passes 1 and 2 and Plaza's pass 3 (the system's file chooser, the panel's
  redraw, nothing before the first page, the slideshow's timing).
- The Audio test's Play buttons (dead-control, keys, 3): each was pressed while a clip played, when the buttons are
  busy (the status line shows "Playing…" in the finding's own screenshot).
- Book playback's `playbackstart` timeouts, `Invalid page request` and `no audio or video data played` (script
  errors): jellyfin-web's book reader, as judged in Plaza's pass 3.
- `Failed to get playlist permissions` 404 on a playlist (script error, 6): jellyfin-web asks the server whether the
  signed-in user may edit the playlist; the walker users are copies of the admin who made it, not its owner, and the
  server answers 404 for a user not on its list. jellyfin-web logs it and shows the playlist.
- The classic home's book cards with no focus look to the walker (no-focus-indicator): jellyfin-web's own page; as
  judged in Plaza's pass 3, rechecked in the overall rounds.
- The Playback page's quality drop-downs not reached by two pad runs (unreachable-by-input, Xbox and Steam): Down
  walks all 18 drop-downs (checked in pass 2); those runs left the column with Left from a checkbox and tried to
  reach the drop-downs with Right, which on a drop-down steps its value.
- Back from an artist to an album focusing the album artist card for the same person (mouse, once): two controls for
  one person, as judged in Plaza's pass 3.
- Shift+Tab (low): Media Center is a TV theme; Tab isn't one of its inputs.

## Verified

Re-walk 1 (lab `~/walks/qa-mc3v`; build main with #222, theme/media-center edcc9306, the walker's fixes): Media Center
130 + 16 findings (from 150 + 20). Gone: Play, Shuffle and Instant mix on an album, an artist and a playlist for the keys and pad runs (the
notice shows), continue reading on Books, the hover findings on the wall's posters and the strip, the strip's
"outside the viewport". Every keys and pad run now reached a season and an episode.

Found by the re-walk, and fixed:
- [x] Live TV, mouse: a channel clicked in the guide, then the mouse's Back button, left the "Connecting to …" dialog
      over every screen the mouse went to for up to 40 s (obscured, 24: the wall, the album's and a collection's
      buttons), and the channel then opened the player on the screen Back went to (broken-back, 15). A history
      traversal while a channel connects cancels it, as Back on the remote did, and a cancelled channel that starts
      late is stopped (engine #224). Checked in the lab: the dialog closes on the Back button and nothing plays in the
      next 29 s.

Found by the re-walk, the walker's (qa/7.6-walk), each traced:
- Back after a start-strip row brought in by the wheel left the home (broken-back, 7, mouse): the row turned, the walker
  activated the row's title from the level before and judged its Back against that level. A control reached on
  another level of the same screen is now exercised from that level.
- Display preferences never opened, by any run: the walker skipped a control named "Display" as a view choice that
  persists; Media Center's settings entries are buttons, where the walker's exception was for links. A settings entry
  named for its page now opens.
- Live TV not reached by the pad runs (budget): the walker ranked libraries as one required route, so after the first
  library Live TV waited behind the series. A library not explored yet now ranks with the required routes.

Re-walk 2 (lab `~/walks/qa-mc3v2`; build main with #222 and #224, theme/media-center be709d44, the walker's fixes above):
Media Center 91 + 11 findings (from 130 + 16). Gone: every obscured finding and the Live TV broken-backs after the mouse's
Back button, the start strip's broken-backs. Display preferences opened in every keys and pad run, and Live TV was
reached by every pad run.

Found by re-walk 2, and fixed:
- [x] Instant mix on an album and a playlist, and Play and Shuffle on a playlist of songs, started music with nothing on
      screen to say so (dead-control, mouse): the "Playing …" notice covered Play, Shuffle and Resume on an album, an
      artist or a song. Instant mix now says "Instant mix from …", and a playlist says "Playing …" once a song plays
      here (a playlist of videos goes to the player). Checked in the lab on Test Tones and Icefin Mix.

Found by re-walk 2, the walker's (qa/7.6-walk), each traced:
- The player's eight controls dead on a Live TV channel (keys), and Play, Shuffle and Instant mix dead on the mouse after
  15:58: the mouse joined the keys run's Watch together group ("Watch together, qa-keys") and clicked Harbour News in
  the guide, which the group played on the keys run's player, a channel that run never chose. Re-walk 1's mouse had
  joined qa-pad-xbox's group before the same Play and Shuffle findings. A walker no longer joins another walker's group.
- Back after Watch now on a channel ending on the player (broken-back, keys and four pad runs): the channel connected
  after the walker's late-change check, so it took the player for a level opened in place; Back with the player's
  controls showing hides them first (Media Center's player, by design). The walker now waits while a channel connects.
- Hover not focusing Live TV's guide and channels tabs and the libraries' date added and years pivots (hover-no-focus,
  mouse): judged on the second click's hover, which lands while the chosen pivot slides along its row. A second click
  keeps the first hover's verdict.
- The mouse not reaching search, the preferences, a show, a book, the photos or a playlist (required-missing, 14, in
  every walk of this pass): its run ended at 23 of its 40 minutes with nothing left to try. A closed start-strip row's
  tiles were listed while the strip turned and are hidden afterwards; the click on the row's title showed them, but
  the walker kept them without that click as their way in. A click that shows controls already listed is now their
  way in.

Judged:
- Choose… in the Theme section (dead-control, every pad run): the wallpaper's file chooser, as above.
- The Display page's theme drop-down, custom CSS box and "Learn how you can contribute." link not reached (Xbox and
  Steam, unreachable-by-input): both reached the page in their last minutes and stepped drop-downs with Right, as on the
  Playback page; the keys and the other pad runs reached every control there.

Re-walk 3 (the fixes above): to follow.
