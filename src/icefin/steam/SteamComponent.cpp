#include "SteamComponent.h"
#include <QClipboard>
#include <QDebug>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QRegularExpression>
#include <QTimer>
#include "Branding.h"
#include "settings/SettingsComponent.h"

namespace Icefin::Steam
{
namespace
{
const char* kOffer = "icefin_steam_offer";  // state section: "answered" once the first-run offer was answered
const char* kFlatpakSteam = "com.valvesoftware.Steam";
const QStringList kSteamPaths = {"~/.steam", "~/.steam/steam", "~/.var/app/com.valvesoftware.Steam"};

QString env(const char* name) { return qEnvironmentVariable(name); }

bool sandboxed() { return QFile::exists("/.flatpak-info"); }

QJsonArray resultsOf(const QByteArray& out)
{
  return QJsonDocument::fromJson(out).object().value("results").toArray();
}
}

QVariantMap SteamComponent::parseStatus(const QByteArray& out, int exitCode)
{
  QVariantMap s{{"checked", true}, {"steam", false}, {"present", false}, {"flatpakSteam", false}, {"accounts", QVariantList()}};
  if (exitCode == 2) { s["error"] = "config"; return s; }
  const QJsonArray results = resultsOf(out);
  QVariantList accounts;
  bool present = false, flatpak = false;
  for (const QJsonValue& v : results)
  {
    const QJsonObject r = v.toObject();
    const bool fp = r.value("flatpak_steam").toBool();
    const bool here = r.value("present").toBool();
    accounts.append(QVariantMap{{"name", personaName(r.value("steam").toString(), r.value("user").toString())},
                                {"flatpak", fp}, {"present", here}});
    present = present || here;
    flatpak = flatpak || fp;
  }
  // A Steam install with no signed-in account yet has nothing to add the shortcut to: treated as no Steam.
  s["steam"] = !accounts.isEmpty();
  s["present"] = present;
  s["flatpakSteam"] = flatpak;
  s["accounts"] = accounts;
  return s;
}

QVariantMap SteamComponent::parseResult(const QString& op, const QByteArray& out, const QByteArray& err, int exitCode)
{
  QVariantMap r{{"op", op}, {"ok", exitCode == 0}, {"accounts", QVariantList()}, {"error", QString()}};
  QVariantList accounts;
  for (const QJsonValue& v : resultsOf(out))
  {
    const QJsonObject o = v.toObject();
    if (!o.value("changed").toBool()) continue;
    accounts.append(QVariantMap{{"name", personaName(o.value("steam").toString(), o.value("user").toString())},
                                {"flatpak", o.value("flatpak_steam").toBool()}});
  }
  r["accounts"] = accounts;
  // Plain sentences for the page; the helper's own words (paths, IDs) stay in the log.
  if (exitCode == 1)
    r["error"] = op == "add" ? QString("Steam wasn't found.") : QString("IceFin Player isn't in Steam.");
  else if (exitCode == 2)
    r["error"] = QString("IceFin Player's Steam files are missing or damaged. Reinstalling IceFin Player should fix it.");
  else if (exitCode == 3)
    r["error"] = QString("Steam may still be running. Quit it completely and try again.");
  else if (exitCode != 0)
    r["error"] = QString("Something went wrong while changing Steam's shortcuts. Nothing was changed.");
  if (exitCode >= 2 && !err.trimmed().isEmpty())
    qWarning().noquote() << "Icefin steam:" << op << "failed:" << QString::fromUtf8(err.trimmed());
  return r;
}

QString SteamComponent::personaName(const QString& root, const QString& user)
{
  if (root.isEmpty() || user.isEmpty()) return {};
  QFile f(root + "/userdata/" + user + "/config/localconfig.vdf");
  if (!f.open(QIODevice::ReadOnly)) return {};
  static const QRegularExpression re(R"re("PersonaName"\s+"((?:[^"\\]|\\.)*)")re");
  const auto m = re.match(QString::fromUtf8(f.read(4 * 1024 * 1024)));
  return m.hasMatch() ? m.captured(1).replace("\\\"", "\"").replace("\\\\", "\\") : QString();
}

bool SteamComponent::sandboxReachesSteam(const QString& flatpakInfo)
{
  bool inContext = false;
  for (const QString& raw : flatpakInfo.split('\n'))
  {
    const QString line = raw.trimmed();
    if (line.startsWith('[')) { inContext = line == "[Context]"; continue; }
    if (!inContext || !line.startsWith("filesystems=")) continue;
    for (const QString& entry : line.mid(12).split(';', Qt::SkipEmptyParts))
    {
      if (entry.startsWith('!') || entry.endsWith(":ro")) continue;
      const QString path = entry.section(':', 0, 0);
      if (path == "home" || path == "host" || kSteamPaths.contains(path)) return true;
    }
  }
  return false;
}

QString SteamComponent::helper() const
{
  const QString e = env("ICEFIN_STEAM_HELPER");
  if (!e.isEmpty()) return e;
  const QString p = QString("/app/bin/%1-steam").arg(Icefin::AppId);
  return QFile::exists(p) ? p : QString();
}

QString SteamComponent::config() const
{
  const QString e = env("ICEFIN_STEAM_CONFIG");
  if (!e.isEmpty()) return e;
  return QString("/app/share/%1/steam/steam-shortcut.json").arg(Icefin::AppId);
}

QVariantMap SteamComponent::state() const
{
  QVariantMap s = m_status;
  const bool available = !helper().isEmpty() && QFile::exists(config());
  s["available"] = available;
  s["busy"] = m_busy || !m_queue.isEmpty();
  if (!s.contains("checked")) s["checked"] = false;
  bool reachable = true;
  if (sandboxed())
  {
    QFile info("/.flatpak-info");
    reachable = info.open(QIODevice::ReadOnly) && sandboxReachesSteam(QString::fromUtf8(info.readAll()));
  }
  s["reachable"] = reachable;
  const QString answered = SettingsComponent::Get().value(SETTINGS_SECTION_STATE, kOffer).toString();
  s["offer"] = available && s.value("checked").toBool() && s.value("steam").toBool() && !s.value("present").toBool()
               && answered.isEmpty();
  QStringList grants;
  for (const QString& p : kSteamPaths) grants << QString("--filesystem=%1:rw").arg(p);
  s["reachCommand"] = QString("flatpak override --user %1 %2").arg(grants.join(' '), Icefin::AppId);
  s["spawnCommand"] = QString("flatpak override --user --talk-name=org.freedesktop.Flatpak %1").arg(kFlatpakSteam);
  return s;
}

void SteamComponent::componentPostInitialize()
{
  if (helper().isEmpty()) return;
  // Every start: new art from an app update reaches an existing shortcut with no prompt (art only, safe while Steam
  // runs; nothing happens without a shortcut), then the state for the page.
  enqueue("refresh", true);
  enqueue("status");
}

void SteamComponent::check() { enqueue("status"); }
void SteamComponent::add() { enqueue("add"); }
void SteamComponent::updateArt() { enqueue("refresh"); }
void SteamComponent::remove() { enqueue("remove"); }

void SteamComponent::dismissOffer()
{
  SettingsComponent::Get().setValue(SETTINGS_SECTION_STATE, kOffer, QString("answered"));
  emit stateChanged(state());
}

void SteamComponent::copyText(const QString& text) const
{
  if (QClipboard* c = QGuiApplication::clipboard()) c->setText(text);
}

void SteamComponent::enqueue(const QString& op, bool quiet)
{
  if (helper().isEmpty()) return;
  for (const Job& j : m_queue)
    if (j.op == op) return;  // already waiting
  m_queue.append({op, quiet});
  if (!m_busy) runNext();
}

void SteamComponent::runNext()
{
  if (m_queue.isEmpty()) { m_busy = false; return; }
  m_busy = true;
  const Job job = m_queue.takeFirst();
  QStringList args{job.op, "--config", config()};
  const QString root = env("ICEFIN_STEAM_ROOT");
  if (!root.isEmpty()) args << "--steam-root" << root;
  if (job.op == "add" || job.op == "remove") args << "--yes";  // the page asked the user to quit Steam first
  QString program = helper();
  if (!QFileInfo(program).isExecutable()) { args.prepend(program); program = "python3"; }

  auto* p = new QProcess(this);
  auto* timeout = new QTimer(p);
  timeout->setSingleShot(true);
  connect(timeout, &QTimer::timeout, p, [p]() { p->kill(); });
  connect(p, &QProcess::finished, this, [this, p, job](int code, QProcess::ExitStatus status) {
    const int exitCode = status == QProcess::NormalExit ? code : -1;
    const QByteArray out = p->readAllStandardOutput(), err = p->readAllStandardError();
    p->deleteLater();
    qInfo().noquote() << "Icefin steam:" << job.op << "-> exit" << exitCode;
    if (job.op == "status")
    {
      m_status = parseStatus(out, exitCode);
      if (!m_queue.isEmpty()) { runNext(); return; }
      m_busy = false;
      emit stateChanged(state());
      return;
    }
    if (!job.quiet) emit finished(parseResult(job.op, out, err, exitCode));
    else if (exitCode >= 2) parseResult(job.op, out, err, exitCode);  // logs the failure
    if (job.op == "add" || job.op == "remove") dismissOffer();  // the offer is settled either way
    if (!job.quiet) m_queue.append({"status", true});
    runNext();
  });
  connect(p, &QProcess::errorOccurred, this, [p](QProcess::ProcessError e) {
    if (e == QProcess::FailedToStart) { qWarning() << "Icefin steam: helper failed to start"; emit p->finished(-1, QProcess::CrashExit); }
  });
  p->start(program, args);
  timeout->start(60000);
}
}
