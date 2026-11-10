#include "WebGpuStatus.h"
#include <QDebug>
#include <QRegularExpression>
#include <QTimer>
#include <QWebEnginePage>
#include <QWebEngineProfile>
#include "settings/SettingsComponent.h"

namespace Icefin::Gpu
{
QMap<QString, QString> parseFeatureStatus(const QStringList& lines)
{
  static const QRegularExpression re(QStringLiteral("^\\*?\\s*([A-Za-z][A-Za-z0-9 ./-]*?):\\s*(.+)$"));
  QMap<QString, QString> out;
  for (const QString& l : lines) {
    const auto m = re.match(l.trimmed());
    if (m.hasMatch()) out.insert(m.captured(1).trimmed(), m.captured(2).trimmed());
  }
  return out;
}

bool webAccelerated(const QMap<QString, QString>& f)
{
  return f.value("Compositing").startsWith("Hardware accelerated") && f.value("Rasterization").startsWith("Hardware accelerated");
}

static bool s_gbmSetting = true;   // the user's switch (main.icefin_webengine_gbm)
static QByteArray s_gbmEnv;        // QTWEBENGINE_FORCE_USE_GBM before WebEngine started, for diagnostics

void applyWebEngineEnv()
{
  const QVariant gbm = SettingsComponent::readPreinitValue(SETTINGS_SECTION_MAIN, "icefin_webengine_gbm");
  s_gbmSetting = !gbm.isValid() || gbm.isNull() || gbm.toBool();  // a missing key reads as JSON null: default on
  if (!s_gbmSetting && qEnvironmentVariableIsEmpty("QTWEBENGINE_FORCE_USE_GBM")) {
    qputenv("QTWEBENGINE_FORCE_USE_GBM", "0");
    qInfo() << "Icefin: web GPU buffers (GBM) turned off in settings: QTWEBENGINE_FORCE_USE_GBM=0";
  }
  s_gbmEnv = qgetenv("QTWEBENGINE_FORCE_USE_GBM");
}

// Walks chrome://gpu's shadow DOM ("info-view") for the "Graphics Feature Status" list.
static const char* kExtract = R"JS((() => {
  const sections = []; let cur = null;
  const walk = (r) => {
    r.querySelectorAll('h3, li').forEach((e) => {
      const t = e.textContent.trim();
      if (e.tagName === 'H3') { cur = { title: t.split('\n')[0], items: [] }; sections.push(cur); }
      else if (cur) cur.items.push(t);
    });
    r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
  };
  walk(document);
  const s = sections.find((x) => x.title.startsWith('Graphics Feature Status'));
  return s ? s.items : [];
})())JS";

WebGpuStatus::~WebGpuStatus()
{
  // Children go in creation order, which would take the profile before its pages ("Release of profile requested
  // but WebEnginePage still not deleted").
  qDeleteAll(findChildren<QWebEnginePage*>(Qt::FindDirectChildrenOnly));
}

void WebGpuStatus::check()
{
  // A private off-the-record profile: GPU status is process-wide, and the default profile's injected shell script
  // (nativeshell.js, which needs qt.webChannelTransport) would otherwise run on chrome://gpu and log errors. The
  // profile lives as long as this object; each check's page is deleted after it (a profile must outlive its pages).
  if (!m_profile) m_profile = new QWebEngineProfile(this);
  auto* page = new QWebEnginePage(m_profile, this);
  auto finish = [this, page](const QVariantMap& status) {
    emit done(status);
    page->deleteLater();
  };
  connect(page, &QWebEnginePage::loadFinished, this, [page, finish](bool ok) {
    if (!ok) { finish({{"error", "chrome://gpu did not load"}}); return; }
    // The page fills its lists after load: give it a moment.
    QTimer::singleShot(2500, page, [page, finish] {
      page->runJavaScript(kExtract, [finish](const QVariant& v) {
        const QMap<QString, QString> f = parseFeatureStatus(v.toStringList());
        QVariantMap features;
        for (auto it = f.begin(); it != f.end(); ++it) features.insert(it.key(), it.value());
        finish({{"accelerated", webAccelerated(f)}, {"features", features},
                {"gbm", s_gbmSetting}, {"gbmEnv", QString::fromUtf8(s_gbmEnv)}, {"error", f.isEmpty() ? QString("no feature status found") : QString()}});
      });
    });
  });
  page->load(QUrl("chrome://gpu"));
}
}
