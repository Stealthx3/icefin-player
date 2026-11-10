// Icefin: the single-surface compositor (PLAN 5.4, SPEC "Single-surface renderer" 3-4, D23/D24).
//
// On the Vulkan path with the compositor on, mpv renders video in linear light into an RGBA16F image (1.0 = libplacebo's
// reference white, 203 nits), in the output's working primaries (BT.709 for SDR, BT.2020 for HDR10 and scRGB). The UI
// (backdrop, web view, overlays) is flattened by Qt Quick into one RGBA8 layer in its own sRGB encoding, so UI elements
// blend among themselves as a browser blends them. One fragment pass (Compositor.qml, compositorShaderSource()) then
// puts the UI over the video and encodes the window:
//  - UiBlend::Srgb: the UI is blended over the video in the UI's encoding (video encoded relative to SDR white with
//    the compositor's SDR transfer, extended above 1.0), as the same page over a <video> looks in a browser;
//  - UiBlend::Linear: the UI is blended in linear light, with alpha compensated so that a black scrim darkens the
//    video as much as it would in a browser (a' = 1 - (1 - a)^gamma); translucent colours read lighter.
// D24 (the user, 2026-11-10): Srgb, like a browser; Linear stays as a diagnostic (ICEFIN_UI_BLEND). Output: SDR (the compositor's SDR transfer, peak = reference white), HDR10 (PQ, BT.2020,
// SDR white at the compositor's reference white) or scRGB (linear BT.709, 1.0 = 80 nits), from the swapchain format.
// The C++ functions below mirror the shader for unit tests and the D24 comparison.
#pragma once
#include <QString>
#include <QVariantMap>

namespace Icefin::Render
{
enum class UiBlend { Srgb, Linear };
enum class OutputEncoding { Sdr, Hdr10, ScRgb };

QString uiBlendName(UiBlend b);
UiBlend uiBlendFromName(const QString& name, UiBlend fallback = UiBlend::Srgb);
QString outputEncodingName(OutputEncoding o);

// The playing video's HDR10 static metadata from mpv (video-params); zero / false where unknown.
struct VideoHdrMetadata
{
  double minLuminance = 0;
  int maxLuminance = 0, maxCll = 0, maxFall = 0;
  bool hasPrimaries = false;
  double primaries[8] = {};  // mastering display red, green, blue, white (CIE 1931 x, y)
  bool operator==(const VideoHdrMetadata& o) const;
  bool operator!=(const VideoHdrMetadata& o) const { return !(*this == o); }
};

struct CompositorState
{
  bool active = false;
  QString reason;                 // why it is on or off
  UiBlend blend = UiBlend::Srgb;
  OutputEncoding output = OutputEncoding::Sdr;
  double referenceWhite = 203;    // nits of SDR white (the compositor's reference white)
  double peak = 203;              // the output's peak in nits (SDR: reference white)
  bool gamma22 = true;            // the compositor's SDR transfer: gamma 2.2 (KWin) or the sRGB curve
  QString shaderUrl;
  // HDR output (5.5): an HDR10 swapchain was asked for, and the surface carries the matching description.
  bool hdrRequested = false;
  QString hdrReason;
  bool tagged = false;
  VideoHdrMetadata video;
  QVariantMap toMap() const;
};

// The process-wide state (GUI thread), set by VulkanDevice and RouterComponent.
CompositorState& compositorState();

// libplacebo's linear light: 1.0 is PL_COLOR_SDR_WHITE.
constexpr double kVideoLinearWhite = 203.0;

struct Rgb { double r = 0, g = 0, b = 0; };

double decodeSdr(double encoded, bool gamma22);  // sign-extended, so values above 1.0 and below 0 survive
double encodeSdr(double linear, bool gamma22);
double pqEncode(double nits);                    // ST 2084
double pqDecode(double encoded);
Rgb bt709To2020(const Rgb& c);
Rgb bt2020To709(const Rgb& c);

// One output pixel: ui is premultiplied in the UI's encoding (as Qt Quick's layer holds it), video is linear in the
// output's working primaries with 1.0 = kVideoLinearWhite nits. Returns the swapchain value for state.output.
Rgb composePixel(const CompositorState& state, const Rgb& uiPremultiplied, double uiAlpha, const Rgb& video, bool hasVideo = true);

// The fragment shader (GLSL 440 for Qt Quick's ShaderEffect) and its baked .qsb, cached on disk. Baking needs Qt
// ShaderTools; without it the compositor stays off and video takes the direct path.
QString compositorShaderSource();
QString compositorShaderUrl(QString* error);
// Built with everything the compositor needs (Qt ShaderTools, the RHI headers and the Vulkan render API).
bool compositorCompiled();
}
