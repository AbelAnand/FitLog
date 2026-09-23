-- Pause/resume, planned workouts, drop-set chains, cardio incline, exercise check-off.
alter table public.workouts
  add column paused_at timestamptz,
  add column paused_seconds int not null default 0 check (paused_seconds >= 0),
  add column is_plan boolean not null default false;
alter table public.sets
  add column drops jsonb not null default '[]'::jsonb,
  add column incline numeric(5,2) check (incline >= 0);
alter table public.exercises add column track_incline boolean not null default false;
alter table public.workout_exercises add column completed_at timestamptz;
create index workouts_user_plan_idx on public.workouts (user_id, is_plan, date);
