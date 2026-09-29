# Legacy: the online version's database

FitLog 1.0 stores everything on the device and does not use this. The folder is kept as the record
of the online version that came before it, and because `npm run export:server` reads from that
database to bring an account's workouts across.

- `migrations/` is the schema as it was applied.
- `tests/security.sql` checks the access rules. It only matters while the project is still running.

Once every account's data has been restored into the app and backed up from there, the Supabase
project can be paused or deleted from its dashboard. Nothing in the app will notice.
