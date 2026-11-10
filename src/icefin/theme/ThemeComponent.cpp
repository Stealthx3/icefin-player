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
#include "settings/SettingsSection.h"
#include "icefin/audio/AudioState.h"
#include <QDateTime>
#include <QSoundEffect>
#include <QUrl>

namespace Icefin::Theme
{
static const char* kStateKey = "icefin_theme";  // state section: {"users": {"<id>": {theme, preset, timestamp}}, "last": "<id>"}
static const char* kSection = "theme";          // Client Settings: active (the picker), sounds
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
  r << ":/icefin-themes";
  r << Paths::globalDataDir("themes");
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
  if (SettingsComponent::Get().getSection(kSection)) updateChoices();
}

static QJsonObject stateObject()
{
  QJsonObject st = QJsonDocument::fromJson(SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kStateKey).toString().toUtf8()).object();
  if (st.contains("id") && !st.contains("users"))  // 6.5-8.3 format: one device-wide choice
    st = QJsonObject{{"users", QJsonObject{{"", QJsonObject{{"theme", st.value("id")}, {"preset", st.value("preset")}, {"timestamp", 1}}}}}, {"last", ""}};
  return st;
}

static void saveState(const QJsonObject& st)
{
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kStateKey, QString::fromUtf8(QJsonDocument(st).toJson(QJsonDocument::Compact)));
}

bool ThemeComponent::componentInitialize()
{
  rescan();
  const QJsonObject st = stateObject();
  m_user = st.value("last").toString();
  const QJsonObject sel = st.value("users").toObject().value(m_user).toObject();
  const QString id = sel.value("theme").toString();
  if (!id.isEmpty() && !apply(id, sel.value("preset").toString(), 0))
    qWarning().noquote() << "Icefin theme: saved theme" << id << "can't be used; engine off:" << m_errors.join("; ");
  if (auto* sec = SettingsComponent::Get().getSection(kSection)) {
    connect(sec, &SettingsSection::valuesUpdated, this, [this](const QVariantMap& v) {
      if (m_mirroring || !v.contains("active")) return;
      const QString picked = v.value("active").toString();
      if (picked != m_active && !setActiveTheme(picked, QString())) mirrorSetting();  // refused: show the real state again
    });
  }
  connect(&Audio::state(), &Audio::AudioState::bitstreamChanged, this, [this](bool on) {
    if (on) for (QSoundEffect* e : m_sounds) e->stop();
  });
  updateChoices();
  mirrorSetting();
  return true;
}

void ThemeComponent::updateChoices()
{
  QVariantList list{QVariantMap{{"value", QString()}, {"title", "Off (stock look)"}}};
  for (const Package& p : m_packages)
    if (p.ok()) list << QVariantMap{{"value", p.id}, {"title", p.source == Source::Development ? p.name + " (development)" : p.name}};
  SettingsComponent::Get().updatePossibleValues(kSection, "active", list);
}

void ThemeComponent::mirrorSetting()
{
  if (!SettingsComponent::Get().getSection(kSection)) return;
  m_mirroring = true;
  SettingsComponent::Get().setValue(kSection, "active", m_active);
  m_mirroring = false;
}

void ThemeComponent::setUser(const QString& userId)
{
  if (userId == m_user) return;
  m_user = userId;
  QJsonObject st = stateObject();
  st["last"] = userId;
  saveState(st);
  const QJsonObject sel = st.value("users").toObject().value(userId).toObject();
  qInfo().noquote() << "Icefin theme: user" << (userId.isEmpty() ? QString("(none)") : userId.left(8))
                    << (sel.isEmpty() ? "has no choice on this device yet" : "-> " + sel.value("theme").toString());
  if (!sel.isEmpty() && (sel.value("theme").toString() != m_active || sel.value("preset").toString() != m_preset))
    apply(sel.value("theme").toString(), sel.value("preset").toString(), 0);
}

QVariantMap ThemeComponent::selection() const
{
  const QJsonObject sel = stateObject().value("users").toObject().value(m_user).toObject();
  return {{"theme", sel.value("theme").toString()}, {"preset", sel.value("preset").toString()},
          {"timestamp", sel.value("timestamp").toDouble()}, {"user", m_user}};
}

bool ThemeComponent::applyRemote(const QString& id, const QString& preset, double timestamp)
{
  if (timestamp <= selection().value("timestamp").toDouble()) return false;
  return apply(id, preset, qint64(timestamp));
}

void ThemeComponent::soundNote(bool played, const QString& event, const QString& reason)
{
  const char* k = played ? "played" : "suppressed";
  m_soundState[k] = m_soundState.value(k).toInt() + 1;
  m_soundState["last"] = event;
  m_soundState["reason"] = reason;
}

void ThemeComponent::playSound(const QString& event)
{
  if (m_active.isEmpty() || !m_packages.contains(m_active)) return;
  if (Audio::state().uiSoundsMuted()) { soundNote(false, event, "passthrough or exclusive playback"); return; }
  if (auto* sec = SettingsComponent::Get().getSection(kSection); sec && !sec->value("sounds").toBool()) { soundNote(false, event, "theme sounds off"); return; }
  const Package& p = m_packages[m_active];
  const QString rel = p.sounds.value(event);
  if (rel.isEmpty() || !mayServe(p, rel, trusted(p))) return;
  const QString path = p.dir + '/' + rel;
  QSoundEffect*& e = m_sounds[path];
  if (!e) {
    e = new QSoundEffect(this);
    e->setSource(path.startsWith(":/") ? QUrl("qrc" + path) : QUrl::fromLocalFile(path));
  }
  bool ok = false;
  const double vol = m_tokens.value("sound.volume").toDouble(&ok);
  e->setVolume(ok ? qBound(0.0, vol, 1.0) : 1.0);
  e->play();
  soundNote(true, event, QString());
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

bool ThemeComponent::apply(const QString& id, const QString& preset, qint64 saveTimestamp)
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
  if (saveTimestamp) {
    QJsonObject st = stateObject();
    QJsonObject users = st.value("users").toObject();
    users[m_user] = QJsonObject{{"theme", m_active}, {"preset", m_preset}, {"timestamp", double(saveTimestamp)}};
    st["users"] = users;
    st["last"] = m_user;
    saveState(st);
  }
  for (QSoundEffect* e : m_sounds) e->deleteLater();
  m_sounds.clear();
  mirrorSetting();
  qInfo().noquote() << "Icefin theme:" << (m_active.isEmpty() ? QString("engine off (stock UI)") : QString("%1%2, %3 tokens").arg(m_active, m_preset.isEmpty() ? QString() : " / " + m_preset).arg(m_tokens.size()));
  emit changed(m_active, m_preset);
  return true;
}

bool ThemeComponent::setActiveTheme(const QString& id, const QString& preset)
{
  return apply(id, preset, QDateTime::currentMSecsSinceEpoch());
}

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
