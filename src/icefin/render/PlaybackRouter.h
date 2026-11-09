// Icefin: PlaybackRouter, the routing table of SPEC "Rendering, playback routing and HDR" (PLAN 6.2).
//
// Pure decision logic: given the source's dynamic range, the active renderer, the display state and the user's HDR
// preference, it says how the file will be shown, or that the capability prompt (6.3) must ask first, and which
// prompt options this system really has. PlayerComponent logs the decision (logRoute) and RouterComponent (6.3) acts
// on a prompt.
#pragma once
#include <QString>
#include <QStringList>
#include <QVariantMap>

namespace Icefin::Render
{
// What kind of source this is, from Jellyfin's VideoRangeType.
enum class Range { Sdr, Hdr, DolbyVision58, DolbyVision7, DolbyVisionUnknown };
Range rangeFromJellyfin(const QString& videoRangeType);
QString rangeName(Range r);

enum class Renderer { Vulkan, OpenGlFallback };
enum class DisplayState { Hdr, Sdr, Unknown };  // Unknown: the probe (6.1) hasn't answered; treated as SDR
enum class HdrPreference { Auto, Off };

struct System
{
  Renderer renderer = Renderer::OpenGlFallback;
  bool vulkanAvailable = false;   // a usable Vulkan device exists (the fallback was chosen by a setting, not forced)
  DisplayState display = DisplayState::Unknown;
  HdrPreference hdr = HdrPreference::Auto;
  bool serverTranscode = false;   // the server lets this user transcode
};

enum class Output { Sdr, ToneMappedSdr, Hdr, Prompt };
enum class Option { PlayAnyway, PlayBaseLayer, TranscodeHdr10, TranscodeSdr, SwitchToVulkan, Cancel };

struct Route
{
  Output output = Output::Sdr;
  QString reason;              // for logs, the debug overlay and the prompt's text
  QList<Option> options;       // only for Output::Prompt, in the order the prompt shows them
  bool baseLayerOnly = false;  // Dolby Vision 7 shown from its HDR10 base layer
};

Route route(Range source, const System& sys);
QString outputName(Output o);
QString optionName(Option o);

// The VideoRangeType of the first video stream. Takes PlayerComponent's load metadata (mpvVideoPlayer.js streamdata:
// icefinMediaSource, then the item under "metadata"), or a BaseItemDto / MediaSourceInfo directly; empty if absent.
QString videoRangeType(const QVariantMap& item);
// Called from PlayerComponent::queueMedia (ICEFIN-HOOK): logs what the router would do for this item.
void logRoute(const QVariantMap& item);
}
