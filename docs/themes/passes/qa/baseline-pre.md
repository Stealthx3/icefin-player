# baseline: QA pre-pass (D40, D41)

The lab walk before pass 1: input_walk.py with keys, mouse and an Xbox pad, 15 min each (iwalk-pre2, no stock control),
on theme/baseline with main merged in (engine #200 to #203). 213 high and medium findings: back-focus 93, focus-lost
74, dead-control 26, no-focus-indicator 11, script-error 5, broken-back 4. Most come from a few causes, so each line
below covers a group. Fixed on theme/baseline in 61ac0100, except broken-back, which the engine fixes for every theme (#204). Baseline is stock's look, so
each fix either does what stock's TV layout does or fills a checklist item the Gate 1 map gave a board but the build
left out.

## Findings

Fixed:
- [x] Back to a screen focused its first card or button, not the control that opened the next screen (93
      back-focus, keys and pad: every card, tab, Live TV button, Search and Settings on the home, the libraries,
      details, Live TV, the settings menu). Stock's TV layout keeps each page and restores its focused element on Back;
      Baseline draws a screen anew on every visit. Each history entry (the Navigation API's key, with the hash) now
      remembers the last control focused or clicked on it, by kind, item id or label, row and place among its twins.
      Back to that entry focuses it as soon as the screen draws it again, within 4 s and not once the user has moved.
      B.arrive takes that target first, so late home rows and the details' late rows don't take focus away. A button
      that renamed itself meanwhile (Play is Resume after the 5 s of playback) is found by its place
      (themes/baseline/kit.js `B.backFocus`, `B.arrive`).
- [x] An empty tab arrived on the header's Back (/tv Search: focus on 'Back'): rowsOf with no cards called B.arrive
      with nothing, and the page's first control was the header's Back. Arrival now takes the page's first control
      outside the header, then the active tab (kit.js `B.arrive`).
- [x] The mouse never moved focus (74 focus-lost, all in the mouse run, and the "not pointer-first" lesson from
      Plaza). Checklist 2.5 "Hover moves focus" is mapped to the Focus board in the Gate 1 map, but Baseline never
      turned on the engine's pointer-first rule, as every other theme does. It is on now (only a pointer that moves
      takes focus). Focus that follows the mouse doesn't scroll the page; the wheel does, as on stock's (kit.js
      `ui.pointerFirst(true)`, `B.page`). The findings themselves are partly the walker's (see below).
- [x] The mouse's Back with the item menu or the exit question open went back a page and left the panel open over it
      (4 broken-back: /details [Book], [Movie], [BoxSet] More, the settings menu's Exit Application). The app turns the
      mouse's Back button into the page's Back, which the controller's actions never see. Fixed by the engine for every
      theme (#204, native/icefin/capabilities.js): while ui.overlay is up, a history traversal is cancelled through the
      Navigation API and taken as the overlay's Back, so Baseline's panel (an ui.overlay) pops a level or closes and
      the page stays. Baseline's own handling was dropped so the two don't act on the same Back.
- [x] Music started from a library or an album showed nothing on screen (dead-control: /music Play All on Songs,
      /details [MusicAlbum] Play with the mouse and the pad, the track row 1A4400:15). Stock shows its now playing bar;
      Baseline had none, though the Gate 1 map lists it on the Home board (1.1, 1.2). It now draws stock's bar along
      the bottom of every Baseline screen while music plays, not over video, Now Playing or Lyrics: the progress line,
      the picture and the song (OK opens Now Playing), Previous, Play/Pause, Stop and Next. The D-pad reaches it, and
      when it goes while focused the screen's arrival takes focus back (themes/baseline/np.js, styles.css `.bl-npbar`).
- [x] Play on a folder of books raised "rejection: undefined" (script-error, /details [Folder] Play, keys and pad).
      jellyfin-web's playback manager rejects with nothing when it finds nothing to play. Every play now goes through
      `B.playWith`, which catches that (kit.js; browse.js, details.js, home.js, library.js call it).

Judged not Baseline's, or not real:
- focus-lost after Back with the mouse (74): the walker's reading. In `activate()` the mouse run takes the focus after
  Back only when hovering gave the control focus (`pf.key == c.key`), but `want` is set from whatever had focus before,
  so a control hover didn't focus always reports "nothing is focused". All 74 have hover_focus false in
  mouse/report.json, and the screenshots show a card focused (mouse/finding_001: Live TV). Pointer-first is on now
  anyway (above).
- no-focus-indicator (11: Live TV, Playlists, 2026-05-02, 2026-06-14, Icefin Test Show, IMG_206, HLG HEVC EAC3,
  Icefin Lab, Icefin Collection on /video): the walker's reading. Each came from a press at a row's or grid's edge,
  where focus doesn't move. `mark_off()` ignores `off()` refusing (the control is still focused), compares stale
  snapshots, then the pixel check compares the still-focused control with itself (0.00%). The screenshots show the
  control grown 1.07 at that moment (pad-xbox/finding_001 Playlists, keys/finding_001 2026-06-14).
- dead-control on the tab you are on (/movies Movies, /music Albums, /livetv?collectionType=livetv Programs in all
  three runs, /livetv Programs with the mouse, /livetv Series with keys and pad): stock's tabs ignore a press on the
  selected tab, and Baseline does the same.
- dead-control /livetv Schedule (keys, pad) and /tv Upcoming, Genres (mouse): the tab changed, but from one empty tab
  to another ("No items found." both), with focus on a control of the same path and label, so the walker's digest saw
  no change. keys/finding_024 shows Schedule active.
- dead-control /movies Play All and Shuffle (keys): the walker had pressed the A–Z strip's G and F just before, which
  match nothing in the lab's movies ("No items found."), so there was nothing to play.
- dead-control Settings on /mypreferencesmenu (all three runs): the header's Settings button on the settings menu
  itself goes to the page you are on.
- dead-control /search T (mouse): the previous letter's results were still arriving, so the walker's digest was noisy
  and only the element was compared. T was in-place both other times it was pressed in the run.
- dead-control Previous and Next in /details [Book] (dialog) (mouse): jellyfin-web's own book reader, and the lab's
  test book has no other page.
- dead-control Play Dolby TrueHD 5.1 and Play PCM 7.1 in Client Settings (mouse): the engine's audio test; the
  previous clip's result re-drew the section while the walker held the old button, and every other clip was
  in-place.
- script-error "[userprofile] Unexpected null page reference" (keys, /mypreferencesmenu personProfile):
  jellyfin-web's own user profile page, mounted under Baseline's #/userprofile and left within 2 s; not seen on the
  mouse run's visit. A stock-control walk would show whether stock logs it too.
- script-error "Script error." (mouse /movies Play All, pad /details [Movie] Play): the sourceless cross-origin error
  at playback start that baseline.md already records (Baseline's own errors carry icefin-theme://baseline/… and a line).

For the host walk:
- [ ] Back focus across the board, with the pad, keys and mouse (the restore waits for the screen to draw the control;
      a slow server could pass the walker's 1.5 s settle).
- [ ] The now playing bar against stock's: its height, colour and buttons (from memory of stock's TV bar, not a
      capture), and that the hints and the alpha strip clear it.
- [ ] Hover moves focus: the rows slide to centre a hovered card as they do for the remote; check this reads well
      with the mouse, and compare with stock in the same shell (the stock control).
- [ ] The mouse's Back with a panel open in the app itself (Qt's goBack, not the walker's CDP event), once #204 is in main.
- Low findings (Shift+Tab) are left for pass 1.
