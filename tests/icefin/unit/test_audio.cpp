// Unit tests for Icefin's ELD parser, per-track passthrough decision, per-device delay and volume routing (PLAN 3.2, 3.3, 3.7).
#include <QtTest>
#include <QFile>
#include "icefin/audio/AudioPolicy.h"
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
    QCOMPARE(sb->maxRate, 48000);      // what the kernel lets the HDMI PCM open (3.9)
    QCOMPARE(sb->maxChannels, 6);
    auto full = fixture("receiver_full.txt");
    QCOMPARE(full->maxRate, 192000);
    QCOMPARE(full->maxChannels, 8);
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
    // The soundbar lists E-AC-3 but no rate above 48 kHz: the kernel can't open E-AC-3's 192 kHz carrier (3.9).
    QTest::newRow("eac3 soundbar -> pcm (48 kHz ELD)") << "eac3" << "" << 6 << "soundbar_eac3.txt" << PA << PCM << "" << 2;
    QTest::newRow("eac3 full receiver") << "eac3" << "" << 6 << "receiver_full.txt" << PW << PT << "eac3" << 0;
    QTest::newRow("ac3 soundbar") << "ac3" << "" << 6 << "soundbar_eac3.txt" << PW << PT << "ac3" << 0;
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
  void hbrNeedsTheRates()
  {
    // TrueHD and DTS-HD listed, but nothing above 48 kHz: their 192 kHz HBR stream can't open (3.9).
    const QString text = "monitor_present\t\t1\neld_valid\t\t1\nmonitor_name\t\tLow\nsad_count\t\t3\n"
                         "sad0_coding_type\t[0x1] LPCM\nsad0_channels\t\t8\nsad0_rates\t\t[0xe0] 32000 44100 48000\n"
                         "sad1_coding_type\t[0xc] MLP (Dolby TrueHD)\nsad1_channels\t\t8\nsad1_rates\t\t[0x80] 48000\n"
                         "sad2_coding_type\t[0xb] DTS-HD\nsad2_channels\t\t8\nsad2_rates\t\t[0x80] 48000\n";
    auto eld = parseEld(text);
    QVERIFY(eld && eld->supports(Codec::TrueHD) && eld->maxRate == 48000);
    const QSet<Codec> all{Codec::AC3, Codec::DTS, Codec::EAC3, Codec::DTSHD, Codec::TrueHD};
    Decision d = Icefin::Audio::decide({"truehd", "", 8}, all, eld, Backend::Alsa);
    QCOMPARE(int(d.mode), int(Decision::Pcm));
    QCOMPARE(d.pcmChannels, 8);
    QVERIFY2(d.reason.contains("48 kHz"), qPrintable(d.reason));
    // A stale copy (receiver in standby) keeps the limit.
    EldMonitor mon;
    mon.update("k", eld);
    auto stale = mon.update("k", parseEld("monitor_present\t\t1\neld_valid\t\t0\n"));
    QVERIFY(stale && stale->stale && stale->maxRate == 48000);
    QCOMPARE(int(Icefin::Audio::decide({"truehd", "", 8}, all, stale, Backend::Alsa).mode), int(Decision::Pcm));
  }
  void selectedTrackBeforeMpvCatchesUp()
  {
    // on_preloaded: aid is set but current-tracks/audio is still empty (3.9); the track comes from track-list.
    using Icefin::Audio::selectedAudioTrack;
    const QVariantList list{QVariantMap{{"id", 1}, {"type", "video"}, {"codec", "hevc"}},
                            QVariantMap{{"id", 1}, {"type", "audio"}, {"codec", "truehd"}, {"demux-channel-count", 8}},
                            QVariantMap{{"id", 2}, {"type", "audio"}, {"codec", "ac3"}, {"selected", true}}};
    QCOMPARE(selectedAudioTrack(1, {}, list).value("codec").toString(), QString("truehd"));
    QCOMPARE(selectedAudioTrack("2", {}, list).value("codec").toString(), QString("ac3"));
    QCOMPARE(selectedAudioTrack("auto", {}, list).value("codec").toString(), QString("ac3"));     // the selected one
    QVERIFY(selectedAudioTrack("no", {}, list).isEmpty());
    QVERIFY(selectedAudioTrack(3, {}, list).isEmpty());
    QCOMPARE(selectedAudioTrack(1, QVariantMap{{"codec", "eac3"}}, list).value("codec").toString(), QString("eac3"));  // mpv knows
  }
  void receiverNotReady()
  {
    // PLAN 3.9, the user's choice: an ELD that was read but isn't valid means PCM, then the bitstream when it wakes;
    // audio.icefin_standby can pick PCM for the whole track or the bitstream straight away.
    using Icefin::Audio::Standby;
    const QSet<Codec> all{Codec::AC3, Codec::DTS, Codec::EAC3, Codec::DTSHD, Codec::TrueHD};
    const Track truehd{"truehd", "", 8};
    auto standby = fixture("standby.txt");                       // never seen awake
    Decision w = Icefin::Audio::decide(truehd, all, standby, Backend::Alsa, Standby::Wake);
    QCOMPARE(int(w.mode), int(Decision::Pcm));
    QVERIFY(w.waitForReceiver);
    QCOMPARE(w.pcmChannels, 8);
    QVERIFY2(w.reason.contains("until it wakes"), qPrintable(w.reason));
    Decision p = Icefin::Audio::decide(truehd, all, standby, Backend::Alsa, Standby::Pcm);
    QVERIFY(p.mode == Decision::Pcm && !p.waitForReceiver);
    Decision b = Icefin::Audio::decide(truehd, all, standby, Backend::Alsa, Standby::Bitstream);
    QVERIFY(b.mode == Decision::Passthrough && b.spdif == "truehd");  // toggles trusted, as before

    EldMonitor mon;                                               // remembered from a full receiver, now stale
    mon.update("k", fixture("receiver_full.txt"));
    auto stale = mon.update("k", standby);
    QVERIFY(stale && stale->stale);
    Decision sw = Icefin::Audio::decide(truehd, all, stale, Backend::Alsa);
    QVERIFY(sw.mode == Decision::Pcm && sw.waitForReceiver && sw.reason.endsWith("truehd"));
    QCOMPARE(Icefin::Audio::decide(truehd, all, stale, Backend::Alsa, Standby::Bitstream).spdif, QString("truehd"));
    // Nothing to wait for: the codec isn't enabled, or the receiver is ready.
    QVERIFY(!Icefin::Audio::decide(truehd, {Codec::AC3}, standby, Backend::Alsa).waitForReceiver);
    QVERIFY(!Icefin::Audio::decide(truehd, all, fixture("receiver_full.txt"), Backend::Alsa).waitForReceiver);
    // Settings values.
    QCOMPARE(int(Icefin::Audio::standbyForSetting("pcm")), int(Standby::Pcm));
    QCOMPARE(int(Icefin::Audio::standbyForSetting("bitstream")), int(Standby::Bitstream));
    QCOMPARE(int(Icefin::Audio::standbyForSetting("")), int(Standby::Wake));
  }
  void wakeGateWaitsAndRestarts()
  {
    Icefin::Audio::WakeGate g(4000);
    QVERIFY(!g.update(false, 0) && !g.waiting());
    QVERIFY(!g.update(true, 1000) && g.waiting());                // woke at 1 s
    QVERIFY(!g.update(true, 4999));
    QVERIFY(g.update(true, 5000));                                // ready for 4 s
    g.reset();
    QVERIFY(!g.update(true, 10000));
    QVERIFY(!g.update(false, 12000) && !g.waiting());             // back to standby inside the delay
    QVERIFY(!g.update(true, 13000));
    QVERIFY(!g.update(true, 16999));
    QVERIFY(g.update(true, 17000));                               // 4 s from the second wake
    QCOMPARE(Icefin::Audio::kWakeDelayMs, 4000);
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
