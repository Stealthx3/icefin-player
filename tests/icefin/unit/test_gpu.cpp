// Unit tests for Icefin's GPU layer: hardware decoding choices (PLAN 4.2) and the settings override they rely on.
#include <QtTest>
#include <QJsonArray>
#include <QJsonObject>
#include "icefin/gpu/Hwdec.h"
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
};

QTEST_GUILESS_MAIN(TestGpu)
#include "test_gpu.moc"
