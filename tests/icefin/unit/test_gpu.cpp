// Unit tests for Icefin's GPU layer: hardware decoding choices (PLAN 4.2) and the settings override they rely on.
#include <QtTest>
#include <QJsonArray>
#include <QJsonObject>
#include "icefin/gpu/Hwdec.h"
#include "icefin/gpu/DecoderSelfTest.h"
#include "icefin/gpu/WebGpuStatus.h"
#include <QTemporaryDir>
#include "icefin/settings/SettingsMerge.h"

using namespace Icefin::Gpu;

class TestGpu : public QObject
{
  Q_OBJECT
private slots:
  void hwdecChoices()
  {
    QCOMPARE(hwdecFor("auto"), QString("auto-safe"));
    QCOMPARE(hwdecFor("vaapi"), QString("vaapi"));
    QCOMPARE(hwdecFor("nvdec"), QString("nvdec"));
    QCOMPARE(hwdecFor("vulkan"), QString("vulkan"));
    QCOMPARE(hwdecFor("copy"), QString("auto-copy-safe"));
    QCOMPARE(hwdecFor("off"), QString("no"));
    QCOMPARE(hwdecFor("enabled"), QString("auto-safe"));
    QCOMPARE(hwdecFor("disabled"), QString("no"));
    QCOMPARE(hwdecFor("nonsense"), QString("auto-safe"));
  }
  void migration()
  {
    QCOMPARE(migratedSetting("enabled"), QString("auto"));
    QCOMPARE(migratedSetting("osx_compat"), QString("auto"));
    QCOMPARE(migratedSetting("disabled"), QString("off"));
    QVERIFY(migratedSetting("copy").isEmpty());
    QVERIFY(migratedSetting("auto").isEmpty());
  }
  void icefinValueReplacesUpstream()
  {
    auto up = QJsonDocument::fromJson("[{\"section\":\"video\",\"values\":[{\"value\":\"a\",\"default\":1},"
                                      "{\"value\":\"hardwareDecoding\",\"default\":\"copy\"},{\"value\":\"b\",\"default\":2}]}]");
    auto ice = QJsonDocument::fromJson("[{\"section\":\"video\",\"values\":[{\"value\":\"hardwareDecoding\",\"default\":\"auto\"}]}]");
    QJsonArray v = Icefin::Settings::mergeDescription(up, ice).array()[0].toObject()["values"].toArray();
    QCOMPARE(v.size(), 3);  // replaced in place, not appended
    QCOMPARE(v[1].toObject()["value"].toString(), QString("hardwareDecoding"));
    QCOMPARE(v[1].toObject()["default"].toString(), QString("auto"));
  }
  void selfTestDecodesSample()
  {
    // The harness either decodes to the end and times it, or says why not. The Flatpak build sandbox has a codec-limited
    // ffmpeg (full codecs arrive at runtime), so a decode failure with a reason is a valid result here.
    SampleResult r = testSample("h264", QString(ICEFIN_TESTMEDIA) + "/h264.mp4");
    if (r.ok) QVERIFY(r.speed > 0);
    else QVERIFY2(!r.error.isEmpty(), "a failed decode must say why");
    qInfo().noquote() << "h264 sample:" << (r.ok ? QString("decoded, %1x real time, %2").arg(r.speed).arg(r.hwdec.isEmpty() ? "software" : r.hwdec) : "not decoded: " + r.error);
    SampleResult bad = testSample("h264", "/nonexistent.mp4");
    QVERIFY(!bad.ok);
    QVERIFY(!bad.error.isEmpty());
  }
  void transcodeRule()
  {
    SampleResult hw; hw.codec = "hevc"; hw.ok = true; hw.hwdec = "vaapi-copy"; hw.speed = 0.5;
    SampleResult sw; sw.codec = "h264"; sw.ok = true; sw.speed = 8;
    SampleResult slow; slow.codec = "av1"; slow.ok = true; slow.speed = 0.7;
    SampleResult broken; broken.codec = "vp9"; broken.error = "x";
    QCOMPARE(transcodeCodecs({hw, sw, slow, broken}), (QStringList{"av1", "vp9"}));
  }
  void fingerprintReadsGpus()
  {
    QTemporaryDir d;
    for (auto [card, vendor, device] : {std::tuple{"card0", "0x1002", "0x7550"}, std::tuple{"card1", "0x8086", "0x56a0"}}) {
      QDir().mkpath(d.path() + "/class/drm/" + card + "/device");
      QFile v(d.path() + "/class/drm/" + card + "/device/vendor"); v.open(QIODevice::WriteOnly); v.write(vendor);
      QFile w(d.path() + "/class/drm/" + card + "/device/device"); w.open(QIODevice::WriteOnly); w.write(device);
    }
    const QString f = fingerprint(d.path());
    QVERIFY2(f.startsWith("0x1002:0x7550, 0x8086:0x56a0, kernel "), qPrintable(f));
    QVERIFY(f.contains("mpv-api"));
  }
  void webFeatureStatus()
  {
    const auto f = parseFeatureStatus({"*   Canvas: Hardware accelerated", "*   Compositing: Hardware accelerated",
                                       "*   Rasterization: Hardware accelerated on all pages", "*   WebGL: Unavailable", "noise"});
    QCOMPARE(f.value("Canvas"), QString("Hardware accelerated"));
    QCOMPARE(f.size(), 4);
    QVERIFY(webAccelerated(f));
    auto sw = f;
    sw["Compositing"] = "Software only. Hardware acceleration disabled";
    QVERIFY(!webAccelerated(sw));
  }
};

QTEST_GUILESS_MAIN(TestGpu)
#include "test_gpu.moc"
