#include "Report.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QTextStream>
#include "icefin/capability/CapabilityModel.h"
#include "utils/Log.h"

namespace Icefin::Diag
{
QStringList reportSections() { return {"main", "audio", "video", "subtitles", "cec", "system", "other", "theme"}; }

QString sanitize(QString text, const QString& home, const QString& hostName)
{
  // Upstream's fixed-length patterns and Icefin's redact() (11.2), a line at a time as in the log: upstream blanks a
  // fixed 32 characters after api_key=, which would run across a short key's line end into the next line.
  QStringList lines = text.split('\n');
  for (QString& line : lines) ::Log::CensorAuthTokens(line);
  text = lines.join('\n');
  // A URL's host (a server address, a LAN IP) -> [server]; the scheme and path stay for triage. file:/// has no host.
  static const QRegularExpression url(QStringLiteral("\\b([A-Za-z][A-Za-z0-9+.-]*://)([^/\\s\"'<>()\\[\\]]+)"));
  text.replace(url, QStringLiteral("\\1[server]"));
  if (home.size() > 1) {
    QString h = home;
    while (h.endsWith('/') && h.size() > 1) h.chop(1);
    text.replace(h, QStringLiteral("~"));
  }
  if (hostName.size() >= 3 && hostName != QLatin1String("localhost"))
    text.replace(QRegularExpression("\\b" + QRegularExpression::escape(hostName) + "\\b"), QStringLiteral("[host]"));
  return text;
}

static QString json(const QVariant& v)
{
  QJsonDocument d = v.typeId() == QMetaType::QVariantList ? QJsonDocument(QJsonArray::fromVariantList(v.toList()))
                                                          : QJsonDocument(QJsonObject::fromVariantMap(v.toMap()));
  return QString::fromUtf8(d.toJson(QJsonDocument::Indented)).trimmed();
}

static QString orUnknown(const QVariant& v) { const QString s = v.toString(); return s.isEmpty() ? QStringLiteral("?") : s; }

static QString displayLine(const QVariantMap& d)
{
  const QString hdr = d.value("hdr").toString();
  QString lum;
  if (d.value("maxLuminance", -1).toDouble() >= 0)
    lum = QString(", peak %1 nits, reference white %2").arg(d.value("maxLuminance").toString(), d.value("referenceLuminance").toString());
  if (hdr == "yes") return "HDR (" + orUnknown(d.value("transfer")) + ", " + orUnknown(d.value("primaries")) + lum + ")";
  if (hdr == "no") return "SDR (" + orUnknown(d.value("transfer")) + lum + ")";
  return "unknown" + (d.value("error").toString().isEmpty() ? QString() : ": " + d.value("error").toString());
}

static QString decodeLine(const QVariantMap& dec)
{
  QStringList samples;
  for (const QVariant& v : dec.value("samples").toList()) {
    const QVariantMap s = v.toMap();
    const QString how = !s.value("ok").toBool() ? "failed" : s.value("hardware").toBool() ? s.value("hwdec").toString() : QString("software");
    samples << s.value("codec").toString() + " " + how;
  }
  QString line = "setting " + orUnknown(dec.value("hwdec")) + ", interop " + orUnknown(dec.value("interop")) + ", last decoder "
                 + orUnknown(dec.value("current"));
  line += samples.isEmpty() ? QString("; self-test not run") : "; self-test: " + samples.join(", ");
  const QStringList tc = dec.value("transcode").toStringList();
  if (!tc.isEmpty()) line += "; the server converts " + tc.join(", ");
  return line;
}

static QString audioLine(const QVariantMap& audio, const QVariantMap& sink)
{
  QString line = "backend " + orUnknown(audio.value("backend")) + ", device " + orUnknown(audio.value("device")) + " ("
                 + orUnknown(audio.value("deviceType")) + ")";
  const QStringList pt = audio.value("passthrough").toStringList();
  line += pt.isEmpty() ? QString(", passthrough off") : ", passthrough " + pt.join(" ");
  if (sink.value("valid").toBool()) {
    const QStringList codecs = sink.value("codecs").toStringList();
    line += "; receiver " + orUnknown(sink.value("name")) + " (" + (codecs.isEmpty() ? QString("PCM") : codecs.join(", ")) + ", "
            + QString::number(sink.value("lpcmChannels", 2).toInt()) + " ch)";
  } else {
    line += sink.value("hdmi").toBool() ? QString("; HDMI sink without a valid ELD") : QString("; no receiver read yet");
  }
  line += audio.value("bitstream").toBool() ? QString("; bitstreaming now") : QString();
  return line;
}

QString build(const ReportInputs& in)
{
  const QVariantMap& caps = in.capabilities;
  const QVariantMap renderer = caps.value("renderer").toMap();
  const QVariantMap versions = caps.value("versions").toMap();
  const QVariantMap web = in.web;
  const QVariantMap features = web.value("features").toMap();
  QStringList plays;
  const QVariantMap video = caps.value("video").toMap();
  for (auto it = video.cbegin(); it != video.cend(); ++it) plays << it.key() + ": " + it.value().toMap().value("output").toString();

  QString t;
  QTextStream o(&t);
  o << "# Icefin Player diagnostics report\n\n";
  o << "Generated " << in.generated << ". Redacted: tokens, passwords, server addresses, home directory and host name.\n\n";
  o << "## Summary\n\n";
  o << "- **Icefin**: " << orUnknown(in.app.value("version")) << " (jellyfin-desktop " << orUnknown(in.app.value("base")) << " base, jellyfin-web "
    << orUnknown(in.app.value("web")) << ", built " << orUnknown(in.app.value("build")) << ")"
    << (in.app.value("flatpak").toBool() ? ", Flatpak " + orUnknown(in.app.value("runtime")) : QString(", not a Flatpak")) << "\n";
  o << "- **System**: " << orUnknown(in.system.value("os")) << ", kernel " << orUnknown(in.system.value("kernel")) << ", "
    << orUnknown(in.system.value("arch")) << "\n";
  o << "- **Session**: " << orUnknown(in.system.value("session")) << ", desktop " << orUnknown(in.system.value("desktop")) << ", Qt platform "
    << orUnknown(in.system.value("platform")) << (in.system.value("gamescope").toBool() ? ", inside Gamescope" : "") << "\n";
  o << "- **Renderer**: " << (caps.isEmpty() ? QString("?") : Capability::rendererSummary(caps))
    << (renderer.value("vulkanAvailable").toBool() ? ", a Vulkan GPU is available" : "") << "\n";
  o << "- **Decode**: " << decodeLine(caps.value("decoders").toMap()) << "\n";
  o << "- **Web layer**: "
    << (features.isEmpty() ? QString("not checked")
                           : QString(web.value("accelerated").toBool() ? "GPU-accelerated" : "not GPU-accelerated") + " (rasterization "
                                 + orUnknown(features.value("Rasterization")) + ", compositing " + orUnknown(features.value("Compositing")) + ")")
    << (web.value("gbm").isValid() && !web.value("gbm").toBool() ? ", GBM off" : "") << "\n";
  o << "- **Display**: " << displayLine(caps.value("display").toMap()) << "; HDR output setting " << orUnknown(caps.value("hdrSetting"))
    << (renderer.value("hdrOutput").toBool() ? ", HDR output on" : "") << "\n";
  o << "- **Playback here**: " << (plays.isEmpty() ? QString("?") : plays.join(" · ")) << "\n";
  o << "- **Audio**: " << audioLine(in.audio, caps.value("audio").toMap()) << "\n";
  // mpv says "mpv v0.40.0"; libass's version is a number (LIBASS_VERSION, 0x01703000 for 0.17.3), shown in hex.
  QString mpvVersion = orUnknown(versions.value("mpv"));
  if (mpvVersion.startsWith("mpv ")) mpvVersion = mpvVersion.mid(4);
  QString libass = orUnknown(versions.value("libass"));
  bool numeric = false;
  const qulonglong assNum = libass.toULongLong(&numeric);
  if (numeric) libass = QString("0x%1").arg(assNum, 8, 16, QChar('0'));
  o << "- **Versions**: mpv " << mpvVersion << ", FFmpeg " << orUnknown(versions.value("ffmpeg")) << ", libplacebo "
    << orUnknown(versions.value("libplacebo")) << ", libass " << libass << ", Qt " << orUnknown(versions.value("qt")) << "\n\n";

  o << "## Screens\n\n";
  if (in.screens.isEmpty()) o << "None reported.\n";
  for (const QVariant& v : in.screens) {
    const QVariantMap s = v.toMap();
    o << "- " << orUnknown(s.value("name")) << ": " << orUnknown(s.value("size")) << " @ " << orUnknown(s.value("refresh")) << " Hz, scale "
      << orUnknown(s.value("dpr")) << (s.value("primary").toBool() ? " (primary)" : "") << (s.value("window").toBool() ? " (Icefin's window)" : "")
      << "\n";
  }
  o << "\n## Now playing\n\n";
  if (in.nowPlaying.trimmed().isEmpty()) o << "Nothing.\n";
  else o << "```\n" << in.nowPlaying.trimmed() << "\n```\n";
  o << "\n## Recent log\n\nIcefin's lines, the player's state changes and every warning (newest last, up to " << in.recentLog.size() << " lines).\n\n";
  o << "```\n" << (in.recentLog.isEmpty() ? QString("(none)") : in.recentLog.join('\n')) << "\n```\n";
  o << "\n## Capability model\n\n```json\n" << json(caps) << "\n```\n";
  o << "\n## Audio\n\n```json\n" << json(in.audio) << "\n```\n";
  o << "\n## Web layer\n\n```json\n" << json(in.web) << "\n```\n";
  o << "\n## Settings\n\n```json\n" << json(in.settings) << "\n```\n";
  o.flush();
  return sanitize(t, in.home, in.hostName);
}
}
