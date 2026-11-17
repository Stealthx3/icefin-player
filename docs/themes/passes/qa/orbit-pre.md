# orbit: QA pre-pass (D40, D41)

The lab walk `iwalk-pre4/orbit` (input_walk.py: keyboard, mouse and an Xbox pad), read on 2026-11-17 against main
cc36c20e (#200 to #204 in). This pass covers the high and medium findings: back-focus 39, dead-control 15, focus-lost 7,
no-focus-indicator 5, broken-back 3, script-error 2. Required-missing (34), shift-tab, hover-no-focus and unpositioned
(low) are left for the next walk; the mouse's required-missing mostly follows from the home below (one channel only).

Commit: theme only, on `qa/orbit`. No engine change was needed.

## Ported from Harbor (a6454c91; the shared kit)

- [x] **A deck panel that loads after the deck is drawn takes the focus** when it is the one on show (Cast and crew,
  Songs, Albums after Back). `themes/orbit/views.js` (fillPanel).
- [x] **Each panel's entry is kept in the level** (`deckMemo`), so Back to the details finds it after the remount.
  `themes/orbit/views.js` (keepAt; also carried over a favourite or track change, replaceTop).
- [x] **The options panel's lower level takes a click**: it goes back to that level and does what was clicked (it had
  `pointer-events: none`). `themes/orbit/panel.js`, `themes/orbit/styles.css`.
- [x] **Home Back focus per entry**: Orbit already kept the channel and tile (`#/home:orbit`), but from the channel last
  stepped to with ▲ ▼. See the home below.
- Not ported, not the same flaw: **scroll-into-view**. Orbit's home is moved by transforms inside `.ob-view`
  (`overflow: clip`, never scrolled) and nothing pins a scroll back, so there is no reset for the mouse to fall foul of.
- Not ported: Harbor's pointer bar move. Orbit's sits top left above its tabs (12.6 vh), away from the clock; on the
  home it covers the faint fourth channel title above (the three nearer ones stay clickable).

## Fixed

- [x] **back-focus, home (20: keys 9, pad 10, mouse 1):** focus given straight to a tile of another channel (the
  engine giving focus back, a jump) left the home's current channel where ▲ ▼ last put it, so Back went to that
  channel. A tile's focus now makes its channel the current one, and a click focuses the tile first. The account
  button (Choose a server) is remembered too. `themes/orbit/channels.js` (adopt, markChannel, remember).
- [x] **back-focus, details (13: BoxSet 8, MusicAlbum 4, PhotoAlbum 1):** the panel each entry was on was lost on
  remount (memo on the panel object), and a focus that reached another panel without ◀ ▶ didn't record the panel
  (`deckAt`), so Play all came back on the items panel. Ports above, plus `deckAt` kept in sync and deckGo.
  `themes/orbit/views.js`.
- [x] **back-focus, Movie Subtitles (pad, 1):** choosing a track redraws the details (replaceTop) and the front panel
  started on Play; its kept entry now carries over. `themes/orbit/views.js` (replaceTop).
- [x] **back-focus, Live TV guide Schedule and Series (4: keys 2, pad 2):** the tabs are other screens; Back to the
  guide focused the grid. The tab that left this history entry (Navigation API key) is focused again.
  `themes/orbit/guide.js` (tabBack).
- [x] **focus-lost, details, mouse (6: Audio Artist, MusicAlbum AlbumArtist and Artist, MusicArtist Test Tones, A440,
  E660):** the late panel (Harbor port).
- [x] **no-focus-indicator (5: Book and Movie More options…, Movie Play and Subtitles, MusicAlbum AlbumArtist):** the
  deck rested on an empty More like this and the focus was put on an entry of the hidden front panel, which shows no
  mark (`.or-dp:not(.cur)`). A focus inside a hidden panel (or any panel, by a pad or keys) now brings that panel in;
  a hover over a receding panel still leaves the deck still. ◀ ▶ pass empty panels, and a shown panel that loads
  empty hands over to the one before it. `themes/orbit/views.js` (icefin-focus on the stage, fillPanel, deckGo).
- [x] **dead-control in the options panel (3: Audio Edit details… and Copy stream URL, MusicAlbum Copy stream URL;
  mouse, after Media info):** the Harbor port.
- [x] **dead-control, guide "No information" (2: keys, pad):** the engine's gap cell ignores OK. A gap that is on now
  plays the channel; a later one gives the error sound. `themes/orbit/guide.js`.
- [x] **dead-control, home "Music, Open library" (mouse):** the tile left of the front one is clipped by design, and the
  mouse had no way to another channel at all (only the current one takes the pointer). The channel titles in view
  are clickable (a channel above comes to the front; the current one's title brings its first tile back), the wheel
  steps channels (sideways or with Shift: tiles), and the pointer bar has Guide (the places, Settings, Search).
  `themes/orbit/channels.js`, `themes/orbit/styles.css`.

## Covered by the engine

- **broken-back (3: Audio and MusicAlbum options, Add a server; mouse):** the mouse's Back went through history with
  the panel up. #204 (the overlay's Back). The back-focus on /selectserver's Add a server (mouse, 1) follows from it:
  the walker reloaded the screen after the failed Back.

## Judged not real

- **focus-lost after the pointer's Options (mouse, 1):** a pointer-only button with no `data-icefin-focus`; the
  crawler compares with the earlier focus anyway (as Harbor's note).
- **script-error, Book Read (2: "Invalid page request", "player cannot be null"):** jellyfin-web's book reader on the
  one-page test document, not Orbit's code.
- **dead-control, audio actions (3: Audio Play, MusicArtist Shuffle, Playlist Instant mix):** they start or restart
  audio already playing; the clock's song line already showed it. A host walk with sound should confirm.
- **dead-control, Watch together (mouse, MusicAlbum panel):** the "you are in" row shows the group (✓); it has no
  action by design.
- **dead-control, PhotoAlbum (keys, 5: Play all, Shuffle, IMG_101 to 103):** jellyfin-web's photo viewer covers the
  screen; the walker focused the details' entries under it and pressed Enter. Nothing visible can change. Whether
  keys and a pad reach the theme under the viewer is the engine's (foreign dialog); check on the host.

## For the crawler

- `rect` counts an ancestor of the control as "on top" (`t.contains(e)`): the clipped home tile was clicked at x = 1 on
  the screen root and reported dead, not obscured.

## For a host walk

- The home with a mouse: channel titles, the wheel, the Guide button, Back to the same tile and to the account.
- Details with a mouse: Back from a person or an album to Cast and crew or Songs; hover over receding panels (the
  deck stays); a pad's ◀ ▶ over an empty panel.
- The options panel: Media info, then a click on the level under it.
- The guide: OK on "No information" now; Schedule, then Back, lands on Schedule.
- PhotoAlbum: keys and a pad while jellyfin-web's photo viewer is up.
