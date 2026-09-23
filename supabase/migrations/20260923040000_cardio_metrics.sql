-- Customisable cardio variables: exercises.metrics is an ordered list of metric keys
-- (see src/data/cardio-metrics.ts); sets.extra holds the ones without a dedicated column.
alter table public.exercises add column metrics text[];
alter table public.sets add column extra jsonb not null default '{}'::jsonb;
update public.exercises set metrics = case when track_incline then array['time','distance','incline'] else array['time','distance'] end where kind = 'cardio';
update public.exercises set metrics = array['time','speed','incline'] where kind = 'cardio' and lower(name) = 'treadmill';
