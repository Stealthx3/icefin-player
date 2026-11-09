#include "ThemeComponent.h"
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcessEnvironment>
#include "settings/SettingsComponent.h"
#include "shared/Paths.h"

namespace Icefin::Theme
{
static const char* kStateKey = "icefin_theme";  // state section: {"id": ..., "preset": ...}
static const char* kAdapter = ":/web-client/extension/icefin/jellyfin-web.css";

static QString sourceName(Source s) { return s == Source::Bundled ? "bundled" : s == Source::Development ? "development" : "user"; }

QStringList ThemeComponent::roots()
{
  QStringList r;
  for (const QString& d : QProcessEnvironment::systemEnvironment().value("ICEFIN_THEME_PATH").split(':', Qt::SkipEmptyParts)) r << d;
  r << ":/icefin-themes" << Paths::globalDataDir("themes");
  return r;
}

void ThemeComponent::rescan()
{
  m_packages.clear();
  const QStringList dev = QProcessEnvironment::systemEnvironment().value("ICEFIN_THEME_PATH").split(':', Qt::SkipEmptyParts);
  for (const QString& root : roots()) {
    const Source src = root.startsWith(":/") ? Source::Bundled : dev.contains(root) ? Source::Development : Source::User;
    for (const QString& sub : QDir(root).entryList(QDir::Dirs | QDir::NoDotAndDotDot, QDir::Name)) {
      Package p = loadPackage(root + '/' + sub, src);
      const QString key = p.id.isEmpty() ? sub : p.id;
      if (m_packages.contains(key)) continue;  // earlier root wins
      if (!p.ok()) qWarning().noquote() << "Icefin theme" << p.dir << "refused:" << p.errors.join("; ");
      m_packages.insert(key, p);
    }
  }
  qInfo().noquote() << "Icefin theme: found" << m_packages.size() << "package(s) in" << roots().join(", ");
}

bool ThemeComponent::componentInitialize()
{
  rescan();
  const QJsonObject st = QJsonDocument::fromJson(SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kStateKey).toString().toUtf8()).object();
  const QString id = st.value("id").toString();
  if (!id.isEmpty() && !apply(id, st.value("preset").toString(), false))
    qWarning().noquote() << "Icefin theme: saved theme" << id << "can't be used; engine off:" << m_errors.join("; ");
  return true;
}

QVariantList ThemeComponent::themes()
{
  QVariantList out;
  for (const Package& p : m_packages) {
    out << QVariantMap{{"id", p.id}, {"name", p.name}, {"version", p.version}, {"source", sourceName(p.source)},
                       {"presets", QStringList(p.presets.keys())}, {"ok", p.ok()}, {"errors", p.errors}};
  }
  return out;
}

bool ThemeComponent::apply(const QString& id, const QString& preset, bool save)
{
  m_errors.clear();
  if (id.isEmpty()) {
    m_active.clear(); m_preset.clear(); m_tokens.clear();
  } else {
    if (!m_packages.contains(id)) { m_errors << QString("no theme '%1'").arg(id); return false; }
    const Package& p = m_packages[id];
    if (!p.ok()) { m_errors = p.errors; return false; }
    QStringList e;
    TokenMap t = p.resolved(preset, {}, &e);
    if (!e.isEmpty()) { m_errors = e; return false; }
    m_active = id; m_preset = preset; m_tokens = t;
  }
  if (save)
    SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kStateKey,
      m_active.isEmpty() ? QString() : QString::fromUtf8(QJsonDocument(QJsonObject{{"id", m_active}, {"preset", m_preset}}).toJson(QJsonDocument::Compact)));
  qInfo().noquote() << "Icefin theme:" << (m_active.isEmpty() ? QString("engine off (stock UI)") : QString("%1%2, %3 tokens").arg(m_active, m_preset.isEmpty() ? QString() : " / " + m_preset).arg(m_tokens.size()));
  emit changed(m_active, m_preset);
  return true;
}

bool ThemeComponent::setActiveTheme(const QString& id, const QString& preset) { return apply(id, preset, true); }

QVariantMap ThemeComponent::tokens() const
{
  QVariantMap m;
  for (auto it = m_tokens.begin(); it != m_tokens.end(); ++it) m.insert(it.key(), it.value());
  return m;
}

QString ThemeComponent::stylesheet() const
{
  if (m_active.isEmpty()) return QString();
  static QString adapter;
  if (adapter.isEmpty()) {
    QFile f(kAdapter);
    if (f.open(QIODevice::ReadOnly)) adapter = QString::fromUtf8(f.readAll());
    else qCritical() << "Icefin theme: adapter stylesheet missing:" << kAdapter;
  }
  return toCss(m_tokens) + adapter;
}
}
