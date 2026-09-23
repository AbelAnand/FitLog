-- Set types (warmup/working/drop/failure), cardio exercises with time + distance, distance unit preference, finished_at.
alter table public.exercises add column kind text not null default 'strength' check (kind in ('strength','cardio'));
alter table public.sets add column set_type text not null default 'working' check (set_type in ('warmup','working','drop','failure'));
alter table public.sets add column duration_seconds int check (duration_seconds >= 0);
alter table public.sets add column distance numeric(8,2) check (distance >= 0);
alter table public.sets add column distance_unit text check (distance_unit in ('km','mi'));
alter table public.profiles add column distance_unit text not null default 'mi' check (distance_unit in ('km','mi'));
alter table public.workouts add column finished_at timestamptz;
