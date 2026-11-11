#include "ThemePackage.h"
#include <QCryptographicHash>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QRegularExpression>

namespace Icefin::Theme
{
static QJsonObject readObject(const QString& path, QStringList& errors)
{
  QFile f(path);
  if (!f.open(QIODevice::ReadOnly)) { errors << QString("%1 is missing").arg(path.section('/', -1)); return {}; }
  QJsonParseError err;
  const QJsonDocument doc = QJsonDocument::fromJson(f.readAll(), &err);
  if (!doc.isObject()) { errors << QString("%1: %2").arg(path.section('/', -1), doc.isNull() ? err.errorString() : "not a JSON object"); return {}; }
  return doc.object();
}

Package loadPackage(const QString& dir, Source source)
{
  Package p;
  p.dir = dir;
  p.source = source;
  const QJsonObject meta = readObject(dir + "/theme.json", p.errors);
  if (!meta.isEmpty()) {
    if (meta.value("schema").toInt() != 1) p.errors << "theme.json: schema must be 1";
    // Same rule as docs/themes/schema/theme.schema.json: no unknown top-level keys.
    static const QStringList known{"schema", "id", "name", "version", "description", "styles", "scripts", "fonts", "sounds", "presets", "backdrop"};
    for (const QString& k : meta.keys()) if (!known.contains(k)) p.errors << QString("theme.json: unknown key '%1'").arg(k);
    p.id = meta.value("id").toString();
    p.name = meta.value("name").toString();
    p.description = meta.value("description").toString();
    p.version = meta.value("version").toString();
    static const QRegularExpression idRe(QStringLiteral("^[a-z0-9][a-z0-9-]{1,47}$"));
    if (!idRe.match(p.id).hasMatch()) p.errors << "theme.json: id must be 2-48 characters of a-z, 0-9 and -";
    if (p.name.trimmed().isEmpty()) p.errors << "theme.json: name is required";
    // Declared assets must exist inside the package (served later only as its trust level allows: ThemeScheme).
    auto asset = [&](const QString& rel, const QString& what) {
      const QString clean = QDir::cleanPath(rel);
      if (rel.isEmpty() || clean.startsWith("..") || clean.startsWith('/') || !QFileInfo(dir + '/' + clean).isFile())
        { p.errors << QString("theme.json: %1 '%2' is not a file in the package").arg(what, rel); return QString(); }
      return clean;
    };
    if (meta.contains("styles")) p.styles = asset(meta.value("styles").toString(), "styles");
    for (const QJsonValue& v : meta.value("scripts").toArray()) { const QString s = asset(v.toString(), "script"); if (!s.isEmpty()) p.scripts << s; }
    const QJsonObject sounds = meta.value("sounds").toObject();
    for (auto it = sounds.begin(); it != sounds.end(); ++it) {
      if (!soundEvents().contains(it.key())) { p.errors << QString("theme.json: unknown sound event '%1'").arg(it.key()); continue; }
      const QString s = asset(it.value().toString(), "sound");
      if (!s.isEmpty()) p.sounds[it.key()] = s;
    }
    for (const QJsonValue& v : meta.value("fonts").toArray()) {
      const QJsonObject f = v.toObject();
      const QString file = asset(f.value("file").toString(), "font");
      static const QRegularExpression fam(QStringLiteral("^[A-Za-z0-9 _-]{1,64}$"));
      if (!fam.match(f.value("family").toString()).hasMatch()) { p.errors << "theme.json: font family must be 1-64 letters, digits, spaces, _ or -"; continue; }
      if (!file.isEmpty()) p.fonts << QVariantMap{{"family", f.value("family").toString()}, {"file", file},
                                                  {"weight", f.value("weight").toVariant().toString().isEmpty() ? QString("400") : f.value("weight").toVariant().toString()}, {"style", f.value("style").toString("normal")}};
    }
    if (meta.contains("backdrop")) {
      p.backdrop = parseBackdrop(meta.value("backdrop").toVariant(), &p.errors);
      if (!p.backdrop.shader.isEmpty()) p.backdrop.shader = asset(p.backdrop.shader, "backdrop shader");
      if (p.backdrop.declared() && !p.backdrop.precompiled() && source == Source::User)
        p.errors << "theme.json: a user-installed theme's backdrop must be a precompiled .qsb (GLSL is for built-in themes)";
    }
    const QJsonObject presets = meta.value("presets").toObject();
    for (auto it = presets.begin(); it != presets.end(); ++it) {
      if (!it.value().isObject()) { p.errors << QString("theme.json: preset '%1' must be an object of tokens").arg(it.key()); continue; }
      p.presets[it.key()] = flatten(it.value().toObject(), &p.errors);
    }
  }
  p.tokens = flatten(readObject(dir + "/tokens.json", p.errors), &p.errors);
  p.contentHash = hashDirectory(dir);
  if (p.errors.isEmpty()) {
    // The package must stand on its own and with every preset.
    QStringList e;
    p.resolved(QString(), {}, &e);
    for (auto it = p.presets.begin(); it != p.presets.end(); ++it) {
      QStringList pe;
      p.resolved(it.key(), {}, &pe);
      for (const QString& s : pe) e << QString("preset '%1': %2").arg(it.key(), s);
    }
    p.errors << e;
  }
  return p;
}

TokenMap Package::resolved(const QString& preset, const TokenMap& overrides, QStringList* errs) const
{
  TokenMap t = tokens;
  if (!preset.isEmpty()) {
    if (presets.contains(preset)) t = overlay(t, presets[preset]);
    else if (errs) *errs << QString("unknown preset '%1'").arg(preset);
  }
  t = overlay(t, overrides);
  QStringList e;
  TokenMap r = resolve(t, &e);
  e << validate(r);
  if (errs) *errs << e;
  return r;
}

QByteArray hashDirectory(const QString& dir)
{
  QStringList files;
  QDirIterator it(dir, QDir::Files | QDir::Hidden, QDirIterator::Subdirectories);
  while (it.hasNext()) files << QDir(dir).relativeFilePath(it.next());
  files.sort();
  QCryptographicHash h(QCryptographicHash::Sha256);
  for (const QString& rel : files) {
    QFile f(dir + '/' + rel);
    if (!f.open(QIODevice::ReadOnly)) continue;
    h.addData(rel.toUtf8());
    h.addData(QByteArray(1, '\0'));
    h.addData(f.readAll());
    h.addData(QByteArray(1, '\0'));
  }
  return h.result().toHex();
}

const QStringList& soundEvents()
{
  static const QStringList e{"focus", "select", "back", "navigate", "error"};
  return e;
}
}
