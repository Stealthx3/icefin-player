// Unit tests for Add to Steam's native side (Steam Shortcut Standard v1, D43, PLAN 11.10): the helper's JSON read into
// the page's state and results, the Steam account names, and the sandbox's access to Steam's folders. The helper's
// own writes are tested against a fake Steam root by tests/icefin/steam/test_steam_shortcut.py; here it runs once,
// for real, so the parsing is checked against its actual output.
#include <QtTest>
#include <QProcess>
#include <QStandardPaths>
#include <QTemporaryDir>
#include "icefin/steam/SteamComponent.h"

using Icefin::Steam::SteamComponent;

class TestSteam : public QObject
{
  Q_OBJECT
private slots:
  void status_noSteam()
  {
    const QVariantMap s = SteamComponent::parseStatus(R"({"steam": false})", 1);
    QCOMPARE(s.value("checked").toBool(), true);
    QCOMPARE(s.value("steam").toBool(), false);
    QCOMPARE(s.value("present").toBool(), false);
  }
  void status_accounts()
  {
    const QByteArray out = R"({"version": "1", "op": "status", "results": [
      {"user": "1", "present": false, "shortcut_id": 1, "steam": "/nowhere/a", "flatpak_steam": false},
      {"user": "2", "present": true, "shortcut_id": 1, "steam": "/nowhere/b", "flatpak_steam": true}]})";
    const QVariantMap s = SteamComponent::parseStatus(out, 0);
    QCOMPARE(s.value("steam").toBool(), true);
    QCOMPARE(s.value("present").toBool(), true);
    QCOMPARE(s.value("flatpakSteam").toBool(), true);
    QCOMPARE(s.value("accounts").toList().size(), 2);
    // A Steam install with no account yet: nothing to add to.
    QCOMPARE(SteamComponent::parseStatus(R"({"version": "1", "op": "status", "results": []})", 0).value("steam").toBool(), false);
  }
  void result_plainWords()
  {
    const QByteArray out = R"({"version": "1", "op": "add", "results": [
      {"user": "1", "changed": true, "added": true, "steam": "/nowhere/a", "flatpak_steam": false},
      {"user": "2", "changed": false, "steam": "/nowhere/a", "flatpak_steam": false}]})";
    const QVariantMap r = SteamComponent::parseResult("add", out, {}, 0);
    QCOMPARE(r.value("ok").toBool(), true);
    QCOMPARE(r.value("accounts").toList().size(), 1);  // only the accounts it changed
    QVERIFY(r.value("error").toString().isEmpty());
    for (int code : {1, 2, 3, -1})
    {
      const QString e = SteamComponent::parseResult("add", {}, "config: art file missing: /app/share/x", code).value("error").toString();
      QVERIFY2(!e.isEmpty() && !e.contains('/'), qPrintable(e));  // a sentence, never a path
    }
  }
  void personaName()
  {
    QTemporaryDir root;
    QVERIFY(QDir(root.path()).mkpath("userdata/42/config"));
    QFile f(root.path() + "/userdata/42/config/localconfig.vdf");
    QVERIFY(f.open(QIODevice::WriteOnly));
    f.write("\"UserLocalConfigStore\"\n{\n\t\"friends\"\n\t{\n\t\t\"PersonaName\"\t\t\"Sam \\\"the\\\" Viewer\"\n\t}\n}\n");
    f.close();
    QCOMPARE(SteamComponent::personaName(root.path(), "42"), QString("Sam \"the\" Viewer"));
    QCOMPARE(SteamComponent::personaName(root.path(), "43"), QString());
  }
  void sandboxReach()
  {
    const QString granted = "[Application]\nname=x\n\n[Context]\nshared=network;ipc;\nfilesystems=xdg-run/pipewire-0;~/.steam:rw;~/.steam/steam:rw;\n";
    QVERIFY(SteamComponent::sandboxReachesSteam(granted));
    QVERIFY(!SteamComponent::sandboxReachesSteam("[Context]\nfilesystems=xdg-run/pipewire-0;/run/lirc:ro;\n"));
    QVERIFY(!SteamComponent::sandboxReachesSteam("[Context]\nfilesystems=~/.steam:ro;\n"));
    QVERIFY(!SteamComponent::sandboxReachesSteam("[Context]\nfilesystems=!~/.steam;\n"));
    QVERIFY(!SteamComponent::sandboxReachesSteam("[Instance]\nfilesystems=~/.steam:rw;\n"));
    QVERIFY(SteamComponent::sandboxReachesSteam("[Context]\nfilesystems=home;\n"));
  }
  void realHelper()
  {
    const QString python = QStandardPaths::findExecutable("python3");
    if (python.isEmpty()) QSKIP("no python3");
    QTemporaryDir tmp;
    const QString root = tmp.path() + "/Steam";
    QVERIFY(QDir().mkpath(root + "/userdata/12345/config"));
    const QString pkg = ICEFIN_STEAM_PKG;
    auto run = [&](const QStringList& args, int& code) {
      QProcess p;
      p.start(python, QStringList{"-I", pkg + "/add_to_steam.py"} + args + QStringList{"--config", pkg + "/steam-shortcut.json", "--steam-root", root});
      p.waitForFinished(30000);
      code = p.exitCode();
      return p.readAllStandardOutput();
    };
    // Each run's output first: the exit code it sets is read after it (argument order is unspecified).
    int code = 0;
    QByteArray out = run({"status"}, code);
    QVariantMap s = SteamComponent::parseStatus(out, code);
    QCOMPARE(s.value("steam").toBool(), true);
    QCOMPARE(s.value("present").toBool(), false);
    out = run({"add", "--yes"}, code);
    const QVariantMap r = SteamComponent::parseResult("add", out, {}, code);
    QCOMPARE(r.value("ok").toBool(), true);
    QCOMPARE(r.value("accounts").toList().size(), 1);
    out = run({"status"}, code);
    QCOMPARE(SteamComponent::parseStatus(out, code).value("present").toBool(), true);
    out = run({"remove", "--yes"}, code);
    QVERIFY(SteamComponent::parseResult("remove", out, {}, code).value("ok").toBool());
    out = run({"refresh"}, code);
    QCOMPARE(SteamComponent::parseResult("refresh", out, {}, code).value("ok").toBool(), false);  // gone
  }
};

QTEST_GUILESS_MAIN(TestSteam)
#include "test_steam.moc"
