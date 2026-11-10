// Spike 2.8: does Qt Quick get an HDR10 Vulkan swapchain on this GPU and compositor? Opens a small window on Qt's
// Vulkan backend with QSG_RHI_HDR=hdr10 (unless set), waits for the first frame, prints one JSON line and quits.
// Built against the Flatpak SDK (build.sh) and run inside the app's sandbox, so it uses the app's own Qt and driver.
#include <QGuiApplication>
#include <QQuickWindow>
#include <QTimer>
#include <rhi/qrhi.h>
#include <cstdio>

static const char* formatName(QRhiSwapChain::Format f)
{
  switch (f) {
    case QRhiSwapChain::SDR: return "SDR";
    case QRhiSwapChain::HDRExtendedSrgbLinear: return "HDRExtendedSrgbLinear";
    case QRhiSwapChain::HDR10: return "HDR10";
    case QRhiSwapChain::HDRExtendedDisplayP3Linear: return "HDRExtendedDisplayP3Linear";
  }
  return "other";
}

int main(int argc, char** argv)
{
  if (qEnvironmentVariableIsEmpty("QSG_RHI_HDR")) qputenv("QSG_RHI_HDR", "hdr10");
  QGuiApplication app(argc, argv);
  QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
  QQuickWindow w;
  w.setColor(QColor(128, 128, 128));
  w.resize(640, 360);
  w.setTitle("Icefin spike 2.8");
  bool done = false;
  QObject::connect(&w, &QQuickWindow::frameSwapped, &app, [&] {
    if (done) return;
    done = true;
    QRhi* rhi = w.rhi();
    QRhiSwapChain* sc = w.swapChain();
    const QRhiDriverInfo d = rhi ? rhi->driverInfo() : QRhiDriverInfo();
    QString hdr = "null";
    if (sc) {
      const QRhiSwapChainHdrInfo h = sc->hdrInfo();
      hdr = QString("{\"limitsType\":%1,\"maxLuminance\":%2,\"sdrWhiteLevel\":%3}")
                .arg(int(h.limitsType))
                .arg(h.limitsType == QRhiSwapChainHdrInfo::LuminanceInNits ? h.limits.luminanceInNits.maxLuminance : h.limits.colorComponentValue.maxColorComponentValue)
                .arg(h.sdrWhiteLevel);
    }
    std::printf("{\"backend\":\"%s\",\"device\":\"%s\",\"requested\":\"%s\",\"format\":\"%s\",\"hdr10Supported\":%s,\"hdrInfo\":%s,\"platform\":\"%s\"}\n",
                rhi ? rhi->backendName() : "none", d.deviceName.constData(), qgetenv("QSG_RHI_HDR").constData(),
                sc ? formatName(sc->format()) : "none",
                sc && sc->isFormatSupported(QRhiSwapChain::HDR10) ? "true" : "false", hdr.toUtf8().constData(),
                QGuiApplication::platformName().toUtf8().constData());
    std::fflush(stdout);
    QTimer::singleShot(500, &app, &QCoreApplication::quit);
  });
  QTimer::singleShot(15000, &app, [&] { if (!done) { std::puts("{\"error\":\"no frame in 15 s\"}"); app.exit(2); } });
  w.show();
  return app.exec();
}
