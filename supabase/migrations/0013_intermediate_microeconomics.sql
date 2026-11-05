-- 0013_intermediate_microeconomics.sql
-- Adds the 'Intermediate Microeconomics' subject (Level 5, abbreviation IM) everywhere a subject list is enforced.
-- Safe whether or not 0012 has been run: it replaces each subject check with the full current list.
-- Do NOT re-run 0011 or 0012 afterwards: they carry shorter lists and would drop the newer subjects again.
-- Requires 0008 (mock_exams) and 0007 (site_analytics).

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
    'Econometrics',
    'Management Accounting',
    'Intermediate Microeconomics'
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
    'Econometrics',
    'Management Accounting',
    'Intermediate Microeconomics'
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
    'Econometrics',
    'Management Accounting',
    'Intermediate Microeconomics'
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
    'Econometrics',
    'Management Accounting',
    'Intermediate Microeconomics'
  )
);

select pg_notify('pgrst', 'reload schema');
