// Icefin: merge Icefin's settings description into upstream's before it is parsed (ICEFIN-HOOK in SettingsComponent).
// Upstream's JSON can't carry hook markers, so Icefin settings live in :/icefin/settings_description.json.
#pragma once
#include <QJsonDocument>
#include <QString>

namespace Icefin::Settings
{
// Values in an Icefin section are appended to the upstream section of the same name; new sections are appended.
QJsonDocument mergeDescription(const QJsonDocument& upstream, const QString& icefinPath = ":/icefin/settings_description.json");
QJsonDocument mergeDescription(const QJsonDocument& upstream, const QJsonDocument& icefin);
}
