import Foundation
import Capacitor

/// Lets the web app switch the edge swipe-back gesture off while a screen has unsaved changes,
/// so leaving always goes through its Save / Discard question.
@objc(BackGesturePlugin)
public class BackGesturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackGesturePlugin"
    public let jsName = "BackGesture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func setEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        DispatchQueue.main.async { [weak self] in
            self?.bridge?.webView?.allowsBackForwardNavigationGestures = enabled
            call.resolve()
        }
    }
}
