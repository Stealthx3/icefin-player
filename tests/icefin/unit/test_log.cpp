// Unit tests for Icefin's log redaction (PLAN 11.2).
#include <QtTest>
#include "icefin/log/Redact.h"

class TestLog : public QObject
{
  Q_OBJECT
private slots:
  void redacts_data()
  {
    QTest::addColumn<QString>("in");
    QTest::addColumn<QString>("secret");
    QTest::newRow("auth header") << "Authorization: MediaBrowser Client=\"x\", Token=\"0123456789abcdef0123456789abcdef\"" << "0123456789abcdef0123456789abcdef";
    QTest::newRow("escaped header") << "{\"h\":\"MediaBrowser Token=\\\"abcdef0123456789\\\"\"}" << "abcdef0123456789";
    QTest::newRow("emby header") << "X-Emby-Token: deadbeefdeadbeefdeadbeef" << "deadbeefdeadbeefdeadbeef";
    QTest::newRow("short api_key") << "GET /Items?api_key=abc123short HTTP" << "abc123short";
    QTest::newRow("long ApiKey") << "url?ApiKey=0123456789abcdef0123456789abcdef0123456789" << "0123456789abcdef0123456789abcdef0123456789";
    QTest::newRow("json password") << "{\"Username\":\"lab\",\"Pw\":\"hunter2 with spaces\"}" << "hunter2 with spaces";
    QTest::newRow("escaped password") << "body: {\\\"Password\\\":\\\"s3cret\\\"}" << "s3cret";
    QTest::newRow("json token") << "{\"AccessToken\":\"tok_12345678\"}" << "tok_12345678";
  }
  void redacts()
  {
    QFETCH(QString, in);
    QFETCH(QString, secret);
    QString msg = in;
    Icefin::Log::redact(msg);
    QVERIFY2(!msg.contains(secret), qPrintable(msg));
    QVERIFY2(msg.contains("[redacted]"), qPrintable(msg));
  }
  void leavesOtherLinesAlone()
  {
    QString msg = "Icefin audio: AC3 6 ch on pipewire -> PCM 2ch (receiver off)";
    const QString before = msg;
    Icefin::Log::redact(msg);
    QCOMPARE(msg, before);
    QString empty = "{\"Pw\":\"\"}";
    Icefin::Log::redact(empty);
    QCOMPARE(empty, QString("{\"Pw\":\"\"}"));
  }
};

QTEST_GUILESS_MAIN(TestLog)
#include "test_log.moc"
