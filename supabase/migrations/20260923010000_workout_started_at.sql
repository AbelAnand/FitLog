-- Workout timer: when the session started; duration = finished_at - started_at.
alter table public.workouts add column started_at timestamptz not null default now();
update public.workouts set started_at = created_at;
