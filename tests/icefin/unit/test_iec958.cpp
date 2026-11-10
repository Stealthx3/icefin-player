// Unit tests for the IEC958 format helpers (PLAN 3.4).
#include <QtTest>
#include "icefin/audio/Iec958Formats.h"

using namespace Icefin::Audio;

class TestIec958 : public QObject
{
  Q_OBJECT
private slots:
  void names()
  {
    QCOMPARE(pulseFormatFor("ac3"), QString("ac3-iec61937"));
    QCOMPARE(pulseFormatFor("dts-hd"), QString("dtshd-iec61937"));
    QCOMPARE(pulseFormatFor("truehd"), QString("truehd-iec61937"));
    QVERIFY(pulseFormatFor("aac").isEmpty());
    QCOMPARE(sinkFromDevice("pulse/alsa_output.pci-0000_01_00.1.hdmi-stereo"), QString("alsa_output.pci-0000_01_00.1.hdmi-stereo"));
    QCOMPARE(sinkFromDevice("pipewire/alsa_output.hdmi"), QString("alsa_output.hdmi"));
    QVERIFY(sinkFromDevice("alsa/hdmi:CARD=0,DEV=0").isEmpty());
    QVERIFY(sinkFromDevice("auto").isEmpty());
  }
  void merging()
  {
    QCOMPARE(withCodecs({"pcm"}, {"ac3"}), (QStringList{"pcm", "ac3-iec61937"}));
    QCOMPARE(withCodecs({"pcm", "ac3-iec61937"}, {"ac3", "eac3"}), (QStringList{"pcm", "ac3-iec61937", "eac3-iec61937"}));
    QCOMPARE(withCodecs({}, {"dts-hd"}), (QStringList{"pcm", "dtshd-iec61937", "dts-iec61937"}));
    QCOMPARE(withCodecs({"ac3-iec61937"}, {}), (QStringList{"pcm", "ac3-iec61937"}));  // PCM always first
  }
  void wirePlumber()
  {
    const QString r = wirePlumberRule("alsa_output.hdmi", {"ac3", "dts-hd", "truehd"});
    QVERIFY(r.contains("node.name = \"alsa_output.hdmi\""));
    QVERIFY(r.contains("iec958.codecs = [ \"PCM\", \"AC3\", \"DTS-HD\", \"TrueHD\", \"DTS\" ]"));
    QVERIFY(r.contains("wireplumber.conf.d/51-icefin-passthrough.conf"));
  }
};

QTEST_GUILESS_MAIN(TestIec958)
#include "test_iec958.moc"
