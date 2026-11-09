// Icefin theme engine: the C++ service on the QWebChannel ("theme"), PLAN 6.5 (SPEC "Theme-engine layer").
//
// Finds packages (bundled in resources, the user's themes folder, ICEFIN_THEME_PATH for development), keeps the
// active theme and preset, resolves its tokens, and gives the page a stylesheet: the token custom properties plus
// the engine's jellyfin-web adapter (native/icefin/jellyfin-web.css). No active theme = engine off = stock UI.
// Native layers (backdrop, capability prompt) read tokens() and follow changed().
// Later: per-user settings in DisplayPreferences (8.5), assets over icefin-theme: (8.3), UI sounds (8.5).
#pragma once
#include "core/ComponentManager.h"
#include "ThemePackage.h"
#include <QVariantList>
#include <QVariantMap>

namespace Icefin::Theme
{
class ThemeComponent : public ComponentBase
{
  Q_OBJECT
  DEFINE_SINGLETON(ThemeComponent);

public:
  bool componentInitialize() override;
  const char* componentName() override { return "theme"; }
  bool componentExport() override { return true; }

  // [{id, name, version, source, presets[], ok, errors[]}]
  Q_INVOKABLE QVariantList themes();
  Q_INVOKABLE QString activeTheme() const { return m_active; }
  Q_INVOKABLE QString activePreset() const { return m_preset; }
  // Empty id turns the engine off. Returns false (and keeps the current theme) if the theme can't be used.
  Q_INVOKABLE bool setActiveTheme(const QString& id, const QString& preset = QString());
  Q_INVOKABLE QVariantMap tokens() const;  // resolved tokens of the active theme; empty when off
  Q_INVOKABLE QString stylesheet() const;  // CSS for the page; empty when off
  Q_INVOKABLE QStringList lastErrors() const { return m_errors; }
  Q_INVOKABLE void rescan();

  // Search roots, in priority order (an id found earlier wins).
  static QStringList roots();

Q_SIGNALS:
  void changed(const QString& id, const QString& preset);

private:
  ThemeComponent() = default;
  bool apply(const QString& id, const QString& preset, bool save);
  QMap<QString, Package> m_packages;
  QString m_active, m_preset;
  TokenMap m_tokens;
  QStringList m_errors;
};
}
