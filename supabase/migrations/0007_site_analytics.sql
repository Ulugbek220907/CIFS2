-- 0007_site_analytics.sql
-- Lightweight event telemetry pipeline for visitor tracking and conversion funnel statistics

create table if not exists public.site_analytics (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('page_visit', 'quiz_start', 'quiz_complete')),
  session_id text not null,
  subject text null check (
    subject is null or subject in (
      'Quantitative Methods',
      'Academic Communication Skills',
      'Professional Skills & Employability',
      'Critical Thinking & Citizenship',
      'Introduction to Business and Economics',
      'Foundations of Economics',
      'Understanding Finance',
      'Math for Eco',
      'Exploring Economics',
      'Contemporary Issues in Global Economy',
      'Financial Accounting',
      'Fundamentals of Statistics',
      'Essentials of Economics'
    )
  ),
  theme text null check (
    theme is null or theme in (
      'Theme 1', 'Theme 2', 'Theme 3', 'Theme 4',
      'Theme 5', 'Theme 6', 'Theme 7', 'Theme 8',
      'Theme 9', 'Theme 10', 'Theme 11', 'Theme 12'
    )
  ),
  score integer null check (score is null or score >= 0),
  total_questions integer null check (total_questions is null or total_questions > 0),
  time_taken_seconds integer null check (time_taken_seconds is null or time_taken_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for lightning-fast KPI aggregations and funnel queries
create index if not exists site_analytics_event_type_created_at_idx
  on public.site_analytics (event_type, created_at desc);

create index if not exists site_analytics_subject_theme_created_at_idx
  on public.site_analytics (subject, theme, created_at desc)
  where subject is not null;

create index if not exists site_analytics_session_id_idx
  on public.site_analytics (session_id);

create index if not exists site_analytics_created_at_idx
  on public.site_analytics (created_at desc);

-- Enable Row Level Security (RLS)
alter table public.site_analytics enable row level security;

-- 1. Anonymous and authenticated visitors can safely INSERT telemetry pings
drop policy if exists "site_analytics are insertable by anyone" on public.site_analytics;
create policy "site_analytics are insertable by anyone"
  on public.site_analytics
  for insert
  to anon, authenticated
  with check (true);

-- 2. ONLY administrators can SELECT / read telemetry data
drop policy if exists "site_analytics are readable by admins only" on public.site_analytics;
create policy "site_analytics are readable by admins only"
  on public.site_analytics
  for select
  to authenticated
  using (public.is_admin());

-- 3. ONLY administrators can DELETE old telemetry rows (maintenance)
drop policy if exists "site_analytics are deletable by admins only" on public.site_analytics;
create policy "site_analytics are deletable by admins only"
  on public.site_analytics
  for delete
  to authenticated
  using (public.is_admin());

-- Reload PostgREST schema cache
select pg_notify('pgrst', 'reload schema');
