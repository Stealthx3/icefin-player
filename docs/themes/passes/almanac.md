# almanac: completeness pass

Copied from docs/themes/CHECKLIST.md at the start of the pass (2026-11-14, main 224020fe). Tick an item
when almanac does it in its own look and a test checks it, or write the user's reason beside it. Motion is judged by the six
principles (PIPELINE.md, The measure).

## Where the pass starts (walk 1, 2026-11-14)

Walk: in the VM lab (the user's choice for this pass), the lab's build and server; **17 of 69** entries drawn by
Almanac, **45 gaps**, 22 failing checks, 6 skipped (nothing in the lab library for them). Contact sheet:
`build-walk/almanac/20261114-131559/index.html`; gap list: `docs/themes/coverage/almanac.md`.

Almanac today is the guide and nothing else of its own: the home and Live TV open a cable-guide grid (an info pane
with the live channel muted in the corner, a tab strip, channel rows over two hours, lime focus on navy), the engine's
details and settings screens in Almanac's colours, and jellyfin-web for the rest. The tab strip's library tabs open
jellyfin-web's pages.

| Area | Walk | What is wrong |
|---|---|---|
| Home (1.1) | drawn | the guide only: no Continue Watching, Next Up, favourites or libraries on the home; no server status, no exit question, no music entry |
| Frame (1.2, 1.12) | — | none: the tabs lead to jellyfin-web's header, drawer and grids |
| Libraries, lists, search (1.3) | 10 stock, sort-filter and new-playlist missing | every library, the genre list and search are jellyfin-web's |
| Details (1.4) | drawn (engine), book, photo album, channel stock | the engine's layout in Almanac's colours, not the target's info pane over a grid |
| Item menu (1.5) | 9 restyled, pickers missing | jellyfin-web's sheets and dialogs in Almanac's colours |
| Music (1.7) | queue, lyrics stock | |
| Player (1.8) | 4 restyled | jellyfin-web's controls; no info banner of the target's kind |
| Play on, Watch together (1.9) | 2 restyled | jellyfin-web's dialogs |
| Settings, account, sign-in (1.10, 1.11) | hub drawn; 11 stock | preference pages, profile, Quick Connect and sign-in unframed |
| Input (2) | 22 failing focus checks | no focus on arrival on jellyfin-web's pages; no ≡ on items; no hints, though the target has a hint bar |
| Motion (3) | | the guide pages and moves its focus; nothing else moves: no panel, no transitions between screens |
| Sound (5) | | five UI sounds; no startup sound |

Judged by the six principles: **timing** and **easing** are fine where anything moves (the guide's page turns);
**spatial orientation** holds inside the guide (time runs right, channels down) and is lost everywhere else;
**directing focus** fails on 22 screens with nothing focused; **visual continuity** has nothing between the guide and
the screens it opens; **clarity** is good in the guide (one lime cell, the info pane says what it is) and absent outside.

The design for the pass (34 boards on the "Almanac Screens" canvas, https://claude.ai/artifact/VhqvpTKGm29uv2uZE5gUH9, Gate 1): the guide's grammar everywhere. Every
screen is the info pane over a grid: a library's sections are rows like channels, its items run right like programmes;
details, settings and search keep the same info pane and rows; options come as a list box; the player gets the
target's kind of info banner; hints sit in the bottom bar the target has. No logos, icons, fonts, sounds or names from
the target.

## Gate 1 map: every checklist item (2026-11-14)

Every item below is one of: **board** (drawn on the Almanac Screens canvas, https://claude.ai/artifact/VhqvpTKGm29uv2uZE5gUH9), **tests** (behaviour the build's tests check), or **not in the target** (a reason on the Decisions board or here, for your call at Gate 1). None is missing. Totals: 104 on boards, 30 by tests, 9 not in the target.

| § | Item | Covered by | Where |
|---|---|---|---|
| 1.1 | The target's home | board | Home, HomeMusic (Decisions 1: rows of what to watch, the guide a tab) |
| 1.1 | Home chrome (clock, Settings, Search) | board | Home (clock line; Search and Settings are tabs) |
| 1.1 | The server's status | board | Home (dot in the clock line), Settings (reachable, Change server), Notices (server lost) |
| 1.1 | Each library shows what it is | board | Home (Libraries row; Continue and Next up cells show the item), Effects (fallbacks) |
| 1.1 | A preview or focus state | board | Home, Guide (the info pane says what the lime cell is; the corner preview fades in after 1.5 s) |
| 1.1 | Sub-views of the home by query | board | Home (one #/home; Libraries row opens each library's own route), Library |
| 1.1 | The order is the user's | board | HomeOrder |
| 1.1 | The music capsule | board | HomeMusic (Now playing row and the song at the hint bar's right on every screen) |
| 1.1 | Exit at the root | board | ExitPanel |
| 1.2 | A shared frame | board | Home, Library, DetailsMovie, Settings, PrefsFramed (info pane, tabs, rows, hint bar) |
| 1.2 | A colour per content kind | not in the target | the target is one palette (navy, denim, lime); kinds are told by the row's label and mark (▶ ↻ ● ✦ ★) |
| 1.2 | Now playing on every framed screen | board | HomeMusic (song at the hint bar's right, every screen) |
| 1.3 | Every library type on its routes | board | Library, Listing, PhotosBooks, Guide, Search; registration checked by tests |
| 1.3 | Section tabs | board | Library (a library's sections are its rows) |
| 1.3 | Drill-downs with Play all and Shuffle | board | Listing (note), DetailsAlbum |
| 1.3 | Sort and filter, A–Z jump | board | SortFilter, Listing (letters are the channel column) |
| 1.3 | Grids page like the target | board | Library (a row pages right at its end), Listing (▲▼ letters), MotionPanel (guide pages) |
| 1.3 | Playlists (New), photos by day, books with a start position | board | MenuDialog (New playlist first), PhotosBooks |
| 1.3 | Series: Next Up's season first, first unwatched focused | board | DetailsSeries |
| 1.3 | Continue Watching and Next Up screens | board | Home, Library (rows; ▶ at the row's end opens the full listing) |
| 1.3 | Search with type filters and keyboard | board | Search (a row per kind) |
| 1.3 | Empty states | board | Notices |
| 1.4 | Every item type with every function | board | DetailsMovie, DetailsSeries, DetailsAlbum, Programme, PhotosBooks; functions checked by tests |
| 1.4 | In the theme's frame, tabs that follow the scroll | board | DetailsSeries (season tabs), DetailsAlbum; rows scroll by whole rows (MotionPanel) |
| 1.4 | Clear labels | board | DetailsMovie (Resume from 42:10), DetailsSeries |
| 1.4 | Placeholders | board | Notices (loading sheen), Effects |
| 1.4 | Pickers as the theme's | board | DetailsMovie (Audio, Subtitles, Version cells open the list box) |
| 1.4 | Back to the top | tests | Back on a details row below the first returns to Watch first; checked by tests |
| 1.5 | The theme's own item menu, context-aware | board | ItemOptions |
| 1.5 | Each dialog it opens | board | MenuDialog, WideDialog |
| 1.5 | jellyfin-web's leftover dialogs as the theme's | board | MenuDialog (note), Notices |
| 1.5 | A notice (toast) | board | Notices, MenuDialog |
| 1.6 | Channels, guide, recordings, schedule | board | Guide, Programme (note), Notices (no guide data) |
| 1.6 | A programme's sheet with steppers | board | Programme |
| 1.6 | Previews that fall back | board | Guide (muted live corner), Notices |
| 1.6 | Connecting dialog and its error | board | Notices (server lost) |
| 1.7 | Now playing, Queue, Lyrics | board | NowPlaying |
| 1.7 | Instant mix | board | DetailsAlbum |
| 1.8 | The theme's controls | board | Player |
| 1.8 | Pickers as the theme's cards | board | PlayerExtras (options list box) |
| 1.8 | Skip prompts and Up next | board | PlayerExtras |
| 1.8 | Live TV in the player | board | Player (note), Hints (◀▶ channel) |
| 1.8 | The web fallback (ui.osd) | tests | osd tokens from Player's look; checked by tests |
| 1.8 | A readability shade | board | Player (banner gradient) |
| 1.8 | Photos and books | board | PhotosBooks |
| 1.9 | Play on and Watch together | board | PlayOn |
| 1.10 | The settings hub | board | Settings |
| 1.10 | Client Settings in the frame | board | Settings (This player row), PrefsFramed |
| 1.10 | Settings › Home | board | HomeOrder |
| 1.10 | The preference pages | board | PrefsFramed (Decisions 3) |
| 1.10 | The user's menu (You) | board | Settings (You row), Profile |
| 1.10 | Profile and Quick Connect approve | board | Profile, QuickConnect |
| 1.11 | Sign in | board | SignIn |
| 1.11 | Choose and add a server | board | SignIn (Servers tab, note) |
| 1.11 | Nothing before sign-in; stock without a theme | tests | checked by tests |
| 1.12 | A frame around every page not drawn | board | PrefsFramed |
| 1.12 | jellyfin-web's chrome hidden, a band | board | PrefsFramed |
| 1.12 | The page's ground on its own layer | tests | build |
| 1.12 | Content clears the frame | tests | build; the lab walk's cut-off audit |
| 1.12 | Fields, buttons, switches, lists restyled | board | PrefsFramed, WideDialog |
| 1.12 | The on-screen keyboard | board | Search |
| 1.12 | Dashboard and plugin pages stay stock | tests | checked by tests |
| 1.12 | A way out to stock | board | Settings (This player › Theme) |
| 2.1 | Pad reaches everything the mouse can | tests | reach walk (lab) |
| 2.1 | Reached by presses alone | tests | reach walk (lab) |
| 2.1 | Only the visible page's items take focus | tests | build (rows window) |
| 2.1 | Grids page at their edges | board | Library, MotionPanel (guide half-hours, rows by whole rows) |
| 2.1 | Modal cards hold focus | tests | the list box; tests |
| 2.1 | Framed pages as one screen | tests | reach walk |
| 2.2 | Focus always shown | board | every board (one lime cell); tests |
| 2.2 | Room for the glow | not in the target | the target's focus is a fill, not a glow; nothing to clear (cut-off audit still runs) |
| 2.2 | Glow over an engine shadow | not in the target | as above: lime fill, no glow |
| 2.2 | Hover apart from focus | tests | pointer: hover moves focus (the target has no separate hover); tests |
| 2.3 | The focused item's caption | board | every screen's info pane (Home, Library, Guide, DetailsSeries) |
| 2.3 | A name pill under the focused item | not in the target | the info pane names the lime cell at the top of the screen |
| 2.3 | Page-aware controller hints | board | Hints (every row kind, remote and pad words), every board's hint bar |
| 2.4 | Back, innermost first | board | MotionScreens, MotionPanel, ExitPanel; tests |
| 2.4 | Menu acts on the focused item | board | ItemOptions, Programme |
| 2.4 | Play/Pause acts on the focused item | board | Home, Library, Listing hints; tests |
| 2.4 | Search and Home from anywhere | board | Home (Search tab), Hints; the Home key goes to #/home (tests) |
| 2.4 | Steppers | board | SortFilter, Programme, PlayerExtras |
| 2.4 | Destructive actions confirm | board | ExitPanel, ItemOptions (Delete…), Profile (Sign out) |
| 2.4 | Focus comes back where it was | board | MotionScreens (Back returns to the cell); tests |
| 2.5 | Hover moves focus | tests | pointer; tests |
| 2.5 | Clicking outside a sheet closes it | tests | the list box's dim closes it; tests |
| 2.5 | Pointer seeking | board | Player, NowPlaying |
| 2.5 | The physical keyboard | board | Search, QuickConnect |
| 2.5 | Text fields open the keyboard | board | Search, WideDialog, Profile |
| 2.6 | One reorder model | board | HomeOrder, NowPlaying (the lift) |
| 2.6 | Reorder by pointer | board | HomeOrder (note) |
| 2.7 | Any input brings the controls back | board | Player (note); tests |
| 2.7 | ◀▶ on the focused time line | board | Player, NowPlaying |
| 2.7 | A new skip prompt takes focus | board | PlayerExtras |
| 3 | A recognisable focus animation | board | MotionPanel (the lime fill moves), MotionTimings |
| 3 | Page turns | board | MotionPanel (guide half-hour), MotionScreens (tab to tab) |
| 3 | The preview opens from the item | board | MotionScreens (rows out from the lit cell, details in) |
| 3 | Tabs move toward the tab picked | board | MotionScreens (rows slide the way you moved) |
| 3 | The caption cross-fades | board | MotionPanel, MotionTimings (info pane) |
| 3 | Shared-element flights | not in the target | the target cuts between screens; continuity is the fixed frame and the lit cell kept to last (MotionScreens) |
| 3 | Sheets and dialogs leave through the engine | board | MotionPanel |
| 3 | Side panels slide from their edge | board | MotionPanel (list box from the right) |
| 3 | Caption and hints step back under a sheet | board | ItemOptions (dim), MotionPanel |
| 3 | Now playing slides in and out | board | MotionTimings (notice and banner timings), HomeMusic |
| 3 | Player chrome fades and slides | board | MotionPanel, MotionTimings (banner) |
| 3 | Progress lines, lyrics, smooth scrolls | board | NowPlaying, MotionTimings |
| 3 | Ambient loops on decoration only | board | Notices (loading sheen only) |
| 3 | Low motion turns all of it off | board | MotionScreens, MotionTimings |
| 4 | A signature ground | board | Effects (now-line sweep at startup), every board's navy gradient |
| 4 | Item framing | board | DetailsMovie (poster and corner backdrop) |
| 4 | Reflections | not in the target | none in the target |
| 4 | Fade masks | board | Player (banner), MotionScreens (rows masked under the tabs) |
| 4 | Original animated illustrations | not in the target | none in the target |
| 4 | Live tiles | board | Guide (the muted live channel in the corner) |
| 4 | Object metaphors | not in the target | none in the target |
| 4 | A muted preview | board | Guide (ui.mutedPreview) |
| 4 | Fallbacks for missing pictures | board | Notices, Effects |
| 4 | Custom chrome geometry | board | Guide (reference geometry: pane, tabs, channel column) |
| 4 | Glows on progress and now | board | Programme, Guide (the red now-line), NowPlaying |
| 4 | A readability shade | board | Player |
| 5 | Five UI sounds | board | Effects |
| 5 | Each sound on its action | board | Effects |
| 5 | A startup jingle and an ambient loop | board | Effects, Decisions 4 (soundboard first) |
| 5 | Jingles where the target has them | not in the target | the target has none beyond startup |
| 5 | The ambient loop waits | board | Effects (opt-in, ducks under playback) |
| 5 | Client Settings apply | tests | tests |
| 6 | theme.json complete | tests | build |
| 6 | Every colour token, contrast | tests | icefin-hooks |
| 6 | Shape tokens | board | every board (square cells, 2 px tab corners); build |
| 6 | The fallback player's tokens | tests | build |
| 6 | Type | board | every board (Noto Sans 400/600/700) |
| 6 | Geometry from the reference | tests | clone_layout.py --theme almanac (references/almanac.json) |
| 6 | Original illustrations and icons only | board | Effects, Decisions (no target assets) |
| 7 | Nothing runs past the window | tests | lab walk cut-off audit |
| 7 | 16:9, wider, 4K | tests | build; tests |
| 7 | Custom CSS and plugins | tests | tests |
| 7 | The theme's overlay use is its own | tests | tests |
| 7 | The engine stays theme-agnostic | tests | theme lint |
| 8 | theme_almanac.py and clone_layout | tests | to update in the build |
| 8 | A reach walk | tests | lab walk in Verify |
| 8 | A polish test | tests | almanac_pass.py, to write |
| 8 | Player, menu, music, sign-in, framed pages | tests | almanac_pass.py groups |
| 8 | Polish tests | tests | in the lab (this pass) |
| 8 | A lab walk and Gate 2 | tests | Verify and Gate 2 |

## Where the pass ended (2026-11-14, Gate 2 approved)

Walk 2 in the lab: **58 of 69** drawn by Almanac, **4 gaps** (the framed Display, Playback, Subtitles and Controls
pages, as approved at Gate 1), 0 failing checks, 6 skipped for want of lab data. Tests in the lab: almanac_pass.py
PASS, theme_almanac.py OK, clone_layout.py --theme almanac OK (the home's rows and the guide, 13 boxes). The user
approved the built screens at Gate 2 ("Approved, merge it"). Left for later: the startup sting and ambient bed (a
soundboard first, as with Tide), a season tab strip on series, the framed pages' checkbox spacing.

## Build notes (2026-11-14, after Gate 1)

Built in Almanac's own scripts (themes/almanac), forked from Tide's working modules where the behaviour is the same
and drawn in Almanac's grammar: kit.js (helpers, the clock and song line, hints in the bottom bar, the pointer's Back
and Home), panel.js (the list box: levels offset over the one under them, steppers, switches, fields, notices),
grid.js (the rows engine: the info pane, the corner picture, the tab strip, the header, rows like channels, folder
rows loading as they come into view, letter rows on long lists by name), data.js, home.js (the home's rows and
Settings), itemmenu.js, details.js (details as rows), guide.js (the 9.15 guide on the Guide tab, with the tab strip,
programme cards and recording marks), tv.js (Live TV's rows, programme cards), library.js (library routes, #/list,
sort and filter, search), np.js, player.js (the info banner), settings.js (the frame, Settings › Home with the lift),
account.js (profile, Quick Connect, forgot password, sign-in), interim.js (the engine's settings hub and the web
player's bar layout). Tests: almanac_pass.py (PASS), theme_almanac.py (OK) and clone_layout.py --theme almanac (13
boxes, OK), all in the lab; almanac_probe.py for looking.

Found on the way: the engine hides every element at the body's top level except its own layers while a themed screen
is up, so a hint bar or notice appended to the body is invisible there. Almanac's live in the open overlay or the
screen's root (D.layer). Tide 0.3.0 has the same fault (its hints were never visible on its own screens; its test read
the opacity, not the visibility): fixed on fix/9.48-tide-hints-layer.

Not as drawn: a series' seasons are rows of episodes, not tabs (the rows engine has one tab strip, the app's places);
the search keyboard is the engine's band across the bottom, not a grid in the channel column; the framed preference
pages don't flip with the shoulders (the frame gets no actions); Photos and books use the rows, then jellyfin-web's
viewers; the startup sting and ambient bed are not made (the soundboard first, as with Tide).

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
