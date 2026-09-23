-- Only exercises that were part of a plan get a check-off circle once the workout starts.
alter table public.workout_exercises add column planned boolean not null default false;
update public.workout_exercises we set planned = true from public.workouts w where w.id = we.workout_id and w.is_plan;
