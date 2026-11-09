#include "ThemePackage.h"
#include <QFile>
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
    p.id = meta.value("id").toString();
    p.name = meta.value("name").toString();
    p.version = meta.value("version").toString();
    static const QRegularExpression idRe(QStringLiteral("^[a-z0-9][a-z0-9-]{1,47}$"));
    if (!idRe.match(p.id).hasMatch()) p.errors << "theme.json: id must be 2-48 characters of a-z, 0-9 and -";
    if (p.name.trimmed().isEmpty()) p.errors << "theme.json: name is required";
    const QJsonObject presets = meta.value("presets").toObject();
    for (auto it = presets.begin(); it != presets.end(); ++it) {
      if (!it.value().isObject()) { p.errors << QString("theme.json: preset '%1' must be an object of tokens").arg(it.key()); continue; }
      p.presets[it.key()] = flatten(it.value().toObject(), &p.errors);
    }
  }
  p.tokens = flatten(readObject(dir + "/tokens.json", p.errors), &p.errors);
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
}
