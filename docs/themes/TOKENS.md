# Theme tokens (schema 1)

A theme package's `tokens.json` defines these tokens. The engine (`src/icefin/theme/`, `native/icefin/`) maps them
onto jellyfin-web, the capability prompt and the native layers. Themes never reach jellyfin-web's own CSS
variables directly, so a jellyfin-web update only changes the engine's adapter (`native/icefin/jellyfin-web.css`).

## Format
- Nested groups; names use letters and digits (`color.accentStrong`).
- A leaf is a string or number, or `{"$value": …, "$description": …}`.
- `"{group.name}"` refers to another token. References are resolved before use, and cycles are refused.
- `theme.json` `presets` override any tokens: `{"presets": {"green": {"color": {"accent": "#…"}}}}`.
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
| Token | Used for | Falls back to |
|---|---|---|
| `font.family` | page font (declare the font file in `theme.json`; served over `icefin-theme:`) | page default |
| `color.button` / `color.buttonHover` | raised buttons | `color.surfaceRaised` / `color.hover` |
| `color.focusTint` | focused list rows | `color.hover` |
| `color.inputBorder` | text field and select borders | `color.divider` |
| `color.errorSoft` | played and rating icons, recording progress | `color.error` |
| `color.toast` / `color.toastText` | toast messages | `color.surfaceRaised` / `color.text` |

Themes may define more tokens, such as a private `palette` group, for their own references and later layers.
