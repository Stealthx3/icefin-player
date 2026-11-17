# almanac: QA pre-pass (D40, D41)

The lab walk before pass 1: input_walk.py with keys, mouse and an Xbox pad, 15 min each (iwalk-pre2, no stock control),
on theme/almanac with main merged in (engine #200 to #203). 249 high and medium findings. Most come from a few causes,
so each line below covers a group. Fixed on theme/almanac; no engine change was needed.

## Findings

Fixed:
- [x] Back to a screen focused its lit cell, not the tab that opened the next screen (about 190 back-focus findings:
      every tab from Home, the libraries, details, Live TV's rows and the guide). The screen now files the tab or the
      pointer-line button that opened the next screen under its history entry (the Navigation API's key). Back to
      that entry focuses it again, and the strip keeps focus when the libraries arrive late. A new visit still starts
      on the rows. Files: grid.js (`S.opener`, `S.back`), guide.js (`opener`), kit.js (`D.entryKey`, `D.isReturn`).
- [x] Back to a cell past the first one in a folder row (a library on the home, a film under Recently added) lit the
      row's first cell. While the row reloaded, its one placeholder cell clamped the saved column to 0. A row that is
      still loading now keeps the column until its cells arrive (grid.js `drawRows`, `colIn`).
- [x] With the mouse, Back put focus on whatever cell sat under the resting pointer. The cells took focus on
      `mouseenter`, and the browser sends that when a screen is drawn under a still cursor. Cells and tabs now follow
      only a pointer that moves (`mousemove` with movement), as the engine's pointer-first rule does (grid.js).
- [x] The pointer's line (Options, Play on, Watch together) and the server button never took focus on hover. After
      their panel closed nothing was focused (focus-lost and hover-no-focus on Options, Watch together and the server
      button). A pointer that moves onto them now focuses them without making them stops for the arrows. They get the
      lime focus look, and Back to the home from Choose a server focuses the server button again (kit.js
      `D.pointerFocus`, home.js, styles.css). On the guide, an arrow from the line goes back into the guide.
- [x] OK on the tab you are on did nothing (dead-control on Movies, Music, Shows, Books, Collections, Photos and Live
      TV on their own screens). It now goes into that screen's rows, or back to its top level from a nested one (grid.js
      `C.home`).
- [x] The guide's "No information" cells did nothing on OK, and Options did nothing on them: the engine's guide
      grid skips gap cells. OK on a gap that is on now watches the channel. Otherwise, and on Options, a panel
      offers Watch and the channel's own programmes (guide.js `selectGap`, `channelOptions`).
- [x] A panel stayed open over the page that history went back to (4 broken-back with the mouse: a level pushed in
      the item options or Add a server, then Back). The panel now closes when the route changes under it. A route the
      panel itself opened on keeps it (panel.js). The walker also reads a popped panel level as "no change" and falls
      back to `history.back()`. That part is the walker's, and with this fix the walker's fallback no longer leaves
      the panel over the next page.
- [x] The rows of a panel level under a pushed one (Find subtitles…, Edit details…, Copy stream URL under Media
      info) did nothing when clicked. That level is inert by design and shows as a faint trail. A click on the trail
      now goes back to that level (panel.js, styles.css).
- [x] Closing a panel after the screen redrew the control it opened from (a row that loaded meanwhile) left nothing
      focused. The screen's lit place takes focus then (panel.js unmount, grid.js `C.refocus`).
- [x] Watch together's "You are in" line (the group's name) was a focusable row with no action (dead-control). It is
      a plain line now (itemmenu.js).

Judged not Almanac's:
- Script error "Error while waiting for `playbackstart` event! … Timed out" on the pad run's first press (the Guide
  tab, which only navigates). This is jellyfin-web's playbackManager timing out on a play started earlier in the
  session; the lab has no live stream.
- Script error "PlayerMedia: Error in updateQueueState: player cannot be null" on a book's Continue reading. It comes
  from jellyfin-web's own PlayerMedia while its book reader opens. The theme only calls `T.ctx.play`.
- Previous and Next in the book reader (/details [Book] (dialog)): jellyfin-web's own reader, and the lab's test book
  has no other page to turn to.
- Back-focus on Play after the capability prompt (/details [Movie], keys and pad). That prompt is the engine's
  (capabilityPrompt.js, jellyfin-web dialog markup holding DOM focus), and the screenshot (keys/finding_029) shows
  Play lit and focused after it closes. While the prompt was up the walker read the engine's focus (Play) as the
  dialog's only row, so its comparison doesn't hold. Recheck on the host walk.
- Focus-lost and hover-no-focus on the home's Guide tab with the mouse: the run's very first pointer event. The
  engine's pointer-first rule ignores an event with nothing to compare against.
- Dead "Guide, what's on, along time" on Live TV's rows (pad): pressed while the channel play from the step before was
  still pending (it timed out; see the first script error). The entry only navigates to #/livetv, and the next press
  (Schedule's "Open the guide", the same navigate) opened the guide. Recheck on the host walk.
- Back-focus on Add a server after its dialog: a follow-on of the broken-back above, the walk having passed through
  /livetv?al=rows with the panel still open.
- [ ] Focus-lost with the mouse after Back from the player (/livetv?al=rows: Guide, 4 · Lantern Movies). The
      screenshots show the screen still fading in, with the pane empty and the lit cell half drawn, so the check ran
      before the remount finished. No cause found in the code; recheck on the host walk.
- Low findings (Shift+Tab on the rows) are left for pass 1: Almanac's rows take the arrows, not Tab.
