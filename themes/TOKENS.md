# Theme tokens (schema 1)

A theme package's `tokens.json` defines these tokens. The engine (`src/icefin/theme/`, `native/icefin/`) maps them
onto jellyfin-web, the capability prompt and the native layers. Themes never reach jellyfin-web's own CSS
variables directly, so a jellyfin-web update only changes the engine's adapter (`native/icefin/jellyfin-web.css`).

## Format
- Nested groups; names use letters and digits (`color.accentStrong`).
- A leaf is a string or number, or `{"$value": …, "$description": …}`.
- `"{group.name}"` refers to another token. References are resolved before use, and cycles are refused.
- `theme.json` `presets` override any tokens: `{"presets": {"green": {"color": {"accent": "#…"}}}}`.
- `theme.json` `schemes` are colour schemes the user picks in the theme manager's *Mode* list (9.20), on top of the
  preset: `{"schemes": {"dark": {"name": "Dark", "tokens": {…}, "presets": {"green": {…}}}}}`. Order: base, preset,
  scheme `tokens`, the scheme's override for that preset. The choice carries across themes: a theme without that
  scheme shows its own colours. The page gets `html[data-icefin-scheme="dark"]` for CSS beyond tokens. Every bundled
  theme has `dark`, and `scripts/icefin/theme-contrast.py` checks every theme × preset × scheme (CI).
- Every `color.*` value is `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()`. The engine also derives the
  `r g b` channels. Values can't contain `;`, `{`, `}`, `<`, `>`, `url(` or `@import`.
- In the page, each token becomes a custom property, for example `color.accent` → `--icefin-color-accent`, and
  colors also get `--icefin-color-accent-channel`.

## Required
| Token | Used for |
|---|---|
| `color.background` | page, dialogs, side drawer |
| `color.surface` | cards, lists, form headers and footers, select menus |
| `color.surfaceRaised` | header bar, raised buttons, toasts, detail ribbon |
| `color.text` / `color.textSecondary` | primary and secondary text |
| `color.accent` / `color.accentStrong` / `color.onAccent` | primary buttons, indicators, progress, selected menu entry (normal / hover / text on it) |
| `color.focus` / `color.onFocus` | what has focus: buttons, cards, inputs, tabs (fill / text on it) |
| `color.hover` | hover and list-focus tint (use transparency) |
| `color.divider` | borders and dividers |
| `color.error` / `color.onError` | delete buttons, error states |
| `color.inputBackground` | text fields |
| `shape.cardRadius` | card and list corners |

## Optional
| Token | Used for |
|---|---|
| `font.family` | page font (the font must be bundled with the theme; 8.3 serves it over `icefin-theme:`) |
| `material.<name>.tint` / `.blur` / `.saturate` / `.opaque` | a translucent panel used with `ui.material(el, name)`: its colour over the content, blur radius, saturation boost, and the opaque colour used when the GPU can't hold 60 fps (defaults: `color.surface`, `20px`, `1.4`) |
| `parallax.highlight` / `parallax.lift` | the moving highlight's colour and the focused item's scale with `ui.parallax` (defaults: none, `1.08`) |
| `palettes.<name>.<any token path>` | a token set for `ui.timePalette`, applied over the theme's own tokens by the time of day or month (for example `palettes.dusk.color.background`) |

Themes may define more tokens, such as a private `palette` group, for their own references and later layers.
