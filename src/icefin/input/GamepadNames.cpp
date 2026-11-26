#include "GamepadNames.h"
#include <QMap>

namespace Icefin::Input
{
QString familyFor(const QString& type, const QString& name)
{
  if (name.contains("Steam Deck", Qt::CaseInsensitive)) return "steamdeck";
  if (type.startsWith("xbox")) return "xbox";
  if (type.startsWith("ps")) return "playstation";
  // SDL3's type strings: "switchpro", "joyconleft", "joyconright", "joyconpair" (SDL_GetGamepadStringForType)
  if (type.startsWith("switch") || type.startsWith("joycon") || type.startsWith("nintendo")) return "nintendo";
  return "generic";
}

QString keycodeForButton(const QString& b)
{
  static const QMap<QString, QString> map{
    {"a", "PAD_SOUTH"}, {"b", "PAD_EAST"}, {"x", "PAD_WEST"}, {"y", "PAD_NORTH"},
    {"back", "PAD_BACK"}, {"guide", "PAD_GUIDE"}, {"start", "PAD_START"},
    {"leftstick", "PAD_LEFTSTICK"}, {"rightstick", "PAD_RIGHTSTICK"},
    {"leftshoulder", "PAD_LEFTSHOULDER"}, {"rightshoulder", "PAD_RIGHTSHOULDER"},
    {"dpup", "PAD_DPAD_UP"}, {"dpdown", "PAD_DPAD_DOWN"}, {"dpleft", "PAD_DPAD_LEFT"}, {"dpright", "PAD_DPAD_RIGHT"},
    {"misc1", "PAD_MISC1"}, {"touchpad", "PAD_TOUCHPAD"},
    {"paddle1", "PAD_PADDLE1"}, {"paddle2", "PAD_PADDLE2"}, {"paddle3", "PAD_PADDLE3"}, {"paddle4", "PAD_PADDLE4"},
  };
  return map.value(b, b.isEmpty() ? QString() : "PAD_" + b.toUpper());
}

QString applyNintendoLayout(const QString& k, const QString& family, bool on)
{
  if (!on || family != "nintendo") return k;
  if (k == "PAD_SOUTH") return "PAD_EAST";
  if (k == "PAD_EAST") return "PAD_SOUTH";
  return k;
}

QString stickDirection(const QString& axis, int v, int deadzone)
{
  if (axis == "lefttrigger" || axis == "righttrigger")
    return v > deadzone ? (axis == "lefttrigger" ? "PAD_LEFTTRIGGER" : "PAD_RIGHTTRIGGER") : QString();
  const bool x = axis.endsWith('x');
  const QString stick = axis.startsWith("left") ? "PAD_LEFTSTICK_" : "PAD_RIGHTSTICK_";
  if (v > deadzone) return stick + (x ? "RIGHT" : "DOWN");
  if (v < -deadzone) return stick + (x ? "LEFT" : "UP");
  return QString();
}

bool isSteamVirtualGamepad(quint16 vendor, quint16 product) { return vendor == 0x28de && product == 0x11ff; }

static QString familyForIds(quint16 vendor, quint16 product)
{
  if (vendor == 0x054c) return "playstation";  // Sony
  if (vendor == 0x057e) return "nintendo";
  if (vendor == 0x28de) return "steamdeck";    // Valve: the Deck's own controls, the Steam Controller
  Q_UNUSED(product);
  return "xbox";                               // Microsoft, and XInput-mode pads (8BitDo and others)
}

QString familyBehindSteam(const QString& ignoreDevices)
{
  QString family;
  for (const QString& entry : ignoreDevices.split(',', Qt::SkipEmptyParts)) {
    const QStringList ids = entry.trimmed().split('/');
    if (ids.size() != 2) continue;
    bool okV = false, okP = false;
    const quint16 v = ids[0].toUShort(&okV, 0), pr = ids[1].toUShort(&okP, 0);
    if (!okV || !okP || isSteamVirtualGamepad(v, pr)) continue;
    const QString f = familyForIds(v, pr);
    if (!family.isEmpty() && family != f) return "xbox";  // several kinds behind several virtual pads
    family = f;
  }
  return family.isEmpty() ? QString("xbox") : family;
}
}
