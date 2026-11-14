// DBusGuard: keep Qt WebEngine alive when one of its D-Bus connections drops.
//
// Chromium (inside Qt WebEngine) adds a filter to every D-Bus connection it opens that aborts the whole process when
// the connection is lost ("D-Bus connection was disconnected. Aborting.", dbus/bus.cc). Inside the Flatpak, Chromium's
// sandbox keeps such a connection (thread "FlatpakPortalBus") to org.freedesktop.portal.Flatpak, which it uses once,
// to spawn its zygote at startup; the connection goes through the sandbox's xdg-dbus-proxy. When the proxy goes first
// (a logout, or anything that signals the app's whole scope at once) or the connection drops for another reason,
// Icefin died with SIGTRAP and a core dump (KDE then shows a crash report), although nothing it needed was gone.
//
// Icefin's executable defines dbus_connection_add_filter and dbus_connection_remove_filter and exports them, so
// Qt WebEngine's calls bind to these first (ordinary ELF interposition; no preload, no rebuilt Qt WebEngine). A filter
// whose code lives in Qt WebEngine is wrapped: every message reaches it as before, except the local Disconnected
// signal, which is logged once and passed over. Everything else goes straight to libdbus. Linux only.
#include <QtGlobal>

#include <atomic>
#include <cstring>
#include <dlfcn.h>
#include <mutex>
#include <vector>

extern "C" {
struct DBusConnection;
struct DBusMessage;
typedef unsigned int dbus_bool_t;
typedef int DBusHandlerResult;  // DBUS_HANDLER_RESULT_HANDLED 0, _NOT_YET_HANDLED 1, _NEED_MEMORY 2
typedef DBusHandlerResult (*DBusHandleMessageFunction)(DBusConnection*, DBusMessage*, void*);
typedef void (*DBusFreeFunction)(void*);
}

namespace
{
constexpr DBusHandlerResult kNotYetHandled = 1;

struct Wrapped
{
  DBusConnection* connection;
  DBusHandleMessageFunction function;
  void* data;
  DBusFreeFunction freeData;
};

std::mutex g_mutex;
std::vector<Wrapped*> g_wrapped;
std::atomic<bool> g_reported{false};

template <typename T> T next(const char* name)
{
  return reinterpret_cast<T>(dlsym(RTLD_NEXT, name));
}

bool inWebEngine(DBusHandleMessageFunction function)
{
  Dl_info info{};
  return dladdr(reinterpret_cast<void*>(function), &info) && info.dli_fname && std::strstr(info.dli_fname, "libQt6WebEngineCore");
}

bool isDisconnected(DBusMessage* message)
{
  using IsSignal = dbus_bool_t (*)(DBusMessage*, const char*, const char*);
  static const IsSignal isSignal = next<IsSignal>("dbus_message_is_signal");
  return isSignal && isSignal(message, "org.freedesktop.DBus.Local", "Disconnected");
}

Wrapped* take(DBusConnection* connection, DBusHandleMessageFunction function, void* data)
{
  std::lock_guard<std::mutex> lock(g_mutex);
  for (auto it = g_wrapped.begin(); it != g_wrapped.end(); ++it)
  {
    Wrapped* w = *it;
    if (w->connection == connection && w->function == function && w->data == data)
    {
      g_wrapped.erase(it);
      return w;
    }
  }
  return nullptr;
}

DBusHandlerResult guardedFilter(DBusConnection* connection, DBusMessage* message, void* userData)
{
  auto* w = static_cast<Wrapped*>(userData);
  if (isDisconnected(message))
  {
    if (!g_reported.exchange(true))
      qWarning("Icefin: a Qt WebEngine D-Bus connection was lost; carrying on (Chromium would abort here)");
    return kNotYetHandled;
  }
  return w->function(connection, message, w->data);
}

void freeGuarded(void* userData)
{
  auto* w = static_cast<Wrapped*>(userData);
  take(w->connection, w->function, w->data);  // still listed when libdbus frees it with the connection
  if (w->freeData)
    w->freeData(w->data);
  delete w;
}
}  // namespace

extern "C" __attribute__((visibility("default"), used)) dbus_bool_t
dbus_connection_add_filter(DBusConnection* connection, DBusHandleMessageFunction function, void* userData, DBusFreeFunction freeData)
{
  using Add = dbus_bool_t (*)(DBusConnection*, DBusHandleMessageFunction, void*, DBusFreeFunction);
  static const Add add = next<Add>("dbus_connection_add_filter");
  if (!add)
    return 0;
  if (!function || !inWebEngine(function))
    return add(connection, function, userData, freeData);
  auto* w = new Wrapped{connection, function, userData, freeData};
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_wrapped.push_back(w);
  }
  if (add(connection, guardedFilter, w, freeGuarded))
    return 1;
  take(connection, function, userData);  // libdbus didn't keep it: as with the plain call, the caller's data stays theirs
  delete w;
  return 0;
}

extern "C" __attribute__((visibility("default"), used)) void
dbus_connection_remove_filter(DBusConnection* connection, DBusHandleMessageFunction function, void* userData)
{
  using Remove = void (*)(DBusConnection*, DBusHandleMessageFunction, void*);
  static const Remove remove = next<Remove>("dbus_connection_remove_filter");
  if (!remove)
    return;
  Wrapped* w = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    for (Wrapped* x : g_wrapped)
      if (x->connection == connection && x->function == function && x->data == userData)
        w = x;
  }
  if (w)
    remove(connection, guardedFilter, w);  // libdbus calls freeGuarded, which unlists and frees it
  else
    remove(connection, function, userData);
}
