// Icefin: the diagnostics report beta testers attach to a bug report (PLAN 11.4, D28, docs/BETA-CHECKLIST.md).
//
// Client Settings -> Hardware -> Copy report puts it on the clipboard. Plain text in Markdown, so it pastes into a
// GitHub issue as is: a summary first (what a triager reads), then the capability model, display and HDR state, the
// audio sink and passthrough setup, the client's settings, what is playing now, and the recent Icefin, player-state
// and warning lines from the log (src/icefin/log/Recent.h).
//
// Redacted like the logs (11.2: tokens, Authorization headers, passwords), and further for a report that may be posted
// in public: a URL keeps its scheme and path but its host becomes [server], the home directory becomes ~, and the
// machine's host name becomes [host]. The state and path settings sections (servers, remembered choices) stay out.
// The assembly is pure (Inputs -> text) so it is unit-tested; HardwareComponent::report() gathers the inputs.
#pragma once
#include <QString>
#include <QStringList>
#include <QVariantMap>

namespace Icefin::Diag
{
struct ReportInputs
{
  QString generated;          // ISO 8601 time
  QVariantMap app;            // version, base, web, build, flatpak, runtime
  QVariantMap system;         // os, kernel, arch, platform, session, desktop, gamescope
  QVariantList screens;       // [{name, size, refresh, dpr, primary}]
  QVariantMap capabilities;   // CapabilityModel snapshot (router.capabilities())
  QVariantMap web;            // HardwareComponent::results().web (4.3)
  QVariantMap audio;          // {bitstream, device, passthrough, ...}
  QVariantMap settings;       // section -> {key: value}; sections listed in reportSections()
  QString nowPlaying;         // PlayerComponent::videoInformation(), empty when idle
  QStringList recentLog;      // Icefin::Log::recentLines()
  QString home;               // home directory, replaced by ~
  QString hostName;           // machine host name, replaced by [host]
};

// The settings sections the report includes (not state, path or __meta__).
QStringList reportSections();
// Redaction applied to the whole report.
QString sanitize(QString text, const QString& home, const QString& hostName);
// The report text, already sanitized.
QString build(const ReportInputs& in);
}
