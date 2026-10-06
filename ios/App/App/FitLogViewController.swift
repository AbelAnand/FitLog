import UIKit
import Capacitor

/// Registers plugins that live inside the app target (not in a package) and tunes the web view.
class FitLogViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(LocalStorePlugin())
        bridge?.registerPluginInstance(BackGesturePlugin())
        NSLog("FitLog: in-app plugins registered")

        // The Start workout control runs its intent inside the app; hand it to the web app the same
        // way a fitlog://start URL arrives (the App plugin keeps the event until a listener is ready).
        NotificationCenter.default.addObserver(forName: .fitlogStartWorkout, object: nil, queue: .main) { [weak self] _ in
            self?.deliverPendingStart()
        }
        deliverPendingStart()

        if let webView = bridge?.webView {
            // Swipe in from the left edge to go back, like every other iOS app.
            webView.allowsBackForwardNavigationGestures = true
            // Dragging the page pulls the keyboard down with it.
            webView.scrollView.keyboardDismissMode = .interactive
        }

        #if DEBUG
        // Test hooks, compiled into debug builds only:
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
        #endif
    }

    private func deliverPendingStart() {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: StartWorkoutRequest.pendingKey) else { return }
        defaults.removeObject(forKey: StartWorkoutRequest.pendingKey)
        guard let url = NSURL(string: "fitlog://start") else { return }
        let payload: [String: Any?] = ["url": url, "options": [:]]
        NotificationCenter.default.post(name: Notification.Name.capacitorOpenURL, object: payload)
        NSLog("FitLog: start workout requested by a control")
    }
}
