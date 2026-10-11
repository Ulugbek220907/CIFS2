-- 0008_mock_exams.sql
-- Mock exams that sit between themes in a subject's quiz list. Each one samples
-- questions from the themes the admin picks, so no questions are duplicated.
-- Requires public.is_admin() from 0005_harden_admin_rls.sql.

create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (
    subject in (
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
  title text not null check (char_length(btrim(title)) between 1 and 80 and title ~ '[^[:space:]]'),
  -- Number of themes listed before the exam: 0 = above Theme 1, 4 = right after Theme 4.
  after_theme integer not null default 0 check (after_theme between 0 and 12),
  source_themes text[] not null check (
    cardinality(source_themes) >= 1
    and source_themes <@ array[
      'Theme 1', 'Theme 2', 'Theme 3', 'Theme 4',
      'Theme 5', 'Theme 6', 'Theme 7', 'Theme 8',
      'Theme 9', 'Theme 10', 'Theme 11', 'Theme 12'
    ]::text[]
  ),
  question_count integer not null default 25 check (question_count between 5 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mock_exams_subject_after_theme_idx
  on public.mock_exams (subject, after_theme, created_at);

alter table public.mock_exams enable row level security;

-- Everyone (including anonymous students) can read mock exams.
drop policy if exists "mock_exams are readable by anyone" on public.mock_exams;
create policy "mock_exams are readable by anyone"
  on public.mock_exams
  for select
  using (true);

-- Only administrators can create, edit, or delete them.
drop policy if exists "mock_exams are insertable by admins" on public.mock_exams;
create policy "mock_exams are insertable by admins"
  on public.mock_exams
  for insert
  with check (public.is_admin());

drop policy if exists "mock_exams are updatable by admins" on public.mock_exams;
create policy "mock_exams are updatable by admins"
  on public.mock_exams
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "mock_exams are deletable by admins" on public.mock_exams;
create policy "mock_exams are deletable by admins"
  on public.mock_exams
  for delete
  using (public.is_admin());

-- Keep updated_at honest for edits made from any client, including the SQL editor.
create or replace function public.mock_exams_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mock_exams_touch_updated_at on public.mock_exams;
create trigger mock_exams_touch_updated_at
  before update on public.mock_exams
  for each row execute function public.mock_exams_touch_updated_at();

select pg_notify('pgrst', 'reload schema');
