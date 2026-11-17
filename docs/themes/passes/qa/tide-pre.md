# tide: QA pre-pass (D40, D41)

From the lab walk iwalk-pre4 (input_walk.py: keys, mouse, pad-xbox, 15 min each), on main after Tide's pass. The walk
reached 3 screens (the home, Choose a server and its panel) and ended with budget left on every input: 72 of its 89
findings were "required-missing" with one cause, the home was a dead end for the walker. The lab's screenshots are
blank (white) for Tide, so the traces and report.json were read instead.

## Why the walk got stuck

- **Keys and pad never activated anything on the home** (every control "unpositioned"). The cross bar draws only the
  current category's column, about 17 entries in a window around the fixed point, and rebuilds it on every category
  step. A control the walk found in one category was gone from the page once the walk had stepped elsewhere, so it
  could not be focused again, and replaying the presses from the first entry went wrong because each category keeps its
  own place. The categories themselves were not focus targets, and folders open in place on the same route, so OK only
  ever led to an "in-place" change (the pad's one activation, Series timers).
- **The mouse saw no entries at all.** Every entry was a zero-height button (its picture and name are positioned
  children), so it had no box to enumerate or click. Left of the screen edge the bar's categories can't be clicked
  (obscured ×6), and clicking the current category did nothing. The mouse reached only the server line under the clock,
  which led to Choose a server.

## Fixed

- [x] **The home was a dead end** (required-missing ×72, unpositioned ×4). The current category is now a control. ▲ from
      the first entry of its column (or Shift+Tab) focuses it, ◀ ▶ step along the bar with the focus staying on it, and
      ▼ goes back down. OK or a click opens the category's own screen: Settings opens the preferences, a library its
      own route (`#/movies?topParentId=…`, `#/tv…`, `#/music…`, `#/livetv`, `#/books…`, `#/homevideos…`, `#/photos…`,
      `#/boxsets…`; playlists and folder libraries `#/list?parentId=…`, as jellyfin-web links them), and Search opens
      search. A click on another category still chooses it. The categories' elements are kept while the bar is up, so
      a step slides them (240 ms, the MotionTimings category step the rebuild had cut) and a category is the same
      element after the step. The focused category gets its glow and its name lit, and the column's entry goes quieter
      while it has focus. (column.js `drawBar`, `toCat`, `toColumn`, `openCategory`; home.js `go` per category;
      library.js `D.libraryHash`; styles.css `.td-cat.current.icefin-focused`, `[data-td-at]`)
- [x] **Entries had no box** (the mouse never saw them). Each entry is a real box around its picture and name now,
      centred on its line (the slot pitch, the focused one 11.6 vh), with its picture and name placed as before. The
      screen clips instead of hiding its overflow, so a scrollIntoView or a focus can't scroll it. (styles.css `.td-e`,
      `.td-e-thumb`, `.td-e-text`, `[data-td-screen] overflow: clip`)
- [x] **A focus asked for from outside did nothing useful.** When the engine focuses an entry off the fixed point, that
      entry comes to the fixed point. A category other than the current one becomes current, with the focus on it.
      This covers a tool, the walker's positioning or an assistive technology. (column.js `icefin-focus` listener)
- [x] **Back lost the control that opened the next screen** (focus-lost ×1: the server line after Back from Choose a
      server). Where focus was (the entry, the category or the server line) is kept with the column's stack. Back lands
      on the same control. The server line is a focus target now (a hover focuses it). A screen kept in memory is drawn
      at once from what it showed, focus included, and redrawn only when the fresh list differs; before, it was blank
      until the server answered. (column.js `load`/`show`, `restoreAside`, `save`; home.js `.td-server`)
- [x] **Back did nothing on Choose a server opened from the home** (keys and pad; found reading the code, as Arcade's
      walk found it). Signed in, Back returns. Signed out, there is still nowhere to go back to. (account.js `leave`, column.js
      `leave` may be a function)
- [x] **Shift+Tab did not move focus back** (shift-tab ×1). Tab went through every entry's button, invisible ones
      included, while the visible focus stayed put. Only the focused entry is a focus target now (`tabIndex -1` on the
      rest), and on a column screen Tab and Shift+Tab step the column as ▼ and ▲. (column.js `entryEl`, kit.js `D.keys`)
- [x] **broken-back ×2 (mouse): Back from the Play on · Watch together panel ended on the home, the panel still
      open.** Tide's panel is the engine's ui.overlay, so the mouse's Back button over it is the panel's Back since
      #204 (merged 14 min before this walk; the lab build may not have had it). Nothing Tide-side; recheck in the next
      walk.

## Judged not real

- **obscured ×6 (mouse: Settings, Live TV, Movies, Music, Shows, Books).** These categories lay left of the screen
  edge, the walker clicked at x = 1. The bar slides so the current category stays at the fixed point (the layout).
  A category off the edge comes in with ◀ or a click on the visible neighbour.
- **unpositioned ×4 (Continue watching, Guide, Home screen, Controls, "outside the viewport").** These were entries
  above the fixed point in the cross bar, which sit above the screen's top by design (the column scrolled past). They
  were also the consequence of the positioning failure above. A focus asked for now brings them to the fixed point.
- **dead-control, Play on (the panel's tab).** The tab already shown: choosing it changes nothing.
- **focus-lost ×2 on Choose a server (Options and Play on in the pointer's line, after Back from their panel).** Those
  buttons are pointer-only and never take the engine's focus. The walker judged them because nothing held the engine's
  focus when it hovered. On a column screen that happens only while a column waits for the server with nothing drawn,
  which is the blank state the instant redraw above removes for screens kept in memory. Recheck in the next walk; if it
  persists, the Servers column load is the place to look.

## What the walker still can't do (input_walk.py, not Tide)

Folders open in place on the same route in Tide: a level pushed into the column, with the trail on the left. The
walker records that as "in-place" and neither explores it nor presses Back. Every control after it on that screen is
then unpositioned. With the fixes the walk reaches every library route, the preferences menu and its pages, search,
and details through items listed straight in a column: collections, playlists, a collection's films, search results,
cast. Details of a Series, Season, Episode, MusicAlbum or MusicArtist sit behind folders (All shows, Albums, Artists).
The walker would need to treat an in-place change that Back undoes as a sub-screen: explore it, then Back.

## Needs the host walk

- The cross bar with the category focused: ▲ from the first entry, ◀ ▶ along the bar (the slide, now animated), ▼,
  OK into each library and Back onto the same category; the look of the focused category against the column.
- The mouse on the home: clicks on entries above and below the fixed point, the current category's click, hover over
  the server line. Check nothing scrolls and that a click outside the picture and name but inside the row opens the entry.
- Back to the home and to a library from details: drawn at once, no flicker when the fresh list arrives; a watched mark
  or progress updates after the refresh.
- Tab and Shift+Tab on the home and in a library; Tab in search's field still types.
- Choose a server from the home: Back returns (keys, pad, mouse).
