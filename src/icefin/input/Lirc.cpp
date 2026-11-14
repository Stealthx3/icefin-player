#include "Lirc.h"
#include <QDebug>

namespace Icefin::Input
{
InputBase::InputkeyState LircKeys::stateFor(const QString& command)
{
  if (command.endsWith("_LIRCUP")) {
    if (!m_releases) qInfo() << "Icefin LIRC: this lircd sends releases; presses follow the button (held keys repeat)";
    m_releases = true;
    return InputBase::KeyUp;
  }
  return m_releases ? InputBase::KeyDown : InputBase::KeyPressed;
}
}
