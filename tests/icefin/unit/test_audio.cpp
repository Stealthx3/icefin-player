// Unit tests for Icefin's ELD parser, per-track passthrough decision, per-device delay and volume routing (PLAN 3.2, 3.3, 3.7).
#include <QtTest>
#include <QFile>
#include "icefin/audio/Eld.h"
#include "icefin/audio/Passthrough.h"
#include "icefin/audio/AudioOutput.h"
#include "icefin/settings/SettingsMerge.h"
#include "icefin/audio/AudioState.h"
#include "icefin/audio/DeviceDelay.h"
#include <QSignalSpy>
#include <QJsonArray>
#include <QJsonObject>

using namespace Icefin::Audio;

static std::optional<Eld> fixture(const char* name)
{
  QFile f(QString(ICEFIN_FIXTURES) + "/eld/" + name);
  if (!f.open(QIODevice::ReadOnly)) return std::nullopt;
  return parseEld(QString::fromUtf8(f.readAll()));
}

class TestAudio : public QObject
{
  Q_OBJECT
private slots:
  void parseReceiver()
  {
    auto e = fixture("receiver_full.txt");
    QVERIFY(e && e->valid && e->present);
    QCOMPARE(e->monitorName, QString("Lab AVR"));
    QCOMPARE(e->lpcmChannels, 8);
    for (Codec c : {Codec::AC3, Codec::DTS, Codec::EAC3, Codec::DTSHD, Codec::TrueHD}) QVERIFY(e->supports(c));
    QCOMPARE(e->codecs.value(Codec::AC3), 6);
  }
  void parseTvAndSoundbar()
  {
    auto tv = fixture("tv_basic.txt");
    QVERIFY(tv && tv->valid);
    QCOMPARE(tv->lpcmChannels, 2);
    QVERIFY(tv->supports(Codec::AC3));
    QVERIFY(!tv->supports(Codec::DTS));
    auto sb = fixture("soundbar_eac3.txt");
    QVERIFY(sb && sb->supports(Codec::EAC3) && !sb->supports(Codec::TrueHD));
    QCOMPARE(sb->codecs.size(), 2);  // AAC is ignored
  }
  void standbyKeepsLastKnown()
  {
    auto standby = fixture("standby.txt");
    QVERIFY(standby && standby->present && !standby->valid);
    EldMonitor mon;
    QVERIFY(!mon.update("card1/hdmi0", standby)->valid);              // nothing remembered yet
    QVERIFY(mon.update("card1/hdmi0", fixture("receiver_full.txt"))->valid);
    auto later = mon.update("card1/hdmi0", standby);                  // receiver went to standby
    QVERIFY(later && later->stale && later->supports(Codec::TrueHD));
  }
  void garbageIsRejected()
  {
    QVERIFY(!parseEld("hello world\n"));
    QVERIFY(!parseEld(""));
  }
  void readEldFromProcTree()
  {
    QTemporaryDir root;
    QDir().mkpath(root.path() + "/card1");
    QFile::copy(QString(ICEFIN_FIXTURES) + "/eld/standby.txt", root.path() + "/card1/eld#0.0");
    QFile::copy(QString(ICEFIN_FIXTURES) + "/eld/receiver_full.txt", root.path() + "/card1/eld#0.1");
    QCOMPARE(eldFiles(1, root.path()).size(), 2);
    QVERIFY(readEld(1, -1, root.path())->valid);                       // first valid one
    QVERIFY(!readEld(1, 0, root.path())->valid);                       // by HDMI index
    QVERIFY(!readEld(2, -1, root.path()));                             // no such card
  }

  void decide_data()
  {
    QTest::addColumn<QString>("codec");
    QTest::addColumn<QString>("profile");
    QTest::addColumn<int>("channels");
    QTest::addColumn<QString>("eldFile");  // "" = no ELD known
    QTest::addColumn<int>("backend");
    QTest::addColumn<int>("mode");
    QTest::addColumn<QString>("spdif");
    QTest::addColumn<int>("pcmChannels");
    const int PW = int(Backend::PipeWire), PA = int(Backend::PulseAudio), AL = int(Backend::Alsa), JK = int(Backend::Jack);
    const int PT = Decision::Passthrough, CORE = Decision::PassthroughCore, PCM = Decision::Pcm;
    QTest::newRow("truehd full receiver pipewire") << "truehd" << "" << 8 << "receiver_full.txt" << PW << PT << "truehd" << 0;
    QTest::newRow("truehd on pulseaudio decodes") << "truehd" << "" << 8 << "receiver_full.txt" << PA << PCM << "" << 8;
    QTest::newRow("truehd on tv decodes to 2ch") << "truehd" << "" << 8 << "tv_basic.txt" << PW << PCM << "" << 2;
    QTest::newRow("dts-hd ma full alsa") << "dts" << "DTS-HD MA" << 8 << "receiver_full.txt" << AL << PT << "dts-hd" << 0;
    QTest::newRow("dts-hd ma on pulseaudio -> core") << "dts" << "DTS-HD MA" << 8 << "receiver_full.txt" << PA << CORE << "dts" << 0;
    QTest::newRow("dts-hd on soundbar -> pcm") << "dts" << "DTS-HD MA" << 6 << "soundbar_eac3.txt" << PW << PCM << "" << 2;
    QTest::newRow("dts plain full") << "dts" << "DTS" << 6 << "receiver_full.txt" << PW << PT << "dts" << 0;
    QTest::newRow("eac3 soundbar") << "eac3" << "" << 6 << "soundbar_eac3.txt" << PA << PT << "eac3" << 0;
    QTest::newRow("ac3 tv") << "ac3" << "" << 6 << "tv_basic.txt" << PW << PT << "ac3" << 0;
    QTest::newRow("ac3 jack -> pcm") << "ac3" << "" << 6 << "receiver_full.txt" << JK << PCM << "" << 6;
    QTest::newRow("no eld trusts user") << "dts" << "DTS-HD MA" << 8 << "" << AL << PT << "dts-hd" << 0;
    QTest::newRow("aac always decoded") << "aac" << "" << 6 << "receiver_full.txt" << PW << PCM << "" << 6;
  }
  void decide()
  {
    QFETCH(QString, codec); QFETCH(QString, profile); QFETCH(int, channels); QFETCH(QString, eldFile);
    QFETCH(int, backend); QFETCH(int, mode); QFETCH(QString, spdif); QFETCH(int, pcmChannels);
    const QSet<Codec> all{Codec::AC3, Codec::DTS, Codec::EAC3, Codec::DTSHD, Codec::TrueHD};
    std::optional<Eld> eld = eldFile.isEmpty() ? std::nullopt : fixture(eldFile.toUtf8().constData());
    Decision d = Icefin::Audio::decide({codec, profile, channels}, all, eld, Backend(backend));
    QCOMPARE(int(d.mode), mode);
    QCOMPARE(d.spdif, spdif);
    if (mode == Decision::Pcm) QCOMPARE(d.pcmChannels, pcmChannels);
    QVERIFY(!d.reason.isEmpty());
  }
  void deviceNames()
  {
    QTemporaryDir root;
    const QString sys = root.path() + "/sys", proc = root.path() + "/proc";
    QDir().mkpath(sys + "/devices/pci0000:00/0000:00:1f.3");
    QDir().mkpath(sys + "/class/sound/card1");
    QFile::link(sys + "/devices/pci0000:00/0000:00:1f.3", sys + "/class/sound/card1/device");
    QDir().mkpath(proc);
    QFile cards(proc + "/cards"); QVERIFY(cards.open(QIODevice::WriteOnly));
    cards.write(" 0 [Generic        ]: HDA-Intel - HD-Audio Generic\n                      HD-Audio Generic at 0xfcc80000\n"
                " 1 [PCH            ]: HDA-Intel - HDA Intel PCH\n                      HDA Intel PCH at 0xf7f10000\n");
    cards.close();

    Output a = parseDevice("alsa/hdmi:CARD=PCH,DEV=2", sys, proc);
    QVERIFY(a.backend == Backend::Alsa); QCOMPARE(a.card, 1); QCOMPARE(a.hdmiIndex, 2);
    Output pw = parseDevice("pipewire/alsa_output.pci-0000_00_1f.3.hdmi-stereo-extra1", sys, proc);
    QVERIFY(pw.backend == Backend::PipeWire); QCOMPARE(pw.card, 1); QCOMPARE(pw.hdmiIndex, 1);
    Output pa = parseDevice("pulse/alsa_output.pci-0000_00_1f.3.hdmi-surround", sys, proc);
    QVERIFY(pa.backend == Backend::PulseAudio); QCOMPARE(pa.card, 1); QCOMPARE(pa.hdmiIndex, 0);
    Output analog = parseDevice("pipewire/alsa_output.pci-0000_00_1f.3.analog-stereo", sys, proc);
    QVERIFY(!analog.isHdmi());
    Output usb = parseDevice("pipewire/alsa_output.usb-Foo_Bar-00.analog-stereo", sys, proc);
    QCOMPARE(usb.card, -1);
    QVERIFY(parseDevice("jack", sys, proc).backend == Backend::Jack);
    Output hw = parseDevice("alsa/hw:CARD=PCH,DEV=0", sys, proc);
    QCOMPARE(hw.card, 1); QVERIFY(!hw.isHdmi());
    QCOMPARE(parseDevice("alsa/plughw:0,3", sys, proc).card, 0);
    QVERIFY(!parseDevice("auto", sys, proc).backend);
    QCOMPARE(cardIndexFromId("Generic", proc), 0);
    QCOMPARE(cardIndexFromId("Nope", proc), -1);
  }
  void backendSetting()
  {
    QCOMPARE(aoForSetting("auto"), QString("pipewire,pulse,alsa"));  // JACK never automatic
    QCOMPARE(aoForSetting(""), QString("pipewire,pulse,alsa"));
    QCOMPARE(aoForSetting("jack"), QString("jack"));
    QCOMPARE(aoForSetting("pulse"), QString("pulse"));
    QVERIFY(backendHidesPassthrough("jack"));
    QVERIFY(!backendHidesPassthrough("alsa"));
    QVERIFY(backendForSetting("alsa") == Backend::Alsa);
    QVERIFY(!backendForSetting("auto"));
  }
  void settingsMerge()
  {
    auto up = QJsonDocument::fromJson(R"([{"section":"__meta__","version":5},{"section":"audio","values":[{"value":"devicetype","default":"basic"}]}])");
    auto ice = QJsonDocument::fromJson(R"([{"section":"audio","values":[{"value":"backend","default":"auto"}]},{"section":"icefin","values":[{"value":"x","default":1}]}])");
    QJsonArray m = Icefin::Settings::mergeDescription(up, ice).array();
    QCOMPARE(m.size(), 3);
    QJsonArray audio = m[1].toObject()["values"].toArray();
    QCOMPARE(audio.size(), 2);
    QCOMPARE(audio[1].toObject()["value"].toString(), QString("backend"));
    QCOMPARE(m[2].toObject()["section"].toString(), QString("icefin"));
    QCOMPARE(Icefin::Settings::mergeDescription(up, QString("/nonexistent.json")), up);  // missing file: unchanged
  }
  void userToggleWins()
  {
    Decision d = Icefin::Audio::decide({"truehd", "", 8}, {Codec::AC3}, fixture("receiver_full.txt"), Backend::PipeWire);
    QCOMPARE(int(d.mode), int(Decision::Pcm));
    QVERIFY(d.reason.contains("not enabled"));
  }
  void delaysPerDevice()
  {
    QJsonObject store;
    QVERIFY(!recallDelays(store, "pipewire/hdmi").has_value());  // first time: no stored values
    store = rememberDelays(store, "pipewire/hdmi", {{"normal", 120}, {"24hz", 80}, {"25hz", 0}, {"50hz", -50}});
    store = rememberDelays(store, "alsa/headphones", {{"normal", 0}});
    store = rememberDelays(store, "", {{"normal", 999}});  // no device: ignored
    QCOMPARE(store.size(), 2);
    auto hdmi = recallDelays(store, "pipewire/hdmi");
    QVERIFY(hdmi);
    QCOMPARE(hdmi->value("normal"), 120.0);
    QCOMPARE(hdmi->value("24hz"), 80.0);
    QCOMPARE(hdmi->value("50hz"), -50.0);
    auto hp = recallDelays(store, "alsa/headphones");
    QCOMPARE(hp->value("24hz"), 0.0);  // missing keys read as 0
    QCOMPARE(hp->size(), 4);
  }
  void volumeRouting()
  {
    AudioState& st = state();
    QSignalSpy spy(&st, &AudioState::bitstreamChanged);
    const QStringList in{"increase_volume", "play_pause", "decrease_volume"};
    QCOMPARE(st.routeVolumeActions(in), in);  // PCM: software volume, unchanged
    QList<int> sent;
    st.setReceiverVolume([&](int dir) { sent << dir; });
    QCOMPARE(st.routeVolumeActions(in), in);  // still PCM
    st.setBitstream(true, "test");
    QVERIFY(st.uiSoundsMuted());
    QCOMPARE(spy.count(), 1);
    QCOMPARE(st.routeVolumeActions(in), QStringList{"play_pause"});
    QCOMPARE(sent, (QList<int>{1, -1}));
    st.setReceiverVolume({});  // CEC adapter gone: volume stays with the web client
    QCOMPARE(st.routeVolumeActions(in), in);
    st.setBitstream(true, "again");
    QCOMPARE(spy.count(), 1);  // no change, no signal
    st.setBitstream(false, "test");
    QVERIFY(!st.uiSoundsMuted());
    QCOMPARE(volumeDirection("increase_volume"), 1);
    QCOMPARE(volumeDirection("seek_forward"), 0);
  }
};

QTEST_GUILESS_MAIN(TestAudio)
#include "test_audio.moc"
