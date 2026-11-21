// Icefin: "steam" on the QWebChannel (Steam Shortcut Standard v1, D43, PLAN 11.10). Adds IceFin Player to Steam with
// its art kit, updates the art and removes it again, by running the helper the Flatpak installs
// (/app/bin/<APP_ID>-steam, vendored unchanged from ai-assets as packaging/steam/add_to_steam.py) and reading its JSON.
// The page (native/icefin/steamShortcut.js) shows the state in Client Settings -> Steam, makes the first-run offer and
// asks the user to quit Steam before Add or Remove. Add and Remove run only from the page, after that confirmation;
// the one silent operation is the art refresh at start, which only re-copies art for a shortcut the user already added
// and never touches shortcuts.vdf.
//
// Outside the Flatpak there's no helper, and the section stays hidden. Tests point the component at a helper, a config
// and a fake Steam root with ICEFIN_STEAM_HELPER, ICEFIN_STEAM_CONFIG and ICEFIN_STEAM_ROOT.
#pragma once
#include "core/ComponentManager.h"
#include <QByteArray>
#include <QStringList>
#include <QVariantMap>

namespace Icefin::Steam
{
class SteamComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(SteamComponent);

public:
  bool componentInitialize() override { return true; }
  void componentPostInitialize() override;
  const char* componentName() override { return "steam"; }
  bool componentExport() override { return true; }

  // {available, busy, checked, steam, present, flatpakSteam, reachable, accounts[{name, flatpak, present}], offer,
  //  reachCommand, spawnCommand}. offer: Steam is here, no shortcut yet and the first-run offer hasn't been answered.
  Q_INVOKABLE QVariantMap state() const;
  // Read the state again (the helper's status); stateChanged() follows.
  Q_INVOKABLE void check();
  // Add, Update art and Remove. finished() follows with {op, ok, accounts[{name, flatpak}], error}, then stateChanged().
  // add() and remove() pass --yes: call them only after the user confirmed that Steam is closed.
  Q_INVOKABLE void add();
  Q_INVOKABLE void updateArt();
  Q_INVOKABLE void remove();
  // The first-run offer was answered (Add or Not now): it never comes back by itself.
  Q_INVOKABLE void dismissOffer();
  // A command onto the clipboard (the Flatpak Steam and folder-access commands the page shows).
  Q_INVOKABLE void copyText(const QString& text) const;

  // The helper's JSON as the page's state and results. Separate so they can be unit-tested without a process.
  static QVariantMap parseStatus(const QByteArray& out, int exitCode);
  static QVariantMap parseResult(const QString& op, const QByteArray& out, const QByteArray& err, int exitCode);
  // A Steam account's display name from <root>/userdata/<id>/config/localconfig.vdf (read only), or "" when unknown.
  static QString personaName(const QString& root, const QString& user);
  // Does this sandbox reach Steam's folders? From /.flatpak-info's [Context] filesystems (the manifest plus overrides).
  static bool sandboxReachesSteam(const QString& flatpakInfo);

Q_SIGNALS:
  void stateChanged(const QVariantMap& state);
  void finished(const QVariantMap& result);

private:
  SteamComponent() = default;
  QString helper() const;
  QString config() const;
  void enqueue(const QString& op, bool quiet = false);
  void runNext();

  struct Job
  {
    QString op;
    bool quiet;
  };
  QList<Job> m_queue;
  bool m_busy = false;
  QVariantMap m_status;  // the last parseStatus()
};
}
