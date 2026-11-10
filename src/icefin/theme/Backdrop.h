// Icefin theme engine: the native backdrop's shader effects (PLAN 8.4, SPEC "Theme-engine layer": "Native backdrop").
//
// A theme declares one backdrop in theme.json:
//   "backdrop": {"shader": "backdrop/wave.frag", "params": {"colorTop": "color.waveTop", "speed": 0.35}, "fps": 30}
// - shader: a GLSL fragment body (bundled themes and ICEFIN_THEME_PATH only; baked here with Qt's shader baker), or a
//   precompiled .qsb (the only kind a user-installed theme may ship, and only once the user trusts the theme). The engine owns the uniform
//   block: for GLSL it writes the header (version, in/out, the block) itself; a .qsb must declare exactly that block.
// - params: up to 16 uniforms; a string names a token (its colour becomes a vec4, its number a float), a number is a
//   float. Reserved names: time (seconds), resolution (pixels, vec2), qt_Matrix, qt_Opacity.
// - fps: 10-60 (default 30). The backdrop renders that often while it moves; it stands still under reduced motion.
// Backdrop.qml (qml/icefin/, loaded under the web view by an ICEFIN-HOOK in webview.qml) draws it and hides it while
// video is up.
#pragma once
#include "Tokens.h"
#include <QByteArray>
#include <QColor>
#include <QMap>
#include <QString>
#include <QStringList>
#include <QVariantMap>

namespace Icefin::Theme
{
struct BackdropSpec
{
  QString shader;                 // relative path in the package, or empty: no backdrop
  QVariantMap params;             // name -> token name (QString) or number (double), as declared
  int fps = 30;
  bool declared() const { return !shader.isEmpty(); }
  bool precompiled() const { return shader.endsWith(".qsb"); }
};

// Parses theme.json's "backdrop" value; problems go to errors. Path checks are the caller's (asset rule).
BackdropSpec parseBackdrop(const QVariant& json, QStringList* errors);

// The uniform types the effect gets: "color" (vec4) or "number" (float) per param, from the resolved tokens.
QMap<QString, QString> backdropTypes(const BackdropSpec& spec, const TokenMap& tokens, QStringList* errors);

// A CSS colour as written in tokens (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) as a QColor; invalid if it isn't one.
QColor cssColor(const QString& css);

// The full GLSL source the engine bakes for a theme's fragment body.
QString backdropSource(const QString& body, const QMap<QString, QString>& types);

// True when shader baking is built in (Qt ShaderTools found at build time).
bool backdropBakingAvailable();

// Bakes a GLSL body into a serialized QShader (every backend Qt Quick may run on). Empty on error.
QByteArray bakeBackdrop(const QString& body, const QMap<QString, QString>& types, QString* error);

// Checks a precompiled .qsb: a fragment shader whose uniform block is exactly the engine's for these params.
bool checkBackdropQsb(const QByteArray& qsb, const QMap<QString, QString>& types, QString* error);
}
