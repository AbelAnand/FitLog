# SplitLog: the product, in one document

Written 2026-10-08, the day after SplitLog 1.0 went live on the App Store. This is the reference for anyone writing about the app: posts, videos, a pitch to a gym, a press note. Every claim here is true of version 1.0.1 and can be said in public. If the app changes, change this file.

- **App Store:** https://apps.apple.com/us/app/splitlog-workout-tracker/id6820002186 (listing name "SplitLog: Workout Tracker", Apple ID 6820002186)
- **Site:** https://abelanand.github.io/SplitLog/ · [Guide](https://abelanand.github.io/SplitLog/guide.html) · [Privacy](https://abelanand.github.io/SplitLog/privacy.html) · [Support](https://abelanand.github.io/SplitLog/support.html)
- **Source:** https://github.com/AbelAnand/SplitLog (public)
- **Maker:** Abel Anand. Solo. Uses the app for his own training every week.
- **Price:** Free. No ads, no subscription, no in-app purchases, nothing locked.
- **Platform:** iPhone, iOS 17 and later. Portrait. Home Screen and Lock Screen widgets, Control Center button on iOS 18+.

## One sentence

SplitLog is a free workout log for iPhone that keeps your training on your phone: log sets in seconds, see your records the moment you hit them, and keep a weekly streak.

## The pitch in three lines

1. **Fast.** Open, tap a title, type weight and reps. Nothing to sign up for, nothing to load, works in a basement gym with no signal.
2. **Private.** No account, no server, no analytics. The app makes zero network requests. The App Store label reads "Data Not Collected".
3. **Free, actually.** No ads, no "Pro" tier, no trial that expires mid-cycle. Every feature is in the free app because there is no other app.

## Why it exists

Abel wanted to log his lifts without a subscription, an account, or an app that nagged him. Most workout trackers are a login screen, a paywall, and a feed. SplitLog began as his personal online tool, and in September 2026 the server was removed entirely after a security review: with no backend there is nothing to attack, nothing to pay for, and nothing to collect. That decision is now the product.

## Who it is for

- Lifters who follow a split (push / pull / legs, upper / lower, bro split) and want a clean record of weight × reps per set.
- People who care where their data goes, or who simply do not want another account.
- People who have been burned by a tracker that went subscription-only or shut down and took their history with it. SplitLog's backup is a plain JSON file and a CSV you can open in Numbers or Excel.
- Beginners who want a streak to keep them going, not a social feed.

Not for (today): Android users, Apple Watch users, people who want a coach, programs, or social features.

## How it works

### The flow of a session

1. **Home** shows the streak card (this week's training days against your weekly goal), a Start workout button, a Plan button, and recent workouts.
2. **Start** opens a sheet. Tap a title chip (Push, Pull, Legs, Upper, Lower, Full body, Cardio) or type your own. Change the date to log a past session. Tap Start and the timer begins.
3. **Add exercise.** Search a built-in library or your own. Exercises you have done under this title before are suggested first. Type a new name and tap Create; mark it as cardio if it is.
4. **Repeat last.** If you have done this workout before, one tap brings in last time's exercises with one empty set each. Last time's numbers show as faint ghost text in the empty fields, so the rows on screen always equal the sets you have done. (Abel's rule: no fake rows, no pre-filled data.)
5. **Log sets.** Type weight and reps. Empty sets below take the same values. Add set copies the one above. Quick fill logs "3 × 8 at 185" in one go. Use last session copies every set from last time.
6. **Hit a PR.** The moment a weight beats your heaviest for that exercise, a gold badge pops onto the field with a haptic tap.
7. **Finish.** Tap the timer to pause and resume; paused time does not count. Finish workout closes the session. Reopen later and Resume if you need to.

### Saving

A live session saves every change as you make it; the header reads Saved. A finished workout or a plan opens for editing: changes stay on screen until you tap Save, and leaving asks Save or Discard. Nothing changes by accident.

### Where the data lives

A SQLite file inside the app's own storage on the iPhone. Every batch of changes is one transaction with write-ahead logging, so a change survives a crash or a dead battery. The file is included in iPhone backups to iCloud or a computer. Deleting the app deletes the log, which is why Settings makes a backup one tap away and Home reminds you when the last backup is over a month old.

## Every feature

### Logging

- Workout titles with chips for common splits, or a custom title.
- Built-in library of about 100 exercises (92 strength across chest, shoulders, triceps, back, biceps, legs, glutes, core and more, plus 12 cardio) and your own; delete your own from the library.
- Title-aware suggestions: exercises you did under "Push" come first when you start a Push day.
- Per-set rows: weight × reps, stored as typed with the unit.
- Set types: working, warm-up (W, excluded from records and volume), drop set (one set stepping down in weight, as many drops as you like), to failure (F).
- Set menu: change type, duplicate, copy to all sets below, delete.
- Hold a set and drag to reorder it (1.1).
- Add set starts empty; Duplicate copies a set (1.1).
- Fill-down: empty sets inherit the values above.
- Add set copies the previous set.
- Quick fill: several identical sets at once.
- Use last session: copies every set from the last time you did that exercise.
- Repeat last: brings in last time's exercises with ghost placeholders.
- Per-exercise notes and a notes box for the whole workout.
- Swipe a set left to delete; long swipe deletes at once. Swipe a workout to delete; hold for options.
- Log a workout for a past date.
- Pause and resume; elapsed time is the single source of truth and excludes pauses.
- Reopen a finished workout and Resume.
- Empty workouts (no exercises) are discarded automatically.

### Cardio

- Cardio exercises log intervals instead of sets.
- Up to four figures per exercise, chosen from: time, distance, speed, incline, level, calories, heart rate, floors, power (watts), cadence (rpm).
- Time accepts 30, 30:00 or 1:05:00.
- Distance is worked out from speed × time when only those are logged.
- Quick fill, totals and the last-time line work for cardio too.

### Progress and records

- A set is a PR when its weight beats the heaviest you have logged for that exercise in any earlier workout. Warm-ups do not count. For drop sets, the top weight counts.
- PR badge appears live, with a success haptic.
- Progress tab: for any exercise, all-time best, a chart of top weight over time with a range selector, and a list of every record.
- Cardio progress: time, distance and pace.

### Streak

- A week counts when you train on at least as many distinct days as your weekly goal (default 4). Weeks run Monday to Sunday.
- The current week is added as soon as you reach the goal and does not break the streak before it ends.
- Weekly goal is set in Settings.
- Streak and this week's days are shown on Home and in the Home Screen widget.

### Plans

- Plan a workout for a later day: title, exercises, target sets.
- On the day, tap Start on the plan and check exercises off as you finish them.
- Plans do not count toward streak, records or history until started.
- Duplicate any workout or plan onto other days as plans; identical plans are skipped (1.1).
- Splits: a saved rolling cycle (Push, Pull, Legs, Rest…) applied from a start date for a number of weeks; Extend carries it on (1.1).
- Share a workout: a SplitLog file another user opens straight into their calendar as a plan, plus a text summary for anyone (1.1).

### History

- Month view: a calendar with training days marked; swipe between months; tap a day to see its workouts.
- Year view: twelve small months, every training day lit, a count per month; swipe between years; tap a month to open it.

### Reminders (optional, all on-device)

- Daily check-in at a chosen time, only on days with no workout logged.
- Gym reminders: gentle nudges to log your sets while a workout is in progress; they stop on pause or finish. Switched on from the start sheet or the editor menu.
- iPhone asks for notification permission only when you turn a reminder on, never at launch.

### Widgets and system integration

- Home Screen widget: Streak, showing the streak and this week's training days.
- Home Screen widget: Start workout, a one-tap tile that opens the start sheet.
- Lock Screen widgets (circular and rectangular) for Start workout.
- iOS 18+: a Start workout control for the Lock Screen corners and Control Center.
- Haptics on PRs and key actions.

### Units and themes

- Pounds or kilograms; miles or kilometres. Logged workouts keep the values you typed and are converted for display.
- Custom themes: four colours plus light or dark, up to 20, shared as a short code (1.1).
- Six themes: Volt (black with electric lime, the default), Tide (deep navy, cool blue), Forest (dark green, mint), Rose (plum black, hot pink), Ember (warm cream, red-orange, light), Slate (clean light, black accent).
- Light motion throughout: every action has a short transition; everything is off under Reduce Motion.

### Your data

- Save a backup: one JSON file holding workouts, sets, notes, plans, exercise library and settings, handed to the share sheet (Save to Files, iCloud Drive, AirDrop, mail).
- Restore from a file: shows what is in the file before anything changes; merges by id; removes nothing; never adds a workout twice, even one that arrived from a spreadsheet.
- Export to CSV: one row per set, opens in Numbers, Excel or Google Sheets. SplitLog can restore from this file too.
- Erase everything, after typing a confirmation word.
- Backup reminder on Home when the last backup is over a month old.
- Moving to a new iPhone: a phone transfer or iCloud restore normally brings the log along; the backup file is the fallback.

### Privacy, stated precisely

- Stored on the device only. No account. No server. No network requests of any kind.
- No analytics, no crash reporting SDK, no advertising identifier, no third-party code that phones home.
- Not used: Apple Health, location, contacts, photos, camera, microphone.
- Backup files are not encrypted by the app; they go wherever the user sends them.
- The developer holds no copy of anyone's data and cannot see, recover or delete it.
- App Store privacy label: Data Not Collected. Privacy manifests for the app and the widget declare no tracking.

## Things SplitLog deliberately does not do

Useful for posts: saying what you left out is as persuasive as listing features.

- No rest timer (declined; Abel found it clutter).
- No social feed, no sharing of workouts to other users, no leaderboards.
- No account, so no password reset and no "we've updated our terms" email.
- No programs or coaching.
- No ads, ever. No subscription, ever. Making money from the app is not a goal.
- No Apple Watch or iPad version yet. Android is built and runs on an emulator as of 2026-10-09; not yet on the Play Store.

## How it is built (for a technical audience)

- React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, Recharts.
- Capacitor 8 shell for iOS with a WidgetKit extension; the storage layer is a small Swift plugin writing SQLite.
- Every change is applied to the screen first and saved afterwards through an ordered queue, which is why it feels instant.
- Every record entering the database is checked and clamped, including restored files, which are treated as untrusted input. A unit test feeds the app a hostile backup file.
- Motion is CSS only, transform and opacity, under half a second, no animation libraries.
- Public source on GitHub; tests and a build run on every push.

## Words to use, words to avoid

Use: free, private, on your iPhone, no account, no signal needed, sets and reps, PR, streak, split, backup file, spreadsheet.

Avoid: "AI", "cloud", "sync" (there is none), "secure" as a bare word (say what is true: stored on your phone, never sent anywhere), "encrypted" (iOS encrypts the device; the app does not add encryption and backup files are plain), "the best", "revolutionary", "track everything".

Never promise: data recovery (there is no copy anywhere), cross-device sync, Android or Watch dates.

## Facts and figures to keep handy

| Fact | Value |
|---|---|
| App Store release | 2026-10-07, approved first submission |
| Current version | 1.1.0 (build 3), in preparation |
| Price | Free in 175 countries |
| Age rating | 4+ |
| Privacy label | Data Not Collected |
| Built-in exercises | 104 (92 strength, 12 cardio) |
| Themes | 6 |
| Cardio figures | 10 available, up to 4 per exercise |
| Set types | 4 (working, warm-up, drop, to failure) |
| Minimum iOS | 17 |
| Repository | public, with unit tests over records, streaks, units, the database, backup and restore |
