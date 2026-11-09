// Icefin controller layer: "gamepads" on the QWebChannel (PLAN 7.3, 7.5). Always built; without the SDL3 layer
// (ICEFIN_SDL3 off) it reports available() == false and no pads.
#pragma once
#include "core/ComponentManager.h"
#include <QVariantList>

namespace Icefin::Input
{
// "gamepads" on the QWebChannel: the page side of the controller layer.
class GamepadComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(GamepadComponent);
public:
  bool componentInitialize() override { return true; }
  void componentPostInitialize() override;
  const char* componentName() override { return "gamepads"; }
  bool componentExport() override { return true; }
  Q_INVOKABLE QVariantList list() const;
  Q_INVOKABLE QString family() const;
  Q_INVOKABLE bool available() const;  // built with the SDL3 layer and running
Q_SIGNALS:
  void changed();
  void familyChanged(const QString& family);
private:
  GamepadComponent() = default;
};
}
