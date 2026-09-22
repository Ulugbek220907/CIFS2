-- 0003_level4_and_ibe.sql

-- 1. Drop existing check constraints first so new subject values can be inserted/updated
alter table public.questions
  drop constraint if exists questions_subject_check;

alter table public.results
  drop constraint if exists results_subject_check;

-- 2. Add updated check constraints allowing new Level 4 subjects and both IBE and FoE
alter table public.questions
  add constraint questions_subject_check check (
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
      'Contemporary Issues in Global Economy'
    )
  );

alter table public.results
  add constraint results_subject_check check (
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
      'Contemporary Issues in Global Economy'
    )
  );

-- 3. Update existing questions and results from 'Foundations of Economics' to 'Introduction to Business and Economics'
update public.questions
set subject = 'Introduction to Business and Economics'
where subject = 'Foundations of Economics';

update public.results
set subject = 'Introduction to Business and Economics'
where subject = 'Foundations of Economics';

-- 4. Reload PostgREST schema cache
select pg_notify('pgrst', 'reload schema');

