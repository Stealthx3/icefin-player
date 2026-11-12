// Icefin controller layer: names shared by the SDL3 service and its tests (PLAN 7.1-7.3, SPEC "Controller support").
// Pure helpers, no SDL here, so they build and test anywhere.
#pragma once
#include <QString>
#include <QtGlobal>

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

// Steam Input (7.4, SPEC "Steam Input"). A game Steam launches sees one Steam Virtual Gamepad (28de:11ff) per physical
// pad Steam took over. SDL learns the pad behind it from the file named in SteamVirtualGamepadInfo, under /tmp, which
// the Flatpak's private /tmp hides, so SDL reports a generic pad there. Steam also lists the physical pads it hid in
// SDL_GAMECONTROLLER_IGNORE_DEVICES ("0x054c/0x0ce6,0x045e/0x0b13", which does reach the sandbox): their family is the
// virtual pad's. Mixed families or an empty list: "xbox", the layout Steam's virtual pad has.
bool isSteamVirtualGamepad(quint16 vendor, quint16 product);
QString familyBehindSteam(const QString& ignoreDevices);
}
