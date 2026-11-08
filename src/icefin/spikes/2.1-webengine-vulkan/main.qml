import QtQuick
import QtWebEngine

Window {
    id: win
    width: 800; height: 400; visible: true
    color: "black"
    // Stand-in for the video layer: pure blue under the web view.
    Rectangle { id: under; anchors.fill: parent; color: "#0000ff" }
    WebEngineView {
        id: web
        objectName: "web"
        anchors.fill: parent
        backgroundColor: "transparent"
        url: spikeUrl
        onLoadingChanged: function(info) { if (info.status === WebEngineView.LoadSucceededStatus) spike.pageLoaded() }
    }
}
