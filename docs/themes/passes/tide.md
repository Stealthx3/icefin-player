# tide: completeness pass

Copied from docs/themes/CHECKLIST.md at the start of the pass (2026-11-14, main d1fdfc2e). Tick an item
when tide does it in its own look and a test checks it, or write the user's reason beside it. Motion is judged by the six
principles (PIPELINE.md, The measure).

## Where the pass starts (walk 1, 2026-11-14)

Walk: the workstation's Icefin 0.1.0~alpha.2, your server; **16 of 69** entries drawn by Tide, **43 gaps**, 23 failing
checks (all "nothing has focus"), 9 skipped (no books, photos, home videos, music videos or playlists on the server).
Contact sheet: `build-walk/tide/20261114-024513/index.html`; gap list: `docs/themes/coverage/tide.md`.

Tide today is a cross bar on the home and nothing else of its own: the engine's details panel, its settings list and
jellyfin-web's player controls in Tide's colours. Everything a library, a list, search, Live TV, music, the item menu,
sign-in or the preference pages shows is jellyfin-web's own page with its header and drawer (the walk's "stock").

| Area | Walk | What is wrong |
|---|---|---|
| Home (1.1) | drawn, focus fails | each library's column is the whole library A–Z (up to 500), with no Continue Watching, Next Up, Recently added or favourites; the first column came up empty on the walk; no server status, no exit question, no music entry; nothing has focus for a pad until a key is pressed |
| Frame (1.2, 1.12) | — | none: leaving the home drops into jellyfin-web's header, drawer and grids |
| Libraries, lists, search (1.3) | 13 stock, sort-filter missing | every library, the genre and studio lists and search are jellyfin-web's |
| Details (1.4) | 10 drawn, channel stock | the engine's panel layout, not the target's; a channel is jellyfin-web's |
| Item menu (1.5) | missing + 8 restyled | no menu of Tide's own; the eight dialogs are jellyfin-web's in Tide's colours |
| Live TV (1.6) | 3 stock | guide, channels and recordings are jellyfin-web's |
| Music (1.7) | capsule drawn; queue, lyrics stock | |
| Player (1.8) | 4 restyled | jellyfin-web's controls and its three pickers |
| Play on, Watch together (1.9) | 2 restyled | jellyfin-web's dialogs |
| Settings (1.10) | hub, client drawn; 7 stock | preference pages, profile and Quick Connect unframed |
| Sign-in (1.11) | 4 stock | |
| Input (2) | 23 focus failures | no focus on arrival; no ≡ on items; no hints; hover does not move focus outside the home |
| Motion (3) | | categories slide (260 ms ease-out) and the column steps (220 ms); nothing else moves: no folder opening, no panel, no flights, no caption; the low-motion path is the wave only |
| Effects (4) | | wave and month palette good; no focus glow on the column beyond a scale, no fallbacks beyond a generic icon, no fade at the column's edges |
| Sound (5) | | five UI sounds; no startup sound |

Judged by the six principles: **timing** and **easing** are close (short ease-out moves that keep up with a held
D-pad); **spatial orientation** fails off the home (no sense of going deeper, as nested columns would give);
**directing focus** fails wherever nothing has focus; **visual continuity** has nothing joining the home to details
or a library; **clarity** is good on the home (one focus point) and lost everywhere else.

The design for the pass (29 boards on the "Tide Screens" canvas, https://claude.ai/artifact/ShsF13JUFnUxto9dgATpZ6, Gate 1): the target's grammar everywhere. Opening a
folder or an item slides a new column in at the fixed point while the one it came from collapses to its icon on the
left; an item's options come in a dark panel from the right edge; information and the player are light overlays on
the wave. Icons stay original line drawings; no names, symbols, sounds or artwork from the target.

## Gate 1 map: every checklist item (2026-11-14)

Every item below is one of: **board** (drawn on the Tide Screens canvas), **tests** (behaviour the build's tests check), or **not in the target** (a reason on the Decisions board, for your call at Gate 1). None is missing. Totals: 101 on boards, 29 by tests, 13 not in the target.

| § | Item | Covered by | Where |
|---|---|---|---|
| 1.1 | The target's home | board | Home, HomeSettings, HomeMusic |
| 1.1 | Home chrome (clock, Settings, Search) | board | Home (clock; Settings and Search are the bar's first and last categories) |
| 1.1 | The server's status | board | Home (dot under the clock), HomeSettings (Server entry opens Choose a server) |
| 1.1 | Each library shows what it is | not in the target | Decisions: the target's categories are line icons; Continue and Next up show the item's own art (Home) |
| 1.1 | A preview or focus state | board | Decisions: the target's focus state is the item grown at the fixed point with its facts (Folder), plus its backdrop fading in after a rest |
| 1.1 | Sub-views of the home by query | board | Home, Folder: one #/home registration; a folder is a level of the column, kept in memory per route, so Back from anywhere returns to it (no query needed) |
| 1.1 | The order is the user's | board | HomeOrder |
| 1.1 | The music capsule | board | HomeMusic (Now playing entry and the song line under the clock) |
| 1.1 | Exit at the root | board | ExitPanel |
| 1.2 | A shared frame | board | Folder, DetailsMovie, PrefsFramed (trail, name, clock, hints); Decisions (pointer Back and Home) |
| 1.2 | A colour per content kind | not in the target | Decisions: the target is monochrome over the month's colour; kinds are told by icon |
| 1.2 | Now playing on every framed screen | board | HomeMusic (the song line under the clock, on every screen) |
| 1.3 | Every library type on its routes | board | Folder, LibrarySections, PhotosBooks, Guide, Search; registration is checked by tests |
| 1.3 | Section tabs | board | LibrarySections (a library's sections are its column's folders) |
| 1.3 | Drill-downs with Play all and Shuffle | board | Folder (note), DetailsAlbum |
| 1.3 | Sort and filter, A–Z jump | board | SortFilter, Folder (letter strip) |
| 1.3 | Grids page like the target | not in the target | Decisions: the target lists in columns; columns page by page keys and letters (Folder) |
| 1.3 | Playlists (New), photos by day, books with a start position | board | PhotosBooks |
| 1.3 | Series: Next Up's season first, first unwatched focused | board | DetailsSeries |
| 1.3 | Continue Watching and Next Up screens | board | LibrarySections |
| 1.3 | Search with type filters and keyboard | board | Search (the kinds line filters) |
| 1.3 | Empty states | board | LibrarySections |
| 1.4 | Every item type with every function | board | DetailsMovie, DetailsSeries, DetailsAlbum, Profile (person note); each function checked by tests |
| 1.4 | In the theme's frame, tabs that follow the scroll | not in the target | Decisions: details is a column, not a scrolling page; each section is an entry |
| 1.4 | Clear labels | board | DetailsMovie (Resume from 42:10), DetailsSeries (Next up) |
| 1.4 | Placeholders | board | Effects (initials, chapter times) |
| 1.4 | Pickers as the theme's | board | DetailsMovie (Audio, Subtitles entries open the options panel) |
| 1.4 | Back to the top | not in the target | Decisions: nothing scrolls under a band; Back steps the column to its first entry |
| 1.5 | The theme's own item menu, context-aware | board | ItemOptions |
| 1.5 | Each dialog it opens | board | MenuDialog, MediaInfo |
| 1.5 | jellyfin-web's leftover dialogs as the theme's | board | Notices |
| 1.5 | A notice (toast) | board | Notices, MenuDialog |
| 1.6 | Channels, guide, recordings, schedule | board | Guide, Notices (empty schedule) |
| 1.6 | A programme's sheet with steppers | board | Notices (programme in the options panel) |
| 1.6 | Previews that fall back | board | Guide, Effects |
| 1.6 | Connecting dialog and its error | board | Notices |
| 1.7 | Now playing, Queue, Lyrics | board | NowPlaying |
| 1.7 | Instant mix | board | DetailsAlbum |
| 1.8 | The theme's controls | board | Player |
| 1.8 | Pickers as the theme's cards | board | Player (options panel) |
| 1.8 | Skip prompts and Up next | board | PlayerExtras |
| 1.8 | Live TV in the player | board | PlayerExtras |
| 1.8 | The web fallback (ui.osd) | tests | osd.* tokens set from Player's look; checked by tests |
| 1.8 | A readability shade | board | Player |
| 1.8 | Photos and books | board | PhotosBooks |
| 1.9 | Play on and Watch together | board | PlayOn |
| 1.10 | The settings hub | board | HomeSettings, You |
| 1.10 | Client Settings in the frame | board | PrefsFramed (the same frame) |
| 1.10 | Settings › Home | board | HomeOrder |
| 1.10 | The preference pages | board | PrefsFramed |
| 1.10 | The user's menu (You) | board | You |
| 1.10 | Profile and Quick Connect approve | board | Profile, QuickConnect |
| 1.11 | Sign in | board | SignIn |
| 1.11 | Choose and add a server | board | Servers |
| 1.11 | Nothing before sign-in; stock without a theme | tests | checked by tests |
| 1.12 | A frame around every page not drawn | board | PrefsFramed |
| 1.12 | jellyfin-web's chrome hidden, a band | board | PrefsFramed |
| 1.12 | The page's ground on its own layer | tests | build |
| 1.12 | Content clears the frame | tests | build; the host walk's cut-off audit |
| 1.12 | Fields, buttons, switches, lists restyled | board | PrefsFramed |
| 1.12 | The on-screen keyboard | board | Search |
| 1.12 | Dashboard and plugin pages stay stock | tests | checked by tests |
| 1.12 | A way out to stock | board | HomeSettings (Classic view), HomeOrder (Classic home sections) |
| 2.1 | Pad reaches everything the mouse can | tests | reach walk |
| 2.1 | Reached by presses alone | tests | reach walk |
| 2.1 | Only the visible page's items take focus | tests | build (the column window) |
| 2.1 | Grids page at their edges | not in the target | Decisions: no grids; columns page by page keys |
| 2.1 | Modal cards hold focus | tests | the options panel; tests |
| 2.1 | Framed pages as one screen | tests | reach walk |
| 2.2 | Focus always shown | board | Effects (focus); tests |
| 2.2 | Room for the glow | tests | cut-off audit |
| 2.2 | Glow over an engine shadow | tests | build |
| 2.2 | Hover apart from focus | board | Decisions (pointer) |
| 2.3 | The focused item's caption | board | Folder, DetailsSeries (the focused entry's facts beside it are the caption) |
| 2.3 | A name pill under the focused item | not in the target | Decisions: the name sits beside the item at the fixed point |
| 2.3 | Page-aware controller hints | board | Hints (the remote's words): column.js builds them from the focused entry, the panel per level, each screen its own; tide_pass checks them |
| 2.4 | Back, innermost first | board | MotionColumns, MotionPanel, ExitPanel; tests |
| 2.4 | Menu acts on the focused item | board | ItemOptions, Servers |
| 2.4 | Play/Pause acts on the focused item | board | Home, Folder hints; tests |
| 2.4 | Search and Home from anywhere | board | Decisions |
| 2.4 | Steppers | board | SortFilter, Player |
| 2.4 | Destructive actions confirm | board | ExitPanel, ItemOptions (Delete), You (Sign out) |
| 2.4 | Focus comes back where it was | board | MotionColumns (Back); tests |
| 2.5 | Hover moves focus | board | Decisions (pointer) |
| 2.5 | Clicking outside a sheet closes it | board | Decisions (pointer) |
| 2.5 | Pointer seeking | board | Player, NowPlaying |
| 2.5 | The physical keyboard | board | Search, QuickConnect |
| 2.5 | Text fields open the keyboard | board | Search, Profile |
| 2.6 | One reorder model | board | HomeOrder |
| 2.6 | Reorder by pointer | board | HomeOrder |
| 2.7 | Any input brings the controls back | board | Player (note); tests |
| 2.7 | ◀▶ on the focused time line | board | Player |
| 2.7 | A new skip prompt takes focus | board | PlayerExtras |
| 3 | A recognisable focus animation | board | Effects, MotionTimings |
| 3 | Page turns | board | MotionColumns (opening a level), MotionTimings (category step) |
| 3 | The preview opens from the item | board | MotionDetails |
| 3 | Tabs move toward the tab picked | board | LibrarySections (Live TV's top line), MotionTimings |
| 3 | The caption cross-fades | board | MotionTimings |
| 3 | Shared-element flights | board | MotionDetails, MotionColumns |
| 3 | Sheets and dialogs leave through the engine | board | MotionPanel |
| 3 | Side panels slide from their edge | board | MotionPanel |
| 3 | Caption and hints step back under a sheet | board | MotionPanel |
| 3 | Now playing slides in and out | board | MotionTimings (song line) |
| 3 | Player chrome fades and slides | board | MotionTimings, PlayerExtras |
| 3 | Progress lines, lyrics, smooth scrolls | board | MotionTimings |
| 3 | Ambient loops on decoration only | board | MotionTimings (the wave) |
| 3 | Low motion turns all of it off | board | MotionTimings and each motion board |
| 4 | A signature ground | board | Effects (wave, month palette) |
| 4 | Item framing | board | Effects, DetailsMovie (shade over the backdrop) |
| 4 | Reflections | not in the target | Decisions |
| 4 | Fade masks | board | Effects |
| 4 | Original animated illustrations | not in the target | Decisions |
| 4 | Live tiles | not in the target | Decisions |
| 4 | Object metaphors | not in the target | Decisions |
| 4 | A muted preview | not in the target | Decisions |
| 4 | Fallbacks for missing pictures | board | Effects |
| 4 | Custom chrome geometry | board | Decisions (the cross bar is Tide's chrome) |
| 4 | Glows on progress and now | board | Guide, NowPlaying, Player |
| 4 | A readability shade | board | Player |
| 5 | Five UI sounds | board | Effects (kept) |
| 5 | Each sound on its action | board | Effects |
| 5 | A startup jingle and an ambient loop | board | Effects, Decisions (your call) |
| 5 | Jingles where the target has them | not in the target | Decisions |
| 5 | The ambient loop waits | board | Decisions (only if you want a loop) |
| 5 | Client Settings apply | tests | tests |
| 6 | theme.json complete | tests | build (music block if the startup sound is approved) |
| 6 | Every colour token, contrast | tests | icefin-hooks |
| 6 | Shape tokens | board | Effects (2 px radius family); build |
| 6 | The fallback player's tokens | tests | build |
| 6 | Type | board | all boards (Noto Sans 300/400, tabular figures for times) |
| 6 | Geometry from the reference | tests | clone_layout.py --theme tide |
| 6 | Original illustrations and icons only | board | Effects (not copied) |
| 7 | Nothing runs past the window | tests | host walk cut-off audit |
| 7 | 16:9, wider, 4K | tests | build; tests |
| 7 | Custom CSS and plugins | tests | tests |
| 7 | The theme's overlay use is its own | tests | tests |
| 7 | The engine stays theme-agnostic | tests | theme lint |
| 8 | theme_tide.py and clone_layout | tests | to write in the build |
| 8 | A reach walk | tests | to run in Verify |
| 8 | A polish test | tests | tide_polish.py, to write |
| 8 | Player, menu, music, sign-in, framed pages | tests | to write |
| 8 | Polish tests on your Icefin | tests | host, in Verify |
| 8 | A host walk and Gate 2 | tests | Verify and Gate 2 |

## Build notes (2026-11-14, after Gate 1)

Built in Tide's own scripts (themes/tide): kit.js (helpers, the ground, the clock and song line, hints, the pointer's
Back and Home), panel.js (the options panel with levels, steppers, switches, fields, notices), column.js (the column
engine: the cross bar, nested levels, the trail, the letter strip, flights), data.js (entries and a library's
sections), home.js, itemmenu.js, details.js, tv.js, library.js (library routes, #/list, sort and filter, search),
np.js, player.js, settings.js (the frame, Settings › Home), account.js (profile, Quick Connect, forgot password,
sign-in), interim.js (the engine's settings hub and web-player fallback, in Tide's look). Tests: tests/icefin/web/
tide_pass.py and tide_probe.py, in the lab. Walks run in the lab at the user's request (theme_walk.py --lab).

Not built yet, or not as drawn: the photo viewer's light frame (jellyfin-web's slideshow as it is), "Find servers on
this network" (no engine call for it), the profile's Easy PIN (not in the engine's account calls).

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
