# mosaic: QA pre-pass (D40, D41)

The lab walk `iwalk-pre4/mosaic` (input_walk.py: keys, mouse and an Xbox pad, no stock control), read on 2026-11-17
against main cc36c20e (#200 to #204 in). It reached 15 screens and ended with budget left on every input. This pass
covers the high and medium findings: dead-control 25, back-focus 11, focus-lost 5, broken-back 3, script-error 1.
Required-missing (62) has one cause, the first item below. Hover-no-focus (14) and shift-tab (4) are low and left for
the next walk.

## Fixed

- [x] **The home pivot was a dead end** (required-missing ×62: every library, the preferences, now playing). A library
  opened only from its own pivot ("all movies"), and the pivots change only with LB/RB, ◀ ▶ past a grid's edge or a
  click on a header. The walker re-finds a control from the home's first tile, but the home reopened on the last
  pivot shown in the session, so the tiles on other pivots were "unpositioned", and the mouse (which sees no header
  as a control) only had the pivot the home happened to open on. Two changes: the home pivot now has a green place tile for every library
  (Live TV included, in the user's order) and for Settings, after Favourites and Playlists; and the home's memory is
  kept per history entry (next item), so a new visit to the home starts on the home pivot. `themes/mosaic/pivots.js`
  (`sections`, home tiles).
- [x] **back-focus, home (7: keys "search" and the account; mouse "all playlists", "icefin mix", "search" and the
  account; pad "2026-06-14")**: Back always landed on the pivot's first tile. Two causes: the Loading tile drawn while
  a pivot loads took the focus and wrote place 0 over the remembered one, and the account (top right) was never
  remembered. The home now remembers the tile (by its label, else its place) or the account per history entry
  (Navigation API key, as Plaza's `P.backFocus`), skips the Loading tile, and restores it once the pivot's tiles are
  drawn. `themes/mosaic/pivots.js` (`remember`, `homeMemo`, `put`, `account`).
- [x] **back-focus, /details [PhotoAlbum] (keys: VID_100 went to IMG_101)**: a deck panel's place was kept on the
  panel object, rebuilt when the details screen mounts again. Ported from Harbor (below). `themes/mosaic/views.js`.
- [x] **focus-lost, /details [MusicArtist] after Back from /queue (mouse)**: the deck reopened on Albums, a panel that
  loads after the deck is drawn, and nothing took the focus. Ported from Harbor (below). `themes/mosaic/views.js`.
- [x] **dead-control /details [Playlist] (dialog) Edit details…, Copy stream URL (mouse)**: after Media info pushed a
  level, the options under it showed but had `pointer-events: none`. Ported from Harbor (below).
  `themes/mosaic/panel.js`, `themes/mosaic/styles.css`.
- [x] **dead-control /details [MusicArtist] Options (mouse)**: the pointer's Options (≡) on an action with no options
  of its own (Play all, Shuffle) did nothing. On a details deck it now opens the item's own options, as on an empty
  panel, and the hints show ≡ options there. `themes/mosaic/views.js` (`onAction` menu, `hintsFor`).
- [x] **broken-back /home › Choose a server (pad)**: Back stayed on Choose a server (`leave: false`). Signed in, Back
  returns to where you were; signed out there is still nowhere to go (as Arcade). `themes/mosaic/account.js`,
  `themes/mosaic/views.js` (`leave` may be a function), `themes/mosaic/kit.js` (`D.signedIn`).
- [x] **broken-back /details [Playlist] dialog E660 and /selectserver dialog Add a server (mouse)**: the mouse's Back
  went to history with the options panel open, leaving it over the next screen. Fixed by the engine, #204
  (`native/icefin/capabilities.js`): with ui.overlay up, a history step is the overlay's Back. Nothing added here.
- [x] **(found on the way) the pointer's Back did nothing at a screen's first level** (a library, details, Settings):
  it called a level back only. It is the pad's Back now (as Arcade's QA pre). `themes/mosaic/views.js`.
- [x] **(found on the way) the home scrolled under the pointer**: the theme root is the engine's `overflow: auto`, so
  focusing a tile off the right scrolled the whole home on top of the grid's own slide, and a click could land on a
  neighbour (Harbor's flaw, Mosaic's form). The home clips and never scrolls; the wheel steps along the tiles and on
  into the next pivot. `themes/mosaic/styles.css` (`#icefin-theme-root.pv-home`), `themes/mosaic/pivots.js` (`wheel`).

## Harbor kit ports (a6454c91 on theme/harbor)

- [x] A deck panel that loads late takes the focus when it is the one on show (`views.js` `fillPanel`).
- [x] Each deck panel's place is kept in its level (`deckMemo`) for Back and redraws, on moves, panel changes and
  activation (`views.js` `keepAt`).
- [x] The options panel's lower level takes a click: it comes back and runs the row (`panel.js`, `styles.css`
  `.ms-level-under`).
- [x] Home Back focus per entry, hover included (pointer-first was already on: `ui.pointerFirst(true)` in `kit.js`),
  and the scroll-into-view flaw (above), adapted to Mosaic's pivot home.
- Not taken: Harbor's pointer-line placement (Mosaic's sits at 10vh, clear of its tabs at 17.2vh and the pivot
  headers at 16.9vh) and its Live TV route (Mosaic's libraries already route Live TV to `#/livetv`). Panel history is
  the engine's (#204).

## Judged not real

- **back-focus /details [Video] Play after /video (keys, pad)**: the lab's VID_100 is 0 min, so playback ended inside
  the walker's 5 s wait and the details came back; the walker's player probe (▶ ×5, ▼ ×3, ◀ ×5) then moved the deck's
  focus to Watched ✓ / Mark as watched (index 4: exactly those presses from Play). Crawler: check the route is still
  /video before probing.
- **script-error "Script error." (keys, Play on /details [Video])**: a cross-origin error with no message or stack,
  raised as playback started; Mosaic's own errors carry their file and line. Recheck with the console on the host walk.
- **dead-control in /details [PhotoAlbum] (dialog) (12: keys Play all, Shuffle, IMG_101–103; pad Play all, Shuffle,
  IMG_203–207)**: the "dialog" is jellyfin-web's photo slideshow (screenshots show the photo full screen); OK inside it
  changes nothing visible. Not Mosaic's.
- **dead-control "overview" (3: MusicAlbum, MusicArtist, Playlist)**: a click on the head of the panel already on show,
  which changes nothing by design.
- **dead-control /queue Shuffle, Previous, Play or pause, Next, Repeat (5, mouse)**: the screen says "Nothing is
  playing": the 15 s test tones had ended. There was nothing to control.
- **dead-control /details [MusicArtist] Play all (mouse)**: Play all had already started the songs; restarting audio
  changes nothing on screen (the capsule already showed the song). A host walk with sound should confirm.
- **dead-control /selectserver (dialog) Watch together (mouse)**: the panel's own section tab, already shown.
- **focus-lost after the pointer's Options and Watch together (4: /details [Playlist] ×2, /selectserver,
  /details [MusicArtist])**: pointer-only buttons that hover doesn't focus; the walker then always reports "nothing is
  focused" (Harbor's finding on input_walk.py `activate`). The overlay gives the screen its focus back on close.
- **back-focus /selectserver Add a server (mouse)**: a consequence of the broken-back above (the walker reloaded the
  screen).

## For a host walk

- The home with keys, a pad and the mouse: Back to the same tile on each pivot and to the account; Home and the
  guide's Home start on the home pivot; the new place tiles (every library, Settings); the wheel over the tiles.
- The mouse's Back with the options panel open, through Qt's goBack (#204).
- Play on details of a real-length video, with the console open (the script error).
