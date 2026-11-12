#include "GamepadService.h"
#include "GamepadNames.h"
#include "GamepadComponent.h"
#include "DuplicateGuard.h"
#include <QCoreApplication>
#include <QDebug>
#include <QHash>
#include <SDL3/SDL.h>
#include "settings/SettingsComponent.h"
#include "settings/SettingsSection.h"

namespace Icefin::Input
{
static GamepadService* s_instance = nullptr;
GamepadService* GamepadService::instance() { return s_instance; }

class GamepadWorker : public QObject
{
public:
  explicit GamepadWorker(GamepadService* svc) : m_svc(svc) {}
  void run();
  std::atomic<bool> stop{false};

private:
  struct Pad { SDL_Gamepad* pad; QString name, family, mapping; QHash<QString, QString> axisDir; };
  void refresh();
  void emitKey(const Pad& p, const QString& keycode, bool down);
  GamepadService* m_svc;
  QHash<SDL_JoystickID, Pad> m_pads;
};

static QString batteryName(SDL_PowerState s)
{
  switch (s) {
    case SDL_POWERSTATE_ON_BATTERY: return "battery";
    case SDL_POWERSTATE_CHARGING: return "charging";
    case SDL_POWERSTATE_CHARGED: return "charged";
    case SDL_POWERSTATE_NO_BATTERY: return "wired";
    default: return "unknown";
  }
}

void GamepadWorker::refresh()
{
  QVariantList list;
  for (auto it = m_pads.begin(); it != m_pads.end(); ++it) {
    int percent = -1;
    const SDL_PowerState ps = SDL_GetGamepadPowerInfo(it->pad, &percent);
    list << QVariantMap{{"id", int(it.key())}, {"name", it->name}, {"family", it->family}, {"mapping", it->mapping},
                        {"battery", batteryName(ps)}, {"percent", percent}};
    if (ps == SDL_POWERSTATE_ON_BATTERY && percent >= 0 && percent <= 10)
      qWarning().noquote() << "Icefin gamepad:" << it->name << "battery low:" << percent << "%";
  }
  { QMutexLocker l(&m_svc->m_lock); m_svc->m_pads = list; }
  DuplicateGuard::instance().setPadsConnected(int(m_pads.size()));
  QMetaObject::invokeMethod(m_svc, &GamepadService::padsChanged, Qt::QueuedConnection);
}

void GamepadWorker::emitKey(const Pad& p, const QString& keycode, bool down)
{
  const QString k = applyNintendoLayout(keycode, p.family, m_svc->m_nintendo.load());
  if (DuplicateGuard::instance().pad(k, down, DuplicateGuard::nowMs())) return;  // Steam's desktop layout sent it as a key
  QMetaObject::invokeMethod(m_svc, [svc = m_svc, k, down, name = p.name] {
    // Per-controller remap (7.2): a remapped button sends its action directly ("direct" source: no map lookup).
    const QString action = GamepadComponent::remapped(name, k);
    if (action == "none") return;  // remapped to nothing
    if (!action.isEmpty()) emit svc->receivedInput("direct", action, down ? InputBase::KeyDown : InputBase::KeyUp);
    else emit svc->receivedInput("Gamepad", k, down ? InputBase::KeyDown : InputBase::KeyUp);
  }, Qt::QueuedConnection);
  if (down) {
    bool changed = false;
    { QMutexLocker l(&m_svc->m_lock); changed = m_svc->m_family != p.family; m_svc->m_family = p.family; }
    if (changed) QMetaObject::invokeMethod(m_svc, [svc = m_svc, f = p.family] { emit svc->familyChanged(f); }, Qt::QueuedConnection);
  }
}

void GamepadWorker::run()
{
  SDL_SetHint(SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS, "1");
  if (!SDL_Init(SDL_INIT_GAMEPAD | SDL_INIT_EVENTS)) {
    qCritical() << "Icefin gamepad: SDL3 init failed:" << SDL_GetError();
    return;
  }
  qInfo().noquote() << "Icefin gamepad: SDL" << SDL_MAJOR_VERSION << SDL_MINOR_VERSION << "gamepad layer running";
  while (!stop) {
    SDL_Event ev;
    if (!SDL_WaitEventTimeout(&ev, 200)) continue;
    switch (ev.type) {
      case SDL_EVENT_GAMEPAD_ADDED: {
        SDL_Gamepad* g = SDL_OpenGamepad(ev.gdevice.which);
        if (!g) break;
        Pad p{g, QString::fromUtf8(SDL_GetGamepadName(g)), QString(), QString(), {}};
        p.family = familyFor(QString::fromUtf8(SDL_GetGamepadStringForType(SDL_GetGamepadType(g))), p.name);
        if (p.family == "generic" && isSteamVirtualGamepad(SDL_GetGamepadVendor(g), SDL_GetGamepadProduct(g))) {
          // Launched from Steam inside the Flatpak: SDL can't read Steam's /tmp file naming the pad behind it.
          p.family = familyBehindSteam(qEnvironmentVariable("SDL_GAMECONTROLLER_IGNORE_DEVICES"));
          qInfo().noquote() << "Icefin gamepad: Steam Virtual Gamepad; the pads Steam took over are" << p.family;
        }
        char* m = SDL_GetGamepadMapping(g);
        p.mapping = m ? "SDL mapping database" : "none";
        if (m) SDL_free(m);
        m_pads.insert(ev.gdevice.which, p);
        qInfo().noquote() << "Icefin gamepad: connected" << p.name << "(" + p.family + ")";
        refresh();
        break;
      }
      case SDL_EVENT_GAMEPAD_REMOVED:
        if (m_pads.contains(ev.gdevice.which)) {
          qInfo().noquote() << "Icefin gamepad: disconnected" << m_pads[ev.gdevice.which].name;
          SDL_CloseGamepad(m_pads.take(ev.gdevice.which).pad);
          refresh();
        }
        break;
      case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
      case SDL_EVENT_GAMEPAD_BUTTON_UP:
        if (m_pads.contains(ev.gbutton.which)) {
          const QString k = keycodeForButton(QString::fromUtf8(SDL_GetGamepadStringForButton(SDL_GamepadButton(ev.gbutton.button))));
          emitKey(m_pads[ev.gbutton.which], k, ev.type == SDL_EVENT_GAMEPAD_BUTTON_DOWN);
        }
        break;
      case SDL_EVENT_GAMEPAD_AXIS_MOTION:
        if (m_pads.contains(ev.gaxis.which)) {
          Pad& p = m_pads[ev.gaxis.which];
          const QString axis = QString::fromUtf8(SDL_GetGamepadStringForAxis(SDL_GamepadAxis(ev.gaxis.axis)));
          const QString dir = stickDirection(axis, ev.gaxis.value);
          const QString old = p.axisDir.value(axis);
          if (dir != old) {
            if (!old.isEmpty()) emitKey(p, old, false);
            if (!dir.isEmpty()) emitKey(p, dir, true);
            p.axisDir[axis] = dir;
          }
        }
        break;
      case SDL_EVENT_JOYSTICK_BATTERY_UPDATED:
        refresh();
        break;
      default:
        break;
    }
  }
  for (const Pad& p : m_pads) SDL_CloseGamepad(p.pad);
  m_pads.clear();
  SDL_Quit();
}

GamepadService::GamepadService(QObject* parent) : InputBase(parent) { s_instance = this; }

GamepadService::~GamepadService()
{
  if (m_worker) m_worker->stop = true;
  m_thread.quit();
  m_thread.wait(2000);
  if (s_instance == this) s_instance = nullptr;
}

bool GamepadService::initInput()
{
  // Settings live on the main thread; the worker reads this cached copy.
  auto readLayout = [this] { m_nintendo = SettingsComponent::Get().value(SETTINGS_SECTION_MAIN, "icefin_nintendo_layout").toBool(); };
  readLayout();
  if (auto* sec = SettingsComponent::Get().getSection(SETTINGS_SECTION_MAIN))
    connect(sec, &SettingsSection::valuesUpdated, this, readLayout);
  // Steam's desktop layout: keys that repeat a pad press are dropped (7.4). Filters every window's key events.
  QCoreApplication::instance()->installEventFilter(new DuplicateKeyFilter(this));
  m_worker = new GamepadWorker(this);
  m_worker->moveToThread(&m_thread);
  connect(&m_thread, &QThread::started, m_worker, [this] { m_worker->run(); });
  connect(&m_thread, &QThread::finished, m_worker, &QObject::deleteLater);
  m_thread.start();
  return true;
}

QVariantList GamepadService::pads() const { QMutexLocker l(&m_lock); return m_pads; }
QString GamepadService::lastFamily() const { QMutexLocker l(&m_lock); return m_family; }
bool GamepadService::nintendoLayout() const { return m_nintendo; }
}
