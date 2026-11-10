# Security review: theme trust levels (PLAN 11.2)

_2026-11-08 · reviews the code from PLAN 6.5, 8.3 and 8.5 (`src/icefin/theme/`, `native/icefin/`) · reviewer: Claude Code_

## What a theme can reach
A theme renders inside the signed-in jellyfin-web page. Any script there can read the user's access token, and with
it act as the user on the server. CSS can't read the token, but CSS that fetches remote URLs can leak what's on the
page (for example attribute selectors with background images). So the boundary is: **who may run script**, and
**which CSS may reach the network**.

## Controls, and where they're enforced
| Control | Where | Tested by |
|---|---|---|
| Bundled themes and `ICEFIN_THEME_PATH` (development) are trusted; user-installed themes are not | `ThemeComponent::trusted` | `theme_trust.py` |
| Untrusted themes serve fonts, images, sounds, JSON and sanitized CSS only; no scripts, no SVG | `mayServe` in `ThemeScheme.cpp` (server side of the scheme, not the page) | `test_icefin_theme` (trustRules), `theme_trust.py` |
| CSS sanitizer: no `@import`, `image-set()`, `expression()`, `-moz-binding`; `url()` only inside the package (rewritten to `icefin-theme:`), anything else becomes `none`; escapes that spell ASCII refuse the stylesheet; unparseable `url(` refuses it | `CssSanitizer.cpp`, applied when the scheme serves CSS | `test_icefin_theme` (sanitizer), `theme_trust.py` (no request reached the leak host) |
| Trust is bound to a SHA-256 of every file in the package; any change drops it | `hashDirectory`, `ThemeComponent::trusted` | `test_icefin_theme` (contentHash), `theme_trust.py` |
| Trusting needs an explicit call after the token warning (`trustWarning()`) | `ThemeComponent::setTrusted` | `theme_trust.py` |
| Paths can't leave the package (`..`, absolute paths, symlinks out) | `SchemeHandler::fileFor` (canonical path prefix check) | `theme_runtime.py` |
| Package metadata is schema-checked; unknown keys are refused | `ThemePackage.cpp`, `docs/themes/schema/` | `test_icefin_theme`, `theme-schemas.py` in CI |
| Token values can't inject CSS (`; { } < > url( @import` refused) | `Tokens.cpp validate()` | `test_icefin_theme` (validation) |
| Engine code holds no theme ids or values | `scripts/icefin/theme-lint.sh` in CI | CI |
| Secrets stay out of logs | upstream `CensorAuthTokens` + `Icefin::Log::redact` | `test_icefin_log`, `log_redaction.py` |

## Findings
1. **Development path is fully trusted.** `ICEFIN_THEME_PATH` is read from the environment. Anyone who can set the
   app's environment can already run code as the user, so this adds no new access. *Accepted.* It's documented in
   `docs/themes/PACKAGE.md`.
2. **Trusted user themes get everything.** That's the SPEC's design. The warning names the risk, and the trust is bound
   to the package's exact content. *Accepted.*
3. **The scheme ignores page CSP** (`ContentSecurityPolicyIgnored`, spike 2.7). Any page in the view can load
   `icefin-theme:` URLs, but only of installed packages, and only what their trust level allows. Nothing outside a
   package can be served. *Accepted.*
4. **Plugin runtime stand-down trusts `window.icefinPluginRuntime`.** A page script can define it and make Icefin's
   runtime step aside, but page scripts are already the server's trusted code (jellyfin-web, server plugins), and the
   handshake only hands over tokens, a non-secret theme palette, and sound playback. *Accepted.*
5. **Sanitized CSS can still restyle the whole page**, for example hiding controls. That's the purpose of a theme,
   and the user picked it. Turning the theme off restores the stock UI live, with no restart. *Accepted.*
6. **jellyfin-web stores the sign-in in Chromium's Local Storage** (a leveldb `*.log` journal under `QtWebEngine/`).
   That's upstream behaviour and the browser's own data store, not a log. `log_redaction.py` excludes it on purpose.
   *Noted, not changed.*
7. **Upstream's pre-init settings reader returns JSON null for a missing key**, which a plain `toBool()` reads as
   false (seen in `allowBrowserZoom`, fixed for Icefin's own GBM switch in 4.3). *Low, upstream; candidate for 10.2.*

## 8.4 re-review: native backdrop shaders (2026-11-09)
What a theme can now reach natively: one fragment shader drawn under the page (`qml/icefin/Backdrop.qml`), with
uniforms the engine owns.
- **Source code (GLSL).** Built-in themes and `ICEFIN_THEME_PATH` only; a user-installed package declaring a `.frag` is
  refused at load. The engine writes the header and uniform block; a body that declares `#version` or a uniform is
  refused. Baked with Qt's shader baker into a `.qsb` in the cache, keyed by a hash of the full source.
- **Precompiled `.qsb` (user themes).** The SPEC trust table lists precompiled shaders as declarative. They aren't
  harmless: a `.qsb` carries GLSL/SPIR-V/HLSL/MSL that goes to the GPU driver's own compiler without translation (unlike
  WebGL, which ANGLE sanitizes), so a crafted one can hit driver compiler bugs or hang the GPU. **Changed:** a
  user-installed theme's backdrop now loads only after the user trusts the theme (the same content-hash-bound trust as
  scripts); until then the theme works without it. *SPEC's trust table carries the change.*
- **Checks on every `.qsb`:** at most 256 KiB; `QShader::fromSerialized` must give a fragment shader with exactly one
  uniform block whose members are the declared params (types from the tokens) plus `qt_Matrix`, `qt_Opacity`, `time`,
  `resolution`; no samplers, so a shader can't read the video, the page or anything else. The deserializer is Qt's
  (QDataStream); it sees only trusted packages' files now.
- **Values from the page.** `setBackdropState` (on the WebChannel, so any page script, plugins included) can change only
  visibility, the motion state and the values of tokens the params already name; each value must parse as a colour or
  a number. Worst case: the backdrop changes colour or hides. *Accepted.*
- **Test hooks.** `grabWindow()`/`grabPixel()` render the whole window (video included) for tests. They answer only
  when the app runs with `--remote-debugging-port`, which already gives full control of the page; otherwise they
  return nothing. The grab path is fixed in the cache, never from the page.
- **Hidden during video.** The layer hides while the player is busy or its window is up, so a theme can't draw over
  playback on the OpenGL path (where the video item is opaque).

## Re-review when
- a new asset type is served over the scheme, or the CSS sanitizer changes;
- the stand-down handshake gains a service beyond tokens and sounds;
- themes get another native capability, the backdrop gets textures or a second shader stage, or user-theme shaders
  stop needing trust.
