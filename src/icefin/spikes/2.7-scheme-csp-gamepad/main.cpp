// Spike 2.7: does an icefin-theme: URL scheme (served from C++) load inside jellyfin-web and under a strict CSP,
// and does Qt WebEngine expose the Gamepad API?
// Usage: spike-scheme-csp URL [--csp-ignored 0|1] [--hide-gamepads 0|1] [--wait-gamepad SECONDS]
// Prints one JSON line with the page's CSP header, which icefin-theme: assets loaded, and Gamepad API results.
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QtWebEngineQuick>
#include <QWebEngineUrlScheme>
#include <QWebEngineUrlSchemeHandler>
#include <QWebEngineUrlRequestJob>
#include <QWebEngineProfile>
#include <QQuickWebEngineProfile>
#include <QBuffer>
#include <QImage>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <cstdio>

class ThemeHandler : public QWebEngineUrlSchemeHandler {
public:
  int served = 0;
  void requestStarted(QWebEngineUrlRequestJob* job) override {
    QString path = job->requestUrl().path();
    auto* buf = new QBuffer(job); QByteArray mime;
    if (path.endsWith(".css")) { buf->setData("body{outline:7px solid rgb(1,2,3)}"); mime = "text/css"; }
    else if (path.endsWith(".js")) { buf->setData("window.__icefinThemeScript=1;"); mime = "text/javascript"; }
    else if (path.endsWith(".png")) { QImage i(4, 4, QImage::Format_RGB32); i.fill(Qt::red); QByteArray b; QBuffer bb(&b); bb.open(QIODevice::WriteOnly); i.save(&bb, "PNG"); buf->setData(b); mime = "image/png"; }
    else { job->fail(QWebEngineUrlRequestJob::UrlNotFound); return; }
    ++served; buf->open(QIODevice::ReadOnly); job->reply(mime, buf);
  }
};

static const char* PROBE = R"JS(
new Promise(async (resolve) => {
  const r = {};
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy" i]');
  r.meta_csp = meta ? meta.content : null;
  const img = new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth === 4); i.onerror = () => ok(false); i.src = 'icefin-theme://pkg/probe.png'; });
  const css = new Promise(ok => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'icefin-theme://pkg/theme.css';
    l.onload = () => ok(getComputedStyle(document.body).outlineColor === 'rgb(1, 2, 3)'); l.onerror = () => ok(false); document.head.appendChild(l); });
  const js = new Promise(ok => { const s = document.createElement('script'); s.src = 'icefin-theme://pkg/theme.js';
    s.onload = () => ok(window.__icefinThemeScript === 1); s.onerror = () => ok(false); document.head.appendChild(s); });
  const fetchOk = fetch('icefin-theme://pkg/theme.css').then(x => x.ok).catch(() => false);
  const blob = new Promise(ok => { const u = URL.createObjectURL(new Blob(['body{outline-offset:3px}'], {type:'text/css'}));
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.onload = () => ok(true); l.onerror = () => ok(false); document.head.appendChild(l); });
  [r.img, r.css, r.script, r.fetch, r.blob_css] = await Promise.all([img, css, js, fetchOk, blob]);
  r.gamepad_api = typeof navigator.getGamepads;
  r.focused = document.hasFocus();
  r.connected_event = await new Promise(ok => { const t = setTimeout(() => ok(false), 6000);
    window.addEventListener('gamepadconnected', ev => { clearTimeout(t); ok(ev.gamepad.id); }); });
  try { r.gamepads = Array.from(navigator.getGamepads() || []).filter(Boolean).map(g => g.id); } catch (e) { r.gamepads = 'error ' + e; }
  resolve(JSON.stringify(r));
}))JS";

int main(int argc, char** argv) {
  QString url = argc > 1 ? argv[1] : "about:blank"; bool cspIgnored = false, hide = false; int waitPad = 0;
  for (int i = 2; i + 1 < argc; ++i) {
    if (!qstrcmp(argv[i], "--csp-ignored")) cspIgnored = atoi(argv[++i]);
    else if (!qstrcmp(argv[i], "--hide-gamepads")) hide = atoi(argv[++i]);
    else if (!qstrcmp(argv[i], "--wait-gamepad")) waitPad = atoi(argv[++i]);
  }
  QWebEngineUrlScheme s("icefin-theme");
  s.setSyntax(QWebEngineUrlScheme::Syntax::Host);
  QWebEngineUrlScheme::Flags f = QWebEngineUrlScheme::SecureScheme | QWebEngineUrlScheme::CorsEnabled;
  if (cspIgnored) f |= QWebEngineUrlScheme::ContentSecurityPolicyIgnored;
  s.setFlags(f);
  QWebEngineUrlScheme::registerScheme(s);
  QtWebEngineQuick::initialize();
  QGuiApplication app(argc, argv);
  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty("spikeUrl", url);
  engine.rootContext()->setContextProperty("hideGamepads", hide);
  // The nativeshell shim (hide navigator.getGamepads) is registered from QML, as upstream registers nativeshell.js.
  engine.loadData("import QtQuick\nimport QtWebEngine\nWindow { width: 1000; height: 600; visible: true\n"
                  "  WebEngineView { objectName: \"web\"; anchors.fill: parent\n"
                  "    Component.onCompleted: { if (hideGamepads) profile.userScripts.collection = [{ name: 'hidepads', injectionPoint: WebEngineScript.DocumentCreation, worldId: WebEngineScript.MainWorld,"
                  " sourceCode: \"Object.defineProperty(Navigator.prototype,'getGamepads',{value:function(){return [];},configurable:true});\" }]; url = spikeUrl } } }", QUrl("qrc:/spike.qml"));
  if (engine.rootObjects().isEmpty()) return 3;
  QObject* web = engine.rootObjects().first()->findChild<QObject*>("web");
  auto* profile = qvariant_cast<QQuickWebEngineProfile*>(web->property("profile"));
  ThemeHandler handler; profile->installUrlSchemeHandler("icefin-theme", &handler);
  if (auto* w = qobject_cast<QQuickWindow*>(engine.rootObjects().first())) { w->requestActivate(); }
  QObject::connect(web, SIGNAL(loadingChanged(QWebEngineLoadingInfo)), web, SLOT(forceActiveFocus()));
  QJsonObject res{{"url", url}, {"csp_ignored_flag", cspIgnored}, {"hide_gamepads", hide}, {"qt", qVersion()}};
  // Run the probe after the page settles; it writes its JSON result into document.title.
  QTimer::singleShot(8000 + waitPad * 1000, &app, [&] {
    QString js = QString("(%1).then(r => { document.title = 'PROBE:' + r; })").arg(QString::fromUtf8(PROBE).trimmed());
    QMetaObject::invokeMethod(web, "runJavaScript", Q_ARG(QString, js));
  });
  QTimer::singleShot(8000 + waitPad * 1000 + 12000, &app, [&] {
    QString t = web->property("title").toString();
    res["scheme_requests_served"] = handler.served;
    if (t.startsWith("PROBE:")) res["page"] = QJsonDocument::fromJson(t.mid(6).toUtf8()).object();
    else res["error"] = "probe did not finish: title=" + t.left(60);
    std::printf("%s\n", QJsonDocument(res).toJson(QJsonDocument::Compact).constData()); std::fflush(stdout);
    app.exit(0);
  });
  return app.exec();
}
