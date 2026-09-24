-- Deleting an exercise removes it (and its sets) from every workout, after an in-app confirmation.
alter table public.workout_exercises drop constraint workout_exercises_exercise_id_fkey;
alter table public.workout_exercises add constraint workout_exercises_exercise_id_fkey foreign key (exercise_id) references public.exercises(id) on delete cascade;
