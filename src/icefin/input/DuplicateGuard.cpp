#include "DuplicateGuard.h"
#include <QDebug>
#include <QElapsedTimer>
#include <QKeyEvent>

namespace Icefin::Input
{
DuplicateGuard& DuplicateGuard::instance()
{
  static DuplicateGuard g;
  return g;
}

qint64 DuplicateGuard::nowMs()
{
  static QElapsedTimer t = [] { QElapsedTimer e; e.start(); return e; }();
  return t.elapsed();
}

QString DuplicateGuard::actionForPad(const QString& k)
{
  if (k == "PAD_DPAD_UP" || k == "PAD_LEFTSTICK_UP") return "up";
  if (k == "PAD_DPAD_DOWN" || k == "PAD_LEFTSTICK_DOWN") return "down";
  if (k == "PAD_DPAD_LEFT" || k == "PAD_LEFTSTICK_LEFT") return "left";
  if (k == "PAD_DPAD_RIGHT" || k == "PAD_LEFTSTICK_RIGHT") return "right";
  if (k == "PAD_SOUTH") return "select";
  if (k == "PAD_EAST") return "back";
  return QString();
}

QString DuplicateGuard::actionForKey(int k)
{
  switch (k) {
    case Qt::Key_Up: return "up";
    case Qt::Key_Down: return "down";
    case Qt::Key_Left: return "left";
    case Qt::Key_Right: return "right";
    case Qt::Key_Return:
    case Qt::Key_Enter: return "select";
    case Qt::Key_Escape: return "back";
    default: return QString();
  }
}

void DuplicateGuard::noteDrop(const QString& what)
{
  if (++m_dropped == 1)
    qInfo().noquote() << "Icefin gamepad: Steam's desktop layout sends keys for pad presses; duplicate guard on (dropped" << what + ")";
}

bool DuplicateGuard::pad(const QString& k, bool down, qint64 now)
{
  const QString a = actionForPad(k);
  if (a.isEmpty()) return false;
  QMutexLocker l(&m_lock);
  if (!down) return m_droppedPad.remove(k);
  auto it = m_key.find(a);
  if (it != m_key.end() && now - *it <= kWindowMs) {
    m_key.erase(it);  // one key press cancels one pad press
    m_droppedPad.insert(k);
    noteDrop("pad " + k);
    return true;
  }
  m_pad.insert(a, now);
  return false;
}

bool DuplicateGuard::key(int k, bool press, bool autoRepeat, qint64 now)
{
  QMutexLocker l(&m_lock);
  if (m_droppedKey.contains(k)) {
    if (!press && !autoRepeat) m_droppedKey.remove(k);
    return true;
  }
  const QString a = actionForKey(k);
  if (a.isEmpty() || !press || autoRepeat || m_pads == 0) return false;
  auto it = m_pad.find(a);
  if (it != m_pad.end() && now - *it <= kWindowMs) {
    m_pad.erase(it);
    m_droppedKey.insert(k);
    noteDrop("key " + QString::number(k, 16));
    return true;
  }
  m_key.insert(a, now);
  return false;
}

void DuplicateGuard::setPadsConnected(int n) { QMutexLocker l(&m_lock); m_pads = n; }
int DuplicateGuard::dropped() const { QMutexLocker l(&m_lock); return m_dropped; }

void DuplicateGuard::reset()
{
  QMutexLocker l(&m_lock);
  m_pad.clear(); m_key.clear(); m_droppedPad.clear(); m_droppedKey.clear();
  m_pads = 0; m_dropped = 0;
}

bool DuplicateKeyFilter::eventFilter(QObject* obj, QEvent* ev)
{
  // Once per key event: at the window, before Qt Quick hands it to the web view.
  if ((ev->type() == QEvent::KeyPress || ev->type() == QEvent::KeyRelease) && obj->isWindowType()) {
    auto* ke = static_cast<QKeyEvent*>(ev);
    if (DuplicateGuard::instance().key(ke->key(), ev->type() == QEvent::KeyPress, ke->isAutoRepeat(), DuplicateGuard::nowMs()))
      return true;
  }
  return QObject::eventFilter(obj, ev);
}
}
