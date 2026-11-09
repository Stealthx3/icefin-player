# Theme packages (schema 1)

A theme is a folder. Icefin looks in, in order:
- `ICEFIN_THEME_PATH`, for development;
- the bundled themes;
- the benchmark pack (`themes/bench/`), only when Client Settings → Benchmark Themes is on (or `ICEFIN_BENCH_THEMES=1`). It ships with the app but isn't offered by default (SPEC "Benchmark clone themes", Distribution); turning it off while one of its themes is active switches the engine off;
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
- `ctx.navigate('#/route')`, `ctx.apiClient()` (jellyfin-web's ApiClient) and `ctx.focus(el)` are available.
- Focus: arrows move between `[data-icefin-focus]` elements by position; Enter clicks; the focused element gets
  the class `icefin-focused`. Themes can't remap input (SPEC "One input pipeline").
- Routes are written as jellyfin-web uses them, without query or `.html`: `#/home`, `#/details`.

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
| `ui.overlay.set({mount(el, ctx)})` | A global panel over any screen, themed or stock: a long press on View (`icefin_overlay`) opens it, and Back closes it. It's modal |
| `ui.pointerFirst(true)` | Hover moves focus, and `html[data-icefin-pointer]` lets the theme enlarge hit targets |
| `ui.motion.cap('low')`, `ui.motion.duration(ms)` | A theme-level motion cap, separate from the user's reduced-motion setting. `html[data-icefin-motion]` follows it |

While a themed screen is up, jellyfin-web's header, drawer and page are hidden (`visibility`, so their state and any
plugin injection survive). Focus moves are beam-first: elements overlapping across the direction of travel win.

## Screens that own navigation, and the stock escape
- A screen can define `onAction(action, ctx)`: it sees every action before the runtime's spatial focus does, and
  returns true when it used it. Rows, strips and carousels use this; `ctx.focused()` and `ctx.focus(el)` help.
- `?icefin=stock` on any route shows jellyfin-web's own page. A theme that replaces home should link to
  `#/home?icefin=stock` (Media Center's "Classic home"), so plugin home sections stay one step away.
