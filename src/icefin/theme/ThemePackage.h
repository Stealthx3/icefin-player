// Icefin theme engine: one theme package on disk or in resources (PLAN 6.5; full schema checks and trust levels: 8.5).
//
//   <dir>/theme.json   {"schema": 1, "id": "...", "name": "...", "version": "...", "presets": {"<name>": {<tokens>}}}
//   <dir>/tokens.json  nested design tokens (Tokens.h)
//   theme.json may also declare assets the web runtime loads over icefin-theme: (8.3):
//     "styles": "styles.css", "fonts": [{"family", "file", "weight", "style"}], "scripts": ["screens.js"],
//     "sounds": {"focus": "sounds/focus.wav", ...} (8.5), "backdrop": {"shader", "params", "fps"} (8.4, Backdrop.h)
#pragma once
#include "Backdrop.h"
#include "Tokens.h"
#include <QString>
#include <QStringList>
#include <QVariantMap>

namespace Icefin::Theme
{
enum class Source { Bundled, User, Development };

struct Package
{
  QString dir;
  QString id, name, version, description;
  Source source = Source::User;
  TokenMap tokens;                  // flattened, unresolved
  QMap<QString, TokenMap> presets;  // name -> flattened overrides
  QString styles;                   // relative path, or empty
  QList<QVariantMap> fonts;         // {family, file, weight, style}
  QStringList scripts;              // relative paths
  QMap<QString, QString> sounds;    // UI event (focus, select, back, navigate, error) -> relative path
  BackdropSpec backdrop;            // native backdrop shader (8.4), or none
  QByteArray contentHash;           // sha256 over every file's path and bytes: trust is bound to it (8.5)
  QStringList errors;               // empty when the package can be used
  bool ok() const { return errors.isEmpty(); }

  // Tokens with a preset and user overrides applied, references resolved and checked. Errors go to errors.
  TokenMap resolved(const QString& preset, const TokenMap& overrides, QStringList* errs) const;
};

Package loadPackage(const QString& dir, Source source);
// UI sound events a theme can provide (the web runtime plays them; themes can't add events).
const QStringList& soundEvents();
// sha256 hex over the sorted relative paths and contents of every file in dir.
QByteArray hashDirectory(const QString& dir);
}
