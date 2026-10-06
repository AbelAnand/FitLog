-- Hardening before public release.
--
-- 1. Ownership is enforced by the database, not only by row-level security: a row can only point at
--    a parent that belongs to the same user.
-- 2. Every text and JSON field has a size limit.
-- 3. Each account has a ceiling on how much it can store and how fast it can add to it, so a single
--    account cannot fill the database.
-- 4. Roles hold only the privileges the app uses.

-- ---------------------------------------------------------------------------------------------
-- 1. Ownership
-- ---------------------------------------------------------------------------------------------
alter table public.workouts add constraint workouts_id_user_key unique (id, user_id);
alter table public.exercises add constraint exercises_id_user_key unique (id, user_id);
alter table public.workout_exercises add constraint workout_exercises_id_user_key unique (id, user_id);

alter table public.workout_exercises
  drop constraint workout_exercises_workout_id_fkey,
  drop constraint workout_exercises_exercise_id_fkey,
  add constraint workout_exercises_workout_id_fkey
    foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade,
  add constraint workout_exercises_exercise_id_fkey
    foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade;

alter table public.sets
  drop constraint sets_workout_exercise_id_fkey,
  add constraint sets_workout_exercise_id_fkey
    foreign key (workout_exercise_id, user_id) references public.workout_exercises (id, user_id) on delete cascade;

-- ---------------------------------------------------------------------------------------------
-- 2. Size limits (the app enforces the same limits in its inputs)
-- ---------------------------------------------------------------------------------------------
alter table public.workouts
  add constraint workouts_title_length check (char_length(title) <= 120),
  add constraint workouts_notes_length check (char_length(notes) <= 4000),
  add constraint workouts_paused_seconds_max check (paused_seconds <= 604800);

alter table public.workout_exercises
  add constraint workout_exercises_notes_length check (char_length(notes) <= 2000),
  add constraint workout_exercises_position_range check (position between 0 and 1000);

alter table public.exercises
  add constraint exercises_name_length check (char_length(name) <= 80),
  add constraint exercises_metrics_count check (metrics is null or cardinality(metrics) <= 4);

alter table public.sets
  add constraint sets_reps_max check (reps <= 10000),
  add constraint sets_set_number_range check (set_number between 0 and 1000),
  add constraint sets_duration_max check (duration_seconds is null or duration_seconds <= 604800),
  add constraint sets_drops_shape check (jsonb_typeof(drops) = 'array' and jsonb_array_length(drops) <= 20 and pg_column_size(drops) <= 2048),
  add constraint sets_extra_shape check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 1024);

-- ---------------------------------------------------------------------------------------------
-- 3. Per-account limits
-- ---------------------------------------------------------------------------------------------

-- The rate limit counts rows by creation time, so creation time must come from the server.
create or replace function public.stamp_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

-- Arguments: the most rows one account may hold, and the most it may add in 24 hours.
-- Runs once per statement. Requests made with database credentials (migrations, seeding) are exempt.
create or replace function public.enforce_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_total constant bigint := tg_argv[0]::bigint;
  max_daily constant bigint := tg_argv[1]::bigint;
  owner uuid;
  n bigint;
begin
  if current_user not in ('authenticated', 'anon') then
    return null;
  end if;
  for owner in select distinct user_id from added loop
    execute format('select count(*) from %I.%I where user_id = $1 and created_at > now() - interval ''24 hours''', tg_table_schema, tg_table_name)
      into n using owner;
    if n > max_daily then
      raise exception 'fitlog_quota:daily:%', tg_table_name
        using errcode = 'P0001', hint = format('At most %s new rows per day.', max_daily);
    end if;
    execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
      into n using owner;
    if n > max_total then
      raise exception 'fitlog_quota:total:%', tg_table_name
        using errcode = 'P0001', hint = format('At most %s rows per account.', max_total);
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.stamp_created_at() from public, anon, authenticated;
revoke execute on function public.enforce_quota() from public, anon, authenticated;

create index workouts_user_created_idx on public.workouts (user_id, created_at);
create index exercises_user_created_idx on public.exercises (user_id, created_at);
create index workout_exercises_user_created_idx on public.workout_exercises (user_id, created_at);
create index sets_user_created_idx on public.sets (user_id, created_at);

create trigger workouts_stamp before insert or update on public.workouts for each row execute function public.stamp_created_at();
create trigger exercises_stamp before insert or update on public.exercises for each row execute function public.stamp_created_at();
create trigger workout_exercises_stamp before insert or update on public.workout_exercises for each row execute function public.stamp_created_at();
create trigger sets_stamp before insert or update on public.sets for each row execute function public.stamp_created_at();

-- Ceilings sit far above real use: someone training four times a week logs about 200 workouts,
-- 1,000 exercise entries and 4,000 sets a year.
create trigger workouts_quota after insert on public.workouts
  referencing new table as added for each statement execute function public.enforce_quota('5000', '60');
create trigger exercises_quota after insert on public.exercises
  referencing new table as added for each statement execute function public.enforce_quota('1000', '150');
create trigger workout_exercises_quota after insert on public.workout_exercises
  referencing new table as added for each statement execute function public.enforce_quota('20000', '400');
create trigger sets_quota after insert on public.sets
  referencing new table as added for each statement execute function public.enforce_quota('60000', '800');

-- ---------------------------------------------------------------------------------------------
-- 4. Least privilege
-- ---------------------------------------------------------------------------------------------
-- Signed-out visitors never touch these tables. Row-level security already returned nothing to
-- them; now they hold no privileges at all.
revoke all on all tables in schema public from anon;
-- TRUNCATE ignores row-level security. The app never needs it, nor TRIGGER or REFERENCES.
revoke truncate, trigger, references on all tables in schema public from authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;
