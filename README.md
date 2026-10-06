# SplitLog

A free workout log for iPhone. Log each session (title, exercises, per-set weight × reps, notes), keep a weekly-goal streak, and watch your top-set weight climb per exercise.

**Your log stays on your iPhone.** SplitLog has no accounts and no server, and makes no network requests. You can save a backup file, export a spreadsheet, or erase everything at any time.

Features: set types (warm-up / working / drop / to failure), fill-down and quick-fill for repeated sets, per-exercise notes, title-aware exercise suggestions, cardio with configurable figures, planned workouts, pause and resume, daily and in-gym reminders, a Home Screen widget, six themes, backup and restore.

Public pages: [overview](https://abelanand.github.io/FitLog/) · [how to use](https://abelanand.github.io/FitLog/guide.html) · [privacy policy](https://abelanand.github.io/FitLog/privacy.html) · [support](https://abelanand.github.io/FitLog/support.html)

## Install on an iPhone from source

```bash
npm install
npm run build:ios      # builds the bundle and syncs it into ios/
npm run ios            # opens ios/App/App.xcodeproj in Xcode
```

In Xcode: plug in your iPhone, pick it as the run destination, and press **Run**. After changing code, run `npm run build:ios` again and press Run.

Installing over an earlier build keeps the log. Deleting the app deletes it, so save a backup first (Settings → Save a backup).

## Development

```bash
npm install
npm run dev     # the app in a browser at http://localhost:5173/, storing to the browser
npm test        # unit tests: records, streaks, units, the database, backup and restore
npm run lint
```

## How it is built

- React 19 + TypeScript + Vite, Tailwind CSS v4, react-router, TanStack Query, Recharts
- Capacitor 8 shell for iOS, with a WidgetKit extension
- Storage: a SQLite file inside the app, written by a small Swift plugin (`ios/App/App/LocalStorePlugin.swift`). The data layer is in `src/db/`.
- `site/` holds the public pages, published to GitHub Pages by `.github/workflows/deploy.yml`, which also runs the tests and a build on every push.

The App Store listing text, screenshots, privacy answers and submission steps are in [`docs/app-store/`](docs/app-store/README.md).

## Data model

`workouts` · `exercises` · `workout_exercises` · `sets`, plus settings. Weights are stored as entered with their unit and converted for display. The backup file is JSON with the same four lists; see `src/db/types.ts`.

## History

SplitLog began as an online app backed by Supabase. `supabase/` keeps that schema for the record, and `npm run export:server` downloads an account's data from it as a backup file the app can restore.
