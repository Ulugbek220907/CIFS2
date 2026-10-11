-- 0009_mock_exam_questions.sql
-- Lets a mock exam own questions. A question belongs either to a theme (as before)
-- or to one mock exam, never both, so mock exam questions never leak into theme quizzes.
-- A mock exam may now also have no source themes at all (only its own questions).
-- Requires 0008_mock_exams.sql.

-- 1. Source themes become optional.
alter table public.mock_exams
  drop constraint if exists mock_exams_source_themes_check;

alter table public.mock_exams
  add constraint mock_exams_source_themes_check check (
    source_themes <@ array[
      'Theme 1', 'Theme 2', 'Theme 3', 'Theme 4',
      'Theme 5', 'Theme 6', 'Theme 7', 'Theme 8',
      'Theme 9', 'Theme 10', 'Theme 11', 'Theme 12'
    ]::text[]
  );

-- 2. Questions can point at a mock exam. Deleting the exam deletes its questions.
alter table public.questions
  add column if not exists mock_exam_id uuid references public.mock_exams (id) on delete cascade;

alter table public.questions
  alter column theme drop not null;

alter table public.questions
  drop constraint if exists questions_theme_check;

alter table public.questions
  add constraint questions_theme_check check (
    theme is null or theme in (
      'Theme 1', 'Theme 2', 'Theme 3', 'Theme 4',
      'Theme 5', 'Theme 6', 'Theme 7', 'Theme 8',
      'Theme 9', 'Theme 10', 'Theme 11', 'Theme 12'
    )
  );

-- Exactly one target: a theme or a mock exam.
alter table public.questions
  drop constraint if exists questions_target_check;

alter table public.questions
  add constraint questions_target_check check ((theme is null) <> (mock_exam_id is null));

create index if not exists questions_mock_exam_created_at_idx
  on public.questions (mock_exam_id, created_at desc)
  where mock_exam_id is not null;

select pg_notify('pgrst', 'reload schema');
