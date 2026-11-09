// Icefin theme engine: the icefin-theme: URL scheme (PLAN 8.3, spike 2.7). Theme assets reach the page without a
// network fetch and under a strict server CSP: icefin-theme://<theme id>/<file inside the package>.
#pragma once
#include <QWebEngineUrlSchemeHandler>
#include <functional>

namespace Icefin::Theme
{
struct Package;

// Call before QtWebEngineQuick::initialize() (ICEFIN-HOOK in main.cpp). Flags from spike 2.7: secure, CORS,
// CSP-ignored (a strict server CSP would block the assets otherwise), fetch() allowed.
void registerScheme();

// What a package may serve over the scheme (SPEC "Theme trust levels"). Bundled and development packages: all
// listed types. User-installed: fonts, images, sounds, JSON and CSS (sanitized when served); scripts and SVG only
// once the user has trusted that exact package content.
bool mayServe(const Package& p, const QString& relPath, bool trusted);
// MIME type for an allowed file extension; empty = not served.
QByteArray mimeFor(const QString& relPath);

class SchemeHandler : public QWebEngineUrlSchemeHandler
{
public:
  using Lookup = std::function<const Package*(const QString& id)>;
  using Trusted = std::function<bool(const Package& p)>;
  SchemeHandler(Lookup lookup, Trusted trusted, QObject* parent = nullptr)
    : QWebEngineUrlSchemeHandler(parent), m_lookup(std::move(lookup)), m_trusted(std::move(trusted)) {}
  void requestStarted(QWebEngineUrlRequestJob* job) override;

  // Resolve a request path to a file inside the package; empty if it escapes the package or isn't allowed.
  static QString fileFor(const Package& p, const QString& urlPath, bool trusted);

private:
  Lookup m_lookup;
  Trusted m_trusted;
};
}
