// Icefin theme engine: CSS from user-installed themes (PLAN 8.5, SPEC "Theme trust levels").
//
// A user theme's stylesheet may restyle the page but must not reach the network: remote fetches from CSS can leak
// what is on the page (attribute selectors + background URLs). So:
//  - @import rules are removed;
//  - url(...) pointing inside the package is rewritten to icefin-theme://<id>/<path>; any other url() becomes none;
//  - image-set() is removed (it fetches from plain strings), as are expression() and -moz-binding;
//  - escapes that spell ASCII (\75 rl, \u...) are refused outright, since they could hide the above.
#pragma once
#include <QString>
#include <QStringList>

namespace Icefin::Theme
{
struct SanitizedCss
{
  QString css;            // safe stylesheet (empty if refused)
  QStringList removed;    // what was taken out, for the log and the settings page
  QString refusedReason;  // non-empty: the whole stylesheet was refused
};

// themeId and the stylesheet's own path inside the package (for resolving relative url()).
SanitizedCss sanitizeCss(const QString& css, const QString& themeId, const QString& cssPath);
}
