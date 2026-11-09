// Icefin controller layer: names shared by the SDL3 service and its tests (PLAN 7.1-7.3, SPEC "Controller support").
// Pure helpers, no SDL here, so they build and test anywhere.
#pragma once
#include <QString>

namespace Icefin::Input
{
// Glyph family for button prompts (7.3): "xbox", "playstation", "nintendo", "steamdeck", "generic".
// sdlType is SDL3's SDL_GamepadType as its string name (SDL_GetGamepadStringForType), e.g. "ps5", "xboxone".
QString familyFor(const QString& sdlType, const QString& name);

// Keycode for a standard button: "PAD_SOUTH", "PAD_DPAD_UP", "PAD_START", ... from SDL3's button string
// (SDL_GetGamepadStringForButton: "a", "b", "x", "y", "dpup", "leftshoulder", ...). SDL3 names buttons by position:
// "a" is the south button whatever is printed on it.
QString keycodeForButton(const QString& sdlButton);

// With the Nintendo layout option on, a Nintendo pad's printed A (east) confirms and B (south) goes back:
// south and east swap. Other families and other buttons are unchanged.
QString applyNintendoLayout(const QString& keycode, const QString& family, bool nintendoLayout);

// Stick and trigger thresholds -> direction keycodes; "" while centered. value in [-32768, 32767].
QString stickDirection(const QString& axis, int value, int deadzone = 16000);
}
