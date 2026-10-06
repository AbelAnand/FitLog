import AppIntents
import Foundation

// Compiled into both the app and the widget extension: the control runs this intent with
// openAppWhenRun, which the system performs inside the app, so the app must know the type.
/// Opens the app on the start sheet (Lock Screen corner control, Control Center, Shortcuts).
@available(iOS 18.0, *)
struct StartWorkoutIntent: AppIntent {
    static let title: LocalizedStringResource = "Start workout"
    static let description = IntentDescription("Opens FitLog ready to start a workout.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "fitlog://start")!))
    }
}

