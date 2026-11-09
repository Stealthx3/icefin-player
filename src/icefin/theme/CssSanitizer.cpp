#include "CssSanitizer.h"
#include <QDir>
#include <QFileInfo>
#include <QRegularExpression>

namespace Icefin::Theme
{
// Any CSS escape that decodes to ASCII could spell url(, @import, expression( ... past the checks below.
static QString asciiEscape(const QString& css)
{
  static const QRegularExpression hex(QStringLiteral("\\\\([0-9a-fA-F]{1,6})"));
  for (auto it = hex.globalMatch(css); it.hasNext();) {
    const auto m = it.next();
    if (m.captured(1).toUInt(nullptr, 16) < 0x80) return m.captured(0);
  }
  static const QRegularExpression lit(QStringLiteral("\\\\([^0-9a-fA-F\\r\\n])"));
  for (auto it = lit.globalMatch(css); it.hasNext();) {
    const auto m = it.next();
    const QChar c = m.captured(1)[0];
    if (c.isLetter() || QStringLiteral("(:/@\\").contains(c)) return m.captured(0);
  }
  return QString();
}

SanitizedCss sanitizeCss(const QString& input, const QString& themeId, const QString& cssPath)
{
  SanitizedCss out;
  if (const QString e = asciiEscape(input); !e.isEmpty()) {
    out.refusedReason = QString("escape sequence '%1' could hide a remote fetch").arg(e);
    return out;
  }
  QString css = input;
  css.remove(QRegularExpression(QStringLiteral("/\\*.*?\\*/"), QRegularExpression::DotMatchesEverythingOption));

  static const QRegularExpression import(QStringLiteral("@import[^;]*;?"), QRegularExpression::CaseInsensitiveOption);
  if (css.contains(import)) { out.removed << "@import"; css.remove(import); }

  static const QRegularExpression imageSet(QStringLiteral("(-webkit-)?image-set\\s*\\([^)]*\\)"), QRegularExpression::CaseInsensitiveOption);
  if (css.contains(imageSet)) { out.removed << "image-set()"; css.replace(imageSet, "none"); }

  static const QRegularExpression bad(QStringLiteral("expression\\s*\\(|-moz-binding|behavior\\s*:"), QRegularExpression::CaseInsensitiveOption);
  if (css.contains(bad)) { out.removed << "expression()/-moz-binding/behavior"; css.replace(bad, "x-removed("); }

  const QString base = QFileInfo(cssPath).path();
  static const QRegularExpression url(QStringLiteral("url\\(\\s*(['\"]?)([^'\")]*)\\1\\s*\\)"), QRegularExpression::CaseInsensitiveOption);
  QString result;
  qsizetype pos = 0;
  for (auto it = url.globalMatch(css); it.hasNext();) {
    const auto m = it.next();
    result += css.mid(pos, m.capturedStart() - pos);
    const QString target = m.captured(2).trimmed();
    static const QRegularExpression scheme(QStringLiteral("^[a-zA-Z][a-zA-Z0-9+.-]*:"));
    QString rel = QDir::cleanPath((base == "." ? QString() : base + '/') + target);
    if (target.isEmpty() || target.startsWith('/') || target.contains(scheme) || rel.startsWith("..") || target.contains('?')) {
      out.removed << "url(" + target + ")";
      result += "none";
    } else {
      result += QString("url(\"icefin-theme://%1/%2\")").arg(themeId, rel);
    }
    pos = m.capturedEnd();
  }
  result += css.mid(pos);
  // A url( that the pattern above couldn't parse (unbalanced quotes etc.) is refused rather than guessed at.
  if (result.contains(QRegularExpression(QStringLiteral("url\\((?!\"icefin-theme://)"), QRegularExpression::CaseInsensitiveOption))) {
    out.refusedReason = "a url() the sanitizer can't read safely";
    return out;
  }
  out.css = result;
  return out;
}
}
