#include "ThemeScheme.h"
#include "ThemePackage.h"
#include <QBuffer>
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QWebEngineUrlRequestJob>
#include <QWebEngineUrlScheme>

namespace Icefin::Theme
{
static const char* kScheme = "icefin-theme";

void registerScheme()
{
  QWebEngineUrlScheme s(kScheme);
  s.setSyntax(QWebEngineUrlScheme::Syntax::Host);
  s.setFlags(QWebEngineUrlScheme::SecureScheme | QWebEngineUrlScheme::CorsEnabled |
             QWebEngineUrlScheme::ContentSecurityPolicyIgnored | QWebEngineUrlScheme::FetchApiAllowed);
  QWebEngineUrlScheme::registerScheme(s);
}

QByteArray mimeFor(const QString& relPath)
{
  static const QMap<QString, QByteArray> types{
    {"css", "text/css"}, {"js", "text/javascript"}, {"json", "application/json"},
    {"png", "image/png"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"}, {"webp", "image/webp"}, {"svg", "image/svg+xml"},
    {"woff2", "font/woff2"}, {"woff", "font/woff"}, {"ttf", "font/ttf"}, {"otf", "font/otf"},
    {"wav", "audio/wav"}, {"ogg", "audio/ogg"}, {"opus", "audio/ogg"},
  };
  return types.value(QFileInfo(relPath).suffix().toLower());
}

bool mayServe(const Package& p, const QString& relPath)
{
  const QString ext = QFileInfo(relPath).suffix().toLower();
  if (mimeFor(relPath).isEmpty()) return false;
  if (p.source != Source::User) return true;  // bundled and development packages: everything listed above
  // User-installed: declarative assets only. Scripts need the trust flow and CSS the sanitizer (8.5); SVG can carry
  // script, so it waits too.
  static const QStringList declarative{"png", "jpg", "jpeg", "webp", "woff2", "woff", "ttf", "otf", "wav", "ogg", "opus", "json"};
  return declarative.contains(ext);
}

QString SchemeHandler::fileFor(const Package& p, const QString& urlPath)
{
  const QString rel = QDir::cleanPath(urlPath).remove(QRegularExpression("^/+"));
  if (rel.isEmpty() || rel.startsWith("..") || !mayServe(p, rel)) return QString();
  const QString root = QFileInfo(p.dir).canonicalFilePath();
  const QString file = QFileInfo(p.dir + '/' + rel).canonicalFilePath();  // resolves symlinks; empty if missing
  if (root.isEmpty() || file.isEmpty() || !file.startsWith(root + '/')) return QString();
  return file;
}

void SchemeHandler::requestStarted(QWebEngineUrlRequestJob* job)
{
  const QUrl url = job->requestUrl();
  if (job->requestMethod() != "GET") { job->fail(QWebEngineUrlRequestJob::RequestDenied); return; }
  const Package* p = m_lookup ? m_lookup(url.host()) : nullptr;
  if (!p || !p->ok()) { job->fail(QWebEngineUrlRequestJob::UrlNotFound); return; }
  const QString path = fileFor(*p, url.path());
  if (path.isEmpty()) {
    qWarning().noquote() << "Icefin theme scheme: refused" << url.toString();
    job->fail(QWebEngineUrlRequestJob::RequestDenied);
    return;
  }
  QFile f(path);
  if (!f.open(QIODevice::ReadOnly)) { job->fail(QWebEngineUrlRequestJob::UrlNotFound); return; }
  auto* buf = new QBuffer(job);
  buf->setData(f.readAll());
  job->reply(mimeFor(path), buf);
}
}
