import UIKit
import Capacitor

/// Registers plugins that live inside the app target (not in a package) and tunes the web view.
class FitLogViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        NSLog("FitLog: WidgetBridge plugin registered")

        if let webView = bridge?.webView {
            // Swipe in from the left edge to go back, like every other iOS app.
            webView.allowsBackForwardNavigationGestures = true
            // Dragging the page pulls the keyboard down with it.
            webView.scrollView.keyboardDismissMode = .interactive
        }

        // Test hooks (simulator only; launch environment variables cannot be set on user installs):
        //   SIMCTL_CHILD_FITLOG_ROUTE=/progress  opens a screen directly
        //   SIMCTL_CHILD_FITLOG_JS='window.scrollTo(0,600)'  runs a snippet after the route
        let env = ProcessInfo.processInfo.environment
        if let route = env["FITLOG_ROUTE"], route.hasPrefix("/") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
                let js = "history.pushState({}, '', '\(route)'); dispatchEvent(new PopStateEvent('popstate'));"
                self?.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
            }
        }
        if let snippet = env["FITLOG_JS"], !snippet.isEmpty {
            DispatchQueue.main.asyncAfter(deadline: .now() + 9) { [weak self] in
                self?.bridge?.webView?.evaluateJavaScript(snippet, completionHandler: nil)
            }
        }
    }
}
