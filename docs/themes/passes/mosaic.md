# mosaic: completeness pass

Copied from docs/themes/CHECKLIST.md at the start of the pass (2026-11-15, main 88103500). Tick an item
when mosaic does it in its own look and a test checks it, or write the user's reason beside it. Motion is judged by the six
principles (PIPELINE.md, The measure).

## 1. Themed elements: screens and surfaces

### 1.1 Home
- [ ] **The target's home** on `#/home`: every library, Continue Watching, Next Up and favourites, in the target's
      layout. Plaza: pages of channels in three rows (libraries, Continue Watching, Next Up, a Playlists channel when
      there is no Playlists library, one channel per favourite), `plaza.js`.
- [ ] **Home chrome**: clock and date (refreshed), Settings and Search buttons. Plaza: a curved bar whose notch is
      computed for the window width.
- [ ] **The server's status** on the home, and it opens Choose a server (with an `aria-label` that says so). Plaza:
      the server card, pinged every 60 s.
- [ ] **Each library shows what it is**: an original illustration or the newest art (section 4). Continue Watching
      and Next Up show the item's own art.
- [ ] **A preview or focus state** where the target has one, with its own actions. Plaza: the channel zooms into a
      card with a preview made for each kind (TV with what's on for Live TV, a fan of posters, a record and sleeve for
      Music, stacked seasons for Shows, discs for Continue Watching, a muted video for favourites), Open/Play and Home
      pills, and ◀▶ to the neighbouring channels.
- [ ] **Sub-views of the home** on the home route by query, so they share one registration (Plaza:
      `#/home?pz=series|resume|nextup|library|items|you`).
- [ ] **The order is the user's**: items move, gaps kept, per user on this device (section 2.6). Settings › Home
      lists them with switches.
- [ ] **The music capsule** while music plays, with prev, play/pause, next, open, and a seekable progress line.
- [ ] **Exit at the root**: Back on the home with nothing open asks "Exit Icefin?", with Cancel focused.

### 1.2 One frame for every screen
- [ ] **A shared frame** on every themed screen: the screen's name (Plaza: a name pill with the clock in it), tabs,
      the Now playing entry while music plays, content, and a bar with Back, Home, the focused item's caption and the
      hints. Plaza: `P.frame` in `menus.js`.
- [ ] **A colour per content kind**, used the same way everywhere: home tiles, the screen's name, sheet tabs, the
      player and jellyfin-web's framed pages. Plaza: 13 kinds with a gradient pair each.
- [ ] **Now playing on every framed screen**, stock pages included, not only on the home. Plaza: a pill that slides
      out from under the name pill and opens `#/queue`.

### 1.3 Libraries, lists and search
- [ ] **Every library type** has a themed screen registered on jellyfin-web's own routes, so every link lands in the
      theme: `#/movies`, `#/tv`, `#/music`, `#/livetv`, `#/search`, `#/list`, `#/playlists`, `#/homevideos`,
      `#/photos`, `#/books`, `#/musicvideos`, `#/boxsets`, `#/mixed`.
- [ ] **Section tabs** per library (Plaza: Movies / Collections / Genres / Favourites; Shows / Genres / Networks /
      Favourites; Albums / Artists / Songs / Playlists / Genres). Folder libraries open folders in place.
- [ ] **Drill-downs**: genres, studios, networks, people and tags (`#/list` from any of its keys), with Play all and
      Shuffle as buttons apart from the tabs.
- [ ] **Sort and filter** in a themed panel that keeps every option, and an **A–Z jump rail** on lists sorted A→Z.
- [ ] **Grids** page like the target and keep their cells at their own size. More columns on wider screens, never
      stretched cells.
- [ ] **Playlists** with New playlist (a name panel). **Photos and home videos** grouped by day, opening the viewer on
      that page's photos; Play starts the slideshow. **Books** always open with a start position (jellyfin-web's
      readers get NaN without one).
- [ ] **Series**: seasons as tabs. The season holding Next Up opens first, and focus starts on the first unwatched
      episode; episode rows show the still, progress, watched and a separate Details.
- [ ] **Continue Watching** and **Next Up** screens (Plaza: a disc rack with Resume / From start / Details; Next Up /
      Upcoming / Recently added).
- [ ] **Search**: a themed field, type filters (All, Movies, Shows, Episodes, Music, People), results, and the theme's
      on-screen keyboard.
- [ ] **Empty states**: a picture in the kind's colours, a hint and a way on (Plaza: a dashed shelf).

### 1.4 Details (every item type)
- [ ] Movie, series, season, episode, album, artist, playlist, collection, person, music video, book, photo album
      and programme, each with every function: play, resume, from start, trailer, versions, audio and subtitle
      tracks, favourite, played, cast, seasons, episodes, tracks, items, filmography (`ui.details.screen`).
- [ ] **In the theme's frame**, with tabs to each section that follow the scroll. The page fades at its top and above
      the bar, and the first section starts below the fold.
- [ ] **Clear labels**: Resume says the time left, a series' Play says which episode is next, genres show as chips,
      and counts appear where they help (filmography, "More by <artist>").
- [ ] **Placeholders**: a picture-less person or artist shows initials; a chapter shows its start time on the picture.
- [ ] **Pickers** (version, audio, subtitles) as the theme's cards.
- [ ] **Back to the top** when focus returns to the actions or the pickers (a picker closed, Up from a list), so the
      title isn't left under the frame's band; smooth, at once in low motion, and only when the focused control
      still shows there. Plaza: `details.js`.

### 1.5 The item menu and its dialogs
- [ ] **The theme's own item menu** (≡ on any item, More on details) in the engine's overlay, with every action the user
      may take under policy and item (CanDelete, CanDownload, administrators' edits). Its context counts: inside a
      playlist it offers Move and Remove from this playlist; inside a collection, Remove from this collection.
- [ ] **Each dialog it opens**, themed and complete: playlist and collection choosers with New, subtitle search,
      media info, refresh, edit details (all tabs), edit images, identify, delete (confirmation), remove subtitles,
      copy stream URL, download.
- [ ] **jellyfin-web's dialogs, action sheets and pickers** that still appear (plugins, rare paths) as the theme's
      cards (a coloured name tab; destructive ones in the error colour; full-screen editors as an inset card), re-centred
      when jellyfin-web anchors them to a hidden header button. Left alone over playing video and on the dashboard.
- [ ] **A notice (toast)** of the theme's own, with the select or error sound, and jellyfin-web's toasts and loading
      spinners restyled.

### 1.6 Live TV
- [ ] Channels (what's on, Next, progress), a guide (`ui.guideGrid`: a day label that follows the window past
      midnight, NOW, programme cells), Recordings and Schedule, whose empty states lead to the guide.
- [ ] A programme's sheet: Watch, Record, Record the series, Cancel, Details, with steppers for start early, stop late
      and keep N.
- [ ] Previews that fall back when pictures are missing: programme picture, then channel logo, then the channel's
      number and name. A logo that can't be seen on the theme's card counts as missing (Plaza: a white logo on its
      white screen, average brightness over 200, falls through to the number and name).
- [ ] The themed connecting dialog while a channel starts, and its error notice with Try again (PLAN 9.35).

### 1.7 Music
- [ ] Now playing (art, transport, shuffle and repeat, what's next), the Queue (play from, move, remove, save as a
      playlist, clear) and Lyrics (timed lines follow the song) as the theme's screens on `#/queue` and `#/lyrics`.
- [ ] Instant mix where the item is audio.

### 1.8 The player
- [ ] **The theme's controls** (`ui.player.set`, D30): the title with Back and when it ends; the time line with
      chapter marks; previous, −10, play/pause, +30, next; audio, subtitles, chapters, Watch together, Play on and
      More (speed, aspect, subtitle timing, repeat and shuffle, playback info, jellyfin-web's controls).
- [ ] **Pickers as the theme's cards** over the video.
- [ ] **Skip prompts and Up next** from the compatibility archive (PLAN 9.36), in the theme's look.
- [ ] **Live TV in the player**: previous and next change the channel, Live replaces the end time, no seeking.
- [ ] **The web fallback** (`ui.osd`) and the `osd.*` tokens, for when a plugin adds what the archive can't draw.
- [ ] **A readability shade** over the video behind the controls; readable at couch distance on 4K (PLAN 9.39).
- [ ] **Photos and books**: the viewer framed (name, date, album, n of N); the readers' bars on the theme's ground.

### 1.9 Play on and Watch together
- [ ] One themed card for devices (this one marked) and Watch together groups (join, leave, new), opened from the
      player and from the frame.

### 1.10 Settings
- [ ] **The settings hub** (`ui.settings.screen`): Client settings, You (profile, display, home, playback, subtitles,
      controls, Quick Connect), Classic View, Classic home, Server dashboard (administrators, before Exit) and Exit
      Icefin, in the theme's look (Plaza: tiles as channels with icons).
- [ ] **Client Settings** in the theme's frame, every section and drop-down usable with the pad.
- [ ] **Settings › Home**: what the theme's home shows, switches and moving, and a link to jellyfin-web's home sections
      for Classic home.
- [ ] **The preference pages** (Display, Playback, Subtitles, Controls) in the frame with tabs between them,
      restyled: rows, switches, ◀▶ on drop-downs, Save as the theme's button. Display is a Material UI (React) page
      and needs its own selectors.
- [ ] **The user's menu (You)**: Profile, the preference pages, Quick Connect, Switch user, Switch server, and Sign out
      with a confirmation (`ctx.signOut`, `ctx.selectServer`).
- [ ] **Profile** (picture change or remove, password, Quick Connect) and **Quick Connect approve** (six code boxes, a
      number pad, Approve; a message when the server has it off).

### 1.11 Sign-in and servers (when the theme is the signed-out theme)
- [ ] Sign in: the server's listed people, Someone else, the password with the on-screen keyboard, Quick Connect's code
      sheet with its countdown (`ctx.publicUsers`, `signIn`, `quickConnect`; `beforeSignIn: true`).
- [ ] Choose a server (the device's servers, Add a server, Forget on ≡ with a confirmation) and Add a server
      (`ctx.servers`, `connect`, `forgetServer`).
- [ ] No Home, Play on or Watch together before sign-in. With no theme chosen Icefin stays stock, sign-in included.

### 1.12 jellyfin-web's pages that remain, and the dashboard
- [ ] **A frame around every page the theme doesn't draw** (`ui.stockChrome`): per-route name, colour and hints;
      sibling pages as tabs; Back, Home, Play on and Watch together (hidden on the preference pages).
- [ ] **jellyfin-web's chrome hidden under the frame** (its header, the MUI app bar, the drawer handle, backdrops), and
      a band behind the top frame so page text doesn't show through.
- [ ] **The page's ground on its own layer** (`body::before`), so nothing stale stays over video at playback start.
- [ ] **Content clears the frame**: top and bottom padding plus `scroll-padding`, so focus never lands under the frame
      or the bar.
- [ ] **Fields, buttons, switches, lists and cards** in the theme's look; the sign-in, profile and music pages restyled
      as fallbacks.
- [ ] **The on-screen keyboard** for every text field (`ui.keyboard.enable()`), in the theme's look.
- [ ] **The server dashboard and plugin pages stay stock**: no frame, no restyle (`html[data-icefin-dashboard]`).
- [ ] **A way out to stock**: Classic View, Classic home, Classic home sections (`?icefin=stock`).

---

## 2. Input changes

### 2.1 Reach
- [ ] **Everything the mouse can use, the pad reaches.** Every control with a click, pointer or mouse handler, on every
      screen, card and dialog, can be focused with the D-pad and used with A (`[data-icefin-focus]`; Plaza's
      `P.focusable`). Nothing is mouse-only (the user, 2026-11-12: the home's server button).
- [ ] **Reached by presses alone**, from each screen's first focus: no control is reachable only by a jump. Watch for
      a control off the column of its neighbours: the engine's moves prefer the same column, so one off to the side is
      skipped (Client Settings' Remap, 2026-11-13). Line it up with its neighbours.
- [ ] **Only the visible page's items take focus**; items on other pages are inert until their page turns.
- [ ] **Grids page at their edges**: ◀ on the first column or ▶ on the last turns the page and keeps the row; page
      arrows for the pointer; clicking a peeking item turns to its page.
- [ ] **Modal cards hold focus** until they close, and confine the arrows to themselves (`ctx.move(dir, within)`).
- [ ] **On jellyfin-web's framed pages** the pad moves over the page and the frame as one screen: tabs, Back, Home,
      Play on and Watch together reachable; ◀▶ inside a drop-down or text field stay that control's.

### 2.2 Focus shown
- [ ] **The focused control always shows it**, for the pad, the remote and the keyboard, on every screen, the
      framed pages included (style `:focus` and `:focus-within` there, not only `.icefin-focused`).
- [ ] **Room for the glow** in every scrolling container (padding, a negative margin, `scroll-padding`), so it is never
      clipped.
- [ ] **A glow over an engine `!important` shadow** goes on `::after` (a resting `box-shadow … !important` blocks a
      focus animation).
- [ ] **Hover looks apart from focus**: tabs, round buttons, tiles, keys and settings tiles have their own hover.

### 2.3 Telling the user where they are
- [ ] **The focused item's caption** in the bar, on every screen: the themed ones, details, settings and jellyfin-web's
      pages. On a framed page the caption is the setting's name: its `label[for]`, its `aria-labelledby` (Material UI
      drop-downs) or the switch's label, never its value. It skips the on-screen keyboard, overlays and dialogs, and
      steps back while a sheet is up. Plaza: `P.caption`.
- [ ] **A name pill under the focused item** where the target has one, kept 16 px inside the window and flipped above
      on the bottom row.
- [ ] **Page-aware controller hints** (PLAN 9.28; a requirement for every theme, the user, 2026-11-14) in the theme's
      style (drawn keys, or the remote's words where the target's own key marks aren't ours to use). Page-aware: each
      screen, panel and framed route shows only the keys that do something there, for what is focused now (no ≡ where
      there are no options, no ▶ on an entry that can't play), and the hints change with the mode (move mode, guide vs
      grid, a lifted queue entry, an open panel, Client Settings). Shown for a pad or remote, gone for the mouse or
      keyboard, always on in Couch Mode (`html[data-icefin-couch]`). Plaza tracks the input in `html[data-pz-input]`,
      Media Center in `html[data-mc-input]`. Every hint must match what the key does, and a test checks that on each
      kind of screen.

### 2.4 Keys and buttons
- [ ] **Back, innermost first**: drag, then a card or panel, then the screen; in the player, a card, then the
      controls, then leaving; on the home, the exit prompt. Escape and Backspace do the same, except that Backspace in a
      text field (or search with text) deletes.
- [ ] **Menu (≡) acts on the focused item**: the item menu in grids and on details, Move or Remove in a playlist or
      queue, forget a server, lift a channel.
- [ ] **Play/Pause acts on the focused item**: plays it in grids, series, Continue Watching and photos (the slideshow),
      and toggles in the player and music screens.
- [ ] **Search and Home** go there from any screen.
- [ ] **Steppers** step with ◀▶ (sort order, record padding, keep N, subtitle timing).
- [ ] **Destructive actions confirm** with the safe choice focused (keep it, stay signed in, cancel).
- [ ] **Focus comes back where it was**: the last card on return to the home, across a resize or a redraw, and the
      opener when a card closes. A menu action that runs as the menu closes (Move) acts on the page's item.

### 2.5 Pointer and keyboard
- [ ] **Hover moves focus** (`ui.pointerFirst(true)` on every screen); page arrows grow under the mouse.
- [ ] **Clicking outside a sheet closes it.**
- [ ] **Pointer seeking** on every time line (the player and the music capsule): click or drag with pointer capture, a
      taller hit zone and a grabber on hover.
- [ ] **The physical keyboard**: type into search from anywhere, Enter submits forms, digits fill Quick Connect.
- [ ] **Text fields** open the on-screen keyboard when the pad moves onto them; B closes it and Down carries on; a
      physical key closes it.

### 2.6 Moving things (reorder)
- [ ] **One model everywhere**: Menu lifts, the arrows carry (an edge turns the page), A or Menu places, Back cancels,
      and the error sound at either end. It applies to home items, Settings › Home rows, queue entries and playlist
      tracks (`data-icefin-reorder` on details). Saved where the item lives (device, user or server).
- [ ] **By pointer**: hold (Plaza: 450 ms) or drag (Plaza: 12 px) lifts. A ghost follows, the slot under the pointer
      lights, holding at a side turns the page, and the click straight after a drop is ignored.

### 2.7 The player
- [ ] **Any input brings the controls back**: a key, a button or a mouse movement. While they are hidden, ◀▶ seek
      −10/+30 s. They hide after a few seconds of playing (Plaza: 4 s), stay while paused or a card is open, and the
      cursor hides with them.
- [ ] **◀▶ on the focused time line** seek ±10 s.
- [ ] **A new skip prompt takes focus** while the controls are hidden, so OK answers it.

---

## 3. Animations and transitions

One family of eased timings, short enough to keep up with a held D-pad, with the target's signature moves kept at
their own length (Plaza's 870 ms channel zoom). Every transition shows where things came from and where they went
(the six principles of UX animation: timing, easing, spatial orientation, directing focus, visual continuity,
clarity). Plaza's timings, for reference:

| Transition | Plaza | Easing |
|---|---|---|
| Focus | a breathing glow, 2.6 s loop | ease-in-out |
| Press and focus scale | 1.04–1.06 over 140 ms | ease |
| Page turn (home, grids, card neighbours) | 450 ms; ±55vw from opacity 0.2 | `cubic-bezier(0.2, 0.8, 0.3, 1)` |
| Preview open (tile → card) | 870 ms, staged: dim, grow, content, name tab | `cubic-bezier(0.3, 0.7, 0.2, 1)` |
| Preview close | 420 ms | ease-in-out |
| Tab change | 220 ms, content ±40 px toward the tab picked | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Caption change | 120 ms cross-fade | ease-out |
| Grid → details | 360 ms flight of the poster; page fades in (240 ms, 120 ms late) | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Details → grid (Back) | 320 ms flight home to the cell | same |
| Settings tile → page / back | 400 ms grow, 180 ms fade / 320 ms shrink | ease-out |
| Sheet, dialog, picker | in 200 ms (rise 14 units from 97 %), out 150 ms | ease-out / ease-in |
| Side panel (sort and filter) | in 260 ms from its edge, out 220 ms | ease-out / `cubic-bezier(0.4, 0, 1, 1)` |
| Now playing pill | out 600 ms, back 550 ms | slight overshoot |
| Player chrome | 250 ms fade and slide | ease |
| Lyrics | 300 ms line growth, smooth scroll to centre | ease |

- [ ] **A recognisable focus animation** on every focusable kind.
- [ ] **Page turns** slide in the direction of travel; a jump without a turn cuts.
- [ ] **The preview** (or the target's focus state) opens from and closes into the item.
- [ ] **Tabs** move the content toward the tab picked; the tabs themselves change at once.
- [ ] **The caption** cross-fades; it never flickers on a held D-pad.
- [ ] **Shared-element flights**: an item grows into its details and Back shrinks it home; a settings tile grows into
      its page and back. A flier never stays behind (a safety timeout).
- [ ] **Sheets, dialogs and pickers** rise in and fall out through `ui.overlay.set({leave})`, so the engine waits for
      the fall. The page has its focus back as the fall starts, and presses go to it.
- [ ] **Side panels** slide from their edge; the dim fades with them.
- [ ] **Bar caption and hints step back** while a sheet is up.
- [ ] **Now playing** slides in and out; a screen opened mid-playback shows it already out.
- [ ] **Player chrome** fades and slides; the skip area moves when the controls hide.
- [ ] **Progress lines** ease; lyrics follow the song; section tabs and chapter strips scroll smoothly.
- [ ] **Ambient loops** on decoration only (spinning discs, a bobbing TV, a Ken Burns pan), never on text.
- [ ] **Low motion turns all of it off** (`html[data-icefin-motion="low"]`, `ui.motion.reduced()`): CSS animations and
      transitions on every surface the theme draws, the player's controls and the stock frame included (they sit
      outside the theme's screen root); JS animations and flights skipped; smooth scrolls become instant; no muted
      previews; card timings through `ui.motion.duration()`.

## 4. Special effects
- [ ] **A signature ground** on themed screens and framed pages (Plaza: a faint horizontal stripe).
- [ ] **Item framing**: an inset frame, a soft shadow, a shade over art where text sits on it.
- [ ] **Reflections** under hero art where the target has them (Plaza: a blurred gradient at 22 %).
- [ ] **Fade masks** at scrolling edges: episode lists, details, sheet lists, lyrics.
- [ ] **Original animated illustrations** per library kind (Plaza: TV with a wave, reel, record, stacked screens,
      camcorder with REC, photos, a flipping book, a leaning box set, a playlist, a folder, a pulsing star).
- [ ] **Live tiles** that cycle the illustration and the newest art (`ui.liveTile`).
- [ ] **Object metaphors** where the target has them (Plaza: a silver disc labelled with the item's art and a moving
      glint; a vinyl record with grooves; CRT scanlines; a fan of posters).
- [ ] **A muted preview** of the focused favourite (`ui.mutedPreview`: from 15 % in, small, faded in when it plays, a
      PREVIEW badge, a Ken Burns poster underneath).
- [ ] **Fallbacks for missing pictures**: initials for people and artists, start times on chapters, the channel's
      number and name on Live TV, an empty slot's watermark.
- [ ] **Custom chrome geometry** (Plaza: a notched bar computed from the window width, arched bars, triangle arrows).
- [ ] **Glows on progress and "now"** (the music line, the guide's NOW line, the player's knob).
- [ ] **A readability shade** over video behind the player controls.

## 5. Sounds and music
- [ ] **Five UI sounds** in `theme.json` (`sounds`), synthesised from the theme's recipe in the target's character,
      nothing recorded from the target (PLAN 9.31; Plaza: `scripts/icefin/theme-sounds.py`).
- [ ] **Each sound on its action**, the same everywhere:

  | Sound | Plays on |
  |---|---|
  | `select` | confirming: a tile, a button, a toggle, a pick in a picker, lift and drop, a sheet's save, a notice |
  | `navigate` | page turns, stepping between previews or channels, steppers, tabs, Home |
  | `back` | closing a card or panel, Back buttons, cancelling a move, deleting a digit |
  | `error` | refusals: an empty Play all, a missing name, a move past an end, a bad code, a failed action |
  | `focus` | ordinary moves (the engine), and moves the theme makes itself |

- [ ] **A startup jingle and a gapless ambient loop** (`music.startup`, `music.ambient`), original, from recipes
      (PLAN 9.33; Plaza: `scripts/icefin/theme_music/plaza.py`), at a level that sits under the UI (Plaza's ambient
      peaks at −7.4 dB, 15 % under its first cut, the user, 2026-11-13).
- [ ] **Jingles where the target has them** (Plaza: one per channel kind while its preview is open), stopped with a
      fade when the preview closes (Plaza: 350 ms, or 150 ms when leaving).
- [ ] **The ambient loop waits** while the theme shows media of its own (`ctx.music.hold`: Plaza holds it while a
      preview card is open), ducks under jingles, and stops while anything plays. Silent during passthrough.
- [ ] **Client Settings apply**: Theme Jingles, Background Music, Music Volume; a `sound.volume` token if the theme's
      sounds need a level of their own.

## 6. The look: package, tokens, type, shape
- [ ] `theme.json` complete: id, name, version, description, styles, scripts, `sounds`, `music`, schemes
      (`docs/themes/PACKAGE.md`, the schema in `docs/themes/schema/`).
- [ ] **Every engine colour token** (`docs/themes/TOKENS.md`), a **dark** scheme (PLAN 9.20), every text and control
      pair passing the contrast check in both (`icefin-hooks`). Colours outside tokens (Plaza's kind colours, the card
      dim) are either per scheme or listed here as the theme's stated exceptions.
- [ ] **Shape tokens** and one shape family (Plaza: tiles r24, cells r21, cards r66, dialogs r48, the capsule r60,
      pills and round buttons).
- [ ] **The fallback player's tokens** (`osd.*`).
- [ ] **Type**: a deliberate face and a fallback stack, shipped (`fonts`) or chosen knowingly from what systems have,
      and never the target's own font. A type scale at 1080 lines, with tabular figures for clocks and times.
- [ ] **Geometry from the reference** at 1080 lines (`docs/themes/references/<id>.json`), scaling to wider screens
      (more columns, not stretched cells) and to 4K; `clone_layout.py --theme <id>` passes.
- [ ] **Original illustrations and icons only**; the server's branding where the target shows its own (PLAN 9.27).

## 7. Robustness
- [ ] Nothing focusable or readable runs past the window's sides, under the frame or under the bar; no text cut or
      clipped (the host walk's audit).
- [ ] 16:9, wider windows and 4K: layouts gain columns rather than stretching, and nothing overlaps.
- [ ] The server's custom CSS and plugins' injected UI don't break the theme's screens (Classic View is the escape).
- [ ] The theme's overlay use is its own: a sheet is the engine's overlay only while it is up, so a long press on View
      never brings back an old sheet.
- [ ] The engine stays theme-agnostic: nothing in `native/icefin/` names the theme or holds its values (theme lint).

## 8. Tests a complete theme has
- [ ] `tests/icefin/web/theme_<id>.py` (the theme's screens and layout) and `clone_layout.py --theme <id>`.
- [ ] **A reach walk** with a virtual controller over every screen of this list: reach, focus shown, mouse comparison
      (`plaza_reach.py`; jellyfin-web's long preference pages walked as a sweep).
- [ ] **A polish test** for the animations, effects and placeholders above (`plaza_polish.py` is Plaza's), low motion
      included.
- [ ] The player with the theme's controls (`theme_player.py` for the engine, `<id>_player.py` for the theme), the
      item menu and its dialogs, music and its jingles (`<id>_jingles.py`), sign-in, and the framed pages
      (`<id>_everywhere.py`).
- [ ] **The polish tests on the user's own Icefin** (`--host`, `tests/icefin/web/hostmode.py`): their profile and
      server, nothing written to it, their theme put back after; Icefin's window kept uncovered for the run (a
      covered Wayland window stops drawing, and the tests' screenshots wait).
- [ ] **A host walk** of the finished theme on the user's server (screenshots, transition films and the cut-off audit
      of every element) and the user's review against the mock-ups (the pipeline's Gate 2).

## The target's other screens (measured 2026-11-15, watched in the browser, nothing downloaded)

Sources: IGN, "New Xbox 360 2012 Dashboard Update Walkthrough" (https://www.youtube.com/watch?v=3zOX7_67dIQ, direct
feed) and Jeremy Hill, "Xbox 360 Dashboard Update 2012 Tour" (https://www.youtube.com/watch?v=olTeUQbIjoU, 640x360
capture). Layout, timing and colours only; no tiles, icons, sounds, fonts or names.

- **Home**: one row of lowercase pivot headers (the current one dark, the rest grey), the pivots before it trailing
  off the left edge and the next ones off the right; under it a grid of flat tiles in three sizes, the first column
  of each pivot green tiles with a white glyph top and a label bottom left, the rest art. The account top right with
  a small picture; hints bottom left as coloured face dots and words. A grey field, lighter at the top.
- **Hubs** (a library opened): the same pivot, smaller and starting at the left (my videos, spotlight, movies, tv,
  recommended), the hub's name top right with a small mark; tiles of one size in a 4-wide grid; dark tiles for
  "my" things with a white glyph.
- **Strips** (my pins, recent, search results, a season's episodes): one row of tall cards running off the right,
  the focused card lifted and white; "2 of 14" under the title top right; a filter top left ("show me / all media").
  Cards carry art on top and a title, a line of facts and a description on white below.
- **Details**: the item's art dimmed as the whole background; its title top right; a pivot of its sections (overview,
  details, related, seasons by number, extras, gallery) under the title; under the current section a 2x2 block of
  action tiles (green for a game, white for a show or song: an icon top right, a label bottom left), the art beside
  them, then the facts and description in a column. Further sections off the right.
- **Now playing**: a white panel over the dimmed screen: art, title, artist and time; then two rows of round-icon
  buttons with words (Pause, Previous, Next; Pin, Shuffle, Explore). A small now-playing strip (art, progress, time)
  sits low in the middle of hub pages while music plays.
- **Lists and settings**: a dark panel of rows with checkboxes, the decisions as green tiles to the right (OK, Undo);
  search suggestions as a column of white bars.
- **Search**: a search bar across a pivot of its own; suggestions as white bars under "search for"; results as a strip.
- **Dialogs and progress**: a white box centred on the dimmed screen, a line of text and a thin progress bar; the
  Back hint stays bottom left.
- **Keyboard**: a dark grid of square keys, 10 wide, a side column (Backspace, Symbols, Accents, Caps, Enter) and a
  wide Space; the suggestion box above, left.
- **Not found**: the system guide of this version (not shown in either source); a full-screen video player bar.

## Gate 1 map: every checklist item (2026-11-15)

The design for the pass: 26 boards on the "Mosaic Screens" canvas, https://claude.ai/artifact/UMJmh78uAnyWMbbYEZaCaJ (Gate 1), drawn from walk 1, `docs/themes/references/mosaic.json` and two walkthroughs of the target (measurements only, above). Every item below is one of: **board**, **tests** (what the build's tests check), **not in the target** (a reason, for your call) or **not in this pass**. None is missing. Totals: 122 board, 6 not in the target, 14 tests, 1 not in this pass.

| § | Item | Covered by | Where |
|---|---|---|---|
| 1.1 | The target's home | board | Home (pivots of flat tiles in three sizes, the current pivot dark) |
| 1.1 | Home chrome (clock, Settings, Search) | board | Home (you, server and clock top right; search and settings are home pivots and in the guide) |
| 1.1 | The server's status | board | Home (the account: server and online, opens Choose a server) |
| 1.1 | Each library shows what it is | board | HomeMore (each library's pivot: its newest as a live tile, green tiles into its sections) |
| 1.1 | A preview or focus state | board | Home, Main (the focused tile lifts 107 % with a white frame; live tiles cycle); Decisions 6 |
| 1.1 | Sub-views of the home | board | Home, HomeMore (pivots are the sub-views; Continue watching and Next up are live tiles) |
| 1.1 | The order is the user's | board | Prefs (Settings › Home: switches and Move); Decisions 8 |
| 1.1 | The music capsule | board | Home (the now-playing strip), Music |
| 1.1 | Exit at the root | board | Dialogs (exit icefin?, cancel focused) |
| 1.2 | A shared frame | board | every board (pivot or hub name, account top right, hints bottom left) |
| 1.2 | A colour per content kind | not in the target | the target is one green; kinds shown by tile glyphs and art |
| 1.2 | Now playing on every framed screen | board | Home (the strip), Guide (now playing on its home tab) |
| 1.3 | Every library type themed | board | LibMovies, LibLists, LibLiveTV, LibMore |
| 1.3 | Section tabs per library | board | LibMovies, LibLists, LibLiveTV (the hub's section pivot) |
| 1.3 | Drill-downs with Play all and Shuffle | board | LibLists (a genre, an album), DetailsMore (collection) |
| 1.3 | Sort and filter panel, A–Z rail | board | LibMore (the side panel), LibMovies (LT / RT by letter, the letter by the count) |
| 1.3 | Grids page like the target | board | LibMovies (posters run sideways, the grid slides with focus) |
| 1.3 | Playlists, photos and home videos, books | board | LibLists, LibMore |
| 1.3 | Series: seasons as tabs, Next up first | board | DetailsSeries (a pivot section per season; play next up on the overview) |
| 1.3 | Continue Watching and Next Up screens | board | Home (live tiles open their lists), Guide (home tab) |
| 1.3 | Search with filters and keyboard | board | Search |
| 1.3 | Empty states | board | Framed (nothing here yet, with a tile that helps), Search |
| 1.4 | Every item type with every function | board | DetailsMovie, DetailsSeries, DetailsMore |
| 1.4 | In the theme's frame, tabs following the scroll | board | DetailsMovie (the item's section pivot); Decisions 2 |
| 1.4 | Clear labels | board | DetailsMovie (38 min left), DetailsSeries (2 of 10), DetailsMore (counts) |
| 1.4 | Placeholders (initials, chapter times) | board | SignIn (initials), PlayerMore (chapter times), Effects |
| 1.4 | Pickers as the theme's cards | board | Menus, PlayerMore (white panels) |
| 1.4 | Back to the top on return | tests | the pass test: the front panel's actions in view after a picker closes |
| 1.5 | The theme's own item menu | board | Menus |
| 1.5 | Each dialog themed and complete | board | Menus, Dialogs |
| 1.5 | jellyfin-web's dialogs as the theme's cards | board | Framed (editors in the white panel), Dialogs |
| 1.5 | A notice of the theme's own | board | Dialogs (toast) |
| 1.6 | Channels, guide, recordings, schedule | board | LibLiveTV |
| 1.6 | A programme's sheet with steppers | board | Framed (record early / late steppers), LibLiveTV |
| 1.6 | Previews that fall back | board | LibLiveTV, DetailsMore (channel), Effects |
| 1.6 | Connecting dialog and its error | board | PlayerExtras, Dialogs |
| 1.7 | Now playing, Queue, Lyrics | board | Music |
| 1.7 | Instant mix | board | Framed (a song's, album's or artist's options), Music |
| 1.8 | The theme's controls | board | Player |
| 1.8 | Pickers over the video | board | PlayerMore |
| 1.8 | Skip prompts and Up next | board | PlayerExtras |
| 1.8 | Live TV in the player | board | PlayerExtras |
| 1.8 | The web fallback and osd tokens | board | Player (osd tokens kept for jellyfin-web's controls under More) |
| 1.8 | A readability shade | board | Player |
| 1.8 | Photos and books framed | board | LibMore |
| 1.9 | Play on and Watch together | board | PlayerMore (settings), Guide (home tab) |
| 1.10 | The settings hub | board | Settings (the settings pivot of green tiles) |
| 1.10 | Client Settings in the frame | board | Settings |
| 1.10 | Settings › Home | board | Prefs |
| 1.10 | The preference pages framed | board | Prefs |
| 1.10 | The user's menu (You) | board | Prefs, Guide (you tab) |
| 1.10 | Profile and Quick Connect approve | board | Prefs |
| 1.11 | Sign in | board | SignIn |
| 1.11 | Choose and add a server | board | SignIn |
| 1.11 | Nothing before sign-in; stock without a theme | board | SignIn (note) |
| 1.12 | A frame around every page | board | Framed |
| 1.12 | jellyfin-web's chrome hidden | board | Framed |
| 1.12 | The ground on its own layer | tests | the pass test: nothing stale over video at playback start |
| 1.12 | Content clears the frame | board | Framed; tests (focus never under the frame) |
| 1.12 | Fields, buttons, switches in the look | board | Framed, Prefs |
| 1.12 | The on-screen keyboard | board | Input, Search, SignIn |
| 1.12 | Dashboard stays stock | board | Framed (reached from a settings tile) |
| 1.12 | A way out to stock | board | HomeMore (settings pivot), Settings |
| 2.1 | Everything the mouse can use, the pad reaches | board | Input; tests (reach walk) |
| 2.1 | Reached by presses alone | tests | the reach walk |
| 2.1 | Only the visible page's items | board | Input; tests |
| 2.1 | Grids page at their edges | board | LibMovies, Input |
| 2.1 | Modal cards hold focus | board | Input; tests |
| 2.1 | Framed pages move as one | board | Input |
| 2.2 | Focus always shown | board | Input |
| 2.2 | Room for the glow | board | Input (room for the 107 % lift); tests (no clipped lift) |
| 2.2 | Glow over an engine shadow | tests | the polish test (the lift and frame over the engine's focus) |
| 2.2 | Hover apart from focus | board | Input |
| 2.3 | The focused item's caption | board | Player (words under the buttons), LibMovies (facts under the grid); Input |
| 2.3 | A name pill under the focused item | board | Player (the word under each square button) |
| 2.3 | Page-aware controller hints | board | Input (per pad family); every board's hints; Decisions 7 |
| 2.4 | Back, innermost first | board | Input |
| 2.4 | Menu acts on the focused item | board | Input, Menus |
| 2.4 | Play/Pause on the focused item | board | Input, LibMovies |
| 2.4 | Search and Home from anywhere | board | Input, Guide |
| 2.4 | Steppers | board | Framed, PlayerMore |
| 2.4 | Destructive actions confirm | board | Menus (cancel focused, delete red), Dialogs |
| 2.4 | Focus comes back where it was | board | Input |
| 2.5 | Hover moves focus | board | Input |
| 2.5 | Clicking outside closes | board | Guide, LibMore |
| 2.5 | Pointer seeking | board | Input, Player |
| 2.5 | The physical keyboard | board | Search, Prefs (Quick Connect digits) |
| 2.5 | Text fields and the keyboard | board | Search |
| 2.6 | One move model | board | Input, Music (queue), Prefs (Settings › Home) |
| 2.6 | By pointer | board | Input |
| 2.7 | Any input brings the controls back | board | Player |
| 2.7 | ◀▶ on the time line | board | Player |
| 2.7 | A new skip prompt takes focus | board | PlayerExtras |
| 3 | A focus animation on every kind | board | Motion, Input |
| 3 | Page turns | board | Motion |
| 3 | The preview opens from the item | board | Motion (a tile's art grows into the details backdrop) |
| 3 | Tabs | board | Motion |
| 3 | The caption cross-fades | board | Motion, Player (button words) |
| 3 | Shared-element flights | board | Motion (tile → details, back to the tile) |
| 3 | Sheets rise and fall | board | Motion |
| 3 | Side panels slide | board | Motion, LibMore |
| 3 | Bar caption and hints step back | tests | the polish test |
| 3 | Now playing slides | board | Motion (the strip rises, notices slide up), Home |
| 3 | Player chrome | board | Motion, Player |
| 3 | Progress lines, lyrics | board | Motion, Music |
| 3 | Ambient loops on decoration only | board | Motion, Effects (live tiles only, off in low motion) |
| 3 | Low motion | board | Motion |
| 4 | A signature ground | board | Effects, Main (the still grey field) |
| 4 | Item framing | board | Main, Effects (flat square tiles, the white frame on focus) |
| 4 | Reflections | not in the target | the target is flat; none added (Effects) |
| 4 | Fade masks | not in the target | grids run off the screen's edge as the target's do; none added (Effects) |
| 4 | Original illustrations per kind | board | Main, HomeMore (white glyphs on green tiles per kind) |
| 4 | Live tiles | board | Effects, Home |
| 4 | Object metaphors | not in the target | the target is flat tiles; none added |
| 4 | A muted preview | not in the target | Decisions 6 |
| 4 | Fallbacks for missing pictures | board | Effects, LibLiveTV, DetailsMore (a green tile with the kind's glyph) |
| 4 | Custom chrome geometry | board | Guide (a panel with its own pivot), Player (square buttons) |
| 4 | Glows on progress and now | not in the target | no glows: progress and the now line are flat green (LibLiveTV, Player) |
| 4 | A readability shade | board | Player |
| 5 | Five UI sounds | board | Effects (new recipe in the target's character) |
| 5 | Each sound on its action | tests | the pass test |
| 5 | Startup jingle and ambient loop | board | Effects; Decisions 5 |
| 5 | Jingles where the target has them | board | Effects (guide, goodbye); Decisions 5 |
| 5 | The ambient loop waits | board | Effects |
| 5 | Client Settings apply | board | Settings, Effects |
| 6 | theme.json complete | board | Effects |
| 6 | Every colour token, dark scheme, contrast | board | Effects; tests (theme-contrast) |
| 6 | Shape tokens | board | Effects |
| 6 | The fallback player's tokens | board | Effects |
| 6 | Type | board | Effects; Decisions 4 |
| 6 | Geometry from the reference | tests | clone_layout.py --theme mosaic |
| 6 | Original illustrations and icons; server branding | board | Main, SignIn (icefin, the server's name) |
| 7 | Nothing runs past the sides | tests | the walk's audit |
| 7 | 16:9, wider, 4K | board | LibMovies, Effects; tests |
| 7 | Custom CSS and plugins don't break it | tests | the lab's plugin servers |
| 7 | The overlay is the theme's own | board | Guide; tests |
| 7 | The engine stays theme-agnostic | tests | theme lint |
| 8 | theme_orbit.py and clone_layout | tests | theme_mosaic.py and clone_layout, kept and extended |
| 8 | A reach walk | tests | mosaic_pass.py with a virtual pad |
| 8 | A polish test | tests | mosaic_pass.py, low motion included |
| 8 | Player, menu, music, sign-in, framed pages | tests | mosaic_pass.py |
| 8 | Polish tests on the user's own Icefin | not in this pass | the user chose the lab for Mosaic's walks and tests |
| 8 | A host walk and Gate 2 | board | Gate 2 on this canvas's Built page |

