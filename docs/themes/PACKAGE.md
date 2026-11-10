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
| `ctx.focus(el)`, `ctx.focused()` | Move focus to an element; the focused one (class `icefin-focused`) |
| `ctx.move(dir, within)` | Spatial move in a direction, confined to `within` (a dialog, a panel); true when focus moved |
| `ctx.sound(event)` | A UI sound: `focus`, `select`, `back`, `navigate`, `error` |
| `icefinTheme.ctx` | The same `ctx`, for chrome, overlays and timers outside a screen. Overlay panels get it with `close()` added |
| `icefinTheme.ui.*` | The engine capabilities: chrome, pivot, overlay, pagedGrid, carousel3d, liveTile, mutedPreview, userViews, parallax, material, cardExpand, guideGrid, keyboard, timePalette, backdrop, pointerFirst, motion; details in *Engine capabilities for screens* below |
| `icefinTheme.glyph(button)` | An original SVG for a controller button (`south`, `east`, `west`, `north`, `view`, ...) in the family of the pad used last (7.3) |
| `icefinTheme.active()` | `{id, source, route}` of the active theme and screen, or `null` |
| `icefinTheme.sound(event)` | Same as `ctx.sound` |
| `icefinTheme.apiVersion` | `1` |
| `icefinTheme.system` | Reserved for the client-side capability model (6.7): undefined until then |

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

## Per-user choice
The theme picker is in Client Settings → Theme. The choice belongs to the signed-in user:
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
| `ui.carousel3d(el, items, {render, spacing, depth, tilt})` | A perspective carousel with the focused item in front. Left/right step through it |
| `ui.liveTile(el, {fetch, render, interval})` | Cycling content, frozen under reduced or low motion |
| `ui.mutedPreview(el, {itemId \| src})` | A muted SDR preview in the page's own `<video>` (a small VP8 server transcode). Never mpv, never the passthrough device |
| `ui.userViews()` | The signed-in user's libraries (a promise of view items). Waits for the session on a cold start and retries a failed or empty answer; use it instead of calling `getUserViews` at mount |
| `ui.overlay.set({mount(el, ctx)})` | A global panel over any screen, themed or stock: a long press on View (`icefin_overlay`) opens it, and Back closes it. It's modal |
| `ui.pointerFirst(true)` | Hover moves focus, and `html[data-icefin-pointer]` lets the theme enlarge hit targets |
| `ui.motion.cap('low')`, `ui.motion.duration(ms)` | A theme-level motion cap, separate from the user's reduced-motion setting. `html[data-icefin-motion]` follows it |
| `ui.chrome.set('sideRail', {width, collapsedWidth, mount(el)})` | An expanding side rail (9.11): icons-only at `collapsedWidth`, widening to `width` over the content (which never reflows) while focus is inside. `data-icefin-rail="collapsed" \| "expanded"` on the rail and on `<html>`; mark labels `.icefin-rail-label` and hide them when collapsed |
| `ui.parallax(el, {tilt, transform})` | Focus parallax (9.11): the focused item in `el` lifts (`--icefin-parallax-lift`), tilts with pointer motion and toward each arrow press (also at a row's end), and a `.icefin-glare` highlight (`--icefin-parallax-highlight`) moves with it. `--icefin-tilt-x/-y` and `--icefin-glare-x/-y` are on the item; `transform: false` leaves the transform to the theme. Flat under reduced or low motion |
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
