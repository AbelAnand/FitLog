# FitLog — notes for Claude

- Personal workout tracker for one user (Abel), used on iPhone as a **native Capacitor app** (`ios/`, bundle id `com.abelanand.fitlog`, signing team Q4X5P825Z6). The same code also deploys as a PWA to GitHub Pages at https://abelanand.github.io/FitLog/ via `.github/workflows/deploy.yml`.
- Two build targets: `npm run build` (web, base `/FitLog/`, PWA on) and `npm run build:ios` (`CAP_BUILD=1`, base `/`, PWA off, then `cap sync ios`). Anything that touches URLs must work under both bases; use `import.meta.env.BASE_URL` / `%BASE_URL%`.
- Native-only behaviour is gated on `isNative` from `src/lib/native.ts` (status bar, keyboard, CSV share via Filesystem + Share). Browser APIs like `navigator.share` with files do not work inside WKWebView.
- To verify the native shell without a phone: `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,id=<sim id>' -derivedDataPath ios/DerivedData build CODE_SIGNING_ALLOWED=NO`, then `xcrun simctl install/launch/io screenshot`. The iOS project uses Swift Package Manager (no CocoaPods).
- Supabase project **FitLog** (`dsmbecluqkkmisynzpqg`, us-west-1). Schema changes go through the Supabase MCP `apply_migration` AND get appended to `supabase/migrations/` so the repo stays the record. Re-run `get_advisors` (security) after DDL.
- Build env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are GitHub Actions repository variables; locally they live in `.env.local` (gitignored).
- Vite `base` is `/FitLog/`; the router uses `import.meta.env.BASE_URL` as its basename. Keep both in sync.
- Design tokens are in `src/styles/app.css` under `@theme`. Restyle by changing tokens and the primitives in `src/components/ui.tsx`, not by scattering colors. Base element resets must stay inside `@layer base` or they override Tailwind utilities.
- All progression/PR/streak math is client-side from `useAllSets()` (`src/lib/prs.ts`, `src/lib/streak.ts`). Weights are stored as entered + unit; convert with `src/lib/units.ts`.
- `npm run build` runs `tsc -b` first; keep it warning-free.
