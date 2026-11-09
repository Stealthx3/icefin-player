// Icefin: decoder self-test on bundled samples (PLAN 4.1, SPEC "GPU acceleration and display").
//
// Decodes two seconds of each sample (H.264, HEVC Main10, AV1, VP9) in a headless mpv with hardware decoding
// allowed (auto-copy-safe, so no window or interop is needed), and records which decoder engaged and how fast it
// decoded. Runs on first start and whenever the GPU, kernel or mpv changes (the fingerprint); results are kept in
// state.icefin_hw_selftest and shown in Client Settings -> Hardware. Codecs decodable neither in hardware nor in real
// time in software are the ones the Auto device profile (6.4) will ask the server to transcode.
#pragma once
#include <QJsonObject>
#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariantMap>

namespace Icefin::Gpu
{
struct SampleResult
{
  QString codec, file;
  bool ok = false;        // decoded to the end
  QString hwdec;          // mpv hwdec-current, e.g. "vaapi-copy"; empty = software
  double speed = 0;       // decode speed as a multiple of real time
  QString error;
  bool hardware() const { return ok && !hwdec.isEmpty() && hwdec != "no"; }
  bool realtime() const { return ok && speed >= 1.2; }
  QJsonObject toJson() const;
};

// One sample, synchronously (call from a worker thread). mediaPath is a local file.
SampleResult testSample(const QString& codec, const QString& mediaPath, const QString& hwdec = "auto-copy-safe");
// GPU ids, kernel release and mpv version; a change re-runs the test.
QString fingerprint(const QString& sysRoot = "/sys");
// Codecs in results that need the server to transcode: not hardware, not real-time software.
QStringList transcodeCodecs(const QList<SampleResult>& results);

}
