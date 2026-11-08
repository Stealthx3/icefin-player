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

Decision decide(const Track& t, const QSet<Codec>& user, const std::optional<Eld>& eld, Backend backend)
{
  const bool eldKnown = eld && (eld->valid || eld->stale);
  auto ok = [&](Codec c, QString* why) {
    if (!user.contains(c)) { *why = codecName(c) + " not enabled"; return false; }
    if (eldKnown && !eld->supports(c)) { *why = "receiver lacks " + codecName(c); return false; }
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
}
