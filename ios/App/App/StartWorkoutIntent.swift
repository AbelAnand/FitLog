import AppIntents
import Foundation

// Compiled into both the app and the widget extension: the control runs this intent with
// openAppWhenRun, which the system performs inside the app, so the app must know the type.

extension Notification.Name {
    /// Posted inside the app when the Start workout control or a Shortcut asks for the start sheet.
    static let fitlogStartWorkout = Notification.Name("fitlog.startWorkout")
}

enum StartWorkoutRequest {
    /// Survives the moment between the intent running and the web view being ready on a cold launch.
    static let pendingKey = "fitlog.pendingStart"
}

/// Opens the app on the start sheet (Lock Screen corner control, Control Center, Shortcuts).
@available(iOS 18.0, *)
struct StartWorkoutIntent: AppIntent {
    static let title: LocalizedStringResource = "Start workout"
    static let description = IntentDescription("Opens FitLog ready to start a workout.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set(true, forKey: StartWorkoutRequest.pendingKey)
        NotificationCenter.default.post(name: .fitlogStartWorkout, object: nil)
        return .result()
    }
}
