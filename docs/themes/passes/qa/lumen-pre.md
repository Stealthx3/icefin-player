# lumen: QA pre-pass (D40, D41)

From the lab walk of input_walk.py `iwalk-pre3` (keyboard, mouse and an Xbox pad, 15 min each; no stock control in this
walk, so findings on jellyfin-web's own pages may be jellyfin-web's): 26 high and 72 medium findings (back-focus 51,
focus-lost 22, dead-control 21, broken-back 3, script-error 1). Engine fixes #200 to #203 were already in main; broken-back is the engine's #204. No
engine change was needed for these: every fix is in Lumen's own files.

## Fixed

- [x] **broken-back (3, mouse)**: Back from the item options ("HDR10 HEVC AC3 (2026)", "Test Tones", "IMG_101") ended
      on another screen with the panel still drawn over it: the mouse's Back button is the web view's history Back,
      which never reached the overlay. Fixed by the engine, #204 (capabilities.js): while ui.overlay is up, a history
      traversal is cancelled and taken as the overlay's Back (a panel's next level first, through panel.js's own
      onAction), or the overlay closes where it can't be cancelled. Lumen's sidebar, quick settings and options panel
      are all ui.overlay, so all three are covered.
- [x] **focus-lost after Back (22)**: the screens drew again from the server after Back, with nothing focused until
      the data came (the walker found no focus for 250 ms), and the details deck lost its section's entry. Lists,
      libraries, Settings and the home's lists draw at once from what they showed and read the level again behind it,
      drawn again only if it changed (views.js `lv.stale`, `refreshLater`); details draw the kept item and its state
      at once and read the item again (details.js); a deck section's level is kept with its entry (views.js
      `p.entry.lmLevel`). The kept levels are only reused for the user who saw them. Covers "Open the sidebar after
      Back from … (dialog)" on Home, Settings, Shows, Music, Books, Photos, Collections, Playlists and the details
      pages, and the artist cards on an album after Back from the artist. "Options" and "Play on" after Back from
      their dialog (mouse) followed from the broken Back above.
- [x] **back-focus on Home (35 of the 51)**: the home always focused the hero's Play (or the first row's first card) when it
      came back. It now returns to the entry that left it, per history entry: the hero button and featured item, or
      the row's card by its item (lumen.js `describe`, `restore`, with kit.js `D.entryKey`, `D.keep`, `D.kept`); the
      rows draw at once from the last load. A new visit to Home still starts at the hero.
- [x] **back-focus on lists after the mouse's Back (Settings › Home → Display, On now → "6 · Copper Docs")**: a list
      drawn again under a resting pointer took the mouse events of the redraw as hover and moved focus to the row
      under the window's centre (where the mouse's Back is pressed). Only a pointer that moved takes focus now
      (views.js, `mousemove` with movement, as the engine's pointer-first rule).
- [x] **back-focus on a collection's or an item's details (Play all, Shuffle, the films; Subtitles → Play)**: the
      deck kept its section but not the entry in it, and a choice in the panel (subtitles, audio, version, the
      favourite and watched marks) redrew the item from its first action. The deck keeps, per section, the entry used
      (views.js `remember`, `deckMemo`, copied by `replaceTop`; `sync` keeps the section focused from outside).
- [x] **back-focus on Live TV (Schedule, Series, Channels → "No information")**: Back from a tab's page focused the
      guide's grid. The guide returns to the tab that left it (guide.js, kept per history entry).
- [x] **dead-control "No information" (3, every input)**: a guide time with nothing listed (a channel with no guide
      data, all of the lab's) took no OK or click. OK on it now watches the channel when the time is now, and says
      nothing is listed for a later time (guide.js).
- [x] **dead-control "Find subtitles…", "Edit details…", "Copy stream URL" (mouse)**: with Media info open, the options
      under it showed past its edge but took no click (`pointer-events: none`). A row of a level under the top one
      now brings that level back and does what it does (panel.js, styles.css).
- [x] **dead-control "Options" on Settings and Shows (mouse)**: the pointer's Options acts on the focused entry and did
      nothing where that has none. It says so now (kit.js `pointerNav`).
- [x] **dead-control "Next" on Home (pad)**: with one featured item, Next paged to the same item. Next shows only when
      there is another (lumen.js).

## Judged not real

- **Pad A on Play (hero, details), Play all and Shuffle (collection) "did nothing"**: the same controls open the player
  with the keyboard and the mouse in the same walk (hero Play → /video with keys; details Play → /video with the
  mouse), through the same click handler; only the pad's press to play gave nothing, as on Plaza's pass. Not in
  Lumen's code; recheck on the host walk (below).
- **Songs: "1. A440", "E660", Shuffle, Instant mix (keys, pad)**: they play music, which leaves the screen as it is
  (the song line under the clock follows within a second); the walker had started the same songs just before, so a
  restart showed no change. Recheck the first press on the host walk.
- **"Play on" in Play on · Watch together (mouse)**: the tab already showing; a click on it keeps it.
- **"Collections" on Movies → /music (keys)**: the walker's replayed path (◀ ▼ OK) opened the sidebar from the
  first tab (◀ at the left edge opens it, by design) and chose Music there; Back then returned to Movies' list, where
  the walker had last been. The Collections tab itself was never pressed.
- **Back from /video to the hero's Play (keys: focus on "Shows")**: the film played to its end and left Continue
  Watching, so the hero (and the button that opened the player) was gone when Home came back.
- **script-error "Script error." (keys, Home › Play SDR AV1 Opus)**: a cross-origin error with no message or stack,
  raised while playback started; nothing points at Lumen's scripts (theirs carry their file and line). Recheck with
  the console on the host walk.

## Needs the host walk

- The mouse's Back with the sidebar, quick settings or an options panel open (closes it, or the panel's next level,
  and stays on the page; engine #204).
- Back focus on Home, the libraries, details decks and the guide's tabs with all three inputs.
- The pad's A on Play, Play all and Shuffle; the first press on a song; the script error with the console open.
- Low findings not taken here: hover-no-focus on the pointer line and the sidebar pill (they are pointer controls,
  not in the pad's focus order), obscured (the details' section heads under their panels), Shift+Tab.
