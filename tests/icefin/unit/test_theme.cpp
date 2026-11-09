// Unit tests for the theme engine's tokens and packages (PLAN 6.5).
#include <QtTest>
#include <QJsonDocument>
#include "icefin/theme/Tokens.h"
#include "icefin/theme/ThemePackage.h"

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
};

QTEST_GUILESS_MAIN(TestTheme)
#include "test_theme.moc"
