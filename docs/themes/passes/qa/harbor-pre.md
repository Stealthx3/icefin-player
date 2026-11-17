# harbor: QA pre-pass (D40, D41)

The lab walk `iwalk-pre2/harbor` (input_walk.py: keyboard, mouse and an Xbox pad, 15 minutes each, no stock control),
read on 2026-11-16 against main 46695eb5 (fixes #200 to #203 in). The pad run stopped early; its two findings are the
home's Back focus below. This pass covers the high and medium findings: focus-lost 28, back-focus 27, dead-control 21,
broken-back 7. Required-missing (29), shift-tab and obscured (low) are left for the next walk.

Commits: theme `a6454c91` (theme/harbor); engine `b73c5caf` (fix/qa-pre-harbor-engine, from origin/main).

## Fixed

- [x] **back-focus, home (25: keys 18, mouse 7; and the pad trace's 2):** Back to the home always focused Home, whatever
  opened the screen. The home now keeps the menu entry, the shelf and the poster (by item) or category (by name) it was
  left on, and comes back to them after its shelves load. `themes/harbor/harbor.js` (rememberHome, restoreShelf).
- [x] **focus-lost, home, mouse (10: Settings, Search, Classic home, Shows, Books, Collections, Photos, Playlists,
  2026-06-14, SDR AV1 Opus) and dead-control Play on… / Watch together… on the home (2):** the menu and the shelves
  are pinned at scroll 0 and moved with transforms. Reaching an entry out of view scrolled it in, then the pin snapped
  it back, so the click landed on a neighbour (Collections for Settings, a gap for Play on…). A scroll is now folded
  into the transform at once. Hover and clicks are taken as the home's own focus, and the wheel steps the menu and
  the shelves, so the pointer reaches everything. `themes/harbor/harbor.js` (pin, still, wheel, adopt).
- [x] **focus-lost, details, keys (6: MusicAlbum's AlbumArtist, Artist and the artist; MusicArtist's Test Tones,
  A440, E660):** after Back the deck opened on the panel it was left on (Cast and crew, Songs). That panel loads after
  the deck is drawn, and nothing gave it the focus. It takes the focus as it loads when it is the one on show.
  `themes/harbor/views.js` (fillPanel).
- [x] **back-focus, details (2: MusicAlbum AlbumArtist went to Artist, mouse; Audio Artist went to Play, keys):** a
  panel's place was kept on the panel object, which is rebuilt on remount. It is now kept in the level too.
  `themes/harbor/views.js` (keepAt).
- [x] **broken-back (7: the options panel on /list, BoxSet, PhotoAlbum, MusicAlbum, MusicArtist and /music, Watch
  together on /music):** the mouse's Back button goes to the web view's history, not through the actions. The screen
  went back and the panel stayed open over the next screen (finding_008: Edit details over the home). In the engine,
  a history traversal while the overlay is up is now the overlay's Back (a level, else close) and is cancelled where
  the Navigation API allows. Where it can't be cancelled, the overlay closes with the screen.
  `native/icefin/capabilities.js` (fix/qa-pre-harbor-engine).
- [x] **dead-control in the options panel (5: BoxSet Find subtitles…, Edit details…, Copy stream URL; MusicAlbum Edit
  details…, Copy stream URL):** after Media info pushed a level, the level under it still showed its rows but had
  `pointer-events: none`. A click there now goes back to that level and does what was clicked.
  `themes/harbor/panel.js`, `themes/harbor/styles.css`.
- [x] **focus-lost, /movies Studios and /tv Networks (2):** the pointer's Back · Home · Options line sat on the
  library's tabs (`.hr-has-tabs .hr-pnav` at 7.6vh) and, without tabs, on the clock. The click on the tab hit Home. It
  now sits bottom left, where a pad's hints are (the two never show together). `themes/harbor/styles.css`.
- [x] **(found on the way) Live TV from the home** opened the Live TV folder as a list (/list), not Harbor's Live TV
  screen. `themes/harbor/harbor.js` (libraryHash).

## Judged not real

- **focus-lost after the pointer's Options, Play on, Watch together (10: /list ×2, /music ×2, BoxSet ×2, PhotoAlbum
  ×2, MusicAlbum, MusicArtist):** these are pointer-only buttons. A pad has ≡ and the hints, so they carry no
  `data-icefin-focus` and hover doesn't focus them. In input_walk.py `activate`, a mouse control that the hover didn't
  focus skips the focus check (`f = None`) but still compares with the earlier focus (`want`), so it always reports
  "nothing is focused". The overlay gives the screen its focus back on close (`restoreFocus`). These runs were also
  broken by the mouse's Back (fixed above). Crawler fix: with the mouse, check focus only when the hover took it.
- **dead-control "overview" (4: Book, BoxSet, Person, PhotoAlbum):** the click was on the head of the panel already
  on show, which changes nothing by design (as a selected tab).
- **dead-control Previous / Next in the book reader (2):** this is jellyfin-web's own reader on the one-page test
  document, so there is nothing to turn to.
- **dead-control audio actions (5: MusicAlbum "1. A440" and Shuffle; MusicArtist Shuffle, Play all, Instant mix;
  keys):** Play all had already started the album. These start or restart audio and change nothing on screen by
  design: the song line under the clock already showed the song. A host walk with sound should confirm.
- **dead-control on the panel's own section tab (3: Play on on /home and /music, Watch together on PhotoAlbum):**
  activating the section already shown redraws it the same.

## For the other forks (shared kit)

Arcade, Lumen, Mosaic and Orbit have the same `views.js` deck (fillPanel focus, keepAt) and the same `panel.js`
levels (click on the level under). Their `.hr-pnav` placement needs checking against their own tabs and clock. The
home fixes (fold, wheel, adopt, Back memory) are in Harbor's own `harbor.js`. The engine fix covers every theme's
overlay.

## For a host walk

- The mouse's Back button with the options panel open, through Qt's goBack: does the Navigation API cancel the
  traversal (the panel pops and the screen stays), or does the panel close as the screen goes back?
- The home with a mouse: wheel over the menu and the shelves, hover and click off-screen entries, Back to the same
  poster.
- The new pointer bar's place on now playing (music), the guide and the sign-in screens.
- Unexplained, not touched: an unstyled "OK choose Back" line top left on the inner screens and bottom left on the
  home in several screenshots (for example mouse/list.png, finding_018). It doesn't match any `D.hints` output.
