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
#include <QCryptographicHash>
#include <QImage>
#include <QCoreApplication>
#include <QUrl>
#include <QSoundEffect>
#include <QFileDialog>
#include "ThemeInstall.h"

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

static QVariantList schemeList(const Package& p)
{
  QVariantList l;
  for (auto it = p.schemes.begin(); it != p.schemes.end(); ++it) l << QVariantMap{{"id", it.key()}, {"name", it.value().name}};
  return l;
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
  m_colorScheme = sel.value("scheme").toString();
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
  if (!sel.isEmpty() && !m_classic && (sel.value("theme").toString() != m_active || sel.value("preset").toString() != m_preset
                         || sel.value("scheme").toString() != m_colorScheme)) {
    m_colorScheme = sel.value("scheme").toString();
    apply(sel.value("theme").toString(), sel.value("preset").toString(), 0);
  }
}

QVariantMap ThemeComponent::selection() const
{
  const QJsonObject sel = stateObject().value("users").toObject().value(m_user).toObject();
  return {{"theme", sel.value("theme").toString()}, {"preset", sel.value("preset").toString()}, {"scheme", sel.value("scheme").toString()},
          {"timestamp", sel.value("timestamp").toDouble()}, {"user", m_user}};
}

void ThemeComponent::saveSelection(const QString& id, const QString& preset, const QString& scheme, qint64 timestamp)
{
  QJsonObject st = stateObject();
  QJsonObject users = st.value("users").toObject();
  users[m_user] = QJsonObject{{"theme", id}, {"preset", preset}, {"scheme", scheme}, {"timestamp", double(timestamp)}};
  st["users"] = users;
  st["last"] = m_user;
  saveState(st);
}

TokenMap ThemeComponent::resolveFor(const Package& p, const QString& preset, const QString& scheme, QStringList* errs) const
{
  if (!preset.startsWith('@')) return p.resolved(preset, {}, errs, scheme);
  // Another theme's colours: its resolved color.* tokens (with its own preset and scheme) over this theme's base.
  // This theme's own extra colours (a tile, a ribbon) stay where the other theme has none.
  const QString fid = preset.mid(1).section('/', 0, 0), fpreset = preset.mid(1).section('/', 1);
  if (!m_packages.contains(fid) || !m_packages[fid].ok()) {
    if (errs) *errs << QString("no colour scheme from theme '%1'").arg(fid);
    return {};
  }
  const TokenMap other = m_packages[fid].resolved(fpreset, {}, errs, scheme);
  TokenMap colours;
  for (auto it = other.begin(); it != other.end(); ++it)
    if (it.key().startsWith("color.")) colours.insert(it.key(), it.value());
  return p.resolved(QString(), colours, errs, QString());
}

bool ThemeComponent::setClassic(bool on)
{
  if (on == m_classic) return true;
  m_classic = on;
  qInfo().noquote() << "Icefin theme: Classic View" << (on ? "on for this session" : "off");
  bool ok = true;
  if (on) {
    apply(QString(), QString(), 0);
  } else {
    const QVariantMap sel = selection();
    m_colorScheme = sel.value("scheme").toString();
    ok = apply(sel.value("theme").toString(), sel.value("preset").toString(), 0);
  }
  emit classicChanged(on);
  return ok;
}

bool ThemeComponent::applyRemote(const QString& id, const QString& preset, const QString& scheme, double timestamp)
{
  if (timestamp <= selection().value("timestamp").toDouble()) return false;
  if (m_classic) { saveSelection(id, preset, scheme, qint64(timestamp)); return true; }  // shown when Classic View ends
  const QString before = m_colorScheme;
  m_colorScheme = scheme;
  if (!apply(id, preset, qint64(timestamp))) { m_colorScheme = before; return false; }
  return true;
}

bool ThemeComponent::select(const QString& id, const QString& preset, const QString& scheme)
{
  if (m_classic) { m_classic = false; emit classicChanged(false); }
  const QString before = m_colorScheme;
  m_colorScheme = scheme;
  if (!apply(id, preset, QDateTime::currentMSecsSinceEpoch())) { m_colorScheme = before; return false; }
  return true;
}

bool ThemeComponent::setScheme(const QString& scheme)
{
  if (scheme == m_colorScheme) return true;
  const QString before = m_colorScheme;
  m_colorScheme = scheme;
  if (!apply(m_active, m_preset, QDateTime::currentMSecsSinceEpoch())) { m_colorScheme = before; apply(m_active, m_preset, 0); return false; }
  return true;
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
    out << QVariantMap{{"id", p.id}, {"name", p.name}, {"version", p.version}, {"description", p.description}, {"source", sourceName(p.source)},
                       {"presets", QStringList(p.presets.keys())}, {"schemes", schemeList(p)}, {"ok", p.ok()}, {"errors", p.errors},
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
    TokenMap t = resolveFor(p, preset, m_colorScheme, &e);
    if (!e.isEmpty()) { m_errors = e; return false; }
    m_active = id; m_preset = preset; m_tokens = t;
  }
  if (saveTimestamp) saveSelection(m_active, m_preset, m_colorScheme, saveTimestamp);
  for (QSoundEffect* e : m_sounds) e->deleteLater();
  m_sounds.clear();
  mirrorSetting();
  qInfo().noquote() << "Icefin theme:" << (m_active.isEmpty() ? QString("engine off (stock UI)") : QString("%1%2%3, %4 tokens").arg(m_active, m_preset.isEmpty() ? QString() : " / " + m_preset, m_colorScheme.isEmpty() ? QString() : " (" + m_colorScheme + ")").arg(m_tokens.size()));
  prepareBackdrop();
  emit changed(m_active, m_preset);
  emit backdropChanged();
  return true;
}

void ThemeComponent::prepareBackdrop()
{
  m_backdropUrl.clear();
  m_backdropTypes.clear();
  m_backdropLive.clear();
  m_backdropVisible = true;
  m_backdropMotion = "normal";
  m_backdropStats.clear();
  if (m_active.isEmpty() || !m_packages.contains(m_active)) return;
  const Package& p = m_packages[m_active];
  if (!p.backdrop.declared()) return;
  QStringList e;
  // A shader is code for the GPU driver's compiler: a user-installed theme's needs the user's trust, like its scripts
  // (docs/security/THEME-TRUST-REVIEW.md, 8.4).
  if (p.source == Source::User && !trusted(p)) e << "backdrop: trust this theme to run its backdrop shader";
  const QMap<QString, QString> types = backdropTypes(p.backdrop, m_tokens, &e);
  QFile f(p.dir + '/' + p.backdrop.shader);
  QByteArray bytes;
  if (e.isEmpty()) {
    if (!f.open(QIODevice::ReadOnly) || f.size() > 256 * 1024) e << "backdrop shader missing or over 256 KiB";
    else bytes = f.readAll();
  }
  QString err;
  if (e.isEmpty() && p.backdrop.precompiled()) {
    if (!checkBackdropQsb(bytes, types, &err)) e << "backdrop: " + err;
    else m_backdropUrl = p.dir.startsWith(":/") ? "qrc" + f.fileName() : QUrl::fromLocalFile(f.fileName()).toString();
  } else if (e.isEmpty()) {
    // Baked once per source and param types; cached as a .qsb file Backdrop.qml loads.
    const QString src = backdropSource(QString::fromUtf8(bytes), types);
    const QString name = QString("%1-%2.qsb").arg(p.id, QString(QCryptographicHash::hash(src.toUtf8(), QCryptographicHash::Sha1).toHex().left(16)));
    const QString path = Paths::cacheDir("backdrop/" + name);
    if (!QFileInfo::exists(path)) {
      const QByteArray qsb = bakeBackdrop(QString::fromUtf8(bytes), types, &err);
      if (qsb.isEmpty()) e << "backdrop: " + err;
      else {
        QDir().mkpath(QFileInfo(path).path());
        QFile out(path);
        if (!out.open(QIODevice::WriteOnly) || out.write(qsb) != qsb.size()) e << "backdrop: can't write " + path;
      }
    }
    if (e.isEmpty()) m_backdropUrl = QUrl::fromLocalFile(path).toString();
  }
  if (!e.isEmpty()) {
    m_errors << e;
    qWarning().noquote() << "Icefin theme:" << p.id << "backdrop off:" << e.join("; ");
    return;
  }
  m_backdropTypes = types;
  qInfo().noquote() << "Icefin theme:" << p.id << "backdrop" << p.backdrop.shader << "ready";
}

QVariantMap ThemeComponent::backdrop() const
{
  if (m_backdropUrl.isEmpty()) return {};
  const Package& p = m_packages[m_active];
  QVariantMap params;
  for (auto it = m_backdropTypes.begin(); it != m_backdropTypes.end(); ++it) {
    const QVariant decl = p.backdrop.params.value(it.key());
    QVariant value;
    if (decl.typeId() == QMetaType::QString) {
      const QString ref = decl.toString();
      const QString v = m_backdropLive.contains(ref) ? m_backdropLive.value(ref) : m_tokens.value(ref);
      value = it.value() == "color" ? QVariant::fromValue(cssColor(v)) : QVariant(v.toDouble());
    } else {
      value = decl.toDouble();
    }
    params.insert(it.key(), QVariantMap{{"type", it.value()}, {"value", value}});
  }
  return {{"shader", m_backdropUrl}, {"fps", p.backdrop.fps}, {"visible", m_backdropVisible}, {"motion", m_backdropMotion}, {"params", params}};
}

// Test hooks: only when the app was started for remote debugging, which already gives full control of the page.
static bool testHooks()
{
  for (const QString& a : QCoreApplication::arguments()) if (a.startsWith("--remote-debugging-port")) return true;
  return false;
}

QString ThemeComponent::grabWindow()
{
  if (!testHooks()) return QString();
  const QString path = Paths::cacheDir("backdrop/window-grab.png");
  QDir().mkpath(QFileInfo(path).path());
  QFile::remove(path);
  m_grab.clear();
  emit grabRequested(path);
  return path;
}

bool ThemeComponent::repaintWeb(const QString& mode)
{
  static const QStringList modes{"bgAlpha", "layer", "visible", "resize"};
  if (!testHooks() || !modes.contains(mode)) return false;
  emit webRepaintRequested(mode);
  return true;
}

QVariantList ThemeComponent::grabPixel(double fx, double fy) const
{
  if (!testHooks()) return {};
  const QImage img(Paths::cacheDir("backdrop/window-grab.png"));
  if (img.isNull()) return {};
  const QColor c = img.pixelColor(qBound(0, int(fx * img.width()), img.width() - 1), qBound(0, int(fy * img.height()), img.height() - 1));
  return {c.red(), c.green(), c.blue()};
}

void ThemeComponent::setBackdropState(const QVariantMap& state)
{
  if (m_backdropUrl.isEmpty()) return;
  const Package& p = m_packages[m_active];
  if (state.contains("visible")) m_backdropVisible = state.value("visible").toBool();
  if (state.contains("motion")) m_backdropMotion = state.value("motion").toString() == "low" ? "low" : "normal";
  if (state.contains("tokens")) {
    m_backdropLive.clear();
    QStringList refs;
    for (const QVariant& v : p.backdrop.params) if (v.typeId() == QMetaType::QString) refs << v.toString();
    const QVariantMap t = state.value("tokens").toMap();
    for (auto it = t.begin(); it != t.end(); ++it) {
      if (!refs.contains(it.key())) continue;
      const QString v = it.value().toString().trimmed();
      bool num = false;
      v.toDouble(&num);
      if (num || cssColor(v).isValid()) m_backdropLive.insert(it.key(), v);
    }
  }
  emit backdropChanged();
}

bool ThemeComponent::setActiveTheme(const QString& id, const QString& preset)
{
  if (m_classic) { m_classic = false; emit classicChanged(false); }
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
  out["backdrop"] = !m_backdropUrl.isEmpty();  // the native backdrop draws under the page: themes make it transparent
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

QVariantMap ThemeComponent::previewTokens(const QString& id, const QString& preset, const QString& scheme) const
{
  QVariantMap m;
  if (!m_packages.contains(id) || !m_packages[id].ok()) return m;
  QStringList e;
  const TokenMap t = resolveFor(m_packages[id], preset, scheme, &e);
  if (!e.isEmpty()) return m;
  for (auto it = t.begin(); it != t.end(); ++it) m.insert(it.key(), it.value());
  return m;
}

void ThemeComponent::pickPackage()
{
  auto* d = new QFileDialog(nullptr, "Install a theme package", QDir::homePath(), "Theme packages (*.zip *.icefin-theme);;All files (*)");
  d->setFileMode(QFileDialog::ExistingFile);
  d->setAttribute(Qt::WA_DeleteOnClose);
  connect(d, &QFileDialog::fileSelected, this, [this](const QString& path) { emit installFinished(installFile(path)); });
  connect(d, &QFileDialog::rejected, this, [this]() { emit installFinished(QVariantMap{{"ok", false}, {"cancelled", true}, {"errors", QStringList()}}); });
  d->open();
}

QVariantMap ThemeComponent::installFile(const QString& path)
{
  QSet<QString> reserved;
  for (const Package& p : m_packages)
    if (p.source != Source::User) reserved.insert(p.id);
  const InstallResult r = installPackageFile(path, Paths::globalDataDir("themes"), reserved);
  QVariantMap out{{"ok", r.ok}, {"id", r.id}, {"name", r.name}, {"replaced", r.replaced}, {"errors", r.errors}};
  if (!r.ok) {
    qWarning().noquote() << "Icefin theme: install from" << QFileInfo(path).fileName() << "refused:" << r.errors.join("; ");
    return out;
  }
  if (r.replaced) setTrusted(r.id, false);  // trust is bound to content: an update asks again
  rescan();
  out["hasScripts"] = m_packages.contains(r.id) && !m_packages[r.id].scripts.isEmpty();
  qInfo().noquote() << "Icefin theme: installed" << r.id << (r.replaced ? "(replaced the installed copy)" : "");
  if (r.id == m_active) apply(m_active, m_preset, 0);
  emit packagesChanged();
  return out;
}

QVariantMap ThemeComponent::removePackage(const QString& id)
{
  if (!m_packages.contains(id) || m_packages[id].source != Source::User)
    return {{"ok", false}, {"errors", QStringList{"only themes you installed can be removed"}}};
  if (id == m_active) return {{"ok", false}, {"errors", QStringList{"switch to another theme before removing this one"}}};
  const QString dir = m_packages[id].dir;
  if (!QFileInfo(dir).absolutePath().startsWith(QFileInfo(Paths::globalDataDir("themes")).absoluteFilePath()) || !QDir(dir).removeRecursively())
    return {{"ok", false}, {"errors", QStringList{"can't remove the theme's folder"}}};
  setTrusted(id, false);
  rescan();
  qInfo().noquote() << "Icefin theme: removed" << id;
  emit packagesChanged();
  return {{"ok", true}, {"errors", QStringList()}};
}
}
