# orbit: QA pass 2 (D40, D41)

Phase A, pass 2 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, 60 minutes a run. Orbit
alone, on lab guest 1. Walk: 2026-11-27. Build: 5b32846881478656 (main with the engine fixes of #236). The stock control
was reused from Tide's pass 2 on the same build (D47). The walker is as of #239 (the mouse's pointer, wheel and click
checks); #241 was not in this walk. Orbit 109 + 25 findings (plain + Steam environment; pass 1: 224 + 31), 51 + 7 left to
triage after the judged list. Continues `orbit-1.md`.

Environment: the lab's Live TV guide had no programme data during this walk (every cell read "No information"; pass 1
still had programmes, and the guide has been refreshed since). The programme panel and the "later programme" half of
pass 1's F3 could not be exercised, so the guide items stay open.

## Coverage

- The mouse reached 26 screens (pass 1: 12) and stopped with 26 of its 60 minutes left and 17 required screens missing.
  #239's fixes worked: the pointer bar joins the controls on the first collect, the wheel adopts the channels it shows,
  the hover approaches from an offset (no hover-no-focus this walk; pass 1: 9), and a target under the pointer is checked.
  What stops it is two walker faults, found by tracing the run:
  - W-K, the Guide blades' rows are never tried: a click that reveals rows appends them to the end of the list, and
    before the loop reaches them it clicks the blade buttons still queued (Library, You, Settings). `drawGuide` rebuilds
    the guide on every blade change, so by the time Live TV to Playlists or Client Settings to Controls come up their
    blade is closed, and each is skipped without a trace line. Every library row and every Settings or You row has no
    outcome; only the blade buttons were clicked.
  - W-L, the wheel probe turns one notch, so the home showed only live tv and movies; Shows, Music, Books, Photos,
    Playlists and Settings never appeared.
- Pads and keys reached 32 to 36 screens a run (Steam 36) and missed 7 required screens (the playlists library, a season,
  an episode, the Display, Playback and Subtitles preferences, Now playing). More than the budget is at work:
  - the playlists library: every pad reached `/playlists`, but the walker's route matched `/list` only (#241);
  - the preferences menu: the snake climbed to Profile, went down onto Quick Connect, already seen, and ended, so
    Subtitles, Controls and Client settings were never enumerated (W-M); Display and Playback were also skipped as a
    persisting choice and as a PIN (#241);
  - a season and an episode: Orbit had no route to either one's details from a Series (Go to details, below);
  - Now playing: its ways exist only while music plays and the lab's songs are 15-second clips; the pads walk the home
    before any music plays;
  - time: each pad run spends about 15 of its 60 minutes on 22 Live TV plays, about 30 s each with the player's 13-press
    walk repeated on every visit (W-N).

## Verdicts

58 findings: 38 walker, 16 real (theme), 4 unsure, 0 judged. #241 fixes 3 of the walker ones and part of the budget.
Two of the theme rows (the Details tab twice) also need a walker change.

## Findings fixed

Theme (theme/orbit, commit 9f38bb3c):
- [x] BB1, Back from Choose a server (broken-back, Steam, high): the sign-in screen was mounted without a way out, so
      signed in, from the home's account (pass 1's F7 made it reachable), a pad or keys could not leave it (six Back
      presses over 14 s). It leaves when a user is signed in and stays when signed out. The mouse got out only because
      its Back button goes through history.
- [x] B2, the account waits for the channels (back-focus, 6, pads: Back from a tile's player landed on the account):
      the account was the only focusable until the channels loaded, so a slow load put focus on it, where A opens Choose
      a server. It becomes focusable when the channels are in, and returning to a channel from the account is remembered.
- [x] B3, Live TV's lists come back on their row (back-focus, 5, mouse; completes pass 1's F4): the tab's zone was
      written only when a tab was chosen, so after a click into the list (a channel row, the empty Schedule's Open the
      guide) Back came up with the tabs focused. The zone is recorded when the screen is left, and the empty state's
      button counts as the list.
- [x] U2, the song line is marked as the pointer's way (unreachable-by-input, 2: "Now playing: E660; open the queue" on a
      person's page): `data-icefin-pointer-only`, as pass 1's F6. A pad has the capsule's note and the guide's Now playing
      row.
- [x] T1, panel tabs are marked (dead-control, mouse, 2: the Details section of a Movie's and a BoxSet's panel): the shown
      tab carries `role="tab"` and `aria-selected`, as Play on and Watch together; a click on it redraws nothing by design.
- [x] Go to details on a season and an episode through the options (≡): a Series had no route to either one's details
      (episode rows play on OK, seasons are levels of the deck), so Season and Episode were unreachable for every input.

Engine: none new. Pass 1's programme-panel back-focus recheck against #236 is still open (no guide data).

## Judged not Orbit's, or the walker's

Walker, fixed in #241 (merged) or #242 (open), each found by tracing the run:
- #241: the playlists library route (`^/(list|playlists)`); the Display and Playback skips (the name before the comma is
  matched, `pin` is a whole word); "new group" is on the danger list (W1: the mouse pressed New group five times and made
  SyncPlay groups, so every later Watch together panel showed "You are in" as a checked row, which has no action, and
  Leave the group four times).
- #242: W-K (the Guide blades: revealed rows go right after the clicked row, re-keyed ones are dropped, a row replays
  its blade when it is not shown), W-L (the wheel probe turns up to 12 notches while each shows new controls), W-J (the
  ring: a tile is brought in by the sideways wheel, never by clicking a neighbour that acts, and no click at a clamped
  point; the mouse clicked three ring tiles below the current one, which plays them, so "/video" was credited to the wrong
  channel and Meridian became an obscured finding), W-M (the snake passes seen controls vertically), W-N (the player's
  walk on the first two visits only), W-O (guide cells keyed by channel and start, not DOM row: the grid draws its window
  from another row, so the played cell's key names a neighbour; B1, 6 back-focus on "No information"), W-P (the dialog
  pass applies the shown-tab rule before a dead-control), W-F2 (a 3-s wait for /video after any "nothing": a video in a
  photo folder plays on OK), W-H2 (direct reach switches axis when a press moves nothing: Channels on `/livetv` was
  reached by Up from the grid and Left, but the walker pressed Left 25 times), and `favou?rite` anchored to the toggles
  so the Favourites places are not skipped (about 40 skips a run).
- Time and coverage that remain the lab's data: Now playing for pads (the songs are 15-s clips).

Judged (rules proposed for `qa-judged.json`, doc `orbit-2.md`; each is dropped when its walker fix lands):
- `/livetv` back-focus on "No information": the played channel's cell is lit after Back (pass 1's F3, seen in the
  mouse's finding_009), but the cell's key names another row until W-O.
- `/livetv` unreachable-by-input on the tabs Channels, Recordings, Schedule and Series: Up from the guide's top row
  focuses the tabs, then Left and Right; the walker presses toward the tab's centre without switching axis (W-H2).
- (dialog) dead-control on Details, Images, Identify, Media info and Refresh: the item panel's shown section, a click on
  it redraws nothing by design; until T1's mark is honoured by the dialog pass (W-P).
- Not proposed: the Watch together rows (#241 stops the group being made); the required-missing screens (coverage, not
  findings to hide); B2, B3, U2 and BB1 are real and fixed above.
- Carried from pass 1 (already judged): the slideshow's IMG_* entries, Shift+Tab, a PhotoAlbum's Play all and Shuffle
  under the slideshow, and `Failed to get playlist permissions` on a playlist (the walker users are copies of the admin
  who made it).

## Not done, for the user

- `/details [Audio]` Play is still silent (7 runs; the stock control has it too, so filtered). Optional: Orbit says
  "Playing <song>" in the notice, as pass 1's F1 does for Play all and Shuffle.
- The cue on the top channel that channels lie below (pass 1) is still a design decision.

## Unsure

- W2 (1, mouse): the Guide's Media blade, "Watch together…" read as dead. The row before it, "Play on…", closes the guide
  and opens the panel, so the walker clicked the next guide row with the panel up; the shot shows the guide redrawn
  with Home focused, as `drawGuide` does. Check by hand: Guide, Media, Watch together… opens the panel on its Watch
  together tab.
- S1 (2, keys and Switch Pro): `Cannot read properties of undefined (reading 'MediaSources')` after Instant mix on an
  artist and a playlist, 26 to 30 s before the press the walker credits it to. Not in the control. Orbit only calls the
  engine's instant mix, which catches its promise. Replay Icefin Mix and Icefin Lab, Instant mix, with devtools on for
  40 s; the walker should record the stack of a script error.
- BF1 (1, Steam): Back from a Series' Shuffle lands on the Episodes panel with episode 1 lit; keys and DualSense passed.
  Either the deck's remembered panel or the walker's scripted focus. Replay by pad: Series, Episodes, A on episode 1, Back,
  Left to the first panel, Shuffle, Back.
- The resting pointer and the sliding ring (engine, cheap check): Meridian was hovered and focus left it before the
  walker moved, so a still pointer may take focus when the ring slides another tile under it. Pointer-first ignores
  still moves (capabilities.js). Check with a real mouse: hover tile 2 of live tv and keep still.

## To recheck in pass 3

Each is replayed in the lab on the build with theme commit 9f38bb3c and the walker of #242; tick when it holds.
- [ ] BB1: home, Up, the account, A, B: back on the home with the account lit (by pad, and by keys).
- [ ] B2: Back from a channel's player, with the load throttled: that tile is lit, never the account; Down from the
      account returns to the same channel.
- [ ] B3: Series, Schedule tab, Open the guide, Back: "Open the guide" is lit. Schedule, Channels tab, a channel, the
      player, Back: that channel's row is lit. Channels, Guide tab, Back: the Guide tab is lit.
- [ ] U2: a pad run leaves no finding on the song line; the mouse still opens /queue with it.
- [ ] T1: the Details section of a Movie's panel is not reported dead on the mouse (needs W-P).
- [ ] Go to details: a Series, a season's ≡, Go to details opens /details [Season]; an episode's ≡ opens /details
      [Episode]; the walker reaches both and counts them.
- [ ] Guide items, on a refreshed guide: a later programme's panel opens on OK within a frame; Back from a panel puts focus
      on the programme (pass 1's unsure group, then once with a row pressed); the played cell is lit after Back (W-O).
- [ ] Walker (#242): the mouse reaches every channel through the wheel and the Guide blades, every library, the
      preferences menu and its pages, and Now playing, with budget left; pads reach the playlists library, a season, an
      episode, and the preferences' Display, Playback and Subtitles in 60 minutes.
- [ ] Walker: no walker user writes (Watched and New group are skipped; Favourites places are not).
- [ ] The open rechecks carried from orbit-1.md: the idle Now playing notice, the `theme_orbit.py` wheel test, the Watch
      together row (a group made by another user), the F6 shoulders with a show of two seasons, F7's Down back to the
      channel, `/details [Audio]` Play.
- [ ] The unsure group above.

Orbit's second pass is done; its third walks on the walker of #242.
