# Theme completeness checklist

What a bundled theme has to do before it counts as **complete**: everything Plaza does, written so another theme can
follow it item by item (the user, 2026-11-12). Plaza is the first theme taken all the way (PLAN 9.32, 9.37, 9.41–9.44,
9.33, and the controller walk of 2026-11-12); Media Center followed (9.46). This page is the list of what that took.

How to use it: copy the list into the theme's pass (`docs/themes/PIPELINE.md`, when it lands with PLAN 9.47), tick
an item when the theme does it **in its own look** and its test checks it, or write the user's reason beside it when
the theme leaves it out. "Plaza" in each item says where Plaza does it, for reference; read it for what, never copy
its look (each theme keeps its target's layout, proportions, navigation, timing and colours, and nothing else of the
target's: CLAUDE.md, clone rules).

Two rules run through every section:
- **Every function stays.** A themed screen does everything jellyfin-web's page does (PLAN 9.18, D30). When the theme
  can't draw something, jellyfin-web's own page or control is used, in the theme's frame, never a dead end.
- **Every input works everywhere.** Controller, remote, keyboard and mouse reach and use everything (section A).

---

## A. Input: controller, remote, keyboard and mouse
- [ ] **Everything the mouse can use, the pad reaches.** Every control with a click, pointer or mouse handler, on
      every screen, card and dialog, can be focused with the D-pad and used with A. Nothing is mouse-only (the user,
      2026-11-12: the home's server button). Plaza: every interactive element is `P.focusable` (`[data-icefin-focus]`).
      Check: `plaza_reach.py`'s mouse comparison (DevTools listeners against the pad's reach; the test lands with the
      controller walk's fixes).
- [ ] **Everything the pad reaches by presses alone.** From each screen's first focus, the D-pad reaches every control
      (no control only reachable by the pointer or by a jump); rows that page turn the page at their edges; Up and Down
      leave a row for the bar and back. Check: `plaza_reach.py` (a virtual Xbox pad through SDL3, presses only).
- [ ] **The focused control always shows it**, for the pad, the remote and the keyboard, and the pointer gets its own
      hover look, on every screen. Watch for: a resting `box-shadow … !important` blocking a focus `animation` (draw
      the glow on `::after`), focus styles keyed only to `.icefin-focused` on jellyfin-web's pages (use `:focus` there
      too), a glow cut off by its container (Plaza 9.44: "room for the focus glow"). Check: screenshots of each focused
      control with and without focus (`plaza_reach.py`).
- [ ] **Nothing looks clickable that does nothing.** A pointer cursor, a button shape or a status card that invites a
      click either acts or doesn't look like it acts. Plaza: the server status card opens Choose a server.
- [ ] **Back works everywhere**: closes the open card, picker or dialog first, then leaves the screen; on the home it
      does nothing harmful; keyboard Escape and Backspace do the same.
- [ ] **Menu (≡) opens the item menu** on any item in the theme's grids and on the details page.
- [ ] **Text fields**: moving onto one with the pad or remote opens the on-screen keyboard (`ui.keyboard`), in the
      theme's look; B closes it; a physical key closes it.
- [ ] **Controller hints** (PLAN 9.28): a hint line in the theme's style (Ⓐ Select · Ⓑ Back, and what ◀▶ or ≡ do on
      that screen), shown only while a pad or remote is in use (`ui.pointerFirst`), gone with the mouse.
- [ ] **Pointer-first moves**: a channel or row item can be dragged where the target allows it; long-press equals
      Menu. Plaza: channels move by hold or drag, or Menu with a pad (9.41, `plaza_move.py`).
- [ ] **On jellyfin-web's pages in the theme's frame**, the pad moves over the page and the frame together (the
      engine's navigation on framed pages): the frame's tabs, Back, Home, Play on and Watch together are reachable and
      show focus.

## B. The look: package, tokens, sound, motion
- [ ] `theme.json` complete: id, name, version, description, styles, scripts, `sounds`, `music`, schemes
      (`docs/themes/PACKAGE.md`, the schema in `docs/themes/schema/`).
- [ ] Tokens for every colour the engine and the theme use (`docs/themes/TOKENS.md`); a **dark** scheme (PLAN 9.20);
      every text and control pair passes the contrast check in both (`icefin-hooks`).
- [ ] Geometry from the reference capture at 1080 lines (`docs/themes/references/<id>.json`), scaling to wider
      screens (more columns, not stretched cells) and to 4K; `clone_layout.py --theme <id>` passes.
- [ ] **Sounds** (PLAN 9.31): focus, select, back, navigate, error, synthesised from the theme's recipe in the
      target's character, nothing recorded from the target.
- [ ] **Music** (PLAN 9.33): a startup jingle, a gapless ambient loop that ducks under jingles and stops while anything
      plays, and jingles where the target has them (Plaza: one per channel kind). Original, from recipes; Client
      Settings' Theme Jingles, Background Music and Music Volume apply; silent during passthrough.
- [ ] **Low motion** (`ui.motion.reduced()`): illustrations and pulses stop, page turns cut instead of sliding.
- [ ] Original illustrations and icons only; the server's branding where the target shows its own (PLAN 9.27).
- [ ] The default stays stock: with no theme chosen Icefin is stock jellyfin-web, sign-in included; the theme's own
      sign-in shows only when it is the signed-out theme.

## C. Home
- [ ] The target's home layout: every library, Continue Watching, Next Up, favourites (Plaza: channels, three rows,
      pages peeking with arrows, a curved bar with the clock, date, Settings, Search and the server card).
- [ ] Each library shows what it is (Plaza: an animated illustration under its name with its newest art); Continue
      Watching and Next Up show the item's art.
- [ ] A preview or focus state where the target has one (Plaza: the channel zooms into a framed card with Open, Home,
      Play for favourites, the neighbours by ◀▶); muted previews where the target plays them (`ui.mutedPreview`).
- [ ] The order is the user's (Plaza 9.41: moved channels, gaps kept, per user on this device; Settings › Home lists
      them with switches and ≡ to move them).
- [ ] The server's status and a way to **Choose a server** from the home.
- [ ] The music capsule while music plays, reachable with the pad (Plaza: over the top of the home; Up reaches it).

## D. Libraries, lists and search
- [ ] Every library type has a themed screen: movies, shows, music, Live TV, home videos and photos (by day), books,
      music videos, collections, playlists (with New playlist), mixed libraries, and the lists under them (genres,
      studios, people, tags) (Plaza 9.32, 9.42: `menus.js`, `#/list`, `#/movies`, … registered on jellyfin-web's
      own routes so any way there lands on the theme's screen).
- [ ] Sort and filter in a themed panel that keeps every option; tabs for the library's sections; tabs scroll when
      many.
- [ ] Grids page like the target, keep their cells at their own size, name every art cell (text or `aria-label`).
- [ ] Empty lists show a picture and a way on; Play all and Shuffle are buttons apart from the tabs.
- [ ] Search: a themed field with the on-screen keyboard, results by type, every result usable.

## E. Details (every type)
- [ ] Movie, series, season, episode, album, artist, playlist, collection, person, music video, book, photo album,
      programme: each with every function (play, resume, play from start, trailer, versions, audio and subtitle
      tracks, favourite, played, cast, seasons, episodes, tracks, items, filmography) (PLAN 9.18; Plaza 9.43 on
      `ui.details.screen`).
- [ ] Pickers (version, audio, subtitles) as the theme's own cards; tabs or another quick way to each section.
- [ ] A playlist's items move on its details screen (Menu, ▲▼, A), saved to the server.
- [ ] Albums and playlists show their tracks; a series its seasons and episodes, stopping clear of the bar.

## F. The item menu and its dialogs
- [ ] The theme's own item menu (≡ on any item, More on details) over a dimmed screen in the engine's modal overlay,
      every action the user may do (policy and item: CanDelete, CanDownload, administrators' edits): play from the
      start, add to a playlist or a collection, mark played, favourite, find subtitles, media info, refresh
      metadata, edit details, edit images, identify, copy stream URL, download, delete (Plaza 9.44, `itemmenu.js`).
- [ ] Each dialog those open, themed and complete (the playlist and collection choosers with New, the subtitle
      search, media info, refresh options, the edit forms, identify, delete's confirmation).
- [ ] jellyfin-web's own dialogs, action sheets, pickers and context menus that still appear (plugins, rare paths)
      in the theme's look and controller-friendly (PLAN 9.38), Icefin's capability prompt included.

## G. Live TV
- [ ] Channels (paged, with what's on and Next), a guide (`ui.guideGrid`: the day, NOW, programme cells), recordings
      and the schedule (series and timers), a programme's sheet with Watch, Record and its options.
- [ ] The themed connecting dialog while a channel starts, and its error notice with Try again (PLAN 9.35).
- [ ] Live playback keeps the theme's player controls (no seek bar to drag, Live in place of the end time, previous
      and next change the channel; section I).

## H. Music
- [ ] Now playing, the queue (play from a song, move and remove, Save as playlist, Clear) and lyrics (timed lyrics
      follow the song) as the theme's own screens (Plaza: `music.js`, `#/queue`, `#/lyrics`).
- [ ] Shuffle, repeat, instant mix; the music capsule on the home and on framed pages.

## I. The player
- [ ] The theme's own controls (`ui.player.set`, D30): the title with Back at its left and when it ends; the time
      line (◀▶ moves it while focused; click or drag seeks; chapter marks); previous, −10, play or pause, +30, next;
      audio, subtitles, chapters, Watch together, Play on, More (speed, aspect, subtitle timing, repeat and shuffle,
      playback info, jellyfin-web's own controls). jellyfin-web's header hidden under them.
- [ ] Pickers as the theme's cards over the video; Back closes a card, then hides the controls, then leaves.
- [ ] The controls fade while playing and come back with **any key, button or mouse movement**; they stay while paused.
- [ ] Skip prompts and Up next from the engine's compatibility archive above the controls (PLAN 9.36), reachable with
      Up.
- [ ] Whatever a plugin adds that the archive can't draw falls back to jellyfin-web's controls laid out by `ui.osd`,
      with the notice (9.45); a plugin button that every video gets (the in-player episode preview) doesn't count as
      an injection after a slow start (live TV).
- [ ] Readable at couch distance on 4K (PLAN 9.39); nothing of a page opened before playback shows above the video.
- [ ] Photos: the viewer framed, with the name, date, album and n of N; books: the reader's controls in the theme.

## J. Settings
- [ ] The settings hub (`ui.settings.screen` or the theme's own, PLAN 9.24): Client settings, the user's own (You:
      profile, display, home, playback, subtitles, controls, Quick Connect), Classic View, Classic home, Server
      dashboard (administrators), Exit Icefin; every tile shows focus and hover.
- [ ] Client Settings as a themed page with every section and its drop-downs (PLAN 9.22, 9.34).
- [ ] Settings › Home: what the theme's home shows, with switches and moving (Plaza `prefs.js`); jellyfin-web's home
      sections for Classic home.
- [ ] The other preference pages (Display, Playback, Subtitles, Controls) framed with tabs between them and restyled:
      rows, switches, ◀▶ spinners on drop-downs; they save where jellyfin-web saves.
- [ ] Profile (picture, password, Quick Connect) and Quick Connect approve (six code boxes, a number pad, Approve).

## K. Sign-in and servers (when the theme is the signed-out theme)
- [ ] Sign in: the server's listed people, Someone else, the password with the on-screen keyboard, Quick Connect's
      code; Choose a server (the device's servers, Add a server, Forget on ≡); Add a server.
- [ ] Without the engine's sign-in calls, jellyfin-web's pages in the theme's frame.

## L. jellyfin-web's pages that remain, and the dashboard
- [ ] Any page the theme doesn't draw gets the theme's frame (`ui.stockChrome`: title, tabs where the page has
      siblings, Back, Home, Play on and Watch together) and its restyle under `html[data-icefin-stock="<route>"]`.
- [ ] The server dashboard and plugin pages stay stock: no frame, no restyle (`html[data-icefin-dashboard]`).
- [ ] Play on and Watch together reachable from the frame and the player (Plaza: one card, `playon.js`).

## M. Robustness
- [ ] Nothing focusable or readable runs past the window's sides, under the frame or under the bar.
- [ ] 16:9, wider windows and 4K: layouts gain columns rather than stretching; nothing overlaps (`clone_layout.py`).
- [ ] The server's custom CSS and plugins' injected UI don't break the theme's screens (Classic View is the escape).
- [ ] The engine stays theme-agnostic: nothing in `native/icefin/` names the theme or holds its values (theme lint).

## N. Tests a complete theme has
- [ ] `tests/icefin/web/theme_<id>.py` (the theme's screens and layout) and `clone_layout.py --theme <id>`.
- [ ] A reach walk with a virtual controller over every screen of this list: reach, focus shown, mouse comparison
      (`plaza_reach.py` is Plaza's; its walk and checks are generic, its screen list and resets are Plaza's).
- [ ] The player with the theme's controls (`theme_player.py` covers the engine; a `<id>_player.py` for the theme's
      own), the item menu and its dialogs, music, sign-in.
- [ ] A host walk of the finished theme on the user's server and the user's review of it against the mock-ups
      (the pipeline's Gate 2).
