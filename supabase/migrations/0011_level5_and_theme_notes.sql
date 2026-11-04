-- 0011_level5_and_theme_notes.sql
-- 1. Level 5: adds the 'Econometrics' subject everywhere a subject list is enforced.
-- 2. "Notes From Lecture": an optional https link per subject + theme, shown under each theme on /quiz.
-- Requires 0005 (public.is_admin) and 0008 (mock_exams).

-- ---------------------------------------------------------------------------
-- 1. Econometrics
-- ---------------------------------------------------------------------------
alter table public.questions drop constraint if exists questions_subject_check;
alter table public.questions add constraint questions_subject_check check (
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
    'Essentials of Economics',
    'Econometrics'
  )
);

alter table public.results drop constraint if exists results_subject_check;
alter table public.results add constraint results_subject_check check (
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
    'Essentials of Economics',
    'Econometrics'
  )
);

alter table public.site_analytics drop constraint if exists site_analytics_subject_check;
alter table public.site_analytics add constraint site_analytics_subject_check check (
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
    'Essentials of Economics',
    'Econometrics'
  )
);

alter table public.mock_exams drop constraint if exists mock_exams_subject_check;
alter table public.mock_exams add constraint mock_exams_subject_check check (
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
    'Essentials of Economics',
    'Econometrics'
  )
);

-- ---------------------------------------------------------------------------
-- 2. Notes From Lecture links
-- ---------------------------------------------------------------------------
create table if not exists public.theme_notes (
  subject text not null,
  theme text not null check (theme in (
    'Theme 1', 'Theme 2', 'Theme 3', 'Theme 4',
    'Theme 5', 'Theme 6', 'Theme 7', 'Theme 8',
    'Theme 9', 'Theme 10', 'Theme 11', 'Theme 12'
  )),
  -- https only, so a javascript: or data: link can never be stored.
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject, theme)
);

alter table public.theme_notes enable row level security;

drop policy if exists "theme_notes are readable by anyone" on public.theme_notes;
create policy "theme_notes are readable by anyone"
  on public.theme_notes
  for select
  using (true);

drop policy if exists "theme_notes are insertable by admins" on public.theme_notes;
create policy "theme_notes are insertable by admins"
  on public.theme_notes
  for insert
  with check (public.is_admin());

drop policy if exists "theme_notes are updatable by admins" on public.theme_notes;
create policy "theme_notes are updatable by admins"
  on public.theme_notes
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "theme_notes are deletable by admins" on public.theme_notes;
create policy "theme_notes are deletable by admins"
  on public.theme_notes
  for delete
  using (public.is_admin());

select pg_notify('pgrst', 'reload schema');
