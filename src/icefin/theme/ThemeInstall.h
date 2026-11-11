// Icefin theme engine: install a theme package from a file (PLAN 9.21, Client Settings -> Theme -> Install from file).
//
// A package file is a zip of a theme folder (theme.json at its top, or inside one top-level folder). It's unpacked
// into a temporary folder next to the user themes folder, checked as a package (ThemePackage.h, the same rules as
// any user theme) and only then moved into place as <user themes>/<id>. Refused before anything is written:
//   - files that aren't zips, are larger than kMaxZipBytes, or unpack to more than kMaxFiles / kMaxUnpackedBytes;
//   - entries with absolute paths, "..", backslashes or symlinks;
//   - an id a built-in or development theme already uses.
// A user theme with the same id is replaced (an update); its trust is dropped, because trust is bound to content.
#pragma once
#include <QSet>
#include <QString>
#include <QStringList>

namespace Icefin::Theme
{
constexpr qint64 kMaxZipBytes = 64ll * 1024 * 1024;
constexpr qint64 kMaxUnpackedBytes = 256ll * 1024 * 1024;
constexpr int kMaxFiles = 4000;

struct InstallResult
{
  bool ok = false;
  QString id, name;
  bool replaced = false;
  QStringList errors;
};

// Unpack zipFile into destRoot/<id>. reservedIds: ids of bundled and development themes (can't be replaced).
InstallResult installPackageFile(const QString& zipFile, const QString& destRoot, const QSet<QString>& reservedIds);
}
