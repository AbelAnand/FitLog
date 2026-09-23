import Foundation
import Capacitor
import WidgetKit

/// Receives the streak snapshot from the web app and hands it to the home-screen widget
/// through the shared app group.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]

    static let suite = "group.com.abelanand.fitlog"
    static let key = "widgetData"

    @objc func update(_ call: CAPPluginCall) {
        let payload = call.options as? [String: Any] ?? [:]
        if let json = try? JSONSerialization.data(withJSONObject: payload, options: []),
           let text = String(data: json, encoding: .utf8) {
            UserDefaults(suiteName: Self.suite)?.set(text, forKey: Self.key)
        }
        WidgetCenter.shared.reloadAllTimelines()
        NSLog("FitLog: widget data updated (%d keys)", payload.count)
        call.resolve()
    }
}
