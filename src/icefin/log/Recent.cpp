#include "Recent.h"
#include <QMutex>
#include <QTime>
#include <deque>

namespace Icefin::Log
{
static QMutex s_lock;
static std::deque<QString> s_lines;

bool keepRecent(QtMsgType type, const QString& msg)
{
  switch (type) {
    case QtWarningMsg:
    case QtCriticalMsg:
    case QtFatalMsg:
      return true;
    case QtInfoMsg:
    {
      // qInfo() << QString quotes it ("Entering state: error (...)" is logged that way).
      const QStringView m = msg.startsWith('"') ? QStringView(msg).mid(1) : QStringView(msg);
      return m.startsWith(QLatin1String("Icefin")) || m.startsWith(QLatin1String("Entering state"));
    }
    default:
      return false;
  }
}

void remember(QtMsgType type, const QString& msg)
{
  if (!keepRecent(type, msg)) return;
  static const char* names[] = {"debug", "warning", "critical", "fatal", "info"};
  const int i = int(type);
  const QString line = QTime::currentTime().toString(QStringLiteral("hh:mm:ss.zzz")) + " [" + (i >= 0 && i < 5 ? names[i] : "?") + "] "
                       + (msg.size() > 1000 ? msg.left(1000) + "..." : msg);
  QMutexLocker l(&s_lock);
  s_lines.push_back(line);
  while (s_lines.size() > size_t(kRecentLines)) s_lines.pop_front();
}

QStringList recentLines()
{
  QMutexLocker l(&s_lock);
  return QStringList(s_lines.begin(), s_lines.end());
}

void clearRecent()
{
  QMutexLocker l(&s_lock);
  s_lines.clear();
}
}
