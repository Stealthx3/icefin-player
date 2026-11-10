// Icefin: the single-surface compositor (PLAN 5.4, src/icefin/render/Compositing.h, D24).
// Loaded by an ICEFIN-HOOK in webview.qml above everything. When the compositor is on (Vulkan video path):
//  - the window's UI items (backdrop, web view, labels: every sibling but the video item and this loader) move into
//    one item, flattened by a ShaderEffectSource into an RGBA8 layer in the UI's own encoding. hideSource keeps them
//    from drawing on their own; input still reaches them;
//  - VideoTexture is mpv's linear RGBA16F image (the video item draws nothing itself);
//  - one ShaderEffect blends the UI over the video and encodes the window (SDR, HDR10 or scRGB).
// Off (OpenGL fallback, no shader baking, ICEFIN_COMPOSITOR=0): nothing moves and nothing is drawn here.
import QtQuick
import Icefin.Render 1.0

Item
{
  id: root
  property var state: components.router.compositor()
  readonly property bool on: !!state.active
  property bool moved: false
  visible: on

  Connections
  {
    target: components.router
    function onCompositorChanged(s) { root.state = s }
  }

  Item { id: ui; anchors.fill: parent }

  ShaderEffectSource
  {
    id: uiLayer
    anchors.fill: parent
    sourceItem: root.on ? ui : null
    hideSource: true
    visible: false
  }

  VideoTexture { id: videoTexture; width: 1; height: 1; visible: false }

  Loader
  {
    anchors.fill: parent
    active: root.on && !!root.state.shaderUrl
    sourceComponent: compositeEffect
  }

  Component
  {
    id: compositeEffect
    ShaderEffect
    {
      blending: false
      property var ui: uiLayer
      property var video: videoTexture
      property real blendMode: root.state.blend === "linear" ? 1 : 0
      property real outputMode: root.state.output === "hdr10" ? 1 : root.state.output === "scrgb" ? 2 : 0
      property real gamma22: root.state.gamma22 ? 1 : 0
      property real referenceWhite: root.state.referenceWhite || 203
      property real videoScale: (root.state.videoLinearWhite || 203) / (root.state.referenceWhite || 203)
      property real hasVideo: 1
      fragmentShader: root.state.shaderUrl
    }
  }

  // The window's UI items move under `ui`, in their z order (the loader is a sibling of them).
  function adopt()
  {
    var loader = root.parent
    var content = loader && loader.parent
    if (!content || moved) return
    var items = []
    for (var i = 0; i < content.children.length; i++) {
      var c = content.children[i]
      if (c !== loader && c.objectName !== "video") items.push(c)
    }
    for (var j = 0; j < items.length; j++) items[j].parent = ui
    moved = true
    for (var k = 0; k < ui.children.length; k++)
      if (ui.children[k].objectName === "web") ui.children[k].forceActiveFocus()
    console.info("Icefin compositor: UI layer holds " + items.length + " items; blend " + state.blend + ", output " + state.output)
  }

  Component.onCompleted: if (on) Qt.callLater(adopt)
  onOnChanged: if (on) Qt.callLater(adopt)
}
