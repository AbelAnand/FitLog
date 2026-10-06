-- In-app account deletion (App Store guideline 5.1.1(v)).
-- Removes the caller's auth user; every FitLog table references auth.users with ON DELETE CASCADE,
-- so profiles, exercises, workouts, workout_exercises and sets go with it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

comment on function public.delete_my_account() is 'Deletes the calling user and all of their data. Callable only by a signed-in user, only for themselves.';

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
