#include "Compositing.h"
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QStandardPaths>
#include <QUrl>
#include <algorithm>
#include <cmath>
#if __has_include(<rhi/qshader.h>) && __has_include(<rhi/qrhi.h>)
#include <rhi/qshader.h>
#define ICEFIN_COMPOSITOR_RHI 1
#endif
#if defined(ICEFIN_SHADERTOOLS) && defined(ICEFIN_COMPOSITOR_RHI)
#include <rhi/qshaderbaker.h>
#define ICEFIN_COMPOSITOR_BAKE 1
#endif

namespace Icefin::Render
{
QString uiBlendName(UiBlend b) { return b == UiBlend::Linear ? "linear" : "srgb"; }

UiBlend uiBlendFromName(const QString& name, UiBlend fallback)
{
  if (name == "linear") return UiBlend::Linear;
  if (name == "srgb") return UiBlend::Srgb;
  return fallback;
}

QString outputEncodingName(OutputEncoding o)
{
  switch (o) {
    case OutputEncoding::Hdr10: return "hdr10";
    case OutputEncoding::ScRgb: return "scrgb";
    default: return "sdr";
  }
}

bool VideoHdrMetadata::operator==(const VideoHdrMetadata& o) const
{
  if (minLuminance != o.minLuminance || maxLuminance != o.maxLuminance || maxCll != o.maxCll || maxFall != o.maxFall
      || hasPrimaries != o.hasPrimaries)
    return false;
  for (int i = 0; i < 8; ++i)
    if (primaries[i] != o.primaries[i]) return false;
  return true;
}

QVariantMap CompositorState::toMap() const
{
  return {{"active", active}, {"reason", reason}, {"blend", uiBlendName(blend)}, {"output", outputEncodingName(output)},
          {"referenceWhite", referenceWhite}, {"peak", peak}, {"gamma22", gamma22}, {"shaderUrl", shaderUrl},
          {"videoLinearWhite", kVideoLinearWhite}, {"hdrRequested", hdrRequested}, {"hdrReason", hdrReason},
          {"tagged", tagged}, {"maxCll", video.maxCll}, {"maxFall", video.maxFall},
          {"masteringMax", video.maxLuminance}, {"masteringMin", video.minLuminance}};
}

CompositorState& compositorState()
{
  static CompositorState s;
  return s;
}

static double sgn(double x) { return x < 0 ? -1.0 : 1.0; }

double decodeSdr(double e, bool gamma22)
{
  const double a = std::fabs(e);
  if (gamma22) return sgn(e) * std::pow(a, 2.2);
  return sgn(e) * (a <= 0.04045 ? a / 12.92 : std::pow((a + 0.055) / 1.055, 2.4));
}

double encodeSdr(double l, bool gamma22)
{
  const double a = std::fabs(l);
  if (gamma22) return sgn(l) * std::pow(a, 1.0 / 2.2);
  return sgn(l) * (a <= 0.0031308 ? a * 12.92 : 1.055 * std::pow(a, 1.0 / 2.4) - 0.055);
}

static constexpr double m1 = 0.1593017578125, m2 = 78.84375, c1 = 0.8359375, c2 = 18.8515625, c3 = 18.6875;

double pqEncode(double nits)
{
  const double y = std::clamp(nits / 10000.0, 0.0, 1.0);
  const double p = std::pow(y, m1);
  return std::pow((c1 + c2 * p) / (1.0 + c3 * p), m2);
}

double pqDecode(double e)
{
  const double p = std::pow(std::clamp(e, 0.0, 1.0), 1.0 / m2);
  return 10000.0 * std::pow(std::max(p - c1, 0.0) / (c2 - c3 * p), 1.0 / m1);
}

// ITU-R BT.2087 / BT.2407.
Rgb bt709To2020(const Rgb& c)
{
  return {0.6274 * c.r + 0.3293 * c.g + 0.0433 * c.b, 0.0691 * c.r + 0.9195 * c.g + 0.0114 * c.b,
          0.0164 * c.r + 0.0880 * c.g + 0.8956 * c.b};
}

Rgb bt2020To709(const Rgb& c)
{
  return {1.6605 * c.r - 0.5876 * c.g - 0.0728 * c.b, -0.1246 * c.r + 1.1329 * c.g - 0.0083 * c.b,
          -0.0182 * c.r - 0.1006 * c.g + 1.1187 * c.b};
}

Rgb composePixel(const CompositorState& s, const Rgb& ui, double a, const Rgb& video, bool hasVideo)
{
  // Video relative to SDR white, in BT.709 (where the UI lives).
  const double k = kVideoLinearWhite / s.referenceWhite;
  Rgb v = hasVideo ? Rgb{video.r * k, video.g * k, video.b * k} : Rgb{};
  if (s.output != OutputEncoding::Sdr) v = bt2020To709(v);
  auto mix = [&](double u, double vv) {
    if (s.blend == UiBlend::Srgb) return decodeSdr(u + (1.0 - a) * encodeSdr(vv, s.gamma22), s.gamma22);
    const double uLin = a > 0 ? decodeSdr(u / a, s.gamma22) * a : 0.0;
    const double aComp = 1.0 - std::pow(1.0 - a, 2.2);
    return uLin + (1.0 - aComp) * vv;
  };
  Rgb rel{mix(ui.r, v.r), mix(ui.g, v.g), mix(ui.b, v.b)};
  switch (s.output) {
    case OutputEncoding::Hdr10: {
      const Rgb n = bt709To2020(rel);
      const double w = s.referenceWhite;
      return {pqEncode(std::max(n.r, 0.0) * w), pqEncode(std::max(n.g, 0.0) * w), pqEncode(std::max(n.b, 0.0) * w)};
    }
    case OutputEncoding::ScRgb: {
      const double w = s.referenceWhite / 80.0;
      return {rel.r * w, rel.g * w, rel.b * w};
    }
    default:
      return {encodeSdr(std::clamp(rel.r, 0.0, 1.0), s.gamma22), encodeSdr(std::clamp(rel.g, 0.0, 1.0), s.gamma22),
              encodeSdr(std::clamp(rel.b, 0.0, 1.0), s.gamma22)};
  }
}

QString compositorShaderSource()
{
  // Mirrors composePixel(). Uniform names are Compositor.qml's ShaderEffect properties.
  return QStringLiteral(R"(#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
  mat4 qt_Matrix;
  float qt_Opacity;
  float blendMode;       // 0: in the UI's encoding (srgb), 1: linear light with alpha compensation
  float outputMode;      // 0: SDR, 1: HDR10 (PQ, BT.2020), 2: scRGB
  float gamma22;         // the compositor's SDR transfer: 1 gamma 2.2, 0 the sRGB curve
  float referenceWhite;  // nits of SDR white
  float videoScale;      // video texture unit -> SDR white (videoLinearWhite / referenceWhite)
  float hasVideo;
};
layout(binding = 1) uniform sampler2D ui;
layout(binding = 2) uniform sampler2D video;

const mat3 BT709_TO_2020 = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0114, 0.8956);
const mat3 BT2020_TO_709 = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187);

vec3 decodeSdr(vec3 e) {
  vec3 a = abs(e);
  vec3 l = gamma22 > 0.5 ? pow(a, vec3(2.2))
                         : mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), a));
  return sign(e) * l;
}
vec3 encodeSdr(vec3 l) {
  vec3 a = abs(l);
  vec3 e = gamma22 > 0.5 ? pow(a, vec3(1.0 / 2.2))
                         : mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), a));
  return sign(l) * e;
}
vec3 pqEncode(vec3 nits) {
  vec3 p = pow(clamp(nits / 10000.0, 0.0, 1.0), vec3(0.1593017578125));
  return pow((0.8359375 + 18.8515625 * p) / (1.0 + 18.6875 * p), vec3(78.84375));
}

void main() {
  vec4 u = texture(ui, qt_TexCoord0);
  vec3 v = hasVideo > 0.5 ? texture(video, qt_TexCoord0).rgb * videoScale : vec3(0.0);
  if (outputMode > 0.5) v = BT2020_TO_709 * v;
  vec3 rel;
  if (blendMode < 0.5) {
    rel = decodeSdr(u.rgb + (1.0 - u.a) * encodeSdr(v));
  } else {
    vec3 uLin = u.a > 0.0 ? decodeSdr(u.rgb / u.a) * u.a : vec3(0.0);
    float aComp = 1.0 - pow(1.0 - u.a, 2.2);
    rel = uLin + (1.0 - aComp) * v;
  }
  if (outputMode > 1.5) fragColor = vec4(rel * (referenceWhite / 80.0), 1.0);
  else if (outputMode > 0.5) fragColor = vec4(pqEncode(max(BT709_TO_2020 * rel, 0.0) * referenceWhite), 1.0);
  else fragColor = vec4(encodeSdr(clamp(rel, 0.0, 1.0)), 1.0);
}
)");
}

bool compositorCompiled()
{
#if defined(ICEFIN_COMPOSITOR_BAKE)
  return true;
#else
  return false;
#endif
}

QString compositorShaderUrl(QString* error)
{
#if defined(ICEFIN_COMPOSITOR_BAKE)
  const QByteArray src = compositorShaderSource().toUtf8();
  const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + "/icefin-shaders";
  const QString path = dir + QString("/compositor-%1.qsb").arg(QString(QCryptographicHash::hash(src, QCryptographicHash::Sha1).toHex().left(16)));
  if (!QFile::exists(path)) {
    QShaderBaker b;
    b.setSourceString(src, QShader::FragmentStage);
    b.setGeneratedShaders({{QShader::SpirvShader, QShaderVersion(100)}});
    b.setGeneratedShaderVariants({QShader::StandardShader});
    const QShader s = b.bake();
    if (!s.isValid()) { *error = "compositor shader: " + b.errorMessage().trimmed(); return {}; }
    QDir().mkpath(dir);
    QFile out(path);
    const QByteArray qsb = s.serialized();
    if (!out.open(QIODevice::WriteOnly) || out.write(qsb) != qsb.size()) { *error = "can't write " + path; return {}; }
  }
  return QUrl::fromLocalFile(path).toString();
#else
  *error = "built without Qt ShaderTools or the RHI headers";
  return {};
#endif
}
}
