# arcade: QA pre-pass (D40, D41)

From the lab walk iwalk-pre2 (input_walk.py: keys, mouse, pad-xbox, 15 min each, no stock control), on main after
Arcade's pass. The walk reached 12 screens and ended with budget left on every input: the home was a dead end. Its
pills only switched the feed in place, the main menu (every library, Settings) opens only from the guide button, F1 or
a long press of View, and the mouse had no control for it. Every library, the preferences and now playing were
therefore "required-missing" (61 findings with one cause).

## Fixed

- [x] **The home was a navigation dead end** (required-missing ×61; pad dead-control on the Live TV pill). OK, or a
      click, on the chosen pill now opens the whole of it: the library, the guide, Next up's or Favourites' list (What's
      new goes down to its cards). Every library has a pill, playlists and collections included, an empty one too.
      Focus chooses the pill, a hover too (pointer-first), and the pill hints say "OK open" (menus.js `openPill`,
      `feeds`). The pointer's line has a Menu button for the main menu (kit.js `D.pointerNav`, menus.js `D.openMenu`),
      and Settings comes before Play on in quick access (menus.js).
- [x] **No focus look on the top bar** (no-focus-indicator ×6: Search, Quick access, your picture). They had a hover
      look only; they take the pill's light fill now, your picture a light ring (styles.css `.ar-btn.icefin-focused`).
- [x] **The pointer's line covered the home's top bar** (mouse: Quick access opened Watch together, focus-lost on
      Quick access). It sits at the home's top left now, clear of Search and quick access (styles.css).
- [x] **Back to the home lost the control that opened the screen** (back-focus ×4: Search twice, the server button, a
      capsule; focus-lost after Back from a film or a channel ×2). The home follows whatever moved focus (pad, keys or
      a hover), remembers it (a capsule by its item, a pill, a top-bar button) and restores it; it is drawn at once from
      what it showed last and drawn again only when something changed, and it asks the server for every feed at once
      instead of one after another (menus.js `onFocused`, `build`, `D.homeCache`). A hovered capsule at the edge brings
      its row along, so the mouse reaches every capsule.
- [x] **The pointer hovered and clicked the wrong capsule** (hover-no-focus, focus-lost ×5 on Icefin Test Document,
      Icefin Test Book, 2026-05-02, 2026-06-14, SDR AV1 Opus): the rows move by transform, but scrollIntoView could
      still scroll their boxes, which the theme then snapped back. They clip now and never scroll (styles.css).
- [x] **The mouse's Back left an options panel open over the screen before** (broken-back ×3: Book and PhotoAlbum
      options, Add a server). The mouse's Back button goes straight to history. Fixed by the engine, #204
      (capabilities.js): while ui.overlay is up, a history step is the overlay's Back (Arcade's panel steps back a
      level or closes), cancelled where the Navigation API allows, else the overlay closes with it.
- [x] **Back stayed on Choose a server** opened from the home's server button (pad broken-back). Signed in, Back
      returns; signed out there is still nowhere to go (account.js, views.js `leave` may be a function).
- [x] **The pointer's Back did nothing on a screen's first level** (found while checking the above: libraries,
      details, Settings). It is the pad's Back now (views.js).
- [x] **Picking a track left focus on Play** (back-focus ×2: Subtitles, Off after its picker). A details redraw (a
      track, a version, favourite, watched) and Back from a screen opened from the deck keep each panel's place
      (views.js `remember`, `lv.memos`).
- [x] **Watch together's "you are in" row took focus and did nothing** (dead-control ×2). It is a line to read now
      (itemmenu.js).
- [x] **Low motion in quick access** (dead-control ×2): a switch drawn as a button. It says role="switch" and
      aria-checked now (menus.js); its knob did change, so the walker's reading was otherwise wrong.

## Judged not real

- back-focus, keys, /details Play after the capability prompt: focus is on the same Play (screenshot), only the
  walker's element path changed once the prompt left the page.
- focus-lost (mouse) on Search (first hover), Watch together and Options on /selectserver, Book and PhotoAlbum: for the
  mouse the walker reports focus-lost whenever the hover had not focused the control (the first mouse move is ignored
  by the engine's resting-pointer rule; the pointer's line buttons are not focus targets), whatever is focused after.
- dead-control Previous and Next in the book reader: jellyfin-web's PDF player on a one-page document.
- back-focus on Add a server: a consequence of the broken-back above (the walker reloaded the screen).

## Needs the host walk

- Whether the mouse's Back is cancellable there (Qt's goBack, engine #204): the panel closes either way, and the
  screen stays only when it is.
- Home after Back from playback: drawn at once from what it showed; confirm no flicker when the fresh data redraws it.
- Low: shift-tab ×2, obscured ×3 (the deck's pivot heads), hover-no-focus on the pointer's line, not worked here.

## Harbor kit ports

From Harbor's QA pre (a6454c91 on theme/harbor), where Arcade's forked kit had the same flaw:

- [x] **Ported: a deck panel that loads late took no focus** (Back to details left on Cast and crew or Songs: the
      panel drew after the deck and nothing was focused). The panel on show takes the focus when it loads (views.js
      `fillPanel`).
- [x] **Ported: the options panel's lower level took no click** (`pointer-events: none`). A click there brings that
      level back and runs the row (panel.js, styles.css `.ac-level-under`).
- Already covered: each deck panel's place kept in the level for Back and redraws (views.js `remember`, `lv.memos`);
  Back to the home landing on the entry that left it, hover included (menus.js `onFocused`); the home's rows can't be
  scrolled by a focus, so nothing is snapped back under the pointer (styles.css `overflow: clip`).
- Not taken: Harbor's pointer-line placement and Live TV route are Harbor's own layout; panel history is the engine's (#204).
