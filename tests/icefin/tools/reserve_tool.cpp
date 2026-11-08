// Lab tool for task 3.5: hold org.freedesktop.ReserveDevice1.Audio<card> for N seconds, then release.
// Usage: icefin-reserve-tool CARD SECONDS   (prints "acquired" / "failed: ..." and "released")
#include <QCoreApplication>
#include <QTimer>
#include <cstdio>
#include "icefin/audio/DeviceReservation.h"

int main(int argc, char** argv)
{
  QCoreApplication app(argc, argv);
  if (argc < 3) { std::fprintf(stderr, "usage: %s CARD SECONDS\n", argv[0]); return 2; }
  Icefin::Audio::DeviceReservation r(atoi(argv[1]));
  if (!r.acquire()) { std::printf("failed: %s\n", qPrintable(r.lastError())); return 1; }
  std::printf("acquired %s\n", qPrintable(r.serviceName())); std::fflush(stdout);
  QTimer::singleShot(atoi(argv[2]) * 1000, &app, [&] { r.release(); std::printf("released\n"); app.quit(); });
  return app.exec();
}
