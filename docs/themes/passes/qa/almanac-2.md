# almanac: QA pass 2 (D40, D41)

Phase A, pass 2 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, 60 minutes a run.
Almanac alone, against its own stock Jellyfin-Web control walked in the same run, on lab guest 2. Walk: 2026-11-27.
Build: 2436649df75ae571 (main with the engine fixes of #236). The walker is as of #239 (the mouse's pointer, wheel and
click checks); #241 was not in this walk. Almanac 111 + 24 findings (plain + Steam environment; pass 1: 111 + 14), 99 + 23
left to triage after the judged list; the stock control 445 + 76. Continues `almanac-1.md`.

## Coverage

Every pad and keys run reached 21 or 22 screens and ran out of budget with 9 or 10 screens still queued; the mouse
reached 47 (stock: 30 to 36 for a pad, 46 for keys). The press rate (1.75 s a press) and Live TV (two channel starts
a pad run, 4 to 7 s each) do not explain it. Where a pad's hour went, found by tracing the runs:
- Direct tries that stall, 17 to 18 minutes a run (26 of 38 failed in the Xbox run, 28 of 40 in keys): each is 25 presses
  in one direction with focus not moving. The walker picks the axis from the centre distance every press and turns it
  only on a bounce (A, B, A); a stall is A, A, A. In Almanac, Left on a row's first cell does nothing by design and Up from
  row 0 goes to the remembered tab, so every target up-left or right of a row end burned 38 s. Stock loses 31 minutes
  the same way (36 of its 41 failures have this shape), so it is walker-wide.
- All levels stuck, 14 to 15 minutes: "All ›, Playlists" on /music, "All ›, All movies" on /movies and "All ›, Photos" on
  /homevideos open a level in place. The walker's level test returns nothing when half or more of the previous controls
  remain, and Almanac's 12-tab strip is on every level and makes up 12 of a library screen's 22 to 25 controls. The
  walker never pressed Back, so every later position began inside the level: 9 "no way to" plans on /music, 10 on
  /movies and 4 on /homevideos, about 35 s each. The same rule kept "All ›, All shows" (the way to a series, its seasons and
  episodes) and "All ›, Albums" from ever becoming screens; /tv was explored last and never reached it.
- Tabs re-pressed, 9 to 10 minutes: each library name, Search and Settings is a seed, so the strip was pressed on each of
  8 screens (76 presses with Back, 7 s each). Guide is not a seed, so it was never pressed and the guide was never collected
  by a pad or keys run.
- Smaller: the second snake ends at the strip (it stops on the 12 seen tabs), and the home's eight-row window scrolls by
  whole rows, so the same cells reappear at another index (two phantom direct tries a run, and U2 below).

Nothing here is a theme bug, but the theme's shape triggers all of it: 12 tabs on every screen, wide rows whose first cell
ignores Left, an Up that returns to the remembered tab, and "All ›" levels opened in place. Fixed in walker PR #242: W7
(direct reach keeps blocked focus and direction pairs, takes the other axis after a press that moves nothing, and gives up
when both are blocked), W8 (a level is judged without the controls that sit on three or more screens, so "All ›" opens
a sub-screen), and W11 (the settings view's page entries are seeds). With them about 28 minutes a run come free, more
than round one's queue needs. Two gaps are the lab's data, not faults: "now playing" for pads (Almanac's Now playing row
shows only while music plays, and the songs are 15-s clips), and the guide's cells for pads and keys, which the freed time
reaches.

## Verdicts

122 findings: 108 walker, 11 real (theme), 1 real (engine), 2 judged (not a bug), 0 unsure. There is also one theme gap
with no finding of its own: an episode's details page could not be reached by any input (F11).

Unreachable-by-input (72 + 22, 28 controls) is all the walker's except the server button:
- U1 (15 controls): the strip's left tabs (Home, Guide, Live TV, Movies, Music) on /books, /movies, /tv, /music and
  /livetv?al=rows. The first snake sweeps right from the current tab and the second ends at the strip; the direct try stalls
  pressing Left in the rows. A pad does reach them: Up gives the strip and Left walks it (every tab was reached on /home).
  The #241 two-way row sweep likely fixes it; W7 makes any leftover try cheap.
- U2 (2 controls): "No favourites yet" and "2026-06-14, 7 items" on /home, the same cells at another key after the window
  scrolled. W10 (skip a label this input already reached on the screen) is proposed, not in #242.
- U3 (9 controls): rows entered mid-row and swept the wrong way (the Live TV row, Icefin Test Book, Classic home, /music's
  Shuffle, A440 and E660, "All ›, All shows"). Fixed by #241's two-way row sweep.
- U4 (2 controls): the server button; real, F10 below.

## Findings fixed

Theme (theme/almanac, commit 12b429a7):
- [x] F9, Back from the song line's queue (back-focus, 3, mouse: /details [MusicAlbum] and [Playlist], "Now playing:
      E660; open the queue"): since pass 1's F8 the song line takes hover focus, so the walker judged its Back, and Back
      from /queue focused the lit cell (Shuffle, Play all). The opener was filed only for the pointer line's buttons and the
      server button, and the return lookup matched class and label, which changes when the song moves on. The song line is
      filed now, and the lookup falls back to the only button of its class, as pass 1's F7 asked.
- [x] F10, the pointer's own controls are marked (U4, unreachable-by-input, 2 controls and 8 findings): the server button
      under the clock, the pointer line and the song line carry `data-icefin-pointer-only`, as PACKAGE.md asks. A pad has
      the same actions under Settings, "Server …, change server", the hints, and the home's Now playing row. The mark also
      takes the song line out of the hover check (H1 below).
- [x] F11, an episode has a way to its details (no finding of its own; the checklist's Series item says "episode rows show a
      separate Details"): a Series or a season gave each episode a play press and a details action nothing read, so OK played
      and no input opened the episode's page. Each episode is a named row with two cells, "▶ Play" and "Details".

Engine: E3 is made in #240 (merged; in lab guest 2's next build). Pass 1's E1 and E2 (#236) are in the build and still open to recheck.

## Judged not Almanac's, or the walker's

Walker, fixed in #242 (the coverage faults above) or #241 (merged), or still to fix:
- #241: the playlists library route (`^/(list|playlists)`: every run reached /playlists, the requirement matched `/list`);
  Display, Playback and Subtitles are no longer skipped (the name before the comma, `pin` as a whole word), though they need
  W11 to become seeds since they share one signature; `new group` on the danger list (the mouse pressed New group seven
  times, making Watch together groups); `liveFailed()` counts as a dialog (O1, 7 obscured on the mouse: Small Worlds'
  channel failed after 40 s on a lab running seven walks, the walker clicked seven controls under the "Couldn't start"
  card; pass 1's G5 again).
- D1 (8, mouse, dead-control on Details in the item's wide panel on /home, /movies, /music, /tv, /books, /boxsets,
  /playlists, /details [MusicArtist]): the mouse opened "Edit details…" in an item's options, a metadata editor with one
  Save. The panel opens on its Details section and a click on the section already shown redraws it, by design. The walker
  should never open the editor: its danger rule misses this wording (W12, add `edit details`). Inside it the mouse clicked
  14 "Lock …" toggles; nothing was saved (Save is denylisted and never hovered; locks persist only on Save).
- W9 (a strip tab pressed once, on the first screen it appears on; saves about 8 minutes), W10, W12 and W13 (the snake
  ends only when focus did not move) are proposed in the triage and are not part of the coverage fix.
- Required screens not reached (budget; the playlists library, a season, an episode, a song, the music details, Display,
  Home, Playback, Subtitles, Now playing): the walker faults above, F11 for an episode, and the lab's data. Reached by
  every run: Settings and /details [MusicAlbum]. Season and MusicArtist were reached by the mouse only.

Judged (rule proposed for `qa-judged.json`, doc `almanac-2.md`):
- J5, (dialog) dead-control on Details, mouse: the item's wide panel opens on its Details section; choosing the section
  already shown redraws it in place. Dropped when W12 keeps the walker out of the editor.
- J4 and H1 (2, mouse, hover-no-focus on "Now playing: A440; open the queue" on /music and /details [MusicAlbum]): the lab's
  songs are 15-s clips, and the line hid under the pointer when the clip ended (the same moments as the dead clicks judged
  in almanac-1.md); during a song it takes hover focus (it did, in the same runs). F10's mark takes the line out of the
  hover check, so no rule is added.
- Carried from pass 1: Shift+Tab (low, keys), and the Now playing line clicked after the song ended.

## Not done, for the user

- E3 (H2, 1, mouse, hover-no-focus on Close of the "Couldn't start" card; real, engine, trivial): the Live TV card's
  buttons keep their own focus through `focusButton` and ignore the pointer; every other control in Almanac follows
  it. The fix is a mousemove handler on the card's buttons that focuses the one under a moving pointer (native/icefin's
  liveConnect.js). Not made.
- Nit: the header comments of itemmenu.js and np.js still say "Tide: …" (copied files). Rename on the next pass.

## To recheck in pass 3

Each is replayed in the lab on the build with theme commit 12b429a7 and the walker of #242; tick when it holds. Checked
in pass 3 (`almanac-3.md`), walked 2026-11-27 on the build 3ac4c01ac61a20a4 with the walker of #242.
- [ ] F9: play Test Tones, hover the song line, click it, mouse Back: the song line is lime-focused. With the song moved on
      (a 15-s clip), Back still lands on it. Failed: 4 back-focus and 1 focus-lost on the song line (mouse), the song
      still playing each time. Pass 3's commit 4fe3723a adds F13 (focus kept across a late redraw); a lab replay is missing.
- [x] F10: pad and keys runs leave no unreachable finding on the server button; the pointer line and the song line stay
      reachable by the mouse. No unreachable-by-input finding in any of the 7 runs (pass 2: 94); the mouse's server
      button reached /selectserver with `back_ok: true`, and the song line reached /queue on 4 pages.
- [x] F11: Shows, Icefin Test Show, Season 1, Right on S01E01, OK on Details: /details [Episode] opens; the walker reaches an
      episode on a pad and keys. All 7 runs: "Details" on S01E01 opened `/details [Episode]` with `back_ok: true`, on the
      Series page and on its "All ›, Season 1" level; Play on the same row went to /video.
- [ ] Coverage: pad and keys runs reach 30 or more screens, press the Guide tab and collect the guide, open "All ›, All
      shows" and "All ›, Albums", and reach the playlists library, a season, an episode, a song, the music details,
      and Display, Home, Playback and Subtitles; read the collect times on #242 (the two-way row sweep adds 1 to 3
      presses a row). Mostly: 37 screens; all 7 reached All shows, the playlists library, an episode, a song, the album,
      Display, Playback and Subtitles; collect time 24 min a run. Missing: the Guide tab (never pressed, W9), "All ›,
      Albums" for pads (the press was credited to the Playlists level, fixed by F12), a season's own page (a level by
      design, W19), the pads' MusicArtist (W9, W16) and preferences: home (W14).
- [ ] The open rechecks carried from almanac-1.md: F1 and F2 on a server throttled by 3 s (held at normal latency; the
      walker's 4-s wait hides latency), F6's "No options here" on Settings, E1 (a guide panel open across a 30-s tick, hover
      Lab Notes, Options, wait), E2 (Left from a programme that began before the window, with focus staying in the grid).
      Open: no throttled run, F6 not exercised (the mouse's Settings Options was unpositioned), E2 not walked (no pad or
      keys run moved in the guide). E1 held for the mouse (two panels open about 50 s across a tick, Back returned to the
      cell); pads and keys never explored the guide.
- [ ] No walker user writes (Watched and New group are skipped; "Edit details…" is never opened, W12). Held with a gap:
      Watched, Favourite, New group, Record, Save and "Edit details…" were skipped, but the mouse entered the metadata
      editor through Media info's Details section and toggled 3 locks twice, unsaved (W17).
- [ ] E3 (#240): hover the "Couldn't start" card's Close with the mouse. Not exercised: no channel failed (9 mouse and 7
      pad starts reached /video).

Almanac's second pass is done; its third walks on the walker of #242.
