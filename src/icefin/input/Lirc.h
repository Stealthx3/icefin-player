// Icefin: key states for IR remotes through lircd (PLAN 11.5 option R, SPEC "Remotes").
//
// lircd sends one line per IR burst while a button is held, and no release unless it is set up to append a release
// suffix (upstream's InputLIRC recognises "_LIRCUP"). Upstream sent every press as KeyDown, and InputComponent's
// auto-repeat (Enable Input Repeat, on by default) starts 650 ms after a KeyDown and stops only on a KeyUp, so one
// press on an IR remote kept repeating until the next button. A press is one-shot (KeyPressed, as HDMI-CEC sends
// them), and a held button repeats at the remote's own rate (lircd's bursts, every third kept). Once this lircd has
// sent a release, presses are KeyDown again, so long presses and held-key repeat work as with a keyboard.
#pragma once
#include "input/InputComponent.h"
#include <QString>

namespace Icefin::Input
{
class LircKeys
{
public:
  InputBase::InputkeyState stateFor(const QString& command);
  bool releasesSeen() const { return m_releases; }

private:
  bool m_releases = false;
};
}
