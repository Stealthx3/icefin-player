#include "ThemeInstall.h"
#include "ThemePackage.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QTemporaryDir>
#include <QtCore/private/qzipreader_p.h>

namespace Icefin::Theme
{
// A safe relative path inside the package, or empty.
static QString cleanEntry(const QString& raw)
{
  if (raw.isEmpty() || raw.contains('\\') || raw.startsWith('/') || raw.contains(QChar(0))) return {};
  const QStringList parts = raw.split('/', Qt::SkipEmptyParts);
  for (const QString& s : parts)
    if (s == ".." || s == ".") return {};
  return parts.join('/');
}

InstallResult installPackageFile(const QString& zipFile, const QString& destRoot, const QSet<QString>& reservedIds)
{
  InstallResult r;
  QFile f(zipFile);
  if (!f.open(QIODevice::ReadOnly)) { r.errors << QString("can't read %1").arg(QFileInfo(zipFile).fileName()); return r; }
  if (f.size() > kMaxZipBytes) { r.errors << QString("the file is larger than %1 MB").arg(kMaxZipBytes >> 20); return r; }
  QZipReader zip(&f);
  if (!zip.isReadable() || zip.status() != QZipReader::NoError) { r.errors << "not a theme package (a zip file)"; return r; }
  const QList<QZipReader::FileInfo> entries = zip.fileInfoList();
  if (entries.isEmpty()) { r.errors << "not a theme package (a zip file), or an empty one"; return r; }
  if (entries.size() > kMaxFiles) { r.errors << QString("more than %1 files").arg(kMaxFiles); return r; }

  // Check every entry first; strip one top-level folder when everything sits inside it (the usual way to zip a folder).
  qint64 total = 0;
  QStringList files;
  for (const auto& e : entries) {
    if (e.isSymLink) { r.errors << QString("%1 is a link; packages can't contain links").arg(e.filePath); return r; }
    const QString p = cleanEntry(e.filePath);
    if (p.isEmpty()) { r.errors << QString("unsafe path in the package: %1").arg(e.filePath); return r; }
    if (e.isFile) { files << p; total += e.size; }
  }
  if (total > kMaxUnpackedBytes) { r.errors << QString("unpacks to more than %1 MB").arg(kMaxUnpackedBytes >> 20); return r; }
  QString prefix;
  if (!files.contains("theme.json")) {
    const QString top = files.value(0).section('/', 0, 0) + '/';
    bool one = true;
    for (const QString& p : files) one = one && p.startsWith(top);
    if (one && files.contains(top + "theme.json")) prefix = top;
    else { r.errors << "no theme.json at the top of the package"; return r; }
  }

  if (!QDir().mkpath(destRoot)) { r.errors << "can't create the themes folder"; return r; }
  QTemporaryDir tmp(destRoot + "/.install-XXXXXX");
  if (!tmp.isValid()) { r.errors << "can't create a temporary folder"; return r; }
  for (const auto& e : entries) {
    if (!e.isFile) continue;
    const QString rel = cleanEntry(e.filePath).mid(prefix.size());
    if (rel.isEmpty()) continue;
    const QString out = tmp.path() + '/' + rel;
    QDir().mkpath(QFileInfo(out).path());
    QFile o(out);
    const QByteArray data = zip.fileData(e.filePath);
    if (data.size() != e.size || !o.open(QIODevice::WriteOnly) || o.write(data) != data.size()) {
      r.errors << QString("can't unpack %1").arg(rel);
      return r;
    }
  }

  Package p = loadPackage(tmp.path(), Source::User);
  r.id = p.id;
  r.name = p.name;
  if (!p.ok()) { r.errors = p.errors; return r; }
  if (reservedIds.contains(p.id)) { r.errors << QString("a built-in theme already uses the id '%1'").arg(p.id); return r; }

  const QString dest = destRoot + '/' + p.id;
  if (QFileInfo::exists(dest)) {
    r.replaced = true;
    const QString old = dest + ".old";
    QDir(old).removeRecursively();
    if (!QDir().rename(dest, old)) { r.errors << "can't replace the installed copy"; return r; }
    if (!QDir().rename(tmp.path(), dest)) { QDir().rename(old, dest); r.errors << "can't move the package into place"; return r; }
    QDir(old).removeRecursively();
  } else if (!QDir().rename(tmp.path(), dest)) {
    r.errors << "can't move the package into place";
    return r;
  }
  tmp.setAutoRemove(false);
  r.ok = true;
  return r;
}
}
