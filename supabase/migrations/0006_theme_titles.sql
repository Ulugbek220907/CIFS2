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
