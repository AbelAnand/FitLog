# FitLog

A mobile-first workout tracker. Log each session (title, exercises, per-set weight × reps, notes), keep a weekly-goal streak, and watch your top-set weight climb per exercise.

Features: set types (warm-up / working / drop / to failure), fill-down and quick-fill for repeated sets, per-exercise notes, title-aware exercise suggestions, cardio with time + distance + pace, long-press actions on workouts, automatic cleanup of empty workouts, daily and in-gym reminders, and a home-screen widget with a "Start workout" shortcut (`fitlog://start`).

Ships two ways from the same code:

- **Native iOS app** (Capacitor shell in `ios/`), installed from Xcode or TestFlight.
- **Web / PWA** at https://abelanand.github.io/FitLog/ (Safari → Share → Add to Home Screen).

## Install the iOS app

```bash
npm install
npm run build:ios      # builds the web bundle for the native shell and syncs it into ios/
npm run ios            # opens ios/App/App.xcodeproj in Xcode
```

In Xcode: plug in your iPhone, pick it as the run destination, and press **Run**. The first time, Xcode registers the bundle id `com.abelanand.fitlog` with your developer account and the phone asks you to trust the developer (Settings → General → VPN & Device Management). With a paid developer account the install lasts a year; Product → Archive → Distribute uploads to TestFlight.

After changing web code, run `npm run build:ios` again and press Run in Xcode. The Xcode project itself rarely needs to change.

## Stack

- React 19 + TypeScript + Vite, Tailwind CSS v4, react-router, TanStack Query, Recharts
- Supabase (Postgres + Auth) with row-level security; every table is scoped to the signed-in user
- PWA via `vite-plugin-pwa`; deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`

## Local development

```bash
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm install
npm run dev                  # http://localhost:5173/FitLog/
```

`npm run build` type-checks and produces the web `dist/` (base `/FitLog/`, with a `404.html` copy so deep links work on GitHub Pages). `npm run build:ios` builds with base `/` and no service worker, then runs `cap sync ios`. Icons and splash screens are generated from `assets/` with `npx @capacitor/assets generate --ios`.

## Data model

`profiles` (unit, weekly goal) · `exercises` · `workouts` · `workout_exercises` · `sets`. Weights are stored as entered with their unit and converted for display. The schema lives in `supabase/migrations/`.
