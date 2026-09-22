# FitLog — notes for Claude

- Personal workout tracker for one user (Abel), used on iPhone as a PWA. Deployed to GitHub Pages at https://abelanand.github.io/FitLog/ by `.github/workflows/deploy.yml`.
- Supabase project **FitLog** (`dsmbecluqkkmisynzpqg`, us-west-1). Schema changes go through the Supabase MCP `apply_migration` AND get appended to `supabase/migrations/` so the repo stays the record. Re-run `get_advisors` (security) after DDL.
- Build env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are GitHub Actions repository variables; locally they live in `.env.local` (gitignored).
- Vite `base` is `/FitLog/`; the router uses `import.meta.env.BASE_URL` as its basename. Keep both in sync.
- Design tokens are in `src/styles/app.css` under `@theme`. Restyle by changing tokens and the primitives in `src/components/ui.tsx`, not by scattering colors. Base element resets must stay inside `@layer base` or they override Tailwind utilities.
- All progression/PR/streak math is client-side from `useAllSets()` (`src/lib/prs.ts`, `src/lib/streak.ts`). Weights are stored as entered + unit; convert with `src/lib/units.ts`.
- `npm run build` runs `tsc -b` first; keep it warning-free.
