-- 0015_admin_speed.sql
-- Makes the admin dashboard fast:
--  * admin_analytics_summary(): the Telemetry Command Center numbers are added up inside the database and come back
--    as one small JSON document, instead of the browser downloading every analytics event (several MB) and counting.
--  * admin_question_counts(): question totals per subject / theme / mock exam as a few dozen small rows, so the
--    dashboard no longer needs every question loaded just to show counts.
--  * an index so the newest-first question feed can be read page by page without sorting the whole table.
-- Both functions run with the caller's rights, so row-level security still applies: only admins can read analytics.
-- Safe to run more than once.

create index if not exists questions_created_at_id_idx on public.questions (created_at desc, id desc);

create or replace function public.admin_question_counts()
returns table (subject text, theme text, mock_exam_id uuid, question_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select q.subject, q.theme, q.mock_exam_id, count(*)::bigint
  from public.questions q
  group by q.subject, q.theme, q.mock_exam_id;
$$;

create or replace function public.admin_analytics_summary(p_since timestamptz default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select
      event_type,
      session_id,
      subject,
      theme,
      score,
      time_taken_seconds,
      case
        when jsonb_typeof(metadata -> 'mock_exam_title') = 'string' then left(btrim(metadata ->> 'mock_exam_title'), 80)
        else ''
      end as mock_title
    from public.site_analytics
    where p_since is null or created_at >= p_since
  ),
  totals as (
    select
      count(distinct session_id) filter (where event_type = 'page_visit') as visitors,
      count(*) filter (where event_type = 'page_visit') as visits,
      count(*) filter (where event_type = 'quiz_start') as starts,
      count(*) filter (where event_type = 'quiz_complete') as completes,
      coalesce(sum(score) filter (where event_type = 'quiz_complete'), 0) as score_sum,
      count(score) filter (where event_type = 'quiz_complete') as score_n,
      coalesce(sum(time_taken_seconds) filter (where event_type = 'quiz_complete'), 0) as time_sum,
      count(time_taken_seconds) filter (where event_type = 'quiz_complete') as time_n
    from ev
  ),
  themed as (
    select
      subject,
      case
        when mock_title <> '' then 'Mock Exam: ' || mock_title
        else coalesce(nullif(theme, ''), 'Theme 1')
      end as theme_key,
      count(*) filter (where event_type = 'quiz_start') as starts,
      count(*) filter (where event_type = 'quiz_complete') as completes
    from ev
    where subject is not null
    group by 1, 2
  ),
  by_subject as (
    select
      subject,
      sum(starts) as starts,
      sum(completes) as completes,
      jsonb_agg(
        jsonb_build_object('theme', theme_key, 'starts', starts, 'completions', completes)
        order by starts desc, theme_key
      ) as themes
    from themed
    group by subject
  )
  select jsonb_build_object(
    'totalVisitors', t.visitors,
    'totalVisits', t.visits,
    'quizzesStarted', t.starts,
    'quizzesCompleted', t.completes,
    'scoreSum', t.score_sum,
    'scoreCount', t.score_n,
    'timeSum', t.time_sum,
    'timeCount', t.time_n,
    'subjects', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('subject', s.subject, 'starts', s.starts, 'completions', s.completes, 'themes', s.themes)
          order by s.starts desc, s.subject
        )
        from by_subject s
      ),
      '[]'::jsonb
    )
  )
  from totals t;
$$;

revoke all on function public.admin_question_counts() from public, anon;
revoke all on function public.admin_analytics_summary(timestamptz) from public, anon;
grant execute on function public.admin_question_counts() to authenticated;
grant execute on function public.admin_analytics_summary(timestamptz) to authenticated;

-- Check "is this an admin?" once per query instead of once per analytics row (same rule, far less work).
drop policy if exists "site_analytics are readable by admins only" on public.site_analytics;
create policy "site_analytics are readable by admins only" on public.site_analytics
  for select to authenticated using ((select public.is_admin()));

select pg_notify('pgrst', 'reload schema');
