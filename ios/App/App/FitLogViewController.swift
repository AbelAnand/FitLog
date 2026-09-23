import UIKit
import Capacitor

/// Registers plugins that live inside the app target (not in a package).
class FitLogViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        NSLog("FitLog: WidgetBridge plugin registered")

        // Test hook: `SIMCTL_CHILD_FITLOG_ROUTE=/progress xcrun simctl launch …` opens a screen directly.
        // Only launch environments can set this, so it has no effect on user installs.
        if let route = ProcessInfo.processInfo.environment["FITLOG_ROUTE"], route.hasPrefix("/") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
                let js = "history.pushState({}, '', '\(route)'); dispatchEvent(new PopStateEvent('popstate'));"
                self?.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }
}
