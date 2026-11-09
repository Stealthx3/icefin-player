#include "Iec958Formats.h"
#include <QDebug>
#include <QElapsedTimer>
#include <QMap>
#include <pulse/pulseaudio.h>
#include <pulse/ext-device-restore.h>

namespace Icefin::Audio
{
QString pulseFormatFor(const QString& c)
{
  static const QMap<QString, QString> m{{"ac3", "ac3-iec61937"}, {"eac3", "eac3-iec61937"}, {"dts", "dts-iec61937"},
                                       {"dts-hd", "dtshd-iec61937"}, {"truehd", "truehd-iec61937"}};
  return m.value(c);
}

QString sinkFromDevice(const QString& d)
{
  for (const char* p : {"pulse/", "pipewire/"})
    if (d.startsWith(p)) return d.mid(int(strlen(p)));
  return QString();
}

QStringList withCodecs(const QStringList& formats, const QStringList& codecs)
{
  QStringList out{"pcm"};
  for (const QString& f : formats) if (!out.contains(f)) out << f;
  for (const QString& c : codecs) {
    const QString f = pulseFormatFor(c);
    if (!f.isEmpty() && !out.contains(f)) out << f;
    if (c == "dts-hd" && !out.contains("dts-iec61937")) out << "dts-iec61937";  // the DTS core rides along
  }
  return out;
}

QString wirePlumberRule(const QString& sink, const QStringList& codecs)
{
  static const QMap<QString, QString> wp{{"ac3", "AC3"}, {"eac3", "EAC3"}, {"dts", "DTS"}, {"dts-hd", "DTS-HD"}, {"truehd", "TrueHD"}};
  QStringList list{"\"PCM\""};
  for (const QString& c : codecs) if (wp.contains(c) && !list.contains("\"" + wp[c] + "\"")) list << "\"" + wp[c] + "\"";
  if (codecs.contains("dts-hd") && !list.contains("\"DTS\"")) list << "\"DTS\"";
  return QString(
    "# ~/.config/wireplumber/wireplumber.conf.d/51-icefin-passthrough.conf  (Icefin Player)\n"
    "# Lets the HDMI output accept these bitstream formats. Restart WirePlumber afterwards:\n"
    "#   systemctl --user restart wireplumber\n"
    "monitor.alsa.rules = [\n"
    "  {\n"
    "    matches = [ { node.name = \"%1\" } ]\n"
    "    actions = { update-props = { iec958.codecs = [ %2 ] } }\n"
    "  }\n"
    "]\n").arg(sink, list.join(", "));
}

// ---- the sound-server side: a short-lived threaded-mainloop connection ----
namespace
{
struct Conn
{
  pa_threaded_mainloop* ml = nullptr;
  pa_context* ctx = nullptr;
  bool ready = false;
  ~Conn()
  {
    if (ml) pa_threaded_mainloop_stop(ml);
    if (ctx) { pa_context_disconnect(ctx); pa_context_unref(ctx); }
    if (ml) pa_threaded_mainloop_free(ml);
  }
  bool open(int timeoutMs)
  {
    ml = pa_threaded_mainloop_new();
    if (!ml) return false;
    ctx = pa_context_new(pa_threaded_mainloop_get_api(ml), "Icefin Player");
    pa_context_set_state_callback(ctx, [](pa_context*, void* ud) { pa_threaded_mainloop_signal(static_cast<pa_threaded_mainloop*>(ud), 0); }, ml);
    if (pa_context_connect(ctx, nullptr, PA_CONTEXT_NOAUTOSPAWN, nullptr) < 0) return false;
    pa_threaded_mainloop_start(ml);
    pa_threaded_mainloop_lock(ml);
    QElapsedTimer t; t.start();
    while (t.elapsed() < timeoutMs) {
      const pa_context_state_t s = pa_context_get_state(ctx);
      if (s == PA_CONTEXT_READY) { ready = true; break; }
      if (!PA_CONTEXT_IS_GOOD(s)) break;
      pa_threaded_mainloop_wait(ml);
    }
    pa_threaded_mainloop_unlock(ml);
    return ready;
  }
  // Run an operation and wait for it (lock held by the caller).
  bool wait(pa_operation* op, int timeoutMs)
  {
    if (!op) return false;
    QElapsedTimer t; t.start();
    while (pa_operation_get_state(op) == PA_OPERATION_RUNNING && t.elapsed() < timeoutMs) pa_threaded_mainloop_wait(ml);
    const bool done = pa_operation_get_state(op) == PA_OPERATION_DONE;
    pa_operation_unref(op);
    return done;
  }
};

struct Query { pa_threaded_mainloop* ml; uint32_t index = PA_INVALID_INDEX; QStringList formats; bool ok = false; };
}

static uint32_t sinkIndex(Conn& c, const QString& sink)
{
  Query q;
  q.ml = c.ml;
  const QByteArray name = sink.toUtf8();
  c.wait(pa_context_get_sink_info_by_name(c.ctx, name.constData(), [](pa_context*, const pa_sink_info* i, int eol, void* ud) {
    auto* qq = static_cast<Query*>(ud);
    if (!eol && i) qq->index = i->index;
    if (eol) pa_threaded_mainloop_signal(qq->ml, 0);
  }, &q), 800);
  return q.index;
}

static QStringList readFormats(Conn& c, uint32_t index, bool* ok)
{
  Query q;
  q.ml = c.ml;
  q.index = index;
  c.wait(pa_ext_device_restore_read_formats(c.ctx, PA_DEVICE_TYPE_SINK, index,
    [](pa_context*, const pa_ext_device_restore_info* info, int eol, void* ud) {
      auto* qq = static_cast<Query*>(ud);
      if (!eol && info) {
        qq->ok = true;
        for (uint8_t i = 0; i < info->n_formats; ++i)
          qq->formats << QString::fromUtf8(pa_encoding_to_string(info->formats[i]->encoding));
      }
      if (eol) pa_threaded_mainloop_signal(qq->ml, 0);
    }, &q), 800);
  if (ok) *ok = q.ok;
  return q.formats;
}

static bool saveFormats(Conn& c, uint32_t index, const QStringList& formats)
{
  QList<pa_format_info*> infos;
  for (const QString& f : formats) {
    pa_format_info* i = pa_format_info_new();
    i->encoding = pa_encoding_from_string(f.toUtf8().constData());
    if (i->encoding == PA_ENCODING_INVALID) { pa_format_info_free(i); continue; }
    infos << i;
  }
  struct S { pa_threaded_mainloop* ml; bool ok = false; } st{c.ml};
  c.wait(pa_ext_device_restore_save_formats(c.ctx, PA_DEVICE_TYPE_SINK, index, uint8_t(infos.size()), infos.data(),
    [](pa_context*, int success, void* ud) { auto* sp = static_cast<S*>(ud); sp->ok = success; pa_threaded_mainloop_signal(sp->ml, 0); }, &st), 800);
  for (pa_format_info* i : infos) pa_format_info_free(i);
  return st.ok;
}

static QString s_changedSink;
static QStringList s_original;

FormatChange ensureSinkFormats(const QString& sink, const QStringList& codecs)
{
  FormatChange r;
  r.sink = sink;
  Conn c;
  if (!c.open(800)) { r.error = "no sound server reachable"; return r; }
  pa_threaded_mainloop_lock(c.ml);
  const uint32_t idx = sinkIndex(c, sink);
  bool readOk = false;
  if (idx == PA_INVALID_INDEX) r.error = "sink not found";
  else {
    r.before = readFormats(c, idx, &readOk);
    const QStringList want = withCodecs(r.before, codecs);
    bool missing = false;
    for (const QString& f : want) if (!r.before.contains(f)) missing = true;
    if (!readOk) r.error = "the server has no device-restore extension";
    else if (!missing) { r.ok = true; r.after = r.before; }
    else if (!saveFormats(c, idx, want)) r.error = "the server refused the formats";
    else {
      r.after = readFormats(c, idx, nullptr);
      r.ok = true;
      for (const QString& f : want) if (!r.after.contains(f)) r.ok = false;
      if (!r.ok) r.error = "the server didn't keep the formats (not an IEC958/HDMI device, or WirePlumber overrides it)";
      if (s_changedSink.isEmpty()) { s_changedSink = sink; s_original = r.before; }
    }
  }
  pa_threaded_mainloop_unlock(c.ml);
  qInfo().noquote() << "Icefin audio: sink" << sink << "formats" << r.before.join(",") << "->" << r.after.join(",")
                    << (r.ok ? QString("(ok)") : "(" + r.error + ")");
  return r;
}

void restoreSinkFormats()
{
  if (s_changedSink.isEmpty()) return;
  const QString sink = s_changedSink;
  const QStringList original = s_original;
  s_changedSink.clear();
  Conn c;
  if (!c.open(800)) return;
  pa_threaded_mainloop_lock(c.ml);
  const uint32_t idx = sinkIndex(c, sink);
  if (idx != PA_INVALID_INDEX) saveFormats(c, idx, original.isEmpty() ? QStringList{"pcm"} : original);
  pa_threaded_mainloop_unlock(c.ml);
  qInfo().noquote() << "Icefin audio: sink" << sink << "formats restored to" << original.join(",");
}
}
