// Icefin controller layer: the SDL3 gamepad service (PLAN 7.1, SPEC "Controller support"). Replaces upstream's SDL2
// InputSDL when the build flag ICEFIN_SDL3 is on (SDL2 and SDL3 can't share a process: same symbol names).
//
// SDL3's gamepad API reports standard buttons for every recognized pad (community mapping database, user mappings
// through SDL_GAMECONTROLLERCONFIG). Events go to InputComponent as source "Gamepad" with PAD_* keycodes;
// :/inputmaps/icefin-gamepad.json maps them to actions (users override per controller in their inputmaps folder).
// Background events stay on, so pads work while another window has focus. Hotplug and several pads are handled;
// "gamepads" on the WebChannel lists them with family, mapping source and battery for the Controllers page (7.5)
// and the glyph tokens (7.3).
#pragma once
#include "input/InputComponent.h"
#include <QMutex>
#include <atomic>
#include <QThread>
#include <QVariantList>

namespace Icefin::Input
{
class GamepadWorker;

class GamepadService : public InputBase
{
  Q_OBJECT
public:
  explicit GamepadService(QObject* parent = nullptr);
  ~GamepadService() override;
  bool initInput() override;
  const char* inputName() override { return "Gamepad"; }
  static GamepadService* instance();

  QVariantList pads() const;         // [{id, name, family, mapping, battery, percent}]
  QString lastFamily() const;        // glyph family of the pad used last ("" before any input)
  bool nintendoLayout() const;

Q_SIGNALS:
  void padsChanged();
  void familyChanged(const QString& family);

private:
  friend class GamepadWorker;
  QThread m_thread;
  GamepadWorker* m_worker = nullptr;
  mutable QMutex m_lock;
  QVariantList m_pads;
  QString m_family;
  std::atomic<bool> m_nintendo{false};
};
}
