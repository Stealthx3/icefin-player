// Icefin controller layer: the double-input guard for Steam's desktop layout (PLAN 7.4, SPEC "Steam Input").
//
// With Steam running on the desktop, its desktop layout turns pad presses into keystrokes (D-pad -> arrows, A -> Enter,
// B -> Escape) while SDL reports the same press: every press would act twice. A keyboard event and the same pad
// action within 50 ms, in either order: the second one is dropped, with its release (and a key's auto-repeat). That
// coincidence is how Icefin detects the desktop layout, so keyboard use alone is never filtered: a key is only dropped
// when a pad sent the same action within the window, and only while a pad is connected.
// Pure logic with the clock passed in, so it is unit-testable; GamepadService feeds it from the SDL thread and a key
// filter on the application from the GUI thread.
#pragma once
#include <QHash>
#include <QMutex>
#include <QObject>
#include <QSet>
#include <QString>

namespace Icefin::Input
{
class DuplicateGuard
{
public:
  static constexpr qint64 kWindowMs = 50;
  static DuplicateGuard& instance();
  static qint64 nowMs();  // monotonic

  static QString actionForPad(const QString& padKeycode);  // "up", "down", "left", "right", "select", "back" or ""
  static QString actionForKey(int qtKey);

  bool pad(const QString& padKeycode, bool down, qint64 nowMs);           // true: drop this pad event
  bool key(int qtKey, bool press, bool autoRepeat, qint64 nowMs);         // true: drop this key event
  void setPadsConnected(int n);
  int dropped() const;
  void reset();

private:
  void noteDrop(const QString& what);
  mutable QMutex m_lock;
  QHash<QString, qint64> m_pad, m_key;  // action -> time of the last unmatched press from each side
  QSet<QString> m_droppedPad;           // pad keycodes whose press was dropped: drop their release
  QSet<int> m_droppedKey;               // keys whose press was dropped: drop repeats and the release
  int m_pads = 0, m_dropped = 0;
};

// Installed on the application by GamepadService: key events to a window go through the guard.
class DuplicateKeyFilter : public QObject
{
public:
  using QObject::QObject;
  bool eventFilter(QObject* obj, QEvent* ev) override;
};
}
