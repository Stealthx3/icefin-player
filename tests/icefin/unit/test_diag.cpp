// Unit tests for the diagnostics report (PLAN 11.4): redaction, the recent-log ring buffer and the report's sections.
#include <QtTest>
#include "icefin/diag/Report.h"
#include "icefin/log/Recent.h"

class TestDiag : public QObject
{
  Q_OBJECT
private slots:
  void sanitizes()
  {
    const QString in = "URL: http://192.168.2.40:8096/Videos/abc/stream.mkv?api_key=0123456789abcdef0123456789abcdef\n"
                       "ws https://jf.example.org/socket?api_key=short123\n"
                       "Authorization: MediaBrowser Token=\"deadbeefdeadbeef\"\n"
                       "{\"Pw\":\"hunter2\"}\n"
                       "log at /home/alice/.var/app/x/log and file:///home/alice/a.mkv on alicebox (alicebox.local)\n"
                       "localhost stays, qrc:/x stays";
    const QString out = Icefin::Diag::sanitize(in, "/home/alice/", "alicebox");
    for (const char* secret : {"192.168.2.40", "8096", "jf.example.org", "0123456789abcdef0123456789abcdef", "short123", "deadbeefdeadbeef",
                               "hunter2", "/home/alice", "alicebox"})
      QVERIFY2(!out.contains(QLatin1String(secret)), qPrintable(QString(secret) + " in:\n" + out));
    QVERIFY2(out.contains("http://[server]/Videos/abc/stream.mkv"), qPrintable(out));
    QVERIFY2(out.contains("https://[server]/socket"), qPrintable(out));
    QVERIFY2(out.contains("~/.var/app/x/log"), qPrintable(out));
    QVERIFY2(out.contains("file:///~/a.mkv") || out.contains("file://~/a.mkv"), qPrintable(out));
    QVERIFY2(out.contains("[host] ([host].local)"), qPrintable(out));
    QVERIFY(out.contains("localhost stays, qrc:/x stays"));
  }
  void keepsTheRightLines()
  {
    using namespace Icefin::Log;
    QVERIFY(keepRecent(QtInfoMsg, "Icefin router: HDR10 -> hdr10"));
    QVERIFY(keepRecent(QtInfoMsg, "Entering state: playing"));
    QVERIFY(keepRecent(QtInfoMsg, "\"Entering state: error (loading failed)\""));
    QVERIFY(keepRecent(QtWarningMsg, "[ffmpeg] anything"));
    QVERIFY(keepRecent(QtCriticalMsg, "anything"));
    QVERIFY(!keepRecent(QtInfoMsg, "WebEngine: some page chatter"));
    QVERIFY(!keepRecent(QtDebugMsg, "Icefin debug detail"));
  }
  void ringBufferCaps()
  {
    using namespace Icefin::Log;
    clearRecent();
    for (int i = 0; i < kRecentLines + 50; i++) remember(QtInfoMsg, QString("Icefin line %1").arg(i));
    remember(QtInfoMsg, "not kept");
    const QStringList lines = recentLines();
    QCOMPARE(lines.size(), kRecentLines);
    QVERIFY(lines.first().endsWith("[info] Icefin line 50"));
    QVERIFY(lines.last().endsWith("Icefin line " + QString::number(kRecentLines + 49)));
    clearRecent();
    QVERIFY(recentLines().isEmpty());
  }
  void sectionsLeaveStateOut()
  {
    const QStringList s = Icefin::Diag::reportSections();
    QVERIFY(s.contains("audio") && s.contains("video") && s.contains("main"));
    QVERIFY(!s.contains("state") && !s.contains("path") && !s.contains("__meta__"));
  }
  void buildsTheReport()
  {
    Icefin::Diag::ReportInputs in;
    in.generated = "2026-11-12T10:00:00Z";
    in.app = {{"version", "0.1.0"}, {"base", "2.0.0"}, {"web", "10.11.0"}, {"build", "x"}, {"flatpak", true}, {"runtime", "org.kde.Platform/x86_64/6.10"}};
    in.system = {{"os", "Debian 13"}, {"kernel", "6.12"}, {"arch", "x86_64"}, {"platform", "wayland"}, {"session", "wayland"}, {"desktop", "KDE"}};
    in.capabilities = {
      {"renderer", QVariantMap{{"api", "vulkan"}, {"videoPath", true}, {"hdrOutput", true},
                               {"compositor", QVariantMap{{"active", true}, {"output", "hdr10"}}}}},
      {"display", QVariantMap{{"hdr", "yes"}, {"transfer", "pq"}, {"primaries", "bt2020"}, {"maxLuminance", 1000}, {"referenceLuminance", 203}}},
      {"hdrSetting", "auto"},
      {"video", QVariantMap{{"hdr10", QVariantMap{{"output", "hdr10"}}}, {"sdr", QVariantMap{{"output", "sdr"}}}}},
      {"decoders", QVariantMap{{"hwdec", "auto"}, {"interop", "vaapi"}, {"current", "vaapi"},
                               {"samples", QVariantList{QVariantMap{{"codec", "hevc"}, {"ok", true}, {"hardware", true}, {"hwdec", "vaapi"}}}},
                               {"transcode", QStringList{"av1"}}}},
      {"audio", QVariantMap{{"valid", true}, {"name", "AVR"}, {"codecs", QStringList{"ac3", "eac3"}}, {"lpcmChannels", 8}}},
      {"versions", QVariantMap{{"mpv", "mpv v0.42.0"}, {"libass", 24129536}, {"qt", "6.11.0"}}}};
    in.web = {{"accelerated", true}, {"features", QVariantMap{{"Rasterization", "Hardware accelerated"}, {"Compositing", "Hardware accelerated"}}}};
    in.audio = {{"backend", "pipewire"}, {"device", "hdmi"}, {"deviceType", "hdmi"}, {"passthrough", QStringList{"ac3", "eac3"}}, {"bitstream", true}};
    in.settings = {{"main", QVariantMap{{"userWebClient", "http://10.0.0.5:8096/web"}}}};
    in.screens = {QVariantMap{{"name", "HDMI-A-1"}, {"size", "3840x2160"}, {"refresh", "60.00"}, {"dpr", 1.0}, {"primary", true}, {"window", true}}};
    in.nowPlaying = "URL: http://10.0.0.5:8096/Videos/1/stream?api_key=abcdef";
    in.recentLog = {"10:00:00.000 [info] Icefin router: HDR10 -> hdr10"};
    in.home = "/home/bob";
    in.hostName = "bobpc";
    const QString r = Icefin::Diag::build(in);
    for (const char* want : {"# Icefin Player diagnostics report", "## Summary", "Vulkan (compositor, HDR10 output)", "HDR (pq, bt2020, peak 1000 nits",
                             "hevc vaapi", "the server converts av1", "GPU-accelerated", "hdr10: hdr10", "receiver AVR (ac3, eac3, 8 ch)",
                             "passthrough ac3 eac3", "bitstreaming now", "Flatpak org.kde.Platform/x86_64/6.10", "mpv v0.42.0, FFmpeg", "libass 0x01703000", "HDMI-A-1: 3840x2160 @ 60.00 Hz",
                             "## Now playing", "## Recent log", "Icefin router: HDR10 -> hdr10", "## Capability model", "## Settings",
                             "http://[server]/web", "http://[server]/Videos/1/stream"})
      QVERIFY2(r.contains(QLatin1String(want)), qPrintable(QString("missing: ") + want + "\n" + r));
    QVERIFY(!r.contains("10.0.0.5"));
    QVERIFY(!r.contains("abcdef\n"));
  }
  void emptyInputsStillBuild()
  {
    const QString r = Icefin::Diag::build({});
    QVERIFY(r.contains("## Summary") && r.contains("Nothing.") && r.contains("(none)") && r.contains("self-test not run"));
  }
};

QTEST_GUILESS_MAIN(TestDiag)
#include "test_diag.moc"
