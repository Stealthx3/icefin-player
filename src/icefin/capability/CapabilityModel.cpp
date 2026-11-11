#include "CapabilityModel.h"
#include <QCoreApplication>
#include <QDebug>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include "icefin/gpu/HardwareComponent.h"
#include "icefin/render/Compositing.h"
#include "icefin/render/HdrCapabilityProbe.h"
#include "icefin/render/RouterComponent.h"
#include "icefin/render/VulkanDevice.h"
#include <MpvController>
#include "settings/SettingsComponent.h"

namespace Icefin::Capability
{
using namespace Icefin::Render;

static const QList<Range> kRanges{Range::Sdr, Range::Hdr, Range::DolbyVision58, Range::DolbyVision7, Range::DolbyVisionUnknown};

System routerSystem(const Inputs& in)
{
  System s;
  s.renderer = in.vulkanRenderer && in.vulkanVideoPath ? Renderer::Vulkan : Renderer::OpenGlFallback;
  // "Switch to Vulkan" is an option only when this start is on OpenGL by choice, not because Vulkan failed (5.7).
  s.vulkanAvailable = s.renderer == Renderer::OpenGlFallback && in.vulkanVideoPath && in.vulkanUsable && in.vulkanFallback.isEmpty();
  const QString hdr = in.display.value("hdr").toString();
  // On the Vulkan path the display counts as HDR only when that path outputs HDR (5.5/5.6); otherwise libplacebo
  // tone-maps there.
  if (hdr == "yes") s.display = s.renderer != Renderer::Vulkan || in.hdrOutput ? DisplayState::Hdr : DisplayState::Sdr;
  else if (hdr == "no") s.display = DisplayState::Sdr;
  else s.display = DisplayState::Unknown;
  s.hdr = in.hdrSetting == "off" ? HdrPreference::Off : HdrPreference::Auto;
  s.serverTranscode = true;  // the page drops the transcode options when the user's policy forbids them
  return s;
}

QVariantMap snapshot(const Inputs& in)
{
  const System sys = routerSystem(in);
  QVariantMap video;
  for (Range r : kRanges) {
    const Route rt = route(r, sys);
    QStringList opts;
    for (Option o : rt.options) opts << optionId(o);
    video[rangeName(r)] = QVariantMap{{"output", outputName(rt.output)}, {"reason", rt.reason},
                                      {"baseLayerOnly", rt.baseLayerOnly}, {"options", opts}};
  }
  return {
    {"renderer", QVariantMap{{"api", in.vulkanRenderer ? "vulkan" : "opengl"},
                             {"videoPath", sys.renderer == Renderer::Vulkan},
                             {"vulkanAvailable", sys.vulkanAvailable},
                             {"vulkanFallback", in.vulkanFallback},
                             {"compositor", in.compositor},
                             {"hdrOutput", in.hdrOutput}}},
    {"display", in.display},
    {"hdrSetting", in.hdrSetting},
    {"video", video},
    {"decoders", QVariantMap{{"samples", in.selfTest.value("samples")}, {"transcode", in.selfTest.value("transcode")},
                             {"selfTestTime", in.selfTest.value("time")}, {"hwdec", in.hwdecSetting},
                             {"interop", in.hwdecInterop}, {"current", in.hwdecCurrent}}},
    {"audio", in.sink},
    {"versions", in.versions},
  };
}

QVariantMap themeView(const QVariantMap& s)
{
  const QVariantMap renderer = s.value("renderer").toMap();
  const QVariantMap video = s.value("video").toMap();
  const QVariantMap audio = s.value("audio").toMap();
  auto out = [&](Range r) { return video.value(rangeName(r)).toMap().value("output").toString(); };
  return {
    {"renderer", renderer.value("api")},
    {"hdr", QVariantMap{{"display", s.value("display").toMap().value("hdr", "unknown")}, {"output", renderer.value("hdrOutput", false)}}},
    // How each kind of source plays here: "SDR", "tone-mapped SDR", "HDR output" or "capability prompt".
    {"video", QVariantMap{{"sdr", out(Range::Sdr)}, {"hdr10", out(Range::Hdr)}, {"hlg", out(Range::Hdr)},
                          {"dolbyVision58", out(Range::DolbyVision58)}, {"dolbyVision7", out(Range::DolbyVision7)}}},
    {"audio", QVariantMap{{"receiver", audio.value("valid").toBool()}, {"passthrough", audio.value("codecs").toStringList()},
                          {"channels", audio.value("lpcmChannels").toInt()}}},
    {"decoders", QVariantMap{{"serverConverts", s.value("decoders").toMap().value("transcode").toStringList()}}},
  };
}

QString rendererSummary(const QVariantMap& s)
{
  const QVariantMap r = s.value("renderer").toMap();
  if (r.value("api") != "vulkan") {
    const QString why = r.value("vulkanFallback").toString();
    return why.isEmpty() ? QString("OpenGL (fallback)") : "OpenGL (fallback: Vulkan failed: " + why + ")";
  }
  const QVariantMap c = r.value("compositor").toMap();
  QStringList parts;
  if (!r.value("videoPath").toBool()) parts << "no Vulkan video path";
  else if (c.value("active").toBool()) {
    parts << "compositor";
    parts << (r.value("hdrOutput").toBool() ? c.value("output").toString().toUpper() + " output" : QString("SDR output"));
  } else {
    parts << "direct (" + c.value("reason").toString() + ")";
  }
  return "Vulkan (" + parts.join(", ") + ")";
}

CapabilityModel& CapabilityModel::instance()
{
  static CapabilityModel* m = new CapabilityModel;  // lives as long as the app; components refer to it
  return *m;
}

void CapabilityModel::setMpv(MpvController* mpv)
{
  if (!mpv || m_mpv == mpv) return;
  m_mpv = mpv;
  QMetaObject::invokeMethod(this, &CapabilityModel::refresh, Qt::QueuedConnection);
}

void CapabilityModel::setSink(const QVariantMap& sink)
{
  if (sink == m_sink) return;
  m_sink = sink;
  refresh();
}

void CapabilityModel::attach()
{
  connect(&HdrCapabilityProbe::instance(), &HdrCapabilityProbe::changed, this, &CapabilityModel::refresh, Qt::QueuedConnection);
  connect(&RouterComponent::Get(), &RouterComponent::compositorChanged, this, &CapabilityModel::refresh, Qt::QueuedConnection);
  connect(&Gpu::HardwareComponent::Get(), &Gpu::HardwareComponent::finished, this, &CapabilityModel::refresh, Qt::QueuedConnection);
  connect(&SettingsComponent::Get(), &SettingsComponent::sectionValueUpdate, this, &CapabilityModel::refresh, Qt::QueuedConnection);
  QMetaObject::invokeMethod(this, &CapabilityModel::refresh, Qt::QueuedConnection);
}

Inputs CapabilityModel::gather() const
{
  Inputs in;
  in.vulkanRenderer = QQuickWindow::graphicsApi() == QSGRendererInterface::Vulkan;
  in.vulkanVideoPath = vulkanVideoPath();
  in.vulkanFallback = vulkanFallbackReason();
  in.vulkanUsable = in.vulkanRenderer || (in.vulkanVideoPath && vulkanUsable());
  in.compositor = compositorState().toMap();
  in.hdrOutput = vulkanHdrOutput();
  in.display = HdrCapabilityProbe::instance().current().toMap();
  const QString env = qEnvironmentVariable("ICEFIN_HDR_OUTPUT");
  const QVariant hs = SettingsComponent::Get().value(SETTINGS_SECTION_MAIN, "icefin_hdr_output");
  in.hdrSetting = !env.isEmpty() ? env : hs.isValid() && !hs.toString().isEmpty() ? hs.toString() : QString("auto");
  in.selfTest = Gpu::HardwareComponent::Get().results();
  in.hwdecSetting = SettingsComponent::Get().value(SETTINGS_SECTION_VIDEO, "hardwareDecoding").toString();
  in.sink = m_sink;
  in.versions = {{"icefin", QCoreApplication::applicationVersion()}, {"qt", QString::fromLatin1(qVersion())}};
  if (m_mpv) {
    in.hwdecInterop = m_mpv->getProperty("hwdec-interop").toString();
    in.hwdecCurrent = m_mpv->getProperty("hwdec-current").toString();
    for (const char* p : {"mpv-version", "ffmpeg-version", "libplacebo-version", "libass-version"})
      in.versions[QString::fromLatin1(p).remove("-version")] = m_mpv->getProperty(p).toString();
  }
  return in;
}

System CapabilityModel::system() { return routerSystem(gather()); }

QVariantMap CapabilityModel::current()
{
  refresh();
  return m_last;
}

void CapabilityModel::refresh()
{
  QVariantMap s = snapshot(gather());
  s["theme"] = themeView(s);
  if (s == m_last) return;
  const bool first = m_last.isEmpty();
  m_last = s;
  if (first) qInfo().noquote() << "Icefin capabilities:" << rendererSummary(s);
  Q_EMIT changed(s);
}
}
