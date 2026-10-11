-- 0010_restore_strict_is_admin.sql
-- Migration 0006 redefined public.is_admin() so that ANY signed-in, non-anonymous
-- Supabase user counted as an admin. Every admin-only policy (questions, theme_titles,
-- mock_exams, site_analytics) uses this function, so such a user could edit the question
-- bank, read analytics, and change theme names. This restores the intended check from 0005.
--
-- An account is an admin when ANY of these holds:
--   * its JWT app_metadata.role = 'admin'
--   * its JWT app_metadata.is_admin = true
--   * its email is the listed admin email below
-- To make another person an admin, run once in the SQL editor (then they sign in again):
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
--    where lower(email) = lower('their-email@example.com');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
    or lower(coalesce(auth.jwt() ->> 'email', '')) in ('ulugbekisoqov22@gmail.com'),
    false
  );
$$;

select pg_notify('pgrst', 'reload schema');
