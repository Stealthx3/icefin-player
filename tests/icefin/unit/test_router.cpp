// Unit tests for the PlaybackRouter: every row of SPEC's routing table (PLAN 6.2).
#include <QtTest>
#include "icefin/render/PlaybackRouter.h"
#include "icefin/render/HdrCapabilityProbe.h"
#include "icefin/render/VulkanDevice.h"

using namespace Icefin::Render;

static System vk(DisplayState d, HdrPreference p = HdrPreference::Auto, bool transcode = false)
{
  System s; s.renderer = Renderer::Vulkan; s.vulkanAvailable = true; s.display = d; s.hdr = p; s.serverTranscode = transcode; return s;
}
static System gl(bool vulkanAvailable = false, bool transcode = false)
{
  System s; s.renderer = Renderer::OpenGlFallback; s.vulkanAvailable = vulkanAvailable; s.serverTranscode = transcode; return s;
}

class TestRouter : public QObject
{
  Q_OBJECT
private slots:
  void ranges()
  {
    QCOMPARE(rangeFromJellyfin("SDR"), Range::Sdr);
    QCOMPARE(rangeFromJellyfin(""), Range::Sdr);
    QCOMPARE(rangeFromJellyfin("Unknown"), Range::Sdr);
    for (auto t : {"HDR10", "HDR10Plus", "HLG"}) QCOMPARE(rangeFromJellyfin(t), Range::Hdr);
    for (auto t : {"DOVI", "DOVIWithHDR10", "DOVIWithHDR10Plus", "DOVIWithHLG", "DOVIWithSDR"}) QCOMPARE(rangeFromJellyfin(t), Range::DolbyVision58);
    for (auto t : {"DOVIWithEL", "DOVIWithELHDR10Plus"}) QCOMPARE(rangeFromJellyfin(t), Range::DolbyVision7);
    QCOMPARE(rangeFromJellyfin("DOVIInvalid"), Range::DolbyVisionUnknown);
  }
  // Vulkan | HDR on | HDR10, HLG, DV 5 or 8 | HDR output
  void vulkanHdrDisplay()
  {
    for (Range r : {Range::Hdr, Range::DolbyVision58}) QCOMPARE(route(r, vk(DisplayState::Hdr)).output, Output::Hdr);
  }
  // Vulkan | SDR, or HDR off | Any HDR | tone-mapped
  void vulkanSdrOrHdrOff()
  {
    for (Range r : {Range::Hdr, Range::DolbyVision58}) {
      QCOMPARE(route(r, vk(DisplayState::Sdr)).output, Output::ToneMappedSdr);
      QCOMPARE(route(r, vk(DisplayState::Hdr, HdrPreference::Off)).output, Output::ToneMappedSdr);
      QCOMPARE(route(r, vk(DisplayState::Unknown)).output, Output::ToneMappedSdr);  // no probe answer yet: safe choice
    }
  }
  // Vulkan | Any | SDR | SDR
  void vulkanSdr()
  {
    for (DisplayState d : {DisplayState::Hdr, DisplayState::Sdr}) QCOMPARE(route(Range::Sdr, vk(d)).output, Output::Sdr);
    QVERIFY(route(Range::Sdr, vk(DisplayState::Hdr)).reason.contains("reference white"));
  }
  // Vulkan | Any | DV 7 | base layer as HDR10; prompt offers the transcode
  void vulkanDolbyVision7()
  {
    Route noTranscode = route(Range::DolbyVision7, vk(DisplayState::Hdr));
    QCOMPARE(noTranscode.output, Output::Hdr);
    QVERIFY(noTranscode.baseLayerOnly);
    QCOMPARE(route(Range::DolbyVision7, vk(DisplayState::Sdr)).output, Output::ToneMappedSdr);
    Route withTranscode = route(Range::DolbyVision7, vk(DisplayState::Hdr, HdrPreference::Auto, true));
    QCOMPARE(withTranscode.output, Output::Prompt);
    QCOMPARE(withTranscode.options, (QList<Option>{Option::PlayBaseLayer, Option::TranscodeHdr10, Option::TranscodeSdr, Option::Cancel}));
  }
  // OpenGL fallback | Any | SDR, HDR10, HLG | tone-mapped by upstream's renderer
  void openGlBasic()
  {
    QCOMPARE(route(Range::Sdr, gl()).output, Output::Sdr);
    QCOMPARE(route(Range::Hdr, gl()).output, Output::ToneMappedSdr);
  }
  // OpenGL fallback | Any | DV 5 or 8 | capability prompt, with only the options this system has
  void openGlDolbyVision()
  {
    Route bare = route(Range::DolbyVision58, gl());
    QCOMPARE(bare.output, Output::Prompt);
    QCOMPARE(bare.options, (QList<Option>{Option::PlayAnyway, Option::Cancel}));
    Route full = route(Range::DolbyVision58, gl(true, true));
    QCOMPARE(full.options, (QList<Option>{Option::PlayAnyway, Option::TranscodeHdr10, Option::TranscodeSdr, Option::SwitchToVulkan, Option::Cancel}));
    QCOMPARE(route(Range::DolbyVision7, gl()).output, Output::Prompt);
    QCOMPARE(route(Range::DolbyVisionUnknown, gl()).output, Output::Prompt);
  }
  void displayClassification()
  {
    QCOMPARE(hdrForTransfer("st2084_pq"), DisplayInfo::Hdr::Yes);
    QCOMPARE(hdrForTransfer("hlg"), DisplayInfo::Hdr::Yes);
    QCOMPARE(hdrForTransfer("srgb"), DisplayInfo::Hdr::No);
    QCOMPARE(hdrForTransfer("gamma22"), DisplayInfo::Hdr::No);
    QCOMPARE(hdrForTransfer(""), DisplayInfo::Hdr::Unknown);
    // KWin: HDR on is gamma22 with headroom (max 800, reference 200); HDR off is max = reference.
    QCOMPARE(hdrForTransfer("gamma22", 800, 200), DisplayInfo::Hdr::Yes);
    QCOMPARE(hdrForTransfer("gamma22", 300, 200), DisplayInfo::Hdr::Yes);
    QCOMPARE(hdrForTransfer("gamma22", 200, 200), DisplayInfo::Hdr::No);
    QCOMPARE(hdrForTransfer("gamma22", 250, 200), DisplayInfo::Hdr::No);
    QCOMPARE(hdrForTransfer("srgb", -1, -1), DisplayInfo::Hdr::No);
    QCOMPARE(hdrForTransfer("", 800, 200), DisplayInfo::Hdr::Unknown);
  }
  void rangeFromItem()
  {
    QVariantMap video{{"Type", "Video"}, {"VideoRangeType", "HDR10"}};
    QVariantMap audio{{"Type", "Audio"}};
    QCOMPARE(videoRangeType({{"MediaStreams", QVariantList{audio, video}}}), QString("HDR10"));
    QVariantMap source{{"MediaStreams", QVariantList{QVariantMap{{"Type", "Video"}, {"VideoRangeType", "DOVIWithHDR10"}}}}};
    QCOMPARE(videoRangeType({{"MediaSources", QVariantList{source}}}), QString("DOVIWithHDR10"));
    QVERIFY(videoRangeType({}).isEmpty());
    // PlayerComponent's load metadata (mpvVideoPlayer.js streamdata)
    QVariantMap streamdata{{"metadata", QVariantMap{{"Name", "x"}}}, {"icefinMediaSource", source}};
    QCOMPARE(videoRangeType(streamdata), QString("DOVIWithHDR10"));
    QVariantMap itemOnly{{"metadata", QVariantMap{{"MediaStreams", QVariantList{video}}}}, {"icefinMediaSource", QVariant()}};
    QCOMPARE(videoRangeType(itemOnly), QString("HDR10"));
  }
  void rendererChoice()
  {
    QCOMPARE(rendererChoiceFrom("vulkan"), RendererChoice::Vulkan);
    QCOMPARE(rendererChoiceFrom("opengl"), RendererChoice::OpenGl);
    QCOMPARE(rendererChoiceFrom("auto"), RendererChoice::Auto);
    QCOMPARE(rendererChoiceFrom(""), RendererChoice::Auto);
    // Auto takes Vulkan only once video plays there (5.3); an explicit Vulkan needs a usable GPU.
    QVERIFY(!useVulkan(RendererChoice::Auto, true, false));
    QVERIFY(useVulkan(RendererChoice::Auto, true, true));
    QVERIFY(!useVulkan(RendererChoice::Auto, false, true));
    QVERIFY(useVulkan(RendererChoice::Vulkan, true, false));
    QVERIFY(!useVulkan(RendererChoice::Vulkan, false, false));
    QVERIFY(!useVulkan(RendererChoice::OpenGl, true, true));
    QVERIFY(!vulkanVideoPath());
  }
  void deviceExtensions()
  {
    const QList<QByteArray> all{"VK_KHR_swapchain", "VK_KHR_external_memory_fd", "VK_KHR_external_semaphore_fd",
                                "VK_EXT_external_memory_dma_buf", "VK_EXT_image_drm_format_modifier", "VK_EXT_hdr_metadata",
                                "VK_KHR_video_queue", "VK_KHR_video_decode_queue", "VK_KHR_video_decode_h265", "VK_EXT_something_else"};
    const auto on13 = pickDeviceExtensions(all, VK_API_VERSION_1_3);
    QVERIFY(on13.contains("VK_KHR_swapchain"));
    QVERIFY(on13.contains("VK_EXT_image_drm_format_modifier"));
    QVERIFY(on13.contains("VK_KHR_video_decode_h265"));
    QVERIFY(!on13.contains("VK_EXT_something_else"));       // only what Icefin asks for
    QVERIFY(!on13.contains("VK_KHR_video_decode_av1"));      // only what the device has
    const auto on12 = pickDeviceExtensions(all, VK_API_VERSION_1_2);
    QVERIFY(on12.contains("VK_EXT_image_drm_format_modifier"));
    QVERIFY(!on12.contains("VK_KHR_video_queue"));           // Vulkan Video needs 1.3 here
    QVERIFY(!pickDeviceExtensions(all, VK_API_VERSION_1_1).contains("VK_EXT_image_drm_format_modifier"));
    QVERIFY(pickDeviceExtensions({"VK_KHR_video_decode_h264"}, VK_API_VERSION_1_3).isEmpty());  // no swapchain: nothing
    const auto noQueue = pickDeviceExtensions({"VK_KHR_swapchain", "VK_KHR_video_decode_queue"}, VK_API_VERSION_1_3);
    QCOMPARE(noQueue, QList<QByteArray>{"VK_KHR_swapchain"});  // decode needs video_queue
  }
};

QTEST_GUILESS_MAIN(TestRouter)
#include "test_router.moc"
