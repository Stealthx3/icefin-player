// Icefin: the capability model's assembly (PLAN 6.7, src/icefin/capability/CapabilityModel.h).
#include <QtTest>
#include "icefin/capability/CapabilityModel.h"

using namespace Icefin::Capability;
using namespace Icefin::Render;

class TestCapability : public QObject
{
  Q_OBJECT

  static Inputs vulkanHdr()
  {
    Inputs in;
    in.vulkanRenderer = true;
    in.vulkanVideoPath = true;
    in.vulkanUsable = true;
    in.hdrOutput = true;
    in.display = {{"hdr", "yes"}, {"transfer", "gamma22"}, {"maxLuminance", 800}};
    in.compositor = {{"active", true}, {"output", "hdr10"}, {"reason", "Vulkan video path"}};
    return in;
  }
  static Inputs openGl()
  {
    Inputs in;
    in.vulkanRenderer = false;
    in.vulkanVideoPath = true;
    in.vulkanUsable = true;
    in.display = {{"hdr", "no"}};
    return in;
  }

private Q_SLOTS:
  void vulkanHdrRoutesHdr()
  {
    const System s = routerSystem(vulkanHdr());
    QCOMPARE(s.renderer, Renderer::Vulkan);
    QCOMPARE(s.display, DisplayState::Hdr);
    QCOMPARE(s.vulkanAvailable, false);  // already on Vulkan: nothing to switch to
    const QVariantMap v = snapshot(vulkanHdr()).value("video").toMap();
    QCOMPARE(v.value("HDR10/HLG").toMap().value("output").toString(), QString("HDR output"));
  }

  // An HDR display whose surface isn't tagged yet (or HDR output off) is SDR on the Vulkan path: tone-mapped.
  void vulkanWithoutHdrOutputIsSdr()
  {
    Inputs in = vulkanHdr();
    in.hdrOutput = false;
    QCOMPARE(routerSystem(in).display, DisplayState::Sdr);
    QCOMPARE(snapshot(in).value("video").toMap().value("HDR10/HLG").toMap().value("output").toString(), QString("tone-mapped SDR"));
  }

  void hdrSettingOffMeansOff()
  {
    Inputs in = vulkanHdr();
    in.hdrSetting = "off";
    QCOMPARE(routerSystem(in).hdr, HdrPreference::Off);
  }

  // On OpenGL by choice with a usable Vulkan GPU, the prompt can offer the switch; not after a Vulkan failure (5.7).
  void switchToVulkanOnlyWhenItCanWork()
  {
    Inputs in = openGl();
    QCOMPARE(routerSystem(in).vulkanAvailable, true);
    const QVariantMap dv = snapshot(in).value("video").toMap().value("Dolby Vision 5/8").toMap();
    QCOMPARE(dv.value("output").toString(), QString("capability prompt"));
    QVERIFY(dv.value("options").toStringList().contains("switchToVulkan"));
    in.vulkanFallback = "mpv's Vulkan render context failed";
    QCOMPARE(routerSystem(in).vulkanAvailable, false);
    in.vulkanFallback.clear();
    in.vulkanUsable = false;
    QCOMPARE(routerSystem(in).vulkanAvailable, false);
    in.vulkanUsable = true;
    in.vulkanVideoPath = false;  // a build without the Vulkan video path: switching wouldn't show video
    QCOMPARE(routerSystem(in).vulkanAvailable, false);
  }

  void unknownDisplayStaysUnknown()
  {
    Inputs in = openGl();
    in.display = {{"hdr", "unknown"}};
    QCOMPARE(routerSystem(in).display, DisplayState::Unknown);
  }

  // Dolby Vision 7 plays from its base layer: the full grade isn't promised on any renderer (5.9, D26).
  void dolbyVision7IsBaseLayer()
  {
    const QVariantMap dv7 = snapshot(vulkanHdr()).value("video").toMap().value("Dolby Vision 7").toMap();
    QVERIFY(dv7.value("baseLayerOnly").toBool() || dv7.value("output").toString() == "capability prompt");
  }

  // Themes get a small, private view: no device paths, receiver names or sample file names.
  void themeViewIsSmallAndPrivate()
  {
    Inputs in = vulkanHdr();
    in.sink = {{"device", "alsa/hdmi:CARD=NVidia,DEV=0"}, {"name", "SONY AVR"}, {"valid", true}, {"lpcmChannels", 8},
               {"codecs", QStringList{"AC-3", "TrueHD"}}};
    in.selfTest = {{"samples", QVariantList{QVariantMap{{"file", "hevc10.mp4"}}}}, {"transcode", QStringList{"av1"}}};
    const QVariantMap t = themeView(snapshot(in));
    QCOMPARE(t.value("renderer").toString(), QString("vulkan"));
    QCOMPARE(t.value("hdr").toMap().value("output").toBool(), true);
    QCOMPARE(t.value("video").toMap().value("hdr10").toString(), QString("HDR output"));
    QCOMPARE(t.value("audio").toMap().value("channels").toInt(), 8);
    QCOMPARE(t.value("audio").toMap().value("passthrough").toStringList(), (QStringList{"AC-3", "TrueHD"}));
    QCOMPARE(t.value("decoders").toMap().value("serverConverts").toStringList(), QStringList{"av1"});
    const QString all = QString::fromUtf8(QJsonDocument::fromVariant(t).toJson());
    QVERIFY(!all.contains("SONY") && !all.contains("alsa/") && !all.contains("hevc10.mp4"));
  }

  // Before the self-test or a playback over HDMI, the lists are empty lists, not missing (PACKAGE.md promises arrays).
  void themeViewListsAreLists()
  {
    const QVariantMap t = themeView(snapshot(openGl()));
    QCOMPARE(t.value("decoders").toMap().value("serverConverts").userType(), QMetaType::QStringList);
    QCOMPARE(t.value("audio").toMap().value("passthrough").userType(), QMetaType::QStringList);
    QCOMPARE(t.value("audio").toMap().value("receiver").toBool(), false);
  }

  void rendererSummaryLines()
  {
    QCOMPARE(rendererSummary(snapshot(vulkanHdr())), QString("Vulkan (compositor, HDR10 output)"));
    Inputs sdr = vulkanHdr();
    sdr.hdrOutput = false;
    QCOMPARE(rendererSummary(snapshot(sdr)), QString("Vulkan (compositor, SDR output)"));
    QCOMPARE(rendererSummary(snapshot(openGl())), QString("OpenGL (fallback)"));
    Inputs failed = openGl();
    failed.vulkanFallback = "no device";
    QCOMPARE(rendererSummary(snapshot(failed)), QString("OpenGL (fallback: Vulkan failed: no device)"));
  }

  // Couch Mode's detection (alpha feedback): a TV-sized display or a Gamescope session; the theme view carries it.
  void couchDisplays()
  {
    QCOMPARE(couchDisplay({{"diagonalInches", 65.0}}).value("couch").toBool(), true);
    QCOMPARE(couchDisplay({{"diagonalInches", 65.0}}).value("reason").toString(), QString("display 65 in"));
    QCOMPARE(couchDisplay({{"diagonalInches", 27.0}}).value("couch").toBool(), false);
    QCOMPARE(couchDisplay({{"diagonalInches", 0.0}}).value("reason").toString(), QString("display size unknown"));
    QCOMPARE(couchDisplay({{"diagonalInches", 24.0}, {"gamescope", true}}).value("reason").toString(), QString("gamescope"));
    Inputs tv = openGl();
    tv.screen = {{"diagonalInches", 55.0}};
    QVariantMap s = snapshot(tv);
    s["theme"] = themeView(s);
    QCOMPARE(s["theme"].toMap().value("couch").toMap().value("couch").toBool(), true);
  }
};

QTEST_GUILESS_MAIN(TestCapability)
#include "test_capability.moc"
