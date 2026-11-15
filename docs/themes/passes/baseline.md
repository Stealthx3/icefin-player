# baseline: completeness pass

Copied from docs/themes/CHECKLIST.md at the start of the pass (2026-11-14, main 22799023). Tick an item
when baseline does it in its own look and a test checks it, or write the user's reason beside it. Motion is judged by the six
principles (PIPELINE.md, The measure).

## Where the pass starts (walk 1, 2026-11-14)

Walk: in the VM lab (the user's choice for this pass), the lab's build and server; **0 of 69** entries drawn by
Baseline, **62 gaps**, 41 failing checks (all "nothing has focus: a controller can't start"), 6 skipped (nothing in
the lab library for them). Contact sheet: `build-walk/baseline/20261114-151457/index.html`; gap list:
`docs/themes/coverage/baseline.md`.

Baseline today registers no screens: every route is jellyfin-web's own page (the desktop layout: the app bar with the
libraries, My Media and the home sections, the library pages with their tabs, the details pages), its dialogs and
action sheets in jellyfin-web's own look, and the engine's layers (tokens, sounds off, the overlay) under it. Its
sounds are none; there are no hints; a pad or remote finds nothing focused on 41 of the screens.

**The user's direction for this pass** (2026-11-14): "visually baseline should just be a 1:1 re-implementation of the
stock Jellyfin-web with the theme engine. As far as augmentations, we will still be adding the full spectrum of theme
sounds, page-aware hints, and improving controller support." So the target is stock jellyfin-web itself (D31: the
stock web client, engine off, stays the pure control; Baseline re-implements its layout with the engine and is where a
plugin's themed UI is built first). Every look and motion item of the checklist is judged against stock: the same
layout, colours, type, cards and transitions, drawn by the engine; the additions are the sound set, page-aware hints
and controller reach (focus on arrival, a visible focus, every control reachable, Back innermost first).

| Area | Walk | What is missing |
|---|---|---|
| Home (1.1) | stock | not drawn by the engine; nothing focused on arrival; no hints |
| Frame (1.2, 1.12) | stock | jellyfin-web's app bar and drawer, not the engine's |
| Libraries, lists, search (1.3) | 13 stock; sort-filter, new-playlist missing | jellyfin-web's pages; the walk can't open their menus with a pad |
| Details (1.4) | 12 stock; pickers missing | jellyfin-web's pages (Baseline kept them as the control in 9.18) |
| Item menu (1.5) | 9 restyled | jellyfin-web's action sheet and dialogs (already its look) |
| Music (1.7) | 3 stock | |
| Player (1.8) | osd stock; 3 restyled | jellyfin-web's controls |
| Settings, account, sign-in (1.10, 1.11) | 13 stock | |
| Input (2) | 41 failing focus checks | no focus on arrival; no hints; the app bar unreachable from the content by ▲ on some pages |
| Sound (5) | | none |

Judged by the six principles: stock jellyfin-web's own motion (card focus lift on the TV layout, page fades, the
action sheet's slide) is the measure; Baseline must match it, not improve on it.

## Gate 1 decisions (the user, 2026-11-14)

1. **How 1:1 is reached: Baseline's own copy of the styles.** Baseline's stylesheet carries stock's look itself
   (not jellyfin-web's class names), so it stands on its own; the comparison with stock's captures catches drift.
2. **The target is jellyfin-web's TV layout**, not the desktop layout Icefin shows today. The boards' screens are
   re-captured from stock in the TV layout (walk with `ICEFIN_WALK_LAYOUT=tv`, labhost.py).
3. **Branding:** "Within the theme, use server-side branding where possible. The app itself and client-specific
   pages should use the Icefin-Player art assets." The theme shows the server's own branding (its logo and splash
   where the server sets them); Icefin's pages (Client Settings, Icefin's own screens) and the app use Icefin-Player's
   art (`/mnt/FileDrive/Personal/Projects/IceSuite/IceFin`, D15). Jellyfin's own marks are not used.
4. **Focus: A**, stock's TV focus (the card grows and gets a light frame).
5. **Controller additions: all four**: ≡ opens the item menu, ▶ plays the focused item, L1 R1 change tabs, and
   "Exit Icefin?" on Back at the home; with focus on arrival, the hint line and the sounds.
6. **Plugins: built in this pass.** Plugin UI on stock's pages (home sections, details buttons) gets its Baseline
   version now, against the lab's plugin servers (theme_plugins.py, D10).
7. **Sounds: the whole set made in this pass**, then the soundboard for the user's approval before Gate 2.

## Gate 1 map: every checklist item (2026-11-14)

The target is stock jellyfin-web (the user's direction). Every item below is one of: **board** (on the Baseline Screens canvas, https://claude.ai/artifact/Ya6BBXs1bnLm5JbwVQy6LP: stock's screen Baseline draws again, or one of the additions), **tests** (behaviour the build's tests check), or **not in the target** (stock doesn't have it, so Baseline doesn't). None is missing. Totals: 97 on boards, 30 by tests, 16 not in the target.

| § | Item | Covered by | Where |
|---|---|---|---|
| 1.1 | The target's home | board | Home (stock's home: My Media and the home sections) |
| 1.1 | Home chrome (clock, Settings, Search) | board | Home (stock's app bar: search, Play on, SyncPlay, the user menu; stock has no clock) |
| 1.1 | The server's status | board | Home (the server's name in the app bar, as stock); Notices are stock's toasts |
| 1.1 | Each library shows what it is | board | Home (My Media: each library's own image or icon, as stock) |
| 1.1 | A preview or focus state | board | Focus (stock's own focus, A) |
| 1.1 | Sub-views of the home by query | board | Home (stock's Home and Favourites tabs) |
| 1.1 | The order is the user's | board | Settings1 (stock's Home preferences: the sections' order) |
| 1.1 | The music capsule | board | Home (stock's now playing bar) |
| 1.1 | Exit at the root | board | Decisions 5 (an addition for the controller) |
| 1.2 | A shared frame | board | every board (stock's app bar) |
| 1.2 | A colour per content kind | not in the target | stock has one accent for everything |
| 1.2 | Now playing on every framed screen | board | Home (stock's now playing bar, on every page) |
| 1.3 | Every library type on its routes | board | Libraries1–3; registration checked by tests |
| 1.3 | Section tabs | board | Libraries1 (stock's library tabs) |
| 1.3 | Drill-downs with Play all and Shuffle | board | Libraries2 (a genre's list), Details2 |
| 1.3 | Sort and filter, A–Z jump | board | Libraries1 (stock's sort, filter and A–Z) |
| 1.3 | Grids page like the target | board | Libraries1 (stock's grid and paging) |
| 1.3 | Playlists (New), photos by day, books with a start position | board | Libraries3 |
| 1.3 | Series: Next Up's season first, first unwatched focused | board | Details1 |
| 1.3 | Continue Watching and Next Up screens | board | Libraries1 (Suggestions) |
| 1.3 | Search with type filters and keyboard | board | Home (stock's search) |
| 1.3 | Empty states | board | Libraries2 (stock's empty Recordings) |
| 1.4 | Every item type with every function | board | Details1–3; functions checked by tests |
| 1.4 | In the theme's frame, tabs that follow the scroll | not in the target | stock's details scroll as a page without tabs |
| 1.4 | Clear labels | board | Details1 (stock's labels) |
| 1.4 | Placeholders | board | Details2 (stock's placeholders) |
| 1.4 | Pickers as the theme's | board | Details1 (stock's selects) |
| 1.4 | Back to the top | tests | Back innermost first; tests |
| 1.5 | The theme's own item menu, context-aware | board | Menus1 (stock's action sheet) |
| 1.5 | Each dialog it opens | board | Menus1, Menus2 |
| 1.5 | jellyfin-web's leftover dialogs as the theme's | board | Menus1–2 (they are the theme's look) |
| 1.5 | A notice (toast) | board | stock's toast (Hints board's chip uses its colour) |
| 1.6 | Channels, guide, recordings, schedule | board | Libraries2 |
| 1.6 | A programme's sheet with steppers | board | Libraries2 (stock's programme menu and recording dialog) |
| 1.6 | Previews that fall back | board | Libraries2 |
| 1.6 | Connecting dialog and its error | board | Account (stock's) |
| 1.7 | Now playing, Queue, Lyrics | board | Music |
| 1.7 | Instant mix | board | Details2 |
| 1.8 | The theme's controls | board | Player |
| 1.8 | Pickers as the theme's cards | board | Player |
| 1.8 | Skip prompts and Up next | board | Player (stock's skip and up-next) |
| 1.8 | Live TV in the player | board | Player |
| 1.8 | The web fallback (ui.osd) | tests | stock's controls are the player itself; tests |
| 1.8 | A readability shade | board | Player (stock's) |
| 1.8 | Photos and books | board | Libraries3 |
| 1.9 | Play on and Watch together | board | Music |
| 1.10 | The settings hub | board | Settings1 |
| 1.10 | Client Settings in the frame | board | Settings1 |
| 1.10 | Settings › Home | board | Settings1 |
| 1.10 | The preference pages | board | Settings1, Settings2 |
| 1.10 | The user's menu (You) | board | Settings1 (stock's user menu) |
| 1.10 | Profile and Quick Connect approve | board | Settings2, Account |
| 1.11 | Sign in | board | Account |
| 1.11 | Choose and add a server | board | Account |
| 1.11 | Nothing before sign-in; stock without a theme | tests | checked by tests |
| 1.12 | A frame around every page not drawn | board | every board (stock's app bar) |
| 1.12 | jellyfin-web's chrome hidden, a band | not in the target | Baseline's frame is stock's chrome itself |
| 1.12 | The page's ground on its own layer | tests | build |
| 1.12 | Content clears the frame | tests | build; the cut-off audit |
| 1.12 | Fields, buttons, switches, lists restyled | board | Settings1–2 (stock's own) |
| 1.12 | The on-screen keyboard | board | Home (search), in stock's look |
| 1.12 | Dashboard and plugin pages stay stock | tests | checked by tests |
| 1.12 | A way out to stock | board | Settings1 (the Jellyfin-Web choice in Client Settings) |
| 2.1 | Pad reaches everything the mouse can | tests | reach walk (lab) |
| 2.1 | Reached by presses alone | tests | reach walk (lab) |
| 2.1 | Only the visible page's items take focus | tests | build (rows window) |
| 2.1 | Grids page at their edges | board | Focus, Hints (the controller additions) |
| 2.1 | Modal cards hold focus | tests | the list box; tests |
| 2.1 | Framed pages as one screen | tests | reach walk |
| 2.2 | Focus always shown | board | Focus, Hints (the controller additions) |
| 2.2 | Room for the glow | tests | Focus A grows the card: the cut-off audit checks room |
| 2.2 | Glow over an engine shadow | not in the target | stock has no glow |
| 2.2 | Hover apart from focus | board | Focus (the mouse keeps stock's hover) |
| 2.3 | The focused item's caption | board | stock's card titles under each card |
| 2.3 | A name pill under the focused item | not in the target | stock shows the title under every card |
| 2.3 | Page-aware controller hints | board | Hints |
| 2.4 | Back, innermost first | board | Focus, Hints (the controller additions) |
| 2.4 | Menu acts on the focused item | board | Focus, Hints (the controller additions) |
| 2.4 | Play/Pause acts on the focused item | board | Focus, Hints (the controller additions) |
| 2.4 | Search and Home from anywhere | board | Focus, Hints (the controller additions) |
| 2.4 | Steppers | board | Focus, Hints (the controller additions) |
| 2.4 | Destructive actions confirm | board | Focus, Hints (the controller additions) |
| 2.4 | Focus comes back where it was | board | Focus, Hints (the controller additions) |
| 2.5 | Hover moves focus | board | Focus |
| 2.5 | Clicking outside a sheet closes it | tests | stock's behaviour; tests |
| 2.5 | Pointer seeking | board | Focus, Hints (the controller additions) |
| 2.5 | The physical keyboard | board | Focus, Hints (the controller additions) |
| 2.5 | Text fields open the keyboard | board | Focus, Hints (the controller additions) |
| 2.6 | One reorder model | board | Details3 (a playlist's Move), Settings1 |
| 2.6 | Reorder by pointer | board | Details3 (stock's drag) |
| 2.7 | Any input brings the controls back | board | Focus, Hints (the controller additions) |
| 2.7 | ◀▶ on the focused time line | board | Focus, Hints (the controller additions) |
| 2.7 | A new skip prompt takes focus | board | Focus, Hints (the controller additions) |
| 3 | A recognisable focus animation | board | Focus (stock's card growth) |
| 3 | Page turns | board | stock's page transitions (every board) |
| 3 | The preview opens from the item | not in the target | stock opens details as a page |
| 3 | Tabs move toward the tab picked | board | Libraries1 (stock's tabs) |
| 3 | The caption cross-fades | not in the target | stock has no caption to fade |
| 3 | Shared-element flights | not in the target | stock has none |
| 3 | Sheets and dialogs leave through the engine | board | Menus1 (stock's sheet animation, through the engine's overlay) |
| 3 | Side panels slide from their edge | not in the target | stock has no side panels (its drawer is not shown in the desktop layout) |
| 3 | Caption and hints step back under a sheet | board | Hints (the line follows the sheet) |
| 3 | Now playing slides in and out | board | Home (stock's now playing bar) |
| 3 | Player chrome fades and slides | board | Player (stock's) |
| 3 | Progress lines, lyrics, smooth scrolls | board | Music (stock's) |
| 3 | Ambient loops on decoration only | not in the target | stock has none |
| 3 | Low motion turns all of it off | tests | tests |
| 4 | A signature ground | board | stock's backdrops on details and the dark ground |
| 4 | Item framing | board | stock's cards |
| 4 | Reflections | not in the target | none in the target |
| 4 | Fade masks | board | stock's details backdrop |
| 4 | Original animated illustrations | not in the target | none in the target |
| 4 | Live tiles | not in the target | stock has none |
| 4 | Object metaphors | not in the target | none in the target |
| 4 | A muted preview | not in the target | stock has none |
| 4 | Fallbacks for missing pictures | board | Home (stock's icons on coloured cards) |
| 4 | Custom chrome geometry | board | every board (stock's app bar geometry); the pass's comparison test |
| 4 | Glows on progress and now | board | stock's progress bars |
| 4 | A readability shade | board | Player (stock's) |
| 5 | Five UI sounds | board | Sounds |
| 5 | Each sound on its action | board | Sounds |
| 5 | A startup jingle and an ambient loop | board | Sounds, Decisions 7 (the soundboard first) |
| 5 | Jingles where the target has them | not in the target | stock has none |
| 5 | The ambient loop waits | board | Sounds (off by default, ducks under playback) |
| 5 | Client Settings apply | tests | tests |
| 6 | theme.json complete | tests | build |
| 6 | Every colour token, contrast | tests | icefin-hooks |
| 6 | Shape tokens | board | every board (stock's shapes); build |
| 6 | The fallback player's tokens | tests | build |
| 6 | Type | board | every board (stock's type) |
| 6 | Geometry from the reference | tests | the pass's comparison test against stock's captures |
| 6 | Original illustrations and icons only | board | Decisions 3 (Icefin's mark in the app bar; stock's Material icons are jellyfin-web's own, kept) |
| 7 | Nothing runs past the window | tests | lab walk cut-off audit |
| 7 | 16:9, wider, 4K | tests | build; tests |
| 7 | Custom CSS and plugins | tests | tests |
| 7 | The theme's overlay use is its own | tests | tests |
| 7 | The engine stays theme-agnostic | tests | theme lint |
| 8 | theme_baseline.py and the comparison with stock | tests | to update in the build |
| 8 | A reach walk | tests | lab walk in Verify |
| 8 | A polish test | tests | baseline_pass.py, to write |
| 8 | Player, menu, music, sign-in, framed pages | tests | baseline_pass.py groups |
| 8 | Polish tests | tests | in the lab (this pass) |
| 8 | A lab walk and Gate 2 | tests | Verify and Gate 2 |

## Where the pass ended (2026-11-15, Gate 2 approved)
The user approved Gate 2 ("Approved, merge it") on the report https://claude.ai/artifact/BdJchX3PA1t83UF3QWr8s4. Main's
new app icon (#177) came in with the last merge from main, and Baseline's home shows it. Left open: the signed-out
pages have no test yet; Home Screen Sections waits for a server where the plugin answers; the TV scroll opt-out for
other themes is an engine follow-up.

## Build notes (2026-11-14 and 15, after Gate 1)

Built in Baseline's own scripts (themes/baseline, bl-* classes, the user's call 1), against jellyfin-web 10.11's TV
layout as captured in the lab (stock's TV captures; the layout set to tv, call 2): kit.js (stock's TV header with
SyncPlay, Search, Settings and the clock, tabs, cards with stock's shapes, default colours and icons, rows that slide
to keep focus in view, raised buttons, the page's own scroll, hints, the toast, Icefin's app mark (the Progress ring, #177) on the home and the
server's branding where it has one, call 3), panel.js (stock's action sheet and form dialog), itemmenu.js (the
engine's actions in stock's wording, order and icons; Add to Playlist and Add to Collection as stock's form), home.js
(the user's own home sections, homesection0–9, in their order; Favorites; L1 R1 between the tabs; the exit question;
Home Screen Sections when the plugin is on, call 6), library.js (Movies, Shows and Music with stock's tabs, toolbar,
grid and A–Z strip; #/list for plain libraries, genres, studios and people), details.js (every kind), browse.js
(search with stock's letters and Suggestions; Live TV's Programs, Guide, Channels, Recordings, Schedule and Series),
settings.js (stock's settings menu, Profile, Quick Connect, Client Settings as jellyfin-web's dialog under Baseline's
header, and the signed-out pages with the server's splash and disclaimer), np.js (Now Playing and Lyrics, stock's
remote-control page), player.js (stock's OSD and its Settings, Audio and Subtitles sheets).

Augmentations only (the user's direction): the whole sound set (five interface sounds; a startup piece, an ambient
loop and a goodbye jingle on Exit and Sign Out; soundboard https://claude.ai/artifact/WFWG4k6R3YrU27u9F4nfsv, call 7),
page-aware hints, and the controller additions (≡ the item's menu, ▶ plays the focused item, L1 R1 change tabs, the
exit question on Back at the home, call 5). Focus is stock's TV focus (call 4).

Tests: baseline_pass.py (48 checks, PASS in the lab); the walk in the TV layout, 51 of 69 drawn by Baseline, 0 with
failing checks. Its 11 gaps: the five preference pages (jellyfin-web's own, stock already, as decided); the details
Audio and Subtitles pickers on a film with one audio track and none (stock shows them as plain text, so nothing opens);
Play on (stock's TV header has no cast button); and the player's Audio, Subtitles and Settings (with one track and no
subtitles stock hides Audio and Subtitles, as Baseline does; the walk then clicks jellyfin-web's hidden button, which
hands that session to jellyfin-web's controls, so Settings after it is jellyfin-web's too); baseline_probe.py for looking; theme-lint (one narrow exception:
the display-preferences client key jellyfin-web keeps home sections under is an API identifier, not branding).

Found on the way:
- `.bl-screen button { font: inherit }` outranked every button class's own size and weight (lyrics, raised buttons):
  now `:where(.bl-screen) button`, with no specificity.
- jellyfin-web's TV layout scrolls the nearest scrollable parent of whatever takes focus (its scroll manager, on every
  focusin), so it nudged Baseline's pages past their headers. A page that scrolls itself says so with
  data-scroll-mode-x/y="custom", which jellyfin-web leaves alone; Baseline's page does. Other themes with their own
  scrolling pages may have the same nudge in the TV layout (an engine follow-up: set it on the theme root).
- Home Screen Sections, turned on in the lab's 12.4 server, does not answer `/HomeScreen/Sections` (no reply in 400 s;
  its settings were put back). Baseline uses the plugin's sections when it answers within 8 s and stock's otherwise,
  so it could not be compared live; a working plugin server is needed for that.
- A sourceless "Script error." appears once in a full pass run, never with any group on its own: another origin's
  script, masked by the browser (Baseline's own errors carry icefin-theme://baseline/… and a line). The pass ignores
  only that form.

Not as stock: the OSD's Quality entry (the engine's player has no quality list) and its fullscreen button (the app is
full screen); Allow public access on Add to Playlist (the engine creates playlists without it); Client Settings keeps
the engine's controller-friendly host (stock's is a plain dialog) with the section rail hidden.

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
