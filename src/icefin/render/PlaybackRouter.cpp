#include "PlaybackRouter.h"
#include <QDebug>
#include <QQuickWindow>
#include <QSGRendererInterface>

namespace Icefin::Render
{
Range rangeFromJellyfin(const QString& t)
{
  if (t == "HDR10" || t == "HDR10Plus" || t == "HLG") return Range::Hdr;
  // Profile 5 ("DOVI") and profile 8.x (an HDR10, HLG or SDR base layer) need Dolby Vision processing for the
  // intended grade; profile 7 has an enhancement layer ("WithEL").
  if (t == "DOVI" || t == "DOVIWithHDR10" || t == "DOVIWithHDR10Plus" || t == "DOVIWithHLG" || t == "DOVIWithSDR")
    return Range::DolbyVision58;
  if (t == "DOVIWithEL" || t == "DOVIWithELHDR10Plus") return Range::DolbyVision7;
  if (t.startsWith("DOVI")) return Range::DolbyVisionUnknown;  // DOVIInvalid and anything newer
  return Range::Sdr;                                           // SDR, Unknown, empty
}

QString rangeName(Range r)
{
  switch (r) {
    case Range::Sdr: return "SDR";
    case Range::Hdr: return "HDR10/HLG";
    case Range::DolbyVision58: return "Dolby Vision 5/8";
    case Range::DolbyVision7: return "Dolby Vision 7";
    case Range::DolbyVisionUnknown: return "Dolby Vision (unknown profile)";
  }
  return "?";
}

QString outputName(Output o)
{
  switch (o) {
    case Output::Sdr: return "SDR";
    case Output::ToneMappedSdr: return "tone-mapped SDR";
    case Output::Hdr: return "HDR output";
    case Output::Prompt: return "capability prompt";
  }
  return "?";
}

QString optionName(Option o)
{
  switch (o) {
    case Option::PlayAnyway: return "play anyway (colors will be wrong)";
    case Option::PlayBaseLayer: return "play the HDR10 base layer";
    case Option::TranscodeHdr10: return "ask the server for an HDR10 version";
    case Option::TranscodeSdr: return "ask the server for an SDR version";
    case Option::SwitchToVulkan: return "switch to the Vulkan renderer and retry";
    case Option::Cancel: return "cancel";
  }
  return "?";
}

static QList<Option> promptOptions(const System& sys, bool baseLayer)
{
  QList<Option> o;
  o << (baseLayer ? Option::PlayBaseLayer : Option::PlayAnyway);
  if (sys.serverTranscode) o << Option::TranscodeHdr10 << Option::TranscodeSdr;
  if (sys.renderer == Renderer::OpenGlFallback && sys.vulkanAvailable) o << Option::SwitchToVulkan;
  o << Option::Cancel;
  return o;
}

Route route(Range source, const System& sys)
{
  Route r;
  const bool hdrShown = sys.display == DisplayState::Hdr && sys.hdr == HdrPreference::Auto;
  if (sys.renderer == Renderer::OpenGlFallback) {
    if (source == Range::Sdr) { r.output = Output::Sdr; r.reason = "SDR source"; return r; }
    if (source == Range::Hdr) { r.output = Output::ToneMappedSdr; r.reason = "OpenGL fallback tone-maps HDR10/HLG"; return r; }
    r.output = Output::Prompt;
    r.reason = rangeName(source) + " can't be shown correctly by the OpenGL fallback";
    r.options = promptOptions(sys, false);
    return r;
  }
  switch (source) {
    case Range::Sdr:
      r.output = Output::Sdr;
      r.reason = sys.display == DisplayState::Hdr ? "SDR source at reference white" : "SDR source";
      return r;
    case Range::Hdr:
    case Range::DolbyVision58:
    case Range::DolbyVisionUnknown:
      r.output = hdrShown ? Output::Hdr : Output::ToneMappedSdr;
      r.reason = rangeName(source) + (hdrShown ? " on an HDR display"
                                              : sys.hdr == HdrPreference::Off ? ", HDR output turned off: tone-mapped"
                                              : ", display not in HDR: tone-mapped");
      return r;
    case Range::DolbyVision7:
      // Base layer as HDR10 by default; the prompt offers the full grade by server transcode when there is one.
      r.baseLayerOnly = true;
      if (sys.serverTranscode) {
        r.output = Output::Prompt;
        r.reason = "Dolby Vision 7: only the HDR10 base layer plays locally";
        r.options = promptOptions(sys, true);
      } else {
        r.output = hdrShown ? Output::Hdr : Output::ToneMappedSdr;
        r.reason = "Dolby Vision 7 from its HDR10 base layer" + QString(hdrShown ? "" : ", tone-mapped");
      }
      return r;
  }
  return r;
}

QString videoRangeType(const QVariantMap& item)
{
  auto fromStreams = [](const QVariantList& streams) -> QString {
    for (const QVariant& s : streams) {
      const QVariantMap m = s.toMap();
      if (m.value("Type").toString() == "Video") return m.value("VideoRangeType").toString();
    }
    return QString();
  };
  if (item.contains("icefinMediaSource") || item.contains("metadata")) {
    QString t = videoRangeType(item.value("icefinMediaSource").toMap());
    return t.isEmpty() ? videoRangeType(item.value("metadata").toMap()) : t;
  }
  QString t = fromStreams(item.value("MediaStreams").toList());
  if (t.isEmpty()) {
    const QVariantList sources = item.value("MediaSources").toList();
    if (!sources.isEmpty()) t = fromStreams(sources.first().toMap().value("MediaStreams").toList());
  }
  return t;
}

void logRoute(const QVariantMap& item)
{
  const QString vrt = videoRangeType(item);
  System sys;
  sys.renderer = QQuickWindow::graphicsApi() == QSGRendererInterface::Vulkan ? Renderer::Vulkan : Renderer::OpenGlFallback;
  sys.display = DisplayState::Unknown;  // HdrCapabilityProbe: 6.1
  const Route r = route(rangeFromJellyfin(vrt), sys);
  QStringList opts;
  for (Option o : r.options) opts << optionName(o);
  qInfo().noquote() << "Icefin router:" << (vrt.isEmpty() ? QString("(no VideoRangeType)") : vrt) << "->" << outputName(r.output)
                    << "(" + r.reason + ")" << (opts.isEmpty() ? QString() : "options: " + opts.join(" | "))
                    << "[log only until 6.3]";
}
}
