#include "Tokens.h"
#include <QJsonValue>
#include <QRegularExpression>

namespace Icefin::Theme
{
const QStringList& requiredTokens()
{
  static const QStringList r{
    "color.background", "color.surface", "color.surfaceRaised", "color.text", "color.textSecondary",
    "color.accent", "color.accentStrong", "color.onAccent", "color.focus", "color.onFocus",
    "color.divider", "color.error", "color.onError", "color.inputBackground", "color.hover",
    "shape.cardRadius",
  };
  return r;
}

static const QRegularExpression kName(QStringLiteral("^[A-Za-z][A-Za-z0-9]*$"));
static const QRegularExpression kRef(QStringLiteral("\\{([A-Za-z][A-Za-z0-9]*(?:\\.[A-Za-z][A-Za-z0-9]*)*)\\}"));

static void walk(const QJsonObject& o, const QString& prefix, TokenMap& out, QStringList* errors)
{
  for (auto it = o.begin(); it != o.end(); ++it) {
    const QString key = it.key();
    if (key.startsWith('$')) continue;  // $description, $type on a group
    if (!kName.match(key).hasMatch()) { if (errors) *errors << QString("bad token name '%1%2'").arg(prefix, key); continue; }
    const QString name = prefix + key;
    QJsonValue v = it.value();
    if (v.isObject() && v.toObject().contains("$value")) v = v.toObject().value("$value");
    if (v.isObject()) { walk(v.toObject(), name + '.', out, errors); continue; }
    if (v.isString()) out[name] = v.toString();
    else if (v.isDouble()) out[name] = QString::number(v.toDouble());
    else if (errors) *errors << QString("token '%1' must be a string or number").arg(name);
  }
}

TokenMap flatten(const QJsonObject& tokens, QStringList* errors)
{
  TokenMap out;
  walk(tokens, QString(), out, errors);
  return out;
}

TokenMap overlay(TokenMap base, const TokenMap& over)
{
  for (auto it = over.begin(); it != over.end(); ++it) base[it.key()] = it.value();
  return base;
}

static QString resolveOne(const QString& name, const TokenMap& in, TokenMap& done, QStringList& stack, QStringList* errors)
{
  if (done.contains(name)) return done[name];
  if (stack.contains(name)) {
    if (errors) *errors << QString("reference cycle: %1 -> %2").arg(stack.join(" -> "), name);
    return QString();
  }
  stack << name;
  QString v = in.value(name);
  QString out;
  qsizetype pos = 0;
  auto it = kRef.globalMatch(v);
  while (it.hasNext()) {
    const auto m = it.next();
    out += v.mid(pos, m.capturedStart() - pos);
    const QString ref = m.captured(1);
    if (!in.contains(ref)) { if (errors) *errors << QString("token '%1' refers to unknown '%2'").arg(name, ref); }
    else out += resolveOne(ref, in, done, stack, errors);
    pos = m.capturedEnd();
  }
  out += v.mid(pos);
  stack.removeLast();
  done[name] = out;
  return out;
}

TokenMap resolve(const TokenMap& in, QStringList* errors)
{
  TokenMap done;
  for (auto it = in.begin(); it != in.end(); ++it) {
    QStringList stack;
    resolveOne(it.key(), in, done, stack, errors);
  }
  return done;
}

QString colorChannel(const QString& c)
{
  static const QRegularExpression hex(QStringLiteral("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$"));
  static const QRegularExpression fn(QStringLiteral("^rgba?\\(\\s*(\\d{1,3})[\\s,]+(\\d{1,3})[\\s,]+(\\d{1,3})(?:\\s*[,/]\\s*[0-9.]+%?)?\\s*\\)$"));
  const QString s = c.trimmed();
  if (auto m = hex.match(s); m.hasMatch()) {
    QString h = m.captured(1);
    if (h.size() == 3) h = QString("%1%1%2%2%3%3").arg(h[0]).arg(h[1]).arg(h[2]);
    bool ok = false;
    return QString("%1 %2 %3").arg(h.mid(0, 2).toInt(&ok, 16)).arg(h.mid(2, 2).toInt(&ok, 16)).arg(h.mid(4, 2).toInt(&ok, 16));
  }
  if (auto m = fn.match(s); m.hasMatch()) {
    for (int i = 1; i <= 3; ++i) if (m.captured(i).toInt() > 255) return QString();
    return QString("%1 %2 %3").arg(m.captured(1), m.captured(2), m.captured(3));
  }
  return QString();
}

QStringList validate(const TokenMap& t)
{
  QStringList errors;
  for (const QString& r : requiredTokens()) if (!t.contains(r) || t[r].trimmed().isEmpty()) errors << QString("missing required token '%1'").arg(r);
  static const QRegularExpression unsafe(QStringLiteral("[;{}<>]|url\\s*\\(|expression\\s*\\(|@import"), QRegularExpression::CaseInsensitiveOption);
  for (auto it = t.begin(); it != t.end(); ++it) {
    if (unsafe.match(it.value()).hasMatch()) errors << QString("token '%1' has a value the engine won't put in CSS").arg(it.key());
    else if (it.key().startsWith("color.") && colorChannel(it.value()).isEmpty())
      errors << QString("token '%1' is not a #hex or rgb()/rgba() color: '%2'").arg(it.key(), it.value());
  }
  return errors;
}

QString cssVar(const QString& token) { return "--icefin-" + QString(token).replace('.', '-'); }

QString toCss(const TokenMap& t)
{
  QString css = ":root {\n";
  for (auto it = t.begin(); it != t.end(); ++it) {
    css += QString("  %1: %2;\n").arg(cssVar(it.key()), it.value());
    if (it.key().startsWith("color.")) css += QString("  %1-channel: %2;\n").arg(cssVar(it.key()), colorChannel(it.value()));
  }
  return css + "}\n";
}
}
