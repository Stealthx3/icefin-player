// Unit tests for the controller layer's naming rules (PLAN 7.1-7.3).
#include <QtTest>
#include "icefin/input/GamepadNames.h"
#include "icefin/input/DuplicateGuard.h"
#include "icefin/input/Lirc.h"

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
    QCOMPARE(familyFor("switchpro", "Nintendo Switch Pro Controller"), QString("nintendo"));  // SDL3's own strings
    QCOMPARE(familyFor("joyconleft", "Nintendo Switch Joy-Con (L)"), QString("nintendo"));
    QCOMPARE(familyFor("joyconright", "Nintendo Switch Joy-Con (R)"), QString("nintendo"));
    QCOMPARE(familyFor("joyconpair", "Nintendo Switch Joy-Con (L/R)"), QString("nintendo"));
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
  void steamVirtualFamily()
  {
    QVERIFY(isSteamVirtualGamepad(0x28de, 0x11ff));
    QVERIFY(!isSteamVirtualGamepad(0x28de, 0x1205));  // the Deck's own controls
    QCOMPARE(familyBehindSteam("0x054c/0x0ce6"), QString("playstation"));
    QCOMPARE(familyBehindSteam("0x057e/0x2009,0x057e/0x2009"), QString("nintendo"));
    QCOMPARE(familyBehindSteam("0x28de/0x1205"), QString("steamdeck"));
    QCOMPARE(familyBehindSteam("0x045e/0x0b13"), QString("xbox"));
    QCOMPARE(familyBehindSteam("0x2dc8/0x3106"), QString("xbox"));               // 8BitDo in X-input mode
    QCOMPARE(familyBehindSteam("0x054c/0x0ce6,0x057e/0x2009"), QString("xbox"));  // mixed
    QCOMPARE(familyBehindSteam(""), QString("xbox"));
    QCOMPARE(familyBehindSteam("0x28de/0x11ff, junk ,0x054c/0x09cc"), QString("playstation"));
  }
  void duplicateGuard()
  {
    DuplicateGuard g;
    // Keyboard alone: nothing is filtered, with or without a pad connected.
    QVERIFY(!g.key(Qt::Key_Down, true, false, 0));
    QVERIFY(!g.key(Qt::Key_Down, false, false, 10));
    g.setPadsConnected(1);
    QVERIFY(!g.key(Qt::Key_Down, true, false, 1000));
    QVERIFY(!g.key(Qt::Key_Down, false, false, 1080));
    // Pad first, Steam's key 20 ms later: the key, its repeat and its release are dropped.
    QVERIFY(!g.pad("PAD_DPAD_DOWN", true, 2000));
    QVERIFY(g.key(Qt::Key_Down, true, false, 2020));
    QVERIFY(g.key(Qt::Key_Down, true, true, 2300));
    QVERIFY(g.key(Qt::Key_Down, false, false, 2400));
    QVERIFY(!g.pad("PAD_DPAD_DOWN", false, 2400));
    QCOMPARE(g.dropped(), 1);
    // Key first, the pad 30 ms later: the pad press and its release are dropped.
    QVERIFY(!g.key(Qt::Key_Return, true, false, 3000));
    QVERIFY(g.pad("PAD_SOUTH", true, 3030));
    QVERIFY(g.pad("PAD_SOUTH", false, 3100));
    QVERIFY(!g.key(Qt::Key_Return, false, false, 3100));
    // Outside the window, or a different action: both act.
    QVERIFY(!g.pad("PAD_EAST", true, 4000));
    QVERIFY(!g.key(Qt::Key_Escape, true, false, 4051));
    QVERIFY(!g.pad("PAD_DPAD_LEFT", true, 5000));
    QVERIFY(!g.key(Qt::Key_Right, true, false, 5010));
    // One key cancels one pad press: a second key right after acts.
    QVERIFY(!g.pad("PAD_LEFTSTICK_UP", true, 6000));
    QVERIFY(g.key(Qt::Key_Up, true, false, 6010));
    QVERIFY(g.key(Qt::Key_Up, false, false, 6015));
    QVERIFY(!g.key(Qt::Key_Up, true, false, 6020));
    // Keys the desktop layout doesn't use are never touched.
    QVERIFY(!g.pad("PAD_NORTH", true, 7000));
    QVERIFY(!g.key(Qt::Key_I, true, false, 7001));
    QCOMPARE(g.dropped(), 3);
  }
  void lircKeys()
  {
    // lircd without releases: one-shot presses, so InputComponent's auto-repeat never starts (it ran forever).
    LircKeys k;
    QCOMPARE(k.stateFor("KEY_RIGHT"), InputBase::KeyPressed);
    QCOMPARE(k.stateFor("KEY_OK"), InputBase::KeyPressed);
    QVERIFY(!k.releasesSeen());
    // Once it sends a release, presses follow the button.
    QCOMPARE(k.stateFor("KEY_OK_LIRCUP"), InputBase::KeyUp);
    QVERIFY(k.releasesSeen());
    QCOMPARE(k.stateFor("KEY_LEFT"), InputBase::KeyDown);
    QCOMPARE(k.stateFor("KEY_LEFT_LIRCUP"), InputBase::KeyUp);
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
