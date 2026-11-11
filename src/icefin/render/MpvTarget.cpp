#include "MpvTarget.h"
#include <QMap>
#include <cmath>

namespace Icefin::Render
{
QByteArray mpvPrimaries(const QString& probe)
{
  static const QMap<QString, QByteArray> m{{"srgb", "bt.709"}, {"bt2020", "bt.2020"}, {"display_p3", "display-p3"},
                                           {"dci_p3", "dci-p3"}, {"adobe_rgb", "adobe"}, {"pal", "bt.601-625"},
                                           {"ntsc", "bt.601-525"}, {"pal_m", "bt.470m"}, {"generic_film", "film-c"},
                                           {"cie1931_xyz", "cie1931"}};
  return m.value(probe);
}

QByteArray mpvTransfer(const QString& probe)
{
  static const QMap<QString, QByteArray> m{{"srgb", "srgb"}, {"gamma22", "gamma2.2"}, {"gamma28", "gamma2.8"},
                                           {"bt1886", "bt.1886"}, {"st2084_pq", "pq"}, {"hlg", "hlg"},
                                           {"ext_linear", "linear"}, {"st428", "st428"}};
  return m.value(probe);
}

MpvOptions mpvTargetOptions(const DisplayInfo& d, bool hdrOutput)
{
  const QByteArray autoValue("auto");
  if (!hdrOutput) {
    // An untagged SDR surface: sRGB primaries, the compositor's SDR transfer (gamma 2.2 or sRGB), its own peak.
    const QByteArray trc = (d.transfer == "gamma22" || d.transfer == "srgb") ? mpvTransfer(d.transfer) : QByteArray("srgb");
    return {{"target-prim", "bt.709"}, {"target-trc", trc}, {"target-peak", autoValue},
            {"hdr-reference-white", autoValue}, {"target-contrast", autoValue}};
  }
  const QByteArray prim = mpvPrimaries(d.primaries), trc = mpvTransfer(d.transfer);
  QByteArray contrast = autoValue;
  if (d.minLuminance > 0 && d.maxLuminance > 0) contrast = QByteArray::number(qRound(d.maxLuminance / d.minLuminance));
  return {{"target-prim", prim.isEmpty() ? autoValue : prim},
          {"target-trc", trc.isEmpty() ? autoValue : trc},
          {"target-peak", d.maxLuminance > 0 ? QByteArray::number(d.maxLuminance) : autoValue},
          {"hdr-reference-white", d.referenceLuminance > 0 ? QByteArray::number(d.referenceLuminance) : autoValue},
          {"target-contrast", contrast}};
}

MpvOptions mpvLinearTargetOptions(const CompositorState& s, const DisplayInfo& d)
{
  const bool sdr = s.output == OutputEncoding::Sdr;
  // SDR output: the same target stock gpu-next renders to for this display (BT.709, the compositor's SDR transfer,
  // the SDR display's black), so libplacebo treats it as SDR exactly as stock does (black level, HLG's reference white);
  // the compositor decodes it with that transfer (5.8 parity). A linear target would count as an HDR display.
  if (sdr)
    return {{"target-prim", "bt.709"}, {"target-trc", s.gamma22 ? "gamma2.2" : "srgb"},
            {"target-peak", QByteArray::number(qRound(s.referenceWhite))},
            {"hdr-reference-white", QByteArray::number(qRound(s.referenceWhite))}, {"target-contrast", "auto"}};
  QByteArray contrast("auto");
  if (d.minLuminance > 0 && d.maxLuminance > 0) contrast = QByteArray::number(qRound(d.maxLuminance / d.minLuminance));
  return {{"target-prim", "bt.2020"}, {"target-trc", "linear"}, {"target-peak", QByteArray::number(qRound(s.peak))},
          {"hdr-reference-white", QByteArray::number(qRound(s.referenceWhite))}, {"target-contrast", contrast}};
}
}
