# Theme packages (schema 1)

A theme is a folder. Icefin looks in, in order:
- `ICEFIN_THEME_PATH`, for development;
- the built-in themes (`themes/` in the source tree, including the benchmark themes: D22);
- the user's `themes` folder in Icefin's data directory.
The first package found with a given id wins.

| File | Required | What it is |
|---|---|---|
| `theme.json` | yes | Metadata and declared assets (below) |
| `tokens.json` | yes | Design tokens; see [TOKENS.md](TOKENS.md) |
| `styles.css` | no | Extra CSS on top of the tokens, declared as `"styles"` |
| fonts, images, sounds | no | Served from inside the package over `icefin-theme://<id>/<path>` |
| scripts | no | Screens and effects, declared as `"scripts"` |
| sounds | no | UI sounds, declared as `"sounds": {"focus"\|"select"\|"back"\|"navigate"\|"error": "path.wav"}`; volume token `sound.volume` (0–1) |

## theme.json
```json
{
  "schema": 1,
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "styles": "styles.css",
  "fonts": [{ "family": "My Sans", "file": "fonts/MySans.woff2", "weight": 400, "style": "normal" }],
  "scripts": ["screens.js"],
  "presets": { "light": { "color": { "background": "#…" } } }
}
```
- `id`: 2–48 characters of `a-z`, `0-9` and `-`.
- Every declared file must exist inside the package. Paths can't leave the package (`..`, absolute paths and
  symlinks that point outside are refused).

## What a package may load
This depends on where it comes from (SPEC "Theme trust levels"; 8.5 adds the CSS sanitizer and the "trust this
theme" flow):

| Source | Styles | Scripts | Fonts, images, sounds |
|---|---|---|---|
| Bundled, or from `ICEFIN_THEME_PATH` | yes | yes | yes |
| User-installed | not yet (8.5: sanitized) | only if the user marks it trusted (8.5) | yes |

## Screens (scripts)
The web runtime (`native/icefin/themeEngine.js`) exposes `window.icefinTheme`. While its scripts load, a theme
registers screens for routes. Any route it doesn't register stays jellyfin-web's own page.

```js
window.icefinTheme.registerScreen('#/home', {
  mount(root, ctx) { /* build the screen in root; mark focusable elements with data-icefin-focus */ },
  unmount() { /* optional */ },
  onBack() { return false; /* optional: true if the screen used Back */ }
});
```
- `ctx` is the theme script API below; it's also `window.icefinTheme.ctx` for code outside a screen.
- Focus: arrows move between `[data-icefin-focus]` elements by position; Enter clicks; the focused element gets
  the class `icefin-focused`. Themes can't remap input (SPEC "One input pipeline").
- Routes are written as jellyfin-web uses them, without query or `.html`: `#/home`, `#/details`.

## Theme script API (`icefinTheme.apiVersion` 1, PLAN 8.7)
Theme scripts reach Icefin and the server **only** through `ctx` and `window.icefinTheme`. The host globals behind them
(`window.ApiClient`, the playback manager, `window.api`, `jmpInfo`, `apiPromise`, `NativeShell`) and
`icefinTheme._engine` are private to the engine: upstream, jellyfin-web and the post-1.0 decoupling can change them,
and the engine absorbs that here instead of in every theme. `scripts/icefin/theme-lint.sh` rule 4 rejects them in
`themes/`. A breaking change to this table bumps `apiVersion`.

| Name | What it does |
|---|---|
| `icefinTheme.registerScreen(route, screen)` | While the theme's scripts load: a screen for a route (`#/home`, `#/details`, ...). Every other route is jellyfin-web's |
| `screen.mount(root, ctx)` | Build the screen in `root`; mark focusable elements `data-icefin-focus`. Called once the API client is signed in |
| `screen.unmount()` | Optional: stop timers and previews |
| `screen.onAction(action, ctx)` | Optional: sees every action (`up`, `down`, `left`, `right`, `enter`, `back`, ...) first; true when it used it |
| `screen.onBack()` | Optional: true when the screen used Back |
| `ctx.apiClient()` | The server client (jellyfin-web's ApiClient): items, images, user. Ask for it when you use it; on a cold start it appears after `ui.userViews()` resolves |
| `ctx.play(options)` | Starts playback (`{ids, serverId, startPositionTicks}` or `{items}`), through the capability prompt (6.3) like any play. A promise; `false` when the player isn't ready |
| `ctx.canPlay()` | True when the player is ready for `ctx.play` |
| `ctx.nowPlaying()` | `{item, player}` for what is playing or paused, or `null` |
| `ctx.navigate(hash)` | Go to a route (`#/details?id=...&serverId=...`) |
| `ctx.queue(options, {next})` | Queue items (`{ids, serverId}` or `{items}`) at the end, or right after what plays with `next: true` (9.44). A promise of true, or false without a player |
| `ctx.instantMix(item)` | An instant mix from a song, album, artist, playlist or genre, played at once (9.44) |
| `ctx.exit()`, `ctx.signOut()`, `ctx.selectServer()` | Quit Icefin; sign out (jellyfin-web's own Sign Out, so its saved sign-in is cleared too); go to the server list (9.44). For themes that replace jellyfin-web's menus |
| `ctx.servers()`, `ctx.connect(idOrAddress)`, `ctx.forgetServer(id)` | The servers this device knows (`[{id, name, address, lastUsed, current, signedIn}]`, newest first); connect to one (or an address): a promise of `{state, serverId}`, `SignedIn` goes home, `ServerSignIn` goes to `#/login?serverid=…`, else `Unavailable` or `ServerUpdateNeeded`; forget one (9.44) |
| `ctx.publicUsers()`, `ctx.signIn(name, password)`, `ctx.quickConnect()` | Sign-in on the server being signed in to (9.44): its listed users (`[{id, name, image, hasPassword}]`); a sign-in (`{ok, error}`, home on success, jellyfin-web keeps the session); Quick Connect: `null` when the server has it off, else `{code, expires, done, cancel()}` where `done` resolves `{ok}` once another device approves the code. Register the sign-in screens (`#/login`, `#/selectserver`, `#/addserver`) with `beforeSignIn: true` on the screen: screens otherwise wait for a signed-in session |
| `ctx.queueItems()`, `ctx.playQueueAt(id)`, `ctx.removeFromQueue(ids)`, `ctx.moveInQueue(id, index)`, `ctx.clearQueue()`, `ctx.saveQueueAsPlaylist(name)` | The play queue (9.44): `{index, items[{id, playlistItemId, name, artist, album, runtime, type, image}]}` or `null`; play, remove or move entries by `playlistItemId`; clear it; save it as a playlist. `ctx.playMode()` (`{repeat, shuffle}`), `ctx.setRepeat('RepeatNone' \| 'RepeatAll' \| 'RepeatOne')` and `ctx.setShuffle(on)` work for music too (over video they are also on `ui.player`) |
| `ctx.playTargets()`, `ctx.setPlayTarget(id)` | Play on (9.44): the devices what plays can go to (`[{id, name, kind ('this', 'tv', 'phone', 'computer', 'other'), app, current}]`) and a choice of one (this device's `id` brings it back) |
| `ctx.syncPlay.groups()`, `.join(id)`, `.create(name)`, `.leave()`, `.current()` | Watch together (SyncPlay, 9.44): the server's groups (`[{id, name, people}]`), joining, starting and leaving one; `current()` is the group this device is in (`{id, name}` or `null`) |
| `ctx.focus(el)`, `ctx.focused()` | Move focus to an element; the focused one (class `icefin-focused`) |
| `ctx.move(dir, within)` | Spatial move in a direction, confined to `within` (a dialog, a panel); true when focus moved |
| `ctx.sound(event)` | A UI sound: `focus`, `select`, `back`, `navigate`, `error` |
| `icefinTheme.ctx` | The same `ctx`, for chrome, overlays and timers outside a screen. Overlay panels get it with `close()` added |
| `icefinTheme.ui.*` | The engine capabilities: chrome, pivot, overlay, pagedGrid, carousel3d, liveTile, mutedPreview, userViews, parallax, material, cardExpand, guideGrid, keyboard, timePalette, backdrop, pointerFirst, motion; details in *Engine capabilities for screens* below |
| `icefinTheme.glyph(button)` | An original SVG for a controller button (`south`, `east`, `west`, `north`, `view`, ...) in the family of the pad used last (7.3) |
| `icefinTheme.active()` | `{id, source, route}` of the active theme and screen, or `null` |
| `icefinTheme.sound(event)` | Same as `ctx.sound` |
| `icefinTheme.apiVersion` | `1` |
| `icefinTheme.system` | What this machine can show and play (the capability model, 6.7), read-only and frozen, `null` until it answers: `{renderer: 'vulkan'\|'opengl', hdr: {display: 'yes'\|'no'\|'unknown', output}, video: {sdr, hdr10, hlg, dolbyVision58, dolbyVision7}, audio: {receiver, passthrough[], channels}, decoders: {serverConverts[]}}`. Each `video` value is `'SDR'`, `'tone-mapped SDR'`, `'HDR output'` or `'capability prompt'`. A new snapshot replaces it on change, with an `icefin-system` event on `window` (`detail` is the snapshot). Additive within API 1 |

## Trust (user-installed themes)
- Stylesheets are sanitized as they're served (`src/icefin/theme/CssSanitizer`):
  - `@import`, `image-set()`, `expression()` and `-moz-binding` are removed;
  - `url()` inside the package is rewritten to `icefin-theme:`, and any other `url()` becomes `none`;
  - escapes that spell ASCII refuse the whole stylesheet.
- Scripts and SVG load only after the user trusts the theme (`theme.setTrusted(id, true)`, after
  `theme.trustWarning()`). Trust is bound to a SHA-256 of the package's files: any change drops it.

## Stand-down (server plugin runtime)
If the server already injects the theme plugin's runtime, Icefin's web layers step aside:
- The plugin runtime defines `window.icefinPluginRuntime`, then dispatches `window.dispatchEvent(new Event('icefin-plugin-runtime'))`.
- Icefin removes its token stylesheet and doesn't mount its runtime or screens.
- Icefin calls `icefinPluginRuntime.attachNative({version: 1, client: 'icefin-player', tokens(), services})` once,
  so the plugin can use native services: the active tokens now; UI sounds and the backdrop as they land.

## Installing a package
A package file is a zip of the theme's folder: `theme.json` at its top, or inside one top-level folder. Client
Settings → Theme → *Install from file…* opens the file chooser (the desktop portal in the Flatpak). The package is
unpacked to a temporary folder and checked with the same rules as any user theme, then moved to the user themes
folder as `<id>/` (`src/icefin/theme/ThemeInstall`). Refused, with the reason shown and nothing installed:
- not a zip, larger than 64 MB, more than 4000 files or 256 MB unpacked;
- links, or paths that leave the package;
- an id a built-in or development theme uses.

Installing a package whose id you already installed updates it, and asks for trust again if it has scripts. *Remove*
deletes a theme you installed (not the active one). From scripts: `theme.installFile(path)`, `theme.pickPackage()`
(result with the `installFinished` signal) and `theme.removePackage(id)`.

## Per-user choice
The theme manager is in Client Settings → Theme (PLAN 9.21, `native/icefin/themeManager.js`):
- a theme list and a colour scheme (preset) list;
- a preview drawn from the chosen theme's tokens (`theme.previewTokens(id, preset)`). Nothing changes until *Apply*;
  *Cancel* goes back to the active theme;
- for a theme you installed with scripts, the trust warning and a box to allow them;
- *Install from file…* and *Remove*.

The choice belongs to the signed-in user:
- it's cached on the device (instant at startup, works offline);
- it's synced to the server's DisplayPreferences (`usersettings`, client `icefin-player`, custom pref `icefin.theme` =
  `{"schema":1,"theme","preset","timestamp"}`); the newest timestamp wins;
- under stand-down, the plugin's settings API owns the choice and Icefin doesn't sync.

## Engine capabilities for screens (`window.icefinTheme.ui`)
Built once in the engine (`native/icefin/capabilities.js`, PLAN 9.2, 9.3) for any theme. Call them from a screen
script while it loads, or from a screen's `mount()`. They all reset when the theme changes.

| Call | What it gives |
|---|---|
| `ui.chrome.set('topBar' \| 'sideRail', {height \| width, mount(el)})`, then `ui.chrome.frame(root)` in a screen | Persistent navigation chrome around the screen. `frame()` returns the content element to fill |
| `ui.pivot(el, [{title, mount(el)}])` | Pivot headers. Left/right at a section's edge slides to the next one, headers with it |
| `ui.pagedGrid(el, items, {cols, rows, render})` | A grid in pages with indicators. Arrows past the edge turn the page |
| `ui.carousel3d(el, items, {render, spacing, depth, tilt, visible, dim})` | A perspective carousel with the focused item in front. Left/right step through it. Items behind fade, or with `dim: true` stay solid and darken (for items that overlap) |
| `ui.liveTile(el, {fetch, render, interval})` | Cycling content, frozen under reduced or low motion |
| `ui.mutedPreview(el, {itemId \| src})` | A muted SDR preview in the page's own `<video>` (a small VP8 server transcode). Never mpv, never the passthrough device |
| `ui.userViews()` | The signed-in user's libraries (a promise of view items). Waits for the session on a cold start and retries a failed or empty answer; use it instead of calling `getUserViews` at mount |
| `ui.overlay.set({mount(el, ctx)})` | A global panel over any screen, themed or stock: a long press on View (`icefin_overlay`) opens it, and Back closes it. It's modal |
| `ui.pointerFirst(true)` | Hover moves focus, and `html[data-icefin-pointer]` lets the theme enlarge hit targets |
| `ui.motion.cap('low')`, `ui.motion.duration(ms)` | A theme-level motion cap, separate from the user's reduced-motion setting. `html[data-icefin-motion]` follows it |
| `ui.chrome.set('sideRail', {width, collapsedWidth, mount(el)})` | An expanding side rail (9.11): icons-only at `collapsedWidth`, widening to `width` over the content (which never reflows) while focus is inside. `data-icefin-rail="collapsed" \| "expanded"` on the rail and on `<html>`; mark labels `.icefin-rail-label` and hide them when collapsed |
| `ui.parallax(el, {tilt, transform})` | Focus parallax (9.11): the focused item in `el` lifts (`--icefin-parallax-lift`), tilts with pointer motion and toward each arrow press (also at a row's end), and a `.icefin-glare` highlight (`--icefin-parallax-highlight`) moves with it. `--icefin-tilt-x/-y` and `--icefin-glare-x/-y` are on the item; `transform: false` leaves the transform to the theme. Flat under reduced or low motion |
| `T.registerScreen('#/mypreferencesmenu', ui.settings.screen({layout}))` | The settings area (9.24): Client settings (the Client Settings dialog), Classic View (`theme.setClassic(true)`: the stock look for this session, the saved choice kept; Client Settings -> Theme offers the way back) and Server Settings (the dashboard, administrators only), with a link to the user's own preferences (jellyfin-web's page). `layout`: `tiles` or `list`; the entries use the details screen's button classes, so the theme's button styles apply |
| `ui.osd.set({layout, align})` | Player controls (9.19): jellyfin-web's own controls stay (every function, MediaSegment skip buttons, trickplay, plugin overlays, the controller map) and take the theme's layout: `bar` (along the bottom), `panel` (floating, `align` `left`, `center` or `right`) or `minimal` (the transport centred under a thin seek line). The look comes from the `osd.*` tokens (TOKENS.md); `html[data-icefin-osd]` carries the layout. It is also the look of the web fallback below |
| `ui.player.set({mount(el, player, ctx), unmount?, onAction?(action, player, ctx), onBack?(player)})` | Theme-native player controls (D30, 9.45). Themed controls: the theme draws the controls over video (`#icefin-theme-root[data-icefin-player]`, transparent) while jellyfin-web's own stay mounted and hidden under it; what the screen doesn't use (media keys, Back with nothing open) reaches jellyfin-web as before. `player.state()` and `player.on(fn)` (about 4 times a second while mounted) give `{active, item, title, subtitle, logo, poster, paused, live, canSeek, position, duration, rate, endsAt, chapter, chapters[{index, name, start, image}], segments[{type, start, end}], audio[{index, label, detail, selected}], subtitles[…], subtitleIndex, subtitleOffset, speeds[{id, name}], aspect, aspects[…], volume, muted, repeat, shuffle, next, method, server, archive[], fallback}` (times in ms; `logo` and every image are the server's). Commands: `playPause play pause stop seek(ms) seekBy(ms) nextChapter previousChapter chapter(i) nextItem previousItem channelUp channelDown setAudio(i) setSubtitles(i\|-1) setSubtitleOffset(s) setSpeed(r) setAspect(id) setVolume(0-100) toggleMute setRepeat(mode) toggleShuffle info() watchTogether() playOn() useWebControls(reason)`. The compatibility archive: overlays jellyfin-web and known plugins put over video arrive in `state().archive` for the theme to draw, each `{id, kind, label \| title + countdown, activate(), dismiss?()}`: `media-segment` (skip prompts from the server's segments), `intro-skipper` (its older button), `up-next`. The web fallback: a plugin adding its own control or panel to the player, a player other than Icefin's local mpv, or the theme's controls throwing makes that play session use jellyfin-web's controls (ui.osd-styled) with a notice saying why; the next session is themed again. `ui.player.status()` → `{themed, session, fallback}`; `ui.player.controls()` is the same `player` anywhere (a now playing page, a music bar), `{active: false}` while nothing plays |
| `ui.brand()` | The server's branding (9.27, 9.45), a promise of `{name, icon, banner, splash}`: the server's name; its square icon and wide banner as the web client the server serves them; the administrator's splash screen when enabled. Every image is the server's (never the theme package's); each is `null` when the server has none, so show the name instead |
| `T.registerScreen('#/details', ui.details.screen({layout}))` | The details screen (9.18) with every feature of jellyfin-web's own page: Back and Home; Play, Resume, Play from the start, Trailer, Shuffle, Instant mix, Favourite, Played, More options (jellyfin-web's page for the rest); Version, Audio and Subtitle pickers; media in brief, chapters, cast, More like this; Seasons and Episodes for series, Tracks, Albums, Items, Filmography. `layout`: `hero`, `poster`, `banner` or `panel`; restyle the `icefin-d-*` markup (`native/icefin/detailsScreen.js`) in the theme's CSS. Live TV programs, books and photos keep jellyfin-web's page. A playlist's items move (9.42): Menu on one, or its handle (`.icefin-d-track .h`), lifts it (`.icefin-d-moving`), up/down carry it, OK or Menu places it (saved to the server), Back puts it back |
| `ui.stockChrome.set({mount(el, info, ctx), update?(info, ctx)})` | A frame around jellyfin-web's own pages (9.42): every route the theme doesn't register (sign-in, lists, user preferences, now playing, ...) keeps jellyfin-web's page and all its functions; `el` (`#icefin-stock-chrome`, fixed over the page, `pointer-events: none` so the frame's own controls turn them back on) is the theme's to fill, and `update` runs on every route change with `info` = `{route, hash, title, back(), home()}` (`title` is jellyfin-web's page title, which arrives a moment later, so `update` runs again). `html[data-icefin-stock="<route>"]` (`login`, `list`, `mypreferencesplayback`, ...) is set on those pages for the theme's CSS, whether or not it sets a frame. The server dashboard and plugin configuration pages are never framed: `html[data-icefin-dashboard]` marks them, and a theme's rules should leave them stock |
| `ui.material(el, name)` | A translucent blurred panel from the `material.<name>.*` tokens (TOKENS.md). While materials are on screen the engine watches the frame rate: a second under 50 fps switches all of them to their opaque colours (`html[data-icefin-materials="opaque"]`) until the theme changes. `ui.material.force('opaque' \| 'translucent' \| 'auto')`, `ui.material.mode()` |
| `ui.cardExpand(el, {item(card), render(item, panel, card), preview(item), dwell, scale, detailsHeight})` | In-row card expansion (9.11): after the dwell a panel (`.icefin-card-expanded`) grows from the focused card over its neighbours without reflowing the row, staying inside the row's view (the element's parent, or `bounds()`). An `.icefin-expand-video` box in the panel gets a muted trailer when `preview` returns an item id. Moving focus collapses it |
| `ui.guideGrid(el, {channels, fetch(ids, start, end), rows, span, slot, renderChannel, renderProgram, onFocus, onSelect, emptyLabel})` | A guide grid (9.14): channels down the side, cells positioned on a time axis, a now line (`.icefin-guide-now`). Only the visible rows and the window's programmes are in the DOM, and `fetch` is asked once per channel and window. Left/right step through a row and page the window by time; up/down keep the time and scroll by channel; past the first channel, or before now, the theme gets the move. `pageTime(dir)`, `pageChannels(dir)`, `refocus()`, `focused()`, `window()` |
| `ui.keyboard.enable()` | An on-screen keyboard (9.14) for every text field while the theme is active, on themed screens and jellyfin-web's own pages: a field focused from the remote or a controller (or Enter on it) opens it docked at the bottom (`#icefin-osk`, keys `.icefin-osk-key`). Arrows move, Enter types (input events, so React sees it), Back closes; a physical key closes it. `open(input)`, `close()`, `isOpen()` |
| `ui.timePalette({schedule: [['05:00', 'dawn'], …], months: [12 names], fadeMs})` | Time-of-day palettes (9.14): token sets under `palettes.<name>` in tokens.json, applied by the local time (and month) and cross-faded; instant under reduced or low motion. `at(date)` pins the clock, `stop()` restores the theme's tokens |
| `ui.mutedPreview(el, {itemId, live: true})` | A Live TV channel as a muted preview (opened through PlaybackInfo as a small VP8 transcode; `stop()` closes the live stream) |

While a themed screen is up, jellyfin-web's header, drawer and page are hidden (`visibility`, so their state and any
plugin injection survive). Focus moves are beam-first: elements overlapping across the direction of travel win.

## Screens that own navigation, and the stock escape
- A screen can define `onAction(action, ctx)`: it sees every action before the runtime's spatial focus does, and
  returns true when it used it. Rows, strips and carousels use this; `ctx.focused()` and `ctx.focus(el)` help.
- `?icefin=stock` on any route shows jellyfin-web's own page. A theme that replaces home should link to
  `#/home?icefin=stock` (Media Center's "Classic home"), so plugin home sections stay one step away.

## Native backdrop (`backdrop`, PLAN 8.4)
One shader drawn under the page by the engine (`qml/icefin/Backdrop.qml`, between the video and the web view):
```json
"backdrop": {
  "shader": "backdrop/wave.frag",
  "params": { "colorTop": "color.waveTop", "speed": 0.35 },
  "fps": 30
}
```
- `shader`: a GLSL fragment **body** (`.frag`, built-in themes and `ICEFIN_THEME_PATH`) or a precompiled `.qsb` (the only
  kind a user-installed theme may ship, and it loads only once the user trusts the theme).
- The engine writes the header for a `.frag`: `#version 440`, `in vec2 qt_TexCoord0`, `out vec4 fragColor`, and the
  uniform block `{mat4 qt_Matrix; float qt_Opacity; float time; vec2 resolution; <params>}`. Write `void main()` (and
  helper functions); multiply the result by `qt_Opacity`. A `.qsb` must declare exactly that block; no samplers.
- `params`: up to 16. A string names a token: a colour becomes a `vec4` (premultiply yourself with `.a`), a number a
  `float`. A number is a `float` as written. Names: a lower-case letter, then letters and digits (not `time` or
  `resolution`).
- `fps`: 10–60 (default 30). `time` (seconds) advances at that rate and stands still under reduced or low motion.
- The page: `html[data-icefin-backdrop]` is set when the backdrop is active; the engine makes jellyfin-web's page
  backgrounds transparent then, and the theme does the same for its own screens (and can keep a web-layer fallback for
  when there's no backdrop, keyed off that attribute).
- `ui.backdrop.hide()` / `show()` from a screen; `ui.timePalette` sends its token values, and colour params cross-fade.
- The layer hides while video is up. Baking needs Qt ShaderTools in the build; without it only `.qsb` backdrops load.
- Switching to a backdrop theme from one without a backdrop reloads the page once, on the same route: a page that
  painted before the backdrop existed keeps stale pixels where it turns transparent (Chromium). Switching between two
  backdrop themes keeps the page. Screens should keep no state that a reload would lose.
