#include "Backdrop.h"
#include <QRegularExpression>
#include <rhi/qshader.h>
#ifdef ICEFIN_SHADERTOOLS
#include <rhi/qshaderbaker.h>
#endif

namespace Icefin::Theme
{
static const QStringList kReserved{"time", "resolution", "qt_Matrix", "qt_Opacity", "fragColor", "qt_TexCoord0", "main"};

BackdropSpec parseBackdrop(const QVariant& json, QStringList* errors)
{
  BackdropSpec b;
  const QVariantMap m = json.toMap();
  if (m.isEmpty()) { *errors << "theme.json: backdrop must be an object with a shader"; return b; }
  static const QStringList known{"shader", "params", "fps"};
  for (const QString& k : m.keys()) if (!known.contains(k)) *errors << QString("theme.json: backdrop: unknown key '%1'").arg(k);
  b.shader = m.value("shader").toString();
  if (!b.shader.endsWith(".frag") && !b.shader.endsWith(".qsb"))
    *errors << "theme.json: backdrop shader must be a .frag (GLSL body) or a precompiled .qsb";
  if (m.contains("fps")) {
    bool ok = false;
    const int fps = m.value("fps").toInt(&ok);
    if (!ok || fps < 10 || fps > 60) *errors << "theme.json: backdrop fps must be 10-60";
    else b.fps = fps;
  }
  static const QRegularExpression name(QStringLiteral("^[a-z][A-Za-z0-9]{0,23}$"));
  static const QRegularExpression token(QStringLiteral("^[A-Za-z][A-Za-z0-9]*(\\.[A-Za-z][A-Za-z0-9]*)+$"));
  const QVariantMap params = m.value("params").toMap();
  if (params.size() > 16) *errors << "theme.json: backdrop has more than 16 params";
  for (auto it = params.begin(); it != params.end(); ++it) {
    if (!name.match(it.key()).hasMatch() || kReserved.contains(it.key())) { *errors << QString("theme.json: backdrop param name '%1' is not allowed").arg(it.key()); continue; }
    const QVariant v = it.value();
    if (v.typeId() == QMetaType::QString) {
      if (!token.match(v.toString()).hasMatch()) { *errors << QString("theme.json: backdrop param '%1' must name a token (group.name) or be a number").arg(it.key()); continue; }
      b.params.insert(it.key(), v.toString());
    } else {
      bool ok = false;
      const double d = v.toDouble(&ok);
      if (!ok || !qIsFinite(d)) { *errors << QString("theme.json: backdrop param '%1' must name a token or be a number").arg(it.key()); continue; }
      b.params.insert(it.key(), d);
    }
  }
  return b;
}

QMap<QString, QString> backdropTypes(const BackdropSpec& spec, const TokenMap& tokens, QStringList* errors)
{
  QMap<QString, QString> t;
  for (auto it = spec.params.begin(); it != spec.params.end(); ++it) {
    if (it.value().typeId() != QMetaType::QString) { t.insert(it.key(), "number"); continue; }
    const QString ref = it.value().toString();
    if (!tokens.contains(ref)) { *errors << QString("backdrop param '%1': no token '%2'").arg(it.key(), ref); continue; }
    const QString v = tokens.value(ref);
    bool num = false;
    v.toDouble(&num);
    if (num) t.insert(it.key(), "number");
    else if (!colorChannel(v).isEmpty()) t.insert(it.key(), "color");
    else *errors << QString("backdrop param '%1': token '%2' is neither a colour nor a number").arg(it.key(), ref);
  }
  return t;
}

QColor cssColor(const QString& css)
{
  const QString c = css.trimmed();
  static const QRegularExpression hex(QStringLiteral("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$"));
  static const QRegularExpression fn(QStringLiteral("^rgba?\\(\\s*(\\d{1,3})[\\s,]+(\\d{1,3})[\\s,]+(\\d{1,3})(?:\\s*[,/]\\s*([0-9.]+)(%?))?\\s*\\)$"));
  if (auto m = hex.match(c); m.hasMatch()) {
    QString h = m.captured(1);
    if (h.size() == 3) h = QString("%1%1%2%2%3%3").arg(h[0]).arg(h[1]).arg(h[2]);
    const int a = h.size() == 8 ? h.mid(6, 2).toInt(nullptr, 16) : 255;  // CSS order: alpha last
    return QColor(h.mid(0, 2).toInt(nullptr, 16), h.mid(2, 2).toInt(nullptr, 16), h.mid(4, 2).toInt(nullptr, 16), a);
  }
  if (auto m = fn.match(c); m.hasMatch()) {
    const int r = m.captured(1).toInt(), g = m.captured(2).toInt(), b = m.captured(3).toInt();
    if (r > 255 || g > 255 || b > 255) return {};
    double a = m.captured(4).isEmpty() ? 1.0 : m.captured(4).toDouble();
    if (m.captured(5) == "%") a /= 100.0;
    QColor q(r, g, b);
    q.setAlphaF(float(qBound(0.0, a, 1.0)));
    return q;
  }
  return {};
}

QString backdropSource(const QString& body, const QMap<QString, QString>& types)
{
  QString block = "    mat4 qt_Matrix;\n    float qt_Opacity;\n    float time;\n    vec2 resolution;\n";
  for (auto it = types.begin(); it != types.end(); ++it) block += QString("    %1 %2;\n").arg(it.value() == "color" ? "vec4" : "float", it.key());
  return "#version 440\n"
         "layout(location = 0) in vec2 qt_TexCoord0;\n"
         "layout(location = 0) out vec4 fragColor;\n"
         "layout(std140, binding = 0) uniform buf {\n" + block + "};\n"
         "#line 1\n" + body;
}

bool backdropBakingAvailable()
{
#ifdef ICEFIN_SHADERTOOLS
  return true;
#else
  return false;
#endif
}

QByteArray bakeBackdrop(const QString& body, const QMap<QString, QString>& types, QString* error)
{
#ifdef ICEFIN_SHADERTOOLS
  QString code = body;  // comments may mention anything
  code.remove(QRegularExpression("/\\*.*?\\*/", QRegularExpression::DotMatchesEverythingOption)).remove(QRegularExpression("//[^\\n]*"));
  if (code.contains("#version") || code.contains(QRegularExpression("\\buniform\\b"))) {
    *error = "the shader body must not declare #version or uniforms: the engine writes the header";
    return {};
  }
  QShaderBaker b;
  b.setSourceString(backdropSource(body, types).toUtf8(), QShader::FragmentStage);
  b.setGeneratedShaders({{QShader::SpirvShader, QShaderVersion(100)},
                         {QShader::GlslShader, QShaderVersion(100, QShaderVersion::GlslEs)},
                         {QShader::GlslShader, QShaderVersion(120)},
                         {QShader::GlslShader, QShaderVersion(150)},
                         {QShader::HlslShader, QShaderVersion(50)},
                         {QShader::MslShader, QShaderVersion(12)}});
  b.setGeneratedShaderVariants({QShader::StandardShader});
  const QShader s = b.bake();
  if (!s.isValid()) { *error = b.errorMessage().trimmed(); return {}; }
  return s.serialized();
#else
  Q_UNUSED(body); Q_UNUSED(types);
  *error = "this build can't bake shaders (Qt ShaderTools missing); ship a precompiled .qsb";
  return {};
#endif
}

bool checkBackdropQsb(const QByteArray& qsb, const QMap<QString, QString>& types, QString* error)
{
  const QShader s = QShader::fromSerialized(qsb);
  if (!s.isValid() || s.stage() != QShader::FragmentStage) { *error = "not a precompiled fragment shader (.qsb)"; return false; }
  const auto blocks = s.description().uniformBlocks();
  if (blocks.size() != 1) { *error = "the shader must have exactly one uniform block"; return false; }
  QMap<QString, QShaderDescription::VariableType> want{{"qt_Matrix", QShaderDescription::Mat4}, {"qt_Opacity", QShaderDescription::Float},
                                                       {"time", QShaderDescription::Float}, {"resolution", QShaderDescription::Vec2}};
  for (auto it = types.begin(); it != types.end(); ++it) want.insert(it.key(), it.value() == "color" ? QShaderDescription::Vec4 : QShaderDescription::Float);
  QMap<QString, QShaderDescription::VariableType> have;
  for (const auto& m : blocks.first().members) have.insert(QString::fromUtf8(m.name), m.type);
  // Unused members may be stripped by the compiler; anything else must match the declaration.
  for (auto it = have.begin(); it != have.end(); ++it) {
    if (!want.contains(it.key())) { *error = QString("uniform '%1' isn't a declared param").arg(it.key()); return false; }
    if (want.value(it.key()) != it.value()) { *error = QString("uniform '%1' has the wrong type").arg(it.key()); return false; }
  }
  if (!s.description().combinedImageSamplers().isEmpty()) { *error = "backdrop shaders can't sample textures"; return false; }
  return true;
}
}
