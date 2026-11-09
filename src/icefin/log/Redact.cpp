#include "Redact.h"
#include <QRegularExpression>

namespace Icefin::Log
{
void redact(QString& msg)
{
  static const QList<QRegularExpression> patterns{
    QRegularExpression(QStringLiteral("(Token=\\\\?\")([^\"\\\\]+)")),
    QRegularExpression(QStringLiteral("((?:X-Emby-Token|X-MediaBrowser-Token)\\s*[:=]\\s*\"?)([A-Za-z0-9]+)"), QRegularExpression::CaseInsensitiveOption),
    QRegularExpression(QStringLiteral("(\\\\?\"(?:Pw|Password|NewPw|CurrentPw)\\\\?\"\\s*:\\s*\\\\?\")([^\"\\\\]*)"), QRegularExpression::CaseInsensitiveOption),
    QRegularExpression(QStringLiteral("((?:api_key|ApiKey|AccessToken)(?:=|\\\\?\"\\s*:\\s*\\\\?\"))([A-Za-z0-9]+)"), QRegularExpression::CaseInsensitiveOption),
  };
  if (!msg.contains("oken", Qt::CaseInsensitive) && !msg.contains("pi_key", Qt::CaseInsensitive) && !msg.contains("ApiKey", Qt::CaseInsensitive)
      && !msg.contains("Pw", Qt::CaseInsensitive) && !msg.contains("Password", Qt::CaseInsensitive))
    return;  // fast path: most log lines carry none of these
  for (const QRegularExpression& re : patterns) {
    QString out;
    qsizetype pos = 0;
    for (auto it = re.globalMatch(msg); it.hasNext();) {
      const auto m = it.next();
      out += msg.mid(pos, m.capturedStart(2) - pos);
      out += m.captured(2).isEmpty() ? QString() : QStringLiteral("[redacted]");
      pos = m.capturedEnd(2);
    }
    if (pos) msg = out + msg.mid(pos);
  }
}
}
