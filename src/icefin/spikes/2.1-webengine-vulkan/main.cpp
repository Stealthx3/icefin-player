// Spike 2.1: does Qt WebEngine render, transparently, inside a Qt Quick scene on the Vulkan RHI backend?
// Usage: spike-webengine-vulkan [--api vulkan|opengl] [--url URL] [--out result.json]
// Prints one JSON line: graphics API in use, whether the page rendered (green left half) and whether the
// QML layer below shows through the transparent right half (blue). Exit 0 when all three hold.
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QtWebEngineQuick>
#include <QTimer>
#include <QJsonObject>
#include <QJsonDocument>
#include <QFile>
#include <QImage>
#include <cstdio>

class Spike : public QObject {
  Q_OBJECT
public:
  QQuickWindow* win = nullptr;
  QJsonObject res;
  QString out;
  Q_INVOKABLE void pageLoaded() { QTimer::singleShot(2500, this, &Spike::check); }  // let the compositor settle
  void check() {
    QImage img = win->grabWindow();
    auto px = [&](double fx, double fy) { return img.pixelColor(int(img.width() * fx), int(img.height() * fy)); };
    QColor l = px(0.25, 0.5), r = px(0.75, 0.5);
    auto api = win->rendererInterface()->graphicsApi();
    res["graphicsApi"] = api == QSGRendererInterface::Vulkan ? "vulkan" : api == QSGRendererInterface::OpenGL ? "opengl" : QString::number(int(api));
    res["grab"] = QString("%1x%2").arg(img.width()).arg(img.height());
    res["left_rgb"] = l.name(); res["right_rgb"] = r.name();
    res["page_rendered"] = l.green() > 200 && l.red() < 60 && l.blue() < 60;
    res["transparent_over_qml"] = r.blue() > 200 && r.red() < 60 && r.green() < 60;
    res["ok"] = res["page_rendered"].toBool() && res["transparent_over_qml"].toBool() && res["graphicsApi"] == res["requested"];
    QByteArray j = QJsonDocument(res).toJson(QJsonDocument::Compact);
    std::printf("%s\n", j.constData()); std::fflush(stdout);
    if (!out.isEmpty()) { QFile f(out); if (f.open(QIODevice::WriteOnly)) f.write(j); }
    img.save(out.isEmpty() ? "spike-2.1.png" : out + ".png");
    qApp->exit(res["ok"].toBool() ? 0 : 1);
  }
};

int main(int argc, char** argv) {
  QString api = "vulkan", url = "qrc:/page.html", out;
  for (int i = 1; i + 1 < argc; ++i) {
    if (!qstrcmp(argv[i], "--api")) api = argv[++i];
    else if (!qstrcmp(argv[i], "--url")) url = argv[++i];
    else if (!qstrcmp(argv[i], "--out")) out = argv[++i];
  }
  QQuickWindow::setGraphicsApi(api == "opengl" ? QSGRendererInterface::OpenGL : QSGRendererInterface::Vulkan);
  QtWebEngineQuick::initialize();
  QGuiApplication app(argc, argv);
  Spike spike; spike.out = out;
  spike.res["requested"] = api; spike.res["qt"] = qVersion(); spike.res["qpa"] = QGuiApplication::platformName();
  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty("spike", &spike);
  engine.rootContext()->setContextProperty("spikeUrl", url);
  engine.load(QUrl("qrc:/main.qml"));
  if (engine.rootObjects().isEmpty()) return 3;
  spike.win = qobject_cast<QQuickWindow*>(engine.rootObjects().first());
  QTimer::singleShot(45000, &app, [&] { spike.res["error"] = "timeout: page never loaded"; std::printf("%s\n", QJsonDocument(spike.res).toJson(QJsonDocument::Compact).constData()); app.exit(2); });
  return app.exec();
}
#include "main.moc"
