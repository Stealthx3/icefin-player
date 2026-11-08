#include "SettingsMerge.h"
#include <QFile>
#include <QJsonArray>
#include <QJsonObject>
#include <QDebug>

namespace Icefin::Settings
{
QJsonDocument mergeDescription(const QJsonDocument& upstream, const QJsonDocument& icefin)
{
  if (!upstream.isArray() || !icefin.isArray()) return upstream;
  QJsonArray out = upstream.array();
  for (const QJsonValue& v : icefin.array()) {
    const QJsonObject add = v.toObject();
    const QString name = add.value("section").toString();
    bool merged = false;
    for (int i = 0; i < out.size(); ++i) {
      QJsonObject sec = out[i].toObject();
      if (sec.value("section").toString() != name) continue;
      QJsonArray values = sec.value("values").toArray();
      for (const QJsonValue& val : add.value("values").toArray()) values.append(val);
      sec["values"] = values;
      out[i] = sec;
      merged = true;
      break;
    }
    if (!merged) out.append(add);
  }
  return QJsonDocument(out);
}

QJsonDocument mergeDescription(const QJsonDocument& upstream, const QString& icefinPath)
{
  QFile f(icefinPath);
  if (!f.open(QIODevice::ReadOnly)) { qWarning() << "Icefin settings description missing:" << icefinPath; return upstream; }
  QJsonParseError err;
  QJsonDocument doc = QJsonDocument::fromJson(f.readAll(), &err);
  if (doc.isNull()) { qCritical() << "Icefin settings description invalid:" << err.errorString(); return upstream; }
  return mergeDescription(upstream, doc);
}
}
