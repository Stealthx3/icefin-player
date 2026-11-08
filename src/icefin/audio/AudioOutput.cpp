#include "AudioOutput.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>

namespace Icefin::Audio
{
int cardIndexFromId(const QString& id, const QString& procRoot)
{
  QFile f(procRoot + "/cards");
  if (!f.open(QIODevice::ReadOnly)) return -1;
  static const QRegularExpression re(R"(^\s*(\d+)\s+\[(\S+)\s*\])");
  for (const QString& l : QString::fromUtf8(f.readAll()).split('\n')) {
    auto m = re.match(l);
    if (m.hasMatch() && m.captured(2) == id) return m.captured(1).toInt();
  }
  return -1;
}

// "pci-0000_00_1f.3" -> card whose /sys/class/sound/cardN/device resolves to .../0000:00:1f.3
static int cardIndexFromBusPath(const QString& busPath, const QString& sysRoot)
{
  QString want = busPath;
  if (want.startsWith("pci-")) want = want.mid(4).replace('_', ':');
  else if (want.startsWith("usb-")) return -1;  // USB audio has no ELD
  QDir d(sysRoot + "/class/sound");
  for (const QString& c : d.entryList({"card*"}, QDir::Dirs | QDir::NoDotAndDotDot | QDir::System)) {
    const QString target = QFileInfo(d.filePath(c) + "/device").canonicalFilePath();
    if (QFileInfo(target).fileName() == want) return c.mid(4).toInt();
  }
  return -1;
}

Output parseDevice(const QString& dev, const QString& sysRoot, const QString& procRoot)
{
  Output o;
  const QString prefix = dev.section('/', 0, 0), rest = dev.section('/', 1);
  if (prefix == "pipewire") o.backend = Backend::PipeWire;
  else if (prefix == "pulse") o.backend = Backend::PulseAudio;
  else if (prefix == "alsa") o.backend = Backend::Alsa;
  else if (prefix == "jack") { o.backend = Backend::Jack; return o; }
  else return o;  // "auto" and anything unknown

  if (o.backend == Backend::Alsa) {
    static const QRegularExpression hdmi(R"(^hdmi:CARD=([^,]+)(?:,DEV=(\d+))?)");
    auto m = hdmi.match(rest);
    if (m.hasMatch()) { o.card = cardIndexFromId(m.captured(1), procRoot); o.hdmiIndex = m.captured(2).isEmpty() ? 0 : m.captured(2).toInt(); }
    return o;
  }
  // PipeWire / PulseAudio ALSA sinks: alsa_output.<bus-path>.<profile>[-extraN]
  static const QRegularExpression sink(R"(^alsa_output\.([^.]+(?:\.\d+)?)\.(hdmi-[a-z0-9-]*?)(?:-extra(\d+))?$)");
  auto m = sink.match(rest);
  if (m.hasMatch()) {
    o.card = cardIndexFromBusPath(m.captured(1), sysRoot);
    o.hdmiIndex = m.captured(3).isEmpty() ? 0 : m.captured(3).toInt();
  }
  return o;
}

Backend autoBackend(const QString& runtimeDir)
{
  if (QFileInfo::exists(runtimeDir + "/pipewire-0")) return Backend::PipeWire;
  if (QFileInfo::exists(runtimeDir + "/pulse/native")) return Backend::PulseAudio;
  return Backend::Alsa;
}
}
