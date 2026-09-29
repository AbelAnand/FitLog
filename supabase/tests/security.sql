-- Security checks for the FitLog database. Safe to run against production: everything it creates
-- is rolled back, and the last two rows of the result confirm that.
--
-- Run it in the Supabase SQL editor (or through the MCP `execute_sql` tool) after any change to
-- tables, policies, grants or triggers. Every row must say PASS.
--
-- It needs one existing account with at least one workout to act as the victim; by default the
-- review account. It plays a second, throwaway account and a signed-out visitor against it.

create temp table _r (n int, test text, expected text, got text) on commit drop;
do $$
declare
  victim uuid := (select id from auth.users where email = 'fitlog-test@example.com');
  attacker uuid := gen_random_uuid();
  v_workout uuid := (select id from public.workouts where user_id = victim limit 1);
  v_we uuid := (select id from public.workout_exercises where user_id = victim limit 1);
  v_ex uuid := (select id from public.exercises where user_id = victim limit 1);
  a_workout uuid := gen_random_uuid();
  a_ex uuid := gen_random_uuid();
  a_we uuid := gen_random_uuid();
  cnt bigint;
  ts timestamptz;
  res jsonb := '[]'::jsonb;  -- variables survive the rollback; table rows would not
begin
  if v_workout is null then raise exception 'The victim account needs at least one workout'; end if;
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', attacker, 'authenticated', 'authenticated', 'fitlog-attacker-test@example.com', 'x', now(), now(), now(), '{}', '{}', '', '', '', '');

    perform set_config('request.jwt.claims', json_build_object('sub', attacker, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    begin
      insert into public.workouts (id, user_id, title, created_at) values (a_workout, attacker, 'Mine', now() - interval '30 days');
      insert into public.exercises (id, user_id, name) values (a_ex, attacker, 'My Exercise');
      insert into public.workout_exercises (id, user_id, workout_id, exercise_id) values (a_we, attacker, a_workout, a_ex);
      insert into public.sets (user_id, workout_exercise_id, set_number, weight, reps) values (attacker, a_we, 1, 100, 5);
      res := res || jsonb_build_array(jsonb_build_array(1, 'Own workout, exercise and set can be created', 'ok', 'ok'));
      select created_at into ts from public.workouts where id = a_workout;
      res := res || jsonb_build_array(jsonb_build_array(2, 'Backdated creation time is replaced by server time', 'now', case when ts > now() - interval '1 minute' then 'now' else ts::text end));
      update public.workouts set created_at = now() - interval '30 days' where id = a_workout;
      select created_at into ts from public.workouts where id = a_workout;
      res := res || jsonb_build_array(jsonb_build_array(3, 'Creation time cannot be edited afterwards', 'unchanged', case when ts > now() - interval '1 minute' then 'unchanged' else 'CHANGED' end));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(1, 'Own workout, exercise and set can be created', 'ok', sqlstate || ' ' || sqlerrm));
    end;

    begin insert into public.workout_exercises (user_id, workout_id, exercise_id) values (attacker, v_workout, a_ex);
      res := res || jsonb_build_array(jsonb_build_array(4, 'Attach own entry to another user''s workout', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(4, 'Attach own entry to another user''s workout', 'refused', 'refused ' || sqlstate)); end;

    begin insert into public.workout_exercises (user_id, workout_id, exercise_id) values (attacker, a_workout, v_ex);
      res := res || jsonb_build_array(jsonb_build_array(5, 'Reference another user''s exercise', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(5, 'Reference another user''s exercise', 'refused', 'refused ' || sqlstate)); end;

    begin insert into public.sets (user_id, workout_exercise_id, set_number) values (attacker, v_we, 1);
      res := res || jsonb_build_array(jsonb_build_array(6, 'Attach a set to another user''s exercise entry', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(6, 'Attach a set to another user''s exercise entry', 'refused', 'refused ' || sqlstate)); end;

    begin insert into public.workouts (user_id, title) values (victim, 'Planted');
      res := res || jsonb_build_array(jsonb_build_array(7, 'Create a row owned by another user', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(7, 'Create a row owned by another user', 'refused', 'refused ' || sqlstate)); end;

    select count(*) into cnt from public.sets where user_id = victim;
    res := res || jsonb_build_array(jsonb_build_array(8, 'Read another user''s sets', '0 rows', cnt || ' rows'));
    update public.workouts set title = 'Hacked' where id = v_workout; get diagnostics cnt = row_count;
    res := res || jsonb_build_array(jsonb_build_array(9, 'Edit another user''s workout', '0 rows', cnt || ' rows'));
    delete from public.workouts where id = v_workout; get diagnostics cnt = row_count;
    res := res || jsonb_build_array(jsonb_build_array(10, 'Delete another user''s workout', '0 rows', cnt || ' rows'));
    begin update public.workouts set user_id = victim where id = a_workout;
      res := res || jsonb_build_array(jsonb_build_array(11, 'Hand own row to another user', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(11, 'Hand own row to another user', 'refused', 'refused ' || sqlstate)); end;

    begin execute 'truncate public.sets';
      res := res || jsonb_build_array(jsonb_build_array(12, 'Truncate a table', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(12, 'Truncate a table', 'refused', 'refused ' || sqlstate)); end;

    begin insert into public.sets (user_id, workout_exercise_id, set_number) select attacker, a_we, 1 from generate_series(1, 799);
      res := res || jsonb_build_array(jsonb_build_array(13, '800 sets in a day, at the limit', 'ok', 'ok'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(13, '800 sets in a day, at the limit', 'ok', sqlstate || ' ' || sqlerrm)); end;

    begin insert into public.sets (user_id, workout_exercise_id, set_number) values (attacker, a_we, 1);
      res := res || jsonb_build_array(jsonb_build_array(14, 'Set number 801 in a day', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(14, 'Set number 801 in a day', 'refused', 'refused: ' || sqlerrm)); end;

    begin insert into public.sets (user_id, workout_exercise_id, set_number, created_at) select attacker, a_we, 1, now() - interval '3 days' from generate_series(1, 5);
      res := res || jsonb_build_array(jsonb_build_array(15, 'Dodge the daily limit by backdating', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(15, 'Dodge the daily limit by backdating', 'refused', 'refused: ' || sqlerrm)); end;

    begin update public.workouts set notes = repeat('x', 4001) where id = a_workout;
      res := res || jsonb_build_array(jsonb_build_array(16, 'Oversized notes, 4,001 characters', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(16, 'Oversized notes, 4,001 characters', 'refused', 'refused ' || sqlstate)); end;

    begin update public.sets set extra = (select jsonb_object_agg('k' || g, repeat('x', 100)) from generate_series(1, 50) g) where workout_exercise_id = a_we;
      res := res || jsonb_build_array(jsonb_build_array(17, 'Oversized JSON in a set', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(17, 'Oversized JSON in a set', 'refused', 'refused ' || sqlstate)); end;

    -- Total ceiling: fill the account as the database owner (exempt), then add one more as the user.
    perform set_config('role', 'postgres', true);
    insert into public.exercises (user_id, name, created_at) select attacker, 'Bulk ' || g, now() - interval '3 days' from generate_series(1, 999) g;
    perform set_config('role', 'authenticated', true);
    begin insert into public.exercises (user_id, name) values (attacker, 'One too many');
      res := res || jsonb_build_array(jsonb_build_array(18, 'Exercise number 1,001 on one account', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(18, 'Exercise number 1,001 on one account', 'refused', 'refused: ' || sqlerrm)); end;

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    begin select count(*) into cnt from public.workouts;
      res := res || jsonb_build_array(jsonb_build_array(19, 'Signed-out visitor reads workouts', 'refused', 'ALLOWED (' || cnt || ' rows)'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(19, 'Signed-out visitor reads workouts', 'refused', 'refused ' || sqlstate)); end;
    begin perform public.delete_my_account();
      res := res || jsonb_build_array(jsonb_build_array(20, 'Signed-out visitor calls delete account', 'refused', 'ALLOWED'));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(20, 'Signed-out visitor calls delete account', 'refused', 'refused ' || sqlstate)); end;

    perform set_config('role', 'postgres', true);
    raise exception 'ROLLBACK_TESTS';
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'ROLLBACK_TESTS' then
      res := res || jsonb_build_array(jsonb_build_array(99, 'TEST HARNESS ERROR', 'none', sqlstate || ' ' || sqlerrm));
    end if;
  end;
  insert into _r select (e->>0)::int, e->>1, e->>2, e->>3 from jsonb_array_elements(res) e;
end $$;

select n, test, expected, got, case when got like expected || '%' then 'PASS' else 'FAIL' end as result from _r
union all
select 100, 'Nothing left behind: throwaway account', '0', count(*)::text, case when count(*) = 0 then 'PASS' else 'FAIL' end
  from auth.users where email = 'fitlog-attacker-test@example.com'
union all
select 101, 'Nothing left behind: rows without an owner', '0', count(*)::text, case when count(*) = 0 then 'PASS' else 'FAIL' end
  from public.sets s where not exists (select 1 from auth.users u where u.id = s.user_id)
order by n;
