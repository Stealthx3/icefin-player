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

// What a package may serve over the scheme, by source (SPEC "Theme trust levels"; the CSS sanitizer for user
// themes arrives in 8.5, so until then user themes serve fonts, images and sounds only).
bool mayServe(const Package& p, const QString& relPath);
// MIME type for an allowed file extension; empty = not served.
QByteArray mimeFor(const QString& relPath);

class SchemeHandler : public QWebEngineUrlSchemeHandler
{
public:
  using Lookup = std::function<const Package*(const QString& id)>;
  explicit SchemeHandler(Lookup lookup, QObject* parent = nullptr) : QWebEngineUrlSchemeHandler(parent), m_lookup(std::move(lookup)) {}
  void requestStarted(QWebEngineUrlRequestJob* job) override;

  // Resolve a request path to a file inside the package; empty if it escapes the package or isn't allowed.
  static QString fileFor(const Package& p, const QString& urlPath);

private:
  Lookup m_lookup;
};
}
