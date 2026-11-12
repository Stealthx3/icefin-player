#include "Eld.h"
#include <QDir>
#include <QFile>
#include <QRegularExpression>

namespace Icefin::Audio
{
QString codecName(Codec c)
{
  switch (c) {
    case Codec::AC3: return "AC-3";
    case Codec::DTS: return "DTS";
    case Codec::EAC3: return "E-AC-3";
    case Codec::DTSHD: return "DTS-HD";
    case Codec::TrueHD: return "TrueHD";
  }
  return "?";
}

QString Eld::summary() const
{
  QStringList parts;
  if (!monitorName.isEmpty()) parts << monitorName;
  parts << QString("LPCM %1ch").arg(lpcmChannels);
  for (auto it = codecs.cbegin(); it != codecs.cend(); ++it) parts << QString("%1 %2ch").arg(codecName(it.key())).arg(it.value());
  if (maxRate > 0) parts << QString("up to %1 kHz %2ch").arg(maxRate / 1000.0).arg(maxChannels);
  if (!valid) parts << "invalid";
  if (stale) parts << "stale";
  return parts.join(", ");
}

std::optional<Eld> parseEld(const QString& text)
{
  static const QRegularExpression line(R"(^\s*(\S+)\s+(.*?)\s*$)");
  static const QRegularExpression coding(R"(^\[0x([0-9a-fA-F]+)\])");
  QMap<QString, QString> kv;
  for (const QString& l : text.split('\n')) {
    auto m = line.match(l);
    if (m.hasMatch()) kv.insert(m.captured(1), m.captured(2));
  }
  if (!kv.contains("monitor_present") && !kv.contains("eld_valid")) return std::nullopt;

  Eld e;
  e.present = kv.value("monitor_present").toInt() == 1;
  e.valid = kv.value("eld_valid").toInt() == 1;
  e.monitorName = kv.value("monitor_name");
  const int sads = kv.value("sad_count").toInt();
  for (int i = 0; i < sads; ++i) {
    auto cm = coding.match(kv.value(QString("sad%1_coding_type").arg(i)));
    if (!cm.hasMatch()) continue;
    const int type = cm.captured(1).toInt(nullptr, 16);
    const int ch = kv.value(QString("sad%1_channels").arg(i)).toInt();
    // "[0xe0] 32000 44100 48000": the kernel's PCM takes every rate any SAD lists, and the basic three.
    const QString rates = kv.value(QString("sad%1_rates").arg(i));
    for (const QString& r : rates.mid(rates.indexOf(']') + 1).split(' ', Qt::SkipEmptyParts))
      e.maxRate = qMax(e.maxRate, qMax(48000, r.toInt()));
    e.maxChannels = qMax(e.maxChannels, qMax(2, ch));
    if (type == 1) { e.lpcmChannels = qMax(e.lpcmChannels, ch); continue; }
    switch (type) {
      case int(Codec::AC3): case int(Codec::DTS): case int(Codec::EAC3): case int(Codec::DTSHD): case int(Codec::TrueHD):
        e.codecs[Codec(type)] = qMax(e.codecs.value(Codec(type)), ch);
        break;
      default: break;  // MPEG, AAC, DSD, ... not passed through
    }
  }
  return e;
}

QStringList eldFiles(int card, const QString& procRoot)
{
  QDir d(QString("%1/card%2").arg(procRoot).arg(card));
  QStringList files = d.entryList({"eld#*"}, QDir::Files, QDir::Name);
  for (QString& f : files) f = d.filePath(f);
  return files;
}

std::optional<Eld> readEld(int card, int hdmiIndex, const QString& procRoot)
{
  const QStringList files = eldFiles(card, procRoot);
  auto parseFile = [](const QString& path) -> std::optional<Eld> {
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) return std::nullopt;
    return parseEld(QString::fromUtf8(f.readAll()));
  };
  if (hdmiIndex >= 0) return hdmiIndex < files.size() ? parseFile(files[hdmiIndex]) : std::nullopt;
  std::optional<Eld> first;
  for (const QString& p : files) {
    auto e = parseFile(p);
    if (e && e->valid) return e;
    if (!first) first = e;
  }
  return first;
}

std::optional<Eld> EldMonitor::update(const QString& key, const std::optional<Eld>& current)
{
  if (current && current->valid) { m_lastValid[key] = *current; return current; }
  if (m_lastValid.contains(key)) { Eld e = m_lastValid[key]; e.stale = true; return e; }
  return current;
}
}
