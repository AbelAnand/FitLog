# FitLog

A mobile-first workout tracker. Log each session (title, exercises, per-set weight × reps, notes), keep a weekly-goal streak, and watch your top-set weight climb per exercise.

**Live app:** https://abelanand.github.io/FitLog/

## Install on iPhone

1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Launch FitLog from the home screen. It runs full-screen like a native app and updates itself on every deploy.

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

`npm run build` type-checks and produces `dist/` (with a `404.html` copy of `index.html` so deep links work on GitHub Pages).

## Data model

`profiles` (unit, weekly goal) · `exercises` · `workouts` · `workout_exercises` · `sets`. Weights are stored as entered with their unit and converted for display. The schema lives in `supabase/migrations/`.
