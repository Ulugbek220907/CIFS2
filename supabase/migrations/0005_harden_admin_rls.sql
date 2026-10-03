-- 0005_harden_admin_rls.sql

-- 1. Drop over-permissive question mutation policies
drop policy if exists "questions are writable by authenticated non-anonymous users" on public.questions;
drop policy if exists "questions are updatable by authenticated non-anonymous users" on public.questions;
drop policy if exists "questions are deletable by authenticated non-anonymous users" on public.questions;

-- 2. Create resilient admin verification function
-- Checks app_metadata ->> 'role' = 'admin' (survives email changes) OR lower(email) match
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

-- 3. Apply admin-only policies on public.questions
create policy "questions are writable by admins only"
  on public.questions
  for insert
  with check (public.is_admin());

create policy "questions are updatable by admins only"
  on public.questions
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "questions are deletable by admins only"
  on public.questions
  for delete
  using (public.is_admin());

-- 4. Reload PostgREST schema cache
select pg_notify('pgrst', 'reload schema');
