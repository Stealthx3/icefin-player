// Icefin theme engine: the C++ service on the QWebChannel ("theme"), PLAN 6.5 (SPEC "Theme-engine layer").
//
// Finds packages (bundled in resources, the user's themes folder, ICEFIN_THEME_PATH for development), keeps the
// active theme and preset, resolves its tokens, and gives the page a stylesheet: the token custom properties plus
// the engine's jellyfin-web adapter (native/icefin/jellyfin-web.css). No active theme = engine off = stock UI.
// Native layers (backdrop, capability prompt) read tokens() and follow changed().
// Per-user choice (8.5): the web side (native/icefin/themeSync.js) tells it the signed-in user, and syncs the choice
// with the server's DisplayPreferences (client icefin-player, key icefin.theme); newest timestamp wins. Locally the
// choice is cached per user in state.icefin_theme, so startup is instant and works offline.
#pragma once
#include "core/ComponentManager.h"
#include "ThemePackage.h"
#include <QHash>
#include <QVariantList>
#include <QVariantMap>

class QSoundEffect;

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
  // Per-user selection: setUser() applies that user's cached choice; selection() is {theme, preset, timestamp}
  // (timestamp 0 = never chosen on this device); applyRemote() takes a newer choice from the server.
  Q_INVOKABLE void setUser(const QString& userId);
  Q_INVOKABLE QVariantMap selection() const;
  Q_INVOKABLE bool applyRemote(const QString& id, const QString& preset, double timestamp);
  // UI sound for an event (focus, select, back, navigate, error) from the active theme. Silent while the user
  // turned theme sounds off, or during passthrough and exclusive playback (Audio::AudioState).
  Q_INVOKABLE void playSound(const QString& event);
  // Diagnostics for the settings page and tests: {played, suppressed, last, reason}.
  Q_INVOKABLE QVariantMap soundState() const { return m_soundState; }
  Q_INVOKABLE QVariantMap tokens() const;  // resolved tokens of the active theme; empty when off
  Q_INVOKABLE QString stylesheet() const;  // CSS for the page; empty when off
  Q_INVOKABLE QStringList lastErrors() const { return m_errors; }
  Q_INVOKABLE void rescan();
  // For the web runtime (8.3): {id, source, styles, fonts[{family, url, weight, style}], scripts[]} as icefin-theme:
  // URLs, already filtered by the package's trust level; empty map when the engine is off.
  Q_INVOKABLE QVariantMap activePackage() const;
  // Trust a user-installed theme's scripts (SPEC "Theme trust levels"). Bound to the package's content hash: any
  // change to the package's files drops the trust. Show trustWarning() first.
  Q_INVOKABLE bool setTrusted(const QString& id, bool trusted);
  Q_INVOKABLE bool isTrusted(const QString& id) const;
  Q_INVOKABLE QString trustWarning() const;
  // Called from webview.qml (ICEFIN-HOOK) with the view's WebEngineProfile: serve icefin-theme: on it.
  Q_INVOKABLE void installSchemeHandler(QObject* profile);

  // Native backdrop (8.4, Backdrop.h) for Backdrop.qml: {} when the active theme has none (or it failed: lastErrors()),
  // else {shader: url, fps, visible, motion, params: {name: {type: "color"|"number", value}}}. backdropChanged() follows
  // theme changes and setBackdropState().
  Q_INVOKABLE QVariantMap backdrop() const;
  // From the web runtime: {visible: bool, motion: "low"|"normal", tokens: {"color.x": value}} (tokens: live values from
  // ui.timePalette, only those the backdrop's params name, checked like tokens.json values).
  Q_INVOKABLE void setBackdropState(const QVariantMap& state);
  // Backdrop.qml reports what it drew ({frames, fps, windowFps, shown}); tests and the debug overlay read it.
  Q_INVOKABLE void reportBackdropStats(const QVariantMap& stats) { m_backdropStats = stats; }
  Q_INVOKABLE QVariantMap backdropStats() const { QVariantMap s = m_backdropStats; if (!m_grab.isEmpty()) s["grab"] = m_grab; return s; }
  Q_INVOKABLE void grabDone(const QString& path) { m_grab = path; }  // from Backdrop.qml
  // Tests and diagnostics: Backdrop.qml renders the whole window (Qt's own scene: backdrop, video item, web view) into
  // a PNG in the cache; returns its path. backdropStats().grab names it once written. No path comes from the page.
  // Only with --remote-debugging-port (tests): otherwise it returns "" and grabPixel() [].
  Q_INVOKABLE QString grabWindow();
  // [r, g, b] of the last grab at a point given as fractions of its size ([] before a grab).
  Q_INVOKABLE QVariantList grabPixel(double fx, double fy) const;

  // Search roots, in priority order (an id found earlier wins).
  static QStringList roots();

Q_SIGNALS:
  void changed(const QString& id, const QString& preset);
  void backdropChanged();
  void grabRequested(const QString& path);

private:
  ThemeComponent() = default;
  bool apply(const QString& id, const QString& preset, qint64 saveTimestamp);  // 0 = don't save
  void mirrorSetting();
  void updateChoices();
  bool trusted(const Package& p) const;
  QMap<QString, Package> m_packages;
  QString m_active, m_preset;
  TokenMap m_tokens;
  QStringList m_errors;
  class SchemeHandler* m_scheme = nullptr;
  QString m_user;
  bool m_mirroring = false;
  QHash<QString, QSoundEffect*> m_sounds;
  QVariantMap m_soundState{{"played", 0}, {"suppressed", 0}};
  void soundNote(bool played, const QString& event, const QString& reason);
  void prepareBackdrop();
  QString m_backdropUrl;                  // baked or checked shader for the active theme, or empty
  QMap<QString, QString> m_backdropTypes;  // param -> color | number
  TokenMap m_backdropLive;                // live token values from the web runtime
  bool m_backdropVisible = true;
  QString m_backdropMotion = "normal";
  QVariantMap m_backdropStats;
  QString m_grab;
};
}
