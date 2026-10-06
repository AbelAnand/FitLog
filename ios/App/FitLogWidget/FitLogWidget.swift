import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared data (written by the app through WidgetBridgePlugin)

struct WidgetData: Codable {
    var streak: Int
    var thisWeek: Int
    var goal: Int
    var week: [Int]
    var todayIndex: Int
    var lastTitle: String
    var lastDate: String
    var updatedAt: Double

    static let sample = WidgetData(streak: 4, thisWeek: 2, goal: 4, week: [1, 0, 1, 0, 0, 0, 0], todayIndex: 3, lastTitle: "Push", lastDate: "2026-09-22", updatedAt: 0)

    static func load() -> WidgetData? {
        guard let text = UserDefaults(suiteName: "group.com.abelanand.fitlog")?.string(forKey: "widgetData"),
              let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(WidgetData.self, from: data)
    }
}

struct StreakEntry: TimelineEntry {
    let date: Date
    let data: WidgetData?
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry { StreakEntry(date: .now, data: .sample) }
    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        completion(StreakEntry(date: .now, data: WidgetData.load() ?? .sample))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let entry = StreakEntry(date: .now, data: WidgetData.load())
        // Refresh at least at the next midnight so "today" moves along even if the app isn't opened.
        let next = Calendar.current.nextDate(after: .now, matching: DateComponents(hour: 0, minute: 1), matchingPolicy: .nextTime) ?? .now.addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Theme

enum Theme {
    static let bg = Color(red: 0.043, green: 0.051, blue: 0.063)
    static let surface = Color(red: 0.114, green: 0.129, blue: 0.157)
    static let accent = Color(red: 0.776, green: 0.945, blue: 0.208)
    static let text = Color(red: 0.949, green: 0.957, blue: 0.969)
    static let muted = Color(red: 0.545, green: 0.576, blue: 0.631)
    static let faint = Color(red: 0.357, green: 0.384, blue: 0.439)
}

// MARK: - Views

struct WeekDots: View {
    let data: WidgetData
    private let labels = ["M", "T", "W", "T", "F", "S", "S"]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { i in
                let trained = i < data.week.count && data.week[i] == 1
                let isToday = i == data.todayIndex
                VStack(spacing: 3) {
                    ZStack {
                        Circle().fill(trained ? Theme.accent : Theme.surface)
                        if isToday && !trained { Circle().strokeBorder(Theme.accent.opacity(0.7), lineWidth: 1.5) }
                        if trained { Image(systemName: "checkmark").font(.system(size: 8, weight: .bold)).foregroundStyle(Theme.bg) }
                    }
                    .frame(width: 16, height: 16)
                    Text(labels[i]).font(.system(size: 8, weight: .medium)).foregroundStyle(isToday ? Theme.text : Theme.faint)
                }
            }
        }
    }
}

struct StreakBlock: View {
    let data: WidgetData
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "flame.fill").foregroundStyle(Theme.accent).font(.system(size: 11, weight: .semibold))
                Text("Week streak").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(data.streak)").font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(Theme.text)
                Text(data.streak == 1 ? "week" : "weeks").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.muted)
            }
        }
    }
}

struct SmallView: View {
    let data: WidgetData
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StreakBlock(data: data)
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(data.thisWeek)").font(.system(size: 15, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                Text("/ \(data.goal) this week").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
            }
            WeekDots(data: data)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "fitlog://start"))
    }
}

struct MediumView: View {
    let data: WidgetData
    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                StreakBlock(data: data)
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(data.thisWeek)").font(.system(size: 15, weight: .semibold, design: .rounded)).foregroundStyle(Theme.text)
                    Text("/ \(data.goal) this week").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                }
                WeekDots(data: data)
            }
            VStack(alignment: .leading, spacing: 8) {
                if !data.lastTitle.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Last workout").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                        Text(data.lastTitle).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
                        Text(formatted(data.lastDate)).font(.system(size: 11)).foregroundStyle(Theme.faint)
                    }
                }
                Spacer(minLength: 0)
                Link(destination: URL(string: "fitlog://start")!) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 12, weight: .bold))
                        Text("Start workout").font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(Theme.bg)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func formatted(_ iso: String) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: iso) else { return iso }
        let out = DateFormatter(); out.dateFormat = "EEE, MMM d"
        return out.string(from: d)
    }
}

struct EmptyView2: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "dumbbell.fill").foregroundStyle(Theme.accent)
            Text("Open SplitLog to start tracking.").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "fitlog://start"))
    }
}

struct FitLogWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StreakEntry

    var body: some View {
        Group {
            if let data = entry.data {
                switch family {
                case .systemMedium: MediumView(data: data)
                default: SmallView(data: data)
                }
            } else {
                EmptyView2()
            }
        }
        .containerBackground(Theme.bg, for: .widget)
    }
}

/// The streak widget. Its kind is unchanged so widgets already on a Home Screen keep working.
struct StreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FitLogWidget", provider: StreakProvider()) { entry in
            FitLogWidgetView(entry: entry)
        }
        .configurationDisplayName("Streak")
        .description("Your weekly streak, this week's training days, and a shortcut to start a workout.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Start workout (Home Screen tile, Lock Screen widgets, iOS 18 control)

struct StartEntry: TimelineEntry {
    let date: Date
}

struct StartProvider: TimelineProvider {
    func placeholder(in context: Context) -> StartEntry { StartEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (StartEntry) -> Void) { completion(StartEntry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<StartEntry>) -> Void) {
        completion(Timeline(entries: [StartEntry(date: .now)], policy: .never))
    }
}

struct StartWorkoutView: View {
    @Environment(\.widgetFamily) private var family
    private let start = URL(string: "fitlog://start")!

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "dumbbell.fill").font(.system(size: 22, weight: .semibold))
                }
                .widgetAccentable()
                .containerBackground(for: .widget) { Color.clear }
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    Image(systemName: "dumbbell.fill").font(.system(size: 20, weight: .semibold))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Start workout").font(.system(size: 15, weight: .semibold))
                        Text("SplitLog").font(.system(size: 12)).opacity(0.7)
                    }
                    Spacer(minLength: 0)
                }
                .widgetAccentable()
                .containerBackground(for: .widget) { Color.clear }
            default:
                VStack(alignment: .leading, spacing: 0) {
                    Image(systemName: "dumbbell.fill").font(.system(size: 26, weight: .semibold)).foregroundStyle(Theme.bg)
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 14, weight: .bold))
                        Text("Start").font(.system(size: 20, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(Theme.bg)
                    Text("workout").font(.system(size: 16, weight: .semibold, design: .rounded)).foregroundStyle(Theme.bg.opacity(0.75))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .containerBackground(Theme.accent, for: .widget)
            }
        }
        .widgetURL(start)
    }
}

struct StartWorkoutWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FitLogStart", provider: StartProvider()) { _ in
            StartWorkoutView()
        }
        .configurationDisplayName("Start workout")
        .description("One tap opens SplitLog ready to start a workout. Works on the Home Screen and the Lock Screen.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

/// A control like the flashlight: add it to the Lock Screen corners or Control Center.
@available(iOS 18.0, *)
struct StartWorkoutControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.abelanand.fitlog.start") {
            ControlWidgetButton(action: StartWorkoutIntent()) {
                Label("Start workout", systemImage: "dumbbell.fill")
            }
        }
        .displayName("Start workout")
        .description("Opens SplitLog ready to start a workout.")
    }
}

@main
struct FitLogWidgets: WidgetBundle {
    var body: some Widget {
        StreakWidget()
        StartWorkoutWidget()
        if #available(iOS 18.0, *) {
            StartWorkoutControl()
        }
    }
}
