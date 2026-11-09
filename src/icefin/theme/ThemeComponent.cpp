#include "ThemeComponent.h"
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcessEnvironment>
#include "settings/SettingsComponent.h"
#include "ThemeScheme.h"
#include <QQuickWebEngineProfile>
#include "shared/Paths.h"

namespace Icefin::Theme
{
static const char* kStateKey = "icefin_theme";  // state section: {"id": ..., "preset": ...}
static const char* kAdapter = ":/web-client/extension/icefin/jellyfin-web.css";
static const char* kTrustKey = "icefin_theme_trust";  // state section: {"<id>": "<content hash>"}

static QJsonObject trustStore()
{
  return QJsonDocument::fromJson(SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kTrustKey).toString().toUtf8()).object();
}

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
                       {"presets", QStringList(p.presets.keys())}, {"ok", p.ok()}, {"errors", p.errors},
                       {"hasScripts", !p.scripts.isEmpty()}, {"trusted", trusted(p)}};
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

QVariantMap ThemeComponent::activePackage() const
{
  if (m_active.isEmpty() || !m_packages.contains(m_active)) return {};
  const Package& p = m_packages[m_active];
  const QString base = QString("icefin-theme://%1/").arg(p.id);
  QVariantMap out{{"id", p.id}, {"source", sourceName(p.source)}};
  const bool t = trusted(p);
  out["trusted"] = t;
  out["styles"] = (!p.styles.isEmpty() && mayServe(p, p.styles, t)) ? base + p.styles : QString();
  QVariantList fonts;
  for (const QVariantMap& f : p.fonts) {
    if (!mayServe(p, f["file"].toString(), t)) continue;
    QVariantMap g = f;
    g["url"] = base + f["file"].toString();
    g.remove("file");
    fonts << g;
  }
  out["fonts"] = fonts;
  QStringList scripts;
  for (const QString& s : p.scripts) if (mayServe(p, s, t)) scripts << base + s;
  out["scripts"] = scripts;
  return out;
}

void ThemeComponent::installSchemeHandler(QObject* profile)
{
  auto* prof = qobject_cast<QQuickWebEngineProfile*>(profile);
  if (!prof) { qCritical() << "Icefin theme: installSchemeHandler needs the view's WebEngineProfile"; return; }
  if (!m_scheme)
    m_scheme = new SchemeHandler([this](const QString& id) -> const Package* { return m_packages.contains(id) ? &m_packages[id] : nullptr; },
                                 [this](const Package& p) { return trusted(p); }, this);
  if (!prof->urlSchemeHandler("icefin-theme")) prof->installUrlSchemeHandler("icefin-theme", m_scheme);
  qInfo() << "Icefin theme: icefin-theme: scheme served on the web view's profile";
}

bool ThemeComponent::trusted(const Package& p) const
{
  if (p.source != Source::User) return true;  // bundled, or development (ICEFIN_THEME_PATH)
  return trustStore().value(p.id).toString().toUtf8() == p.contentHash;
}

bool ThemeComponent::isTrusted(const QString& id) const { return m_packages.contains(id) && trusted(m_packages[id]); }

QString ThemeComponent::trustWarning() const
{
  return "Theme scripts run inside the signed-in page. They can read your server access token and act as you on "
         "the server. Only trust a theme from someone you trust. Changing the theme's files removes the trust.";
}

bool ThemeComponent::setTrusted(const QString& id, bool on)
{
  if (!m_packages.contains(id)) return false;
  const Package& p = m_packages[id];
  if (p.source != Source::User) return true;
  QJsonObject store = trustStore();
  if (on) store[id] = QString::fromUtf8(p.contentHash); else store.remove(id);
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kTrustKey, QString::fromUtf8(QJsonDocument(store).toJson(QJsonDocument::Compact)));
  qInfo().noquote() << "Icefin theme:" << id << (on ? "trusted (scripts allowed)" : "no longer trusted");
  if (id == m_active) emit changed(m_active, m_preset);  // reload its assets with the new rights
  return true;
}
}
