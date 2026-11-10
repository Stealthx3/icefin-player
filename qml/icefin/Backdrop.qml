// Icefin theme engine: the native backdrop (PLAN 8.4, SPEC "Theme-engine layer": "Native backdrop").
// Loaded by an ICEFIN-HOOK in webview.qml between the video item and the (transparent) web view. It draws the active
// theme's backdrop shader (ThemeComponent::backdrop(), baked or checked in C++) as a ShaderEffect whose uniforms are
// the theme's declared params, plus time and resolution. Theme-agnostic: it knows params only by the names and types
// the theme declared.
// - Hidden while video is up (the player is playing, paused or buffering): on the OpenGL path the video item is opaque
//   and this layer would sit above it. Not the player's window (vo-configured): with force-window, mpv opens it idle at
//   startup on a real GPU, with nothing playing.
// - time advances at the theme's fps; under reduced or low motion (from the web runtime) it stands still.
// - Colour params cross-fade when the web runtime sends new token values (time-of-day palettes).
// - Known gap (PLAN 8.4): Chromium keeps a page that loaded opaque as an opaque layer, so the backdrop only shows
//   through the page after a reload. Nudging the web view's background colour fixed it under Xvfb but froze the page
//   on the HTPC's GPU (Gamescope), so it was taken out again.
// - Reports what it drew to ThemeComponent::reportBackdropStats() every two seconds for tests and diagnostics.
import QtQuick

Item
{
  id: root
  property var spec: ({})
  property bool videoUp: false
  property var effect: null
  property int frames: 0
  property int windowFrames: 0
  property double t0: Date.now()
  readonly property bool shown: !!effect && spec.visible !== false && !videoUp
  readonly property bool moving: shown && spec.motion !== "low"

  visible: shown

  // The web view is a sibling under the window's content item (webview.qml, objectName "web").
  function webView()
  {
    var p = root.parent && root.parent.parent
    if (!p) return null
    for (var i = 0; i < p.children.length; i++)
      if (p.children[i].objectName === "web") return p.children[i]
    return null
  }

  // Tests (ThemeComponent::repaintWeb): one change to the web view now, undone 300 ms later.
  Timer
  {
    id: repaintUndo
    interval: 300
    property var undo: null
    onTriggered: { if (undo) undo(); undo = null }
  }

  function repaintWeb(mode)
  {
    var w = webView()
    if (!w) return
    if (mode === "bgAlpha") {
      var c = w.backgroundColor
      w.backgroundColor = Qt.rgba(c.r, c.g, c.b, 1 / 255)
      repaintUndo.undo = function() { w.backgroundColor = "transparent" }
    } else if (mode === "layer") {
      w.layer.enabled = false
      repaintUndo.undo = function() { w.layer.enabled = true }
    } else if (mode === "visible") {
      w.visible = false
      repaintUndo.undo = function() { w.visible = true }
    } else if (mode === "resize") {
      w.height = w.height - 1
      repaintUndo.undo = function() { w.height = Qt.binding(function() { return w.parent ? w.parent.height : w.height + 1 }) }
    }
    repaintUndo.restart()
  }

  function paramDecl(name, p)
  {
    if (p.type === "color")
      return "property color " + name + ": \"transparent\"; Behavior on " + name + " { ColorAnimation { duration: 1500 } }\n"
    return "property real " + name + ": 0\n"
  }

  function rebuild()
  {
    var s = components.theme.backdrop()
    if (effect) { effect.destroy(); effect = null }
    spec = s || {}
    if (!s || !s.shader) return
    var names = Object.keys(s.params || {})
    for (var i = 0; i < names.length; i++)
      if (!/^[a-z][A-Za-z0-9]{0,23}$/.test(names[i])) { console.warn("Icefin backdrop: bad param name", names[i]); return }
    var qml = "import QtQuick\nShaderEffect {\n  anchors.fill: parent\n  fragmentShader: " + JSON.stringify(s.shader) + "\n  property real time: 0\n" +
              "  property size resolution: Qt.size(width, height)\n"
    for (var j = 0; j < names.length; j++) qml += "  " + paramDecl(names[j], s.params[names[j]])
    qml += "}\n"
    try {
      effect = Qt.createQmlObject(qml, root, "IcefinBackdropEffect")
    } catch (e) {
      console.warn("Icefin backdrop: effect failed", e)
      return
    }
    apply(false)
    t0 = Date.now()
  }

  // Values only (same shader): token changes from the web runtime, visibility and motion.
  function apply(animate)
  {
    var s = components.theme.backdrop()
    if (!s || !s.shader || !effect) { rebuild(); return }
    if (s.shader !== spec.shader) { rebuild(); return }
    spec = s
    var names = Object.keys(s.params || {})
    for (var i = 0; i < names.length; i++) effect[names[i]] = s.params[names[i]].value
  }

  property bool playerBusy: false
  onPlayerBusyChanged: videoUp = playerBusy

  Connections
  {
    target: components.theme
    function onBackdropChanged() { root.apply(true) }
    // The whole window as Qt renders it (this layer, the video item, the web view), for tests and diagnostics.
    function onWebRepaintRequested(mode) { root.repaintWeb(mode) }
    function onGrabRequested(path)
    {
      var item = root.Window.window ? root.Window.window.contentItem : null
      if (!item) return
      item.grabToImage(function(result) {
        if (result.saveToFile(path)) components.theme.grabDone(path)
      })
    }
  }

  Connections
  {
    target: components.player
    // PlayerComponent's state signals (its State enum isn't registered with QML)
    function onPlaying() { root.playerBusy = true }
    function onPaused() { root.playerBusy = true }
    function onBuffering(percent) { root.playerBusy = true }
    function onFinished() { root.playerBusy = false }
    function onCanceled() { root.playerBusy = false }
    function onError(msg) { root.playerBusy = false }
    function onStopped() { root.playerBusy = false }
  }

  Timer
  {
    interval: Math.round(1000 / Math.max(10, Math.min(60, root.spec.fps || 30)))
    repeat: true
    running: root.moving
    onTriggered: { root.effect.time = (Date.now() - root.t0) / 1000; root.frames++ }
  }

  Connections
  {
    target: root.Window.window
    function onFrameSwapped() { root.windowFrames++ }
  }

  Timer
  {
    property int lastFrames: 0
    property int lastWindow: 0
    interval: 2000
    repeat: true
    running: !!root.effect
    onTriggered: {
      components.theme.reportBackdropStats({
        shown: root.shown, moving: root.moving, videoUp: root.videoUp,
        fps: (root.frames - lastFrames) / 2, windowFps: (root.windowFrames - lastWindow) / 2,
        frames: root.frames, time: root.effect ? root.effect.time : 0, shader: root.spec.shader || ""
      })
      lastFrames = root.frames
      lastWindow = root.windowFrames
    }
  }

  Component.onCompleted: rebuild()
}
