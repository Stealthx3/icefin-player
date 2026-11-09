// Unit tests for the controller layer's naming rules (PLAN 7.1-7.3).
#include <QtTest>
#include "icefin/input/GamepadNames.h"

using namespace Icefin::Input;

class TestGamepad : public QObject
{
  Q_OBJECT
private slots:
  void families()
  {
    QCOMPARE(familyFor("xbox360", "Xbox 360 Controller"), QString("xbox"));
    QCOMPARE(familyFor("xboxone", "Xbox Series X Controller"), QString("xbox"));
    QCOMPARE(familyFor("ps4", "PS4 Controller"), QString("playstation"));
    QCOMPARE(familyFor("ps5", "DualSense Wireless Controller"), QString("playstation"));
    QCOMPARE(familyFor("nintendo_switch_pro", "Nintendo Switch Pro Controller"), QString("nintendo"));
    QCOMPARE(familyFor("standard", "Steam Deck"), QString("steamdeck"));
    QCOMPARE(familyFor("standard", "8BitDo Pro 2"), QString("generic"));
    QCOMPARE(familyFor("unknown", ""), QString("generic"));
  }
  void buttons()
  {
    QCOMPARE(keycodeForButton("a"), QString("PAD_SOUTH"));
    QCOMPARE(keycodeForButton("b"), QString("PAD_EAST"));
    QCOMPARE(keycodeForButton("dpup"), QString("PAD_DPAD_UP"));
    QCOMPARE(keycodeForButton("leftshoulder"), QString("PAD_LEFTSHOULDER"));
    QCOMPARE(keycodeForButton("start"), QString("PAD_START"));
    QCOMPARE(keycodeForButton("newbutton"), QString("PAD_NEWBUTTON"));
  }
  void nintendoLayout()
  {
    QCOMPARE(applyNintendoLayout("PAD_SOUTH", "nintendo", true), QString("PAD_EAST"));
    QCOMPARE(applyNintendoLayout("PAD_EAST", "nintendo", true), QString("PAD_SOUTH"));
    QCOMPARE(applyNintendoLayout("PAD_SOUTH", "nintendo", false), QString("PAD_SOUTH"));
    QCOMPARE(applyNintendoLayout("PAD_SOUTH", "xbox", true), QString("PAD_SOUTH"));
    QCOMPARE(applyNintendoLayout("PAD_NORTH", "nintendo", true), QString("PAD_NORTH"));
  }
  void sticks()
  {
    QCOMPARE(stickDirection("leftx", 30000), QString("PAD_LEFTSTICK_RIGHT"));
    QCOMPARE(stickDirection("leftx", -30000), QString("PAD_LEFTSTICK_LEFT"));
    QCOMPARE(stickDirection("lefty", -30000), QString("PAD_LEFTSTICK_UP"));
    QCOMPARE(stickDirection("righty", 30000), QString("PAD_RIGHTSTICK_DOWN"));
    QVERIFY(stickDirection("leftx", 5000).isEmpty());
    QCOMPARE(stickDirection("righttrigger", 30000), QString("PAD_RIGHTTRIGGER"));
    QVERIFY(stickDirection("lefttrigger", 0).isEmpty());
  }
};

QTEST_GUILESS_MAIN(TestGamepad)
#include "test_gamepad.moc"
