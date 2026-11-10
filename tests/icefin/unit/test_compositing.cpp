// Icefin: the compositor's math (PLAN 5.4, src/icefin/render/Compositing.h) and the linear mpv target.
#include <QtTest>
#include "icefin/render/Compositing.h"
#include "icefin/render/MpvTarget.h"
#include "icefin/render/HdrCapabilityProbe.h"

using namespace Icefin::Render;

class TestCompositing : public QObject
{
  Q_OBJECT

  static CompositorState state(UiBlend b, OutputEncoding o, double white = 203)
  {
    CompositorState s;
    s.active = true;
    s.blend = b;
    s.output = o;
    s.referenceWhite = white;
    s.peak = o == OutputEncoding::Sdr ? white : 1000;
    return s;
  }
  static Rgb grey(double v) { return {v, v, v}; }
  // Video at `nits`, in libplacebo's linear units.
  static Rgb videoNits(double nits) { return grey(nits / kVideoLinearWhite); }

private Q_SLOTS:
  void pqReferencePoints()
  {
    QCOMPARE(qRound(pqEncode(10000) * 1000), 1000);
    QVERIFY(pqEncode(0) < 1e-5);  // c1^m2, about 7e-7
    QVERIFY(qAbs(pqEncode(100) - 0.5081) < 0.001);   // ST 2084 table values
    QVERIFY(qAbs(pqEncode(1000) - 0.7518) < 0.001);
    for (double n : {0.1, 5.0, 203.0, 800.0, 4000.0}) QVERIFY(qAbs(pqDecode(pqEncode(n)) - n) / n < 1e-6);
  }

  void sdrTransfersRoundTripAndExtend()
  {
    for (bool g22 : {true, false})
      for (double v : {-0.5, 0.0, 0.001, 0.02, 0.5, 1.0, 2.5}) QVERIFY(qAbs(decodeSdr(encodeSdr(v, g22), g22) - v) < 1e-9);
    QVERIFY(qAbs(decodeSdr(0.5, true) - 0.2176) < 1e-4);
    QVERIFY(qAbs(decodeSdr(0.5, false) - 0.2140) < 1e-4);
    QVERIFY(encodeSdr(2.0, true) > 1.0);   // extended above SDR white
    QVERIFY(encodeSdr(-0.1, true) < 0.0);  // and below black (out-of-gamut BT.2020 colours in BT.709)
  }

  void primariesRoundTrip()
  {
    const Rgb w = bt709To2020({1, 1, 1});
    QVERIFY(qAbs(w.r - 1) < 1e-3 && qAbs(w.g - 1) < 1e-3 && qAbs(w.b - 1) < 1e-3);
    const Rgb c{0.2, 0.7, 0.1};
    const Rgb back = bt2020To709(bt709To2020(c));
    QVERIFY(qAbs(back.r - c.r) < 1e-3 && qAbs(back.g - c.g) < 1e-3 && qAbs(back.b - c.b) < 1e-3);
  }

  // No UI over the video: SDR video at reference white shows as full white, in either blend.
  void sdrVideoAlone()
  {
    for (UiBlend b : {UiBlend::Srgb, UiBlend::Linear}) {
      const CompositorState s = state(b, OutputEncoding::Sdr, 200);
      QVERIFY(qAbs(composePixel(s, grey(0), 0, videoNits(200)).r - 1.0) < 1e-9);
      const double mid = composePixel(s, grey(0), 0, videoNits(200 * 0.2)).g;
      QVERIFY(qAbs(mid - encodeSdr(0.2, true)) < 1e-9);
    }
  }

  // An opaque UI pixel is the UI's own colour, whatever is under it and however it blends.
  void opaqueUiIsExact()
  {
    for (UiBlend b : {UiBlend::Srgb, UiBlend::Linear}) {
      const Rgb out = composePixel(state(b, OutputEncoding::Sdr), {0.25, 0.5, 0.75}, 1.0, videoNits(150));
      QVERIFY(qAbs(out.r - 0.25) < 1e-9 && qAbs(out.g - 0.5) < 1e-9 && qAbs(out.b - 0.75) < 1e-9);
    }
  }

  // The alpha compensation makes a black scrim darken video exactly as the browser-style blend does.
  void blackScrimMatchesInBothBlends()
  {
    for (double a : {0.2, 0.5, 0.8}) {
      const double s = composePixel(state(UiBlend::Srgb, OutputEncoding::Sdr), grey(0), a, videoNits(203)).r;
      const double l = composePixel(state(UiBlend::Linear, OutputEncoding::Sdr), grey(0), a, videoNits(203)).r;
      QVERIFY(qAbs(s - (1 - a)) < 1e-9);  // white video under the scrim: 1 - a in the UI's encoding, as a browser
      QVERIFY(qAbs(s - l) < 1e-9);
    }
  }

  // Where the two differ: a translucent light colour over dark video reads lighter in linear light (D24).
  void whiteVeilDiffers()
  {
    const Rgb ui = grey(0.5);  // premultiplied white at 50%
    const double s = composePixel(state(UiBlend::Srgb, OutputEncoding::Sdr), ui, 0.5, videoNits(0)).r;
    const double l = composePixel(state(UiBlend::Linear, OutputEncoding::Sdr), ui, 0.5, videoNits(0)).r;
    QVERIFY(qAbs(s - 0.5) < 1e-9);
    QVERIFY(l > 0.7 && l < 0.75);
  }

  void hdr10Output()
  {
    const CompositorState s = state(UiBlend::Srgb, OutputEncoding::Hdr10, 203);
    // Opaque UI white sits at the reference white.
    QVERIFY(qAbs(composePixel(s, grey(1), 1, {}).r - pqEncode(203)) < 1e-9);
    // A 1000-nit highlight with no UI over it keeps its luminance.
    QVERIFY(qAbs(composePixel(s, grey(0), 0, videoNits(1000)).g - pqEncode(1000)) < 1e-6);
    // A black 50% scrim over it darkens it in the UI's encoding, staying above SDR white.
    const double under = pqDecode(composePixel(s, grey(0), 0.5, videoNits(1000)).g);
    QVERIFY(under > 203 && under < 1000);
  }

  void scrgbOutput()
  {
    const CompositorState s = state(UiBlend::Linear, OutputEncoding::ScRgb, 240);
    QVERIFY(qAbs(composePixel(s, grey(1), 1, {}).r - 3.0) < 1e-9);  // 240 nits / 80
  }

  void noVideo()
  {
    const Rgb out = composePixel(state(UiBlend::Srgb, OutputEncoding::Sdr), grey(0), 0, videoNits(500), false);
    QCOMPARE(out.r, 0.0);
  }

  void linearMpvTarget()
  {
    DisplayInfo d;
    d.maxLuminance = 800;
    d.minLuminance = 0.05;
    d.referenceLuminance = 200;
    CompositorState s = state(UiBlend::Srgb, OutputEncoding::Sdr, 200);
    MpvOptions o = mpvLinearTargetOptions(s, d);
    QCOMPARE(o.value(0), qMakePair(QByteArray("target-prim"), QByteArray("bt.709")));
    QCOMPARE(o.value(1), qMakePair(QByteArray("target-trc"), QByteArray("linear")));
    QCOMPARE(o.value(2), qMakePair(QByteArray("target-peak"), QByteArray("200")));
    QCOMPARE(o.value(3), qMakePair(QByteArray("hdr-reference-white"), QByteArray("200")));
    QCOMPARE(o.value(4), qMakePair(QByteArray("target-contrast"), QByteArray("auto")));
    s = state(UiBlend::Srgb, OutputEncoding::Hdr10, 200);
    s.peak = 800;
    o = mpvLinearTargetOptions(s, d);
    QCOMPARE(o.value(0).second, QByteArray("bt.2020"));
    QCOMPARE(o.value(2).second, QByteArray("800"));
    QCOMPARE(o.value(4).second, QByteArray("16000"));
  }

  void hdrMetadataAndSurfaceDescription()
  {
    VideoHdrMetadata a, b;
    QVERIFY(a == b);
    b.maxCll = 1000;
    QVERIFY(a != b);
    SurfaceDescription d;
    QCOMPARE(d.summary(), QString("untagged (SDR)"));
    d.kind = SurfaceDescription::Kind::Hdr10;
    d.referenceWhite = 200;
    d.masteringMaxLuminance = 1000;
    d.masteringMinLuminance = 0.005;
    d.maxCll = 950;
    QVERIFY(d.summary().startsWith("HDR10 (PQ, BT.2020, reference white 200)"));
    QVERIFY(d.summary().contains("MaxCLL 950"));
    SurfaceDescription e = d;
    QVERIFY(d == e);
    e.masteringPrimaries[0] = 0.68;
    QVERIFY(d != e);
  }

  void names()
  {
    QCOMPARE(uiBlendFromName("linear"), UiBlend::Linear);
    QCOMPARE(uiBlendFromName("srgb"), UiBlend::Srgb);
    QCOMPARE(uiBlendFromName("nonsense", UiBlend::Linear), UiBlend::Linear);
    QCOMPARE(outputEncodingName(OutputEncoding::Hdr10), QString("hdr10"));
  }

  // The shader mirrors composePixel: its uniforms are the QML properties Compositor.qml sets.
  void shaderDeclaresCompositorUniforms()
  {
    const QString src = compositorShaderSource();
    for (const char* u : {"blendMode", "outputMode", "gamma22", "referenceWhite", "videoScale", "hasVideo", "sampler2D ui", "sampler2D video"})
      QVERIFY2(src.contains(u), u);
  }
};

QTEST_GUILESS_MAIN(TestCompositing)
#include "test_compositing.moc"
