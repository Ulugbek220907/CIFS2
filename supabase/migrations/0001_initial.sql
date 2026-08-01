create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  theme text not null check (theme in (
    'Theme 1',
    'Theme 2',
    'Theme 3',
    'Theme 4',
    'Theme 5',
    'Theme 6',
    'Theme 7',
    'Theme 8',
    'Theme 9',
    'Theme 10',
    'Theme 11',
    'Theme 12'
  )),
  question_text text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text not null,
  created_at timestamptz not null default now(),
  constraint questions_subject_check check (
    subject in (
      'Quantitative Methods',
      'Academic Communication Skills',
      'Professional Skills & Employability',
      'Critical Thinking & Citizenship',
      'Foundations of Economics',
      'Understanding Finance'
    )
  )
);

create index if not exists questions_subject_theme_created_at_idx
  on public.questions (subject, theme, created_at desc);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  theme text not null check (theme in (
    'Theme 1',
    'Theme 2',
    'Theme 3',
    'Theme 4',
    'Theme 5',
    'Theme 6',
    'Theme 7',
    'Theme 8',
    'Theme 9',
    'Theme 10',
    'Theme 11',
    'Theme 12'
  )),
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  percent integer not null check (percent between 0 and 100),
  time_used_seconds integer not null check (time_used_seconds >= 0),
  created_at timestamptz not null default now(),
  constraint results_subject_check check (
    subject in (
      'Quantitative Methods',
      'Academic Communication Skills',
      'Professional Skills & Employability',
      'Critical Thinking & Citizenship',
      'Foundations of Economics',
      'Understanding Finance'
    )
  )
);

create index if not exists results_user_id_created_at_idx
  on public.results (user_id, created_at desc);

alter table public.questions enable row level security;
alter table public.results enable row level security;

create policy "questions are readable by everyone"
  on public.questions
  for select
  using (true);

create policy "questions are writable by authenticated non-anonymous users"
  on public.questions
  for insert
  with check (
    auth.role() = 'authenticated'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

create policy "questions are updatable by authenticated non-anonymous users"
  on public.questions
  for update
  using (
    auth.role() = 'authenticated'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    auth.role() = 'authenticated'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

create policy "questions are deletable by authenticated non-anonymous users"
  on public.questions
  for delete
  using (
    auth.role() = 'authenticated'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

create policy "results are readable by owner"
  on public.results
  for select
  using (auth.uid() = user_id);

create policy "results are insertable by owner"
  on public.results
  for insert
  with check (auth.uid() = user_id);
