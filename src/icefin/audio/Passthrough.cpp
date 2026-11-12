#include "Passthrough.h"
#include <QtGlobal>

namespace Icefin::Audio
{
bool backendCarries(Backend b, Codec c)
{
  switch (b) {
    case Backend::PipeWire: case Backend::Alsa: return true;
    case Backend::PulseAudio: return c == Codec::AC3 || c == Codec::EAC3 || c == Codec::DTS;
    case Backend::Jack: return false;
  }
  return false;
}

static QString spdifName(Codec c)
{
  switch (c) {
    case Codec::AC3: return "ac3";
    case Codec::EAC3: return "eac3";
    case Codec::DTS: return "dts";
    case Codec::DTSHD: return "dts-hd";
    case Codec::TrueHD: return "truehd";
  }
  return {};
}

// The IEC 61937 carrier each format needs on HDMI (48 kHz content, as mpv's spdif muxer writes it): AC-3 and DTS
// 48 kHz stereo; E-AC-3 four times that; TrueHD and DTS-HD (HD rate 768 kHz) eight channels at 192 kHz (HBR).
struct Carrier { int rate; int channels; };
static Carrier carrier(Codec c)
{
  switch (c) {
    case Codec::AC3: case Codec::DTS: return {48000, 2};
    case Codec::EAC3: return {192000, 2};
    case Codec::DTSHD: case Codec::TrueHD: return {192000, 8};
  }
  return {48000, 2};
}

Standby standbyForSetting(const QString& value)
{
  if (value == "pcm") return Standby::Pcm;
  if (value == "bitstream") return Standby::Bitstream;
  return Standby::Wake;
}

bool WakeGate::update(bool valid, qint64 nowMs)
{
  if (!valid) { m_since = -1; return false; }
  if (m_since < 0) m_since = nowMs;
  return nowMs - m_since >= m_delay;
}

// The decision as if the receiver were ready: the ELD (or the remembered one, when stale) as it reads.
static Decision decideReady(const Track& t, const QSet<Codec>& user, const std::optional<Eld>& eld, Backend backend)
{
  const bool eldKnown = eld && (eld->valid || eld->stale);
  auto ok = [&](Codec c, QString* why) {
    if (!user.contains(c)) { *why = codecName(c) + " not enabled"; return false; }
    if (eldKnown && !eld->supports(c)) { *why = "receiver lacks " + codecName(c); return false; }
    // The kernel opens the HDMI PCM only at the ELD's rates and channel count (PLAN 3.9): a sink listing E-AC-3 but
    // nothing above 48 kHz can't take E-AC-3's 192 kHz stream, and mpv stalls on the refused open instead of failing.
    const Carrier need = carrier(c);
    if (eldKnown && eld->maxRate > 0 && need.rate > eld->maxRate) {
      *why = QString("receiver's ELD tops out at %1 kHz, %2 needs %3 kHz").arg(eld->maxRate / 1000.0).arg(codecName(c)).arg(need.rate / 1000);
      return false;
    }
    if (eldKnown && eld->maxChannels > 0 && need.channels > eld->maxChannels) {
      *why = QString("receiver's ELD has %1 channels, %2 needs %3").arg(eld->maxChannels).arg(codecName(c)).arg(need.channels);
      return false;
    }
    if (!backendCarries(backend, c)) { *why = "backend can't carry " + codecName(c); return false; }
    return true;
  };
  const int sinkCh = eldKnown && eld->lpcmChannels > 0 ? eld->lpcmChannels : 8;
  auto pcm = [&](const QString& why, int maxCh) {
    Decision d; d.mode = Decision::Pcm; d.pcmChannels = qBound(1, qMin(t.channels, qMin(sinkCh, maxCh)), 8); d.reason = why;
    return d;
  };
  auto pass = [&](Codec c, Decision::Mode m, const QString& why) {
    Decision d; d.mode = m; d.spdif = spdifName(c); d.reason = why; return d;
  };

  const QString codec = t.codec.toLower();
  QString why;
  if (codec == "dts") {
    const bool hd = t.profile.startsWith("DTS-HD", Qt::CaseInsensitive);
    if (hd && ok(Codec::DTSHD, &why)) return pass(Codec::DTSHD, Decision::Passthrough, "DTS-HD passthrough");
    QString whyCore;
    if (ok(Codec::DTS, &whyCore)) return pass(Codec::DTS, hd ? Decision::PassthroughCore : Decision::Passthrough,
                                               hd ? "DTS core (" + why + ")" : "DTS passthrough");
    return pcm(hd ? why + "; " + whyCore : whyCore, 8);
  }
  static const QMap<QString, Codec> simple{{"ac3", Codec::AC3}, {"eac3", Codec::EAC3}, {"truehd", Codec::TrueHD}};
  if (simple.contains(codec)) {
    const Codec c = simple[codec];
    if (ok(c, &why)) return pass(c, Decision::Passthrough, codecName(c) + " passthrough");
    return pcm(why, 8);  // TrueHD and E-AC-3 decode to multichannel LPCM, up to what the receiver takes
  }
  return pcm("decoded (" + codec + ")", 8);
}

Decision decide(const Track& t, const QSet<Codec>& user, const std::optional<Eld>& eld, Backend backend, Standby standby)
{
  Decision d = decideReady(t, user, eld, backend);
  // An ELD that was read but isn't valid now (EldMonitor hands back the remembered one, marked stale): the receiver is
  // in standby, off or unplugged (PLAN 3.9).
  const bool notReady = eld && (!eld->valid || eld->stale);
  if (!notReady || d.mode == Decision::Pcm || standby == Standby::Bitstream) return d;
  const int sinkCh = eld->stale && eld->lpcmChannels > 0 ? eld->lpcmChannels : 8;
  Decision p;
  p.mode = Decision::Pcm;
  p.pcmChannels = qBound(1, qMin(t.channels, sinkCh), 8);
  p.waitForReceiver = standby == Standby::Wake;
  p.reason = p.waitForReceiver ? "receiver not ready (standby, off or unplugged): PCM until it wakes, then " + d.spdif
                               : QString("receiver not ready (standby, off or unplugged): PCM (Receiver in Standby: Always PCM)");
  return p;
}
}
