-- The ownership foreign keys are (parent id, user_id). Give each one an index in that column order,
-- and drop the older indexes they replace. Filtering by user alone is served by the
-- (user_id, created_at) indexes.
create index sets_we_user_idx on public.sets (workout_exercise_id, user_id);
create index workout_exercises_workout_user_idx on public.workout_exercises (workout_id, user_id);
create index workout_exercises_exercise_user_idx on public.workout_exercises (exercise_id, user_id);

drop index public.sets_user_we_idx;
drop index public.workout_exercises_workout_idx;
drop index public.workout_exercises_user_exercise_idx;
