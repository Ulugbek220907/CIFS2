-- 0004_add_level4_subjects.sql

-- 1. Drop existing check constraints first so new subject values can be inserted/updated
alter table public.questions
  drop constraint if exists questions_subject_check;

alter table public.results
  drop constraint if exists results_subject_check;

-- 2. Add updated check constraints allowing all subjects including FA, FoS, and EoE
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
      'Contemporary Issues in Global Economy',
      'Financial Accounting',
      'Fundamentals of Statistics',
      'Essentials of Economics'
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
      'Contemporary Issues in Global Economy',
      'Financial Accounting',
      'Fundamentals of Statistics',
      'Essentials of Economics'
    )
  );

-- 3. Reload PostgREST schema cache
select pg_notify('pgrst', 'reload schema');
