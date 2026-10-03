-- 0006_theme_titles.sql
-- Table to store custom/optional theme titles set by admins

create table if not exists public.theme_titles (
  subject text not null,
  theme text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject, theme)
);

-- Enable RLS
alter table public.theme_titles enable row level security;

-- Ensure is_admin helper exists
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
    or lower(coalesce(auth.jwt() ->> 'email', '')) in ('ulugbekisoqov22@gmail.com')
    or (auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)),
    false
  );
$$;

-- Public can read theme titles
drop policy if exists "theme_titles are readable by anyone" on public.theme_titles;
create policy "theme_titles are readable by anyone"
  on public.theme_titles
  for select
  using (true);

-- Admins can insert, update, delete theme titles
drop policy if exists "theme_titles are writable by admins" on public.theme_titles;
create policy "theme_titles are writable by admins"
  on public.theme_titles
  for insert
  with check (public.is_admin());

drop policy if exists "theme_titles are updatable by admins" on public.theme_titles;
create policy "theme_titles are updatable by admins"
  on public.theme_titles
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "theme_titles are deletable by admins" on public.theme_titles;
create policy "theme_titles are deletable by admins"
  on public.theme_titles
  for delete
  using (public.is_admin());

-- Reload schema
select pg_notify('pgrst', 'reload schema');
