// Icefin: the recent log lines kept in memory for the diagnostics report (PLAN 11.4).
//
// Upstream's message handler passes every message here (ICEFIN-HOOK in src/utils/Log.cpp). Kept: Icefin's own lines at
// info and above (router, audio, hardware, compositor, ...), the player's state changes, and every warning or error.
// The newest kRecentLines are kept. Lines are stored as logged; the report redacts them (Report.h).
#pragma once
#include <QString>
#include <QStringList>
#include <QtGlobal>

namespace Icefin::Log
{
constexpr int kRecentLines = 300;

// Is this message one the report keeps?
bool keepRecent(QtMsgType type, const QString& msg);
// Thread-safe; called from the Qt message handler.
void remember(QtMsgType type, const QString& msg);
// Oldest first, each "hh:mm:ss.zzz [level] message".
QStringList recentLines();
void clearRecent();  // tests
}
