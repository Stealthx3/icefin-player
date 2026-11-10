#ifndef MPVVIDEOITEM_H
#define MPVVIDEOITEM_H

#include <MpvAbstractItem>

class PlayerComponent;
namespace Icefin::Render { class VulkanVideo; }  // ICEFIN-HOOK: video on the Vulkan path (PLAN 5.3)

class MpvVideoItem : public MpvAbstractItem
{
    Q_OBJECT
    QML_ELEMENT

public:
    explicit MpvVideoItem(QQuickItem *parent = nullptr);
    void setPlayerComponent(PlayerComponent* player);

    MpvController* controller() { return mpvController(); }

protected:
    QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData* data) override;  // ICEFIN-HOOK: Vulkan path draws its own node (PLAN 5.3)

private:
    PlayerComponent* m_player = nullptr;
    Icefin::Render::VulkanVideo* m_vulkan = nullptr;  // ICEFIN-HOOK: set when Qt Quick runs on Vulkan (PLAN 5.3)
};

#endif // MPVVIDEOITEM_H
