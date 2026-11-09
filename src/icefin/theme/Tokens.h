// Icefin theme engine: design tokens (PLAN 6.5, SPEC "Theme-engine layer"). Theme-agnostic: nothing here knows a
// theme by id or holds a theme's values (CI: scripts/icefin/theme-lint.sh).
//
// tokens.json is nested JSON. A leaf is a string or number, or {"$value": ..., "$description": ...}.
// A string value "{group.name}" refers to another token. Token names and the required set: themes/TOKENS.md.
#pragma once
#include <QJsonObject>
#include <QMap>
#include <QString>
#include <QStringList>

namespace Icefin::Theme
{
using TokenMap = QMap<QString, QString>;  // "color.accent" -> its value as written in tokens.json

// Tokens every package must define (after references resolve); the web adapter relies on all of them.
const QStringList& requiredTokens();

// Nested groups -> dotted names. Errors (non-scalar leaves, bad names) are appended to errors.
TokenMap flatten(const QJsonObject& tokens, QStringList* errors);
// Later maps win: base tokens, then a preset, then the user's overrides.
TokenMap overlay(TokenMap base, const TokenMap& over);
// Replace "{name}" references; unknown names and cycles are errors.
TokenMap resolve(const TokenMap& in, QStringList* errors);
// Check the required set and value types (color.* must be #rgb/#rrggbb/#rrggbbaa or rgb()/rgba()).
QStringList validate(const TokenMap& resolved);

// "r g b" for a color token (for rgba(var(--…-channel) / a)); empty if it isn't a color the engine can parse.
QString colorChannel(const QString& color);
// CSS custom properties for the page: --icefin-color-accent, --icefin-color-accent-channel, ...
QString toCss(const TokenMap& resolved);
// The custom property name for a token: "color.accent" -> "--icefin-color-accent".
QString cssVar(const QString& token);
}
