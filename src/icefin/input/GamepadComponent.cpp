#include "GamepadComponent.h"
#ifdef ICEFIN_SDL3
#include "GamepadService.h"
#endif

namespace Icefin::Input
{
void GamepadComponent::componentPostInitialize()
{
#ifdef ICEFIN_SDL3
  if (auto* s = GamepadService::instance()) {
    connect(s, &GamepadService::padsChanged, this, &GamepadComponent::changed);
    connect(s, &GamepadService::familyChanged, this, &GamepadComponent::familyChanged);
  }
#endif
}

QVariantList GamepadComponent::list() const
{
#ifdef ICEFIN_SDL3
  if (auto* s = GamepadService::instance()) return s->pads();
#endif
  return {};
}

QString GamepadComponent::family() const
{
#ifdef ICEFIN_SDL3
  if (auto* s = GamepadService::instance()) return s->lastFamily();
#endif
  return QString();
}

bool GamepadComponent::available() const
{
#ifdef ICEFIN_SDL3
  return GamepadService::instance() != nullptr;
#else
  return false;
#endif
}
}
