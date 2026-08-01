-- Paste this into the Supabase SQL editor if you need to upgrade an existing database.

alter table public.questions
  add column if not exists theme text;

update public.questions
set theme = case difficulty
  when 'Easy' then 'Theme 1'
  when 'Medium' then 'Theme 2'
  when 'Hard' then 'Theme 3'
  else coalesce(theme, 'Theme 1')
end
where theme is null;

alter table public.questions
  alter column theme set not null;

alter table public.questions
  drop column if exists difficulty;

alter table public.questions
  drop constraint if exists questions_theme_check;

alter table public.questions
  add constraint questions_theme_check check (theme in (
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
  ));

create index if not exists questions_subject_theme_created_at_idx
  on public.questions (subject, theme, created_at desc);

alter table public.results
  add column if not exists theme text;

update public.results
set theme = case difficulty
  when 'Easy' then 'Theme 1'
  when 'Medium' then 'Theme 2'
  when 'Hard' then 'Theme 3'
  else coalesce(theme, 'Theme 1')
end
where theme is null;

alter table public.results
  alter column theme set not null;

alter table public.results
  drop column if exists difficulty;

alter table public.results
  drop constraint if exists results_theme_check;

alter table public.results
  add constraint results_theme_check check (theme in (
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
  ));

select pg_notify('pgrst', 'reload schema');
