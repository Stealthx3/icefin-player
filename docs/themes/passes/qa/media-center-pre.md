# media-center: QA pre-pass (D40, D41)

The lab walk `iwalk-pre3/media-center` (input_walk.py: keyboard, mouse and an Xbox pad, 15 minutes each, no stock
control), read on 2026-11-17 against main 46695eb5 (fixes #200 to #203 in). This pass covers the high and medium
findings: back-focus 48, dead-control 21, broken-back 6, script-error 5, walk-error 5, unreachable-by-input 3, plus
focus-lost 2 and no-focus-indicator 2. Required-missing (36), shift-tab and hover-no-focus (low) are left for the
next walk.

Commits: theme `27162644` (theme/media-center); engine `e1139668` (fix/qa-pre-mc-engine, from origin/main). The
mouse's Back button over an overlay is fixed by Harbor's engine branch, `b73c5caf` (fix/qa-pre-harbor-engine).

## Fixed

- [x] **walk-error (5, pad):** the pad's dialog pass on the Tasks row's "close" tile pressed Yes on "Close IceFin
  Player?". The app quit, the walk's connection closed, and the next five screens failed. The tile's label was just
  "close", which reads as closing a dialog, so the walk's quit rule didn't match it. It is now named Close IceFin
  Player (aria-label; the tile still shows "close"). Screen readers get the same name. `themes/media-center/start.js`.
- [x] **back-focus, home (38: keys 19, mouse 9, pad 10):** the start strip always focused its first tile when it
  mounted, so Back from Settings, a channel, a library, Search or a film landed on the first Live TV channel. kit.js
  now remembers, for each history entry, the last control focused or clicked on it (`M.backFocus`, like Plaza's
  `P.backFocus`). On Back, that control gets the focus once it is drawn. The strip asks for it before it lays out
  (`M.returnTo`), so it slides once. Tiles are matched by item and row (`data-mc-group`), links by label.
  `themes/media-center/kit.js`, `themes/media-center/start.js`.
- [x] **back-focus, Program info (Back to guide, mouse):** after Back from the guide, the focus went to Watch now.
  The same memory fixes it. The wall and the library screens also use it when no poster flies home (an item without
  art, a tab, Sort). `themes/media-center/kit.js`, `wall.js`, `library.js`.
- [x] **dead-control, home, mouse (Aurora Nature, Summit Science):** hovering a tile focused it, and its row then slid
  the tile to the lens, out from under the pointer, so the click hit a gap (finding_022: the click at x 980, the tile
  at 750). Focus from the pointer no longer slides a row while the tile is in view. A closed row's title now opens
  that row, and the wheel moves one row at a time; before this, the mouse could not reach any row but the first.
  `themes/media-center/start.js`, `styles.css`.
- [x] **broken-back from Play on (keys: Book, PhotoAlbum) and no-focus-indicator on its tabs (keys: Book,
  PhotoAlbum), with the follow-on back-focus (4: Play on, Watch together) and dead-control "Play" (PhotoAlbum
  dialog):** over jellyfin-web's own page, no themed screen is current. The engine's keydown handler returned before
  the overlay saw the keys. Escape reached the theme's page Back, which left the page with the panel still up.
  The arrows moved a native focus under the panel: its tab kept the ring it had when it opened, and the walk's
  "Play" was the page's own button under the panel. The keys now drive the overlay there.
  `native/icefin/themeEngine.js` (fix/qa-pre-mc-engine).
- [x] **broken-back from Play on (mouse: /home, /details [TvChannel], /livetv) with the follow-on back-focus (2) and
  focus-lost (2):** the mouse's Back button went to the web view's history, so the screen went back and the panel
  stayed open over the previous page. Fixed in the engine by fix/qa-pre-harbor-engine (`b73c5caf`, capabilities.js):
  a history Back while the overlay is up now closes the overlay instead.
- [x] **dead-control Look again (3, pad):** it redrew the same list. It now says when it looked ("Looked again at
  7:34: …") and keeps the focus on itself. A chosen tab keeps the focus too; before, the focus went back to the
  first tab. `themes/media-center/itemmenu.js`.
- [x] **dead-control Watch together row (mouse, /home dialog):** the group you are in was a focusable row that did
  nothing. It is now a line of text, not a control. `themes/media-center/itemmenu.js`, `styles.css`.
- [x] **dead-control Other showings (mouse, channel):** with nothing else in the guide, it gave only an error sound.
  It now shows only when there are other showings; the list's note already says when there are none.
  `themes/media-center/programme.js`.
- [x] **dead-control Play, Shuffle (keys, MusicAlbum):** the music played, but the screen covers jellyfin-web's
  now-playing bar, so nothing showed. Play, Resume and Shuffle on an album, artist or song now show a notice
  ("Playing Test Tones"). `themes/media-center/details.js`, `panel.js` (a quiet notice). The walk reads only the
  theme's root, so it may still list this; the notice sits on the page body.

## Judged not real

- **back-focus on Back after Play, /details [Movie] and [Video] (keys):** the test clips last 10 s and 6 s
  (tests/icefin/servers/make-media.sh). Each clip ended during or before the walk's player pass. The details screen
  came back with Play focused, and the walk's remaining Left presses moved the focus to Back (finding_033 shows
  "Played ✓" and Back lit).
- **dead-control on the panel's own tab, "play on" (9: /home, /music, /homevideos, /livetv, /books, channel, Book):**
  pressing the tab that is already shown redraws the same tab, as with any selected tab. It now carries
  `aria-pressed`.
- **script-error "Invalid page request." (Resume on the Book, keys and pad), "Timed out while waiting for 'ready'
  event! Seeking to …" (Previous in the reader), "Error while waiting for `playbackstart`…" (Book):** these come from
  jellyfin-web's own PDF reader and playback manager on the one-page test document (pdf.js rejects the resume page).
  The theme only frames that page.
- **dead-control Previous in the book reader (keys, pad):** this is jellyfin-web's reader on the test document, which
  has no earlier page.
- **back-focus "Play" after the reader (pad, Book):** jellyfin-web's own details page redraws itself when its reader
  closes. The focus lands on its new Play button, which has the same label as the old one.
- **script-error "Script error." (keys, during the player pass after Play on the film):** a cross-origin error with no
  source. The same message shows when video starts in other themes' walks (Plaza's cal2 Play all, Baseline's pre2
  Play All). No uncaught path was found in Media Center's player (its update, onAction and onBack run inside the
  engine's guards). Needs the host walk with the app's console log to name the script.

## Needs the host walk

- [x] **broken-back, Classic home (pad):** Back stayed on `#/home?icefin=stock` after six presses. Engine #200
  (stockRootBack) should handle it, and the keys and mouse runs never opened Classic home. The lab build is dated
  2026-11-16 and #200 merged that day at 15:53, so recheck with a build known to include #200.
  Closed: in pass 3's re-walk 2 (build with #200) all five pad runs opened Classic home and a book from it, and
  none reported Back there.
- [ ] **unreachable-by-input (pad, Book's framed details: Home, Back, Add to favorites):** the engine's framed-page
  navigation should reach the frame's Home and Back (up, then left). Plaza's pass has the same open item for Add to
  favorites. Recheck with the focus trace.
  Traced in pass 3's re-walk 2: every pad run reached the frame's Home and Back and the book's Play, Mark played
  and More, never Add to favorites or Download. The engine's picker skipped a neighbour the focused button
  overlaps by a few pixels (it scales up): engine #225, checked in the app before it merges.
- [x] The pointer on the start strip (a closed row's title, the wheel, a tile that stays put on hover), and the
  notice when music starts from a details screen.
  Closed: a closed row's title is the pointer's own button and the wheel turns the strip (pass 2, the walker in
  pass 3); the notice shows for Play, Shuffle, Resume and Instant mix and for a playlist of songs (pass 3).
- [ ] Mouse Back over a panel on the real app, where Qt's event filter sends the button to the web view's
  `goBack()`. The Navigation API path in b73c5caf should catch it.
  Still open: the walker's mouse Back is a DevTools event the page gets directly, so Qt's path isn't walked. To
  check with a real button press on the lab's display.
