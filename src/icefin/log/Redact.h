// Icefin: more log redaction on top of upstream's Log::CensorAuthTokens (PLAN 11.2).
// Upstream masks fixed-length api_key= / ApiKey= / AccessToken patterns. Icefin also masks, at any length:
// MediaBrowser Token="..." (Authorization headers), X-Emby-Token / X-MediaBrowser-Token headers, and password
// fields in JSON ("Pw", "Password", "NewPw", "CurrentPw").
#pragma once
#include <QString>

namespace Icefin::Log
{
void redact(QString& msg);
}
