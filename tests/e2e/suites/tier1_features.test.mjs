import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestEnvironment,
  EVENT_TYPES,
  CIFS_SUBJECTS,
  LEVEL4_SUBJECTS,
  ALL_SUBJECTS,
  TIME_RANGES,
} from '../harness/index.mjs';

test('Tier 1: Feature Coverage (35 tests across 7 core features)', async (t) => {
  // =========================================================================
  // Feature 1: Session Visit Deduplication (5 tests)
  // =========================================================================
  await t.test('F1.1: Initial page visit records exactly 1 page_visit event', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession({ route: '/' });

    const result = await telemetry.trackPageVisit(session);
    assert.equal(result.deduplicated, false);
    assert.equal(result.sent, true);

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 1);
    assert.equal(raw[0].event_type, EVENT_TYPES.PAGE_VISIT);
    assert.ok(raw[0].session_id, 'Must generate a valid session ID');
  });

  await t.test('F1.2: Page refresh within the same session does not log duplicate visit', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession({ route: '/' });

    await telemetry.trackPageVisit(session);
    session.reload();
    const secondResult = await telemetry.trackPageVisit(session);

    assert.equal(secondResult.deduplicated, true);
    assert.equal(secondResult.sent, false);

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 1, 'Store must still contain exactly 1 event after reload');
  });

  await t.test('F1.3: Multi-route navigation (/ to /quiz to /admin) does not duplicate visit', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession({ route: '/' });

    await telemetry.trackPageVisit(session);
    session.navigate('/quiz');
    await telemetry.trackPageVisit(session);
    session.navigate('/admin');
    await telemetry.trackPageVisit(session);

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 1, 'Only the initial entry should log a page_visit');
  });

  await t.test('F1.4: New browser session generates a distinct session ID and logs a new visit', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session1 = createSession({ route: '/' });
    const session2 = createSession({ route: '/' });

    await telemetry.trackPageVisit(session1);
    await telemetry.trackPageVisit(session2);

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 2);
    assert.notEqual(raw[0].session_id, raw[1].session_id, 'Each session must have a distinct session_id');
  });

  await t.test('F1.5: Page visit captures correct metadata without personally identifying info', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession({ route: '/quiz', referrer: 'https://google.com' });

    await telemetry.trackPageVisit(session);
    const raw = store.getAllRawEvents();

    assert.equal(raw.length, 1);
    assert.equal(raw[0].metadata.path, '/quiz');
    assert.equal(raw[0].metadata.referrer, 'https://google.com');
    assert.equal(raw[0].metadata.userEmail, undefined, 'No PII stored in metadata');
  });

  // =========================================================================
  // Feature 2: Quiz Start Logging with Subject/Theme (5 tests)
  // =========================================================================
  await t.test('F2.1: Starting a quiz records quiz_start event with valid subject and theme', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    const result = await telemetry.trackQuizStart(session, 'Quantitative Methods', 'Theme 1');
    assert.equal(result.sent, true);

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 1);
    assert.equal(raw[0].event_type, EVENT_TYPES.QUIZ_START);
    assert.equal(raw[0].subject, 'Quantitative Methods');
    assert.equal(raw[0].theme, 'Theme 1');
  });

  await t.test('F2.2: Starting different subjects (CIFS vs Level 4) accurately records subject identifier', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizStart(session, 'Introduction to Business and Economics', 'Theme 2');
    await telemetry.trackQuizStart(session, 'Financial Accounting', 'Theme 5');

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 2);
    assert.equal(raw[0].subject, 'Introduction to Business and Economics');
    assert.equal(raw[1].subject, 'Financial Accounting');
  });

  await t.test('F2.3: Starting different themes across subjects records appropriate theme string', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizStart(session, 'Math for Eco', 'Theme 12');
    const raw = store.getAllRawEvents();
    assert.equal(raw[0].theme, 'Theme 12');
  });

  await t.test('F2.4: Multiple quiz starts in the same session maintain same session_id', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackPageVisit(session);
    await telemetry.trackQuizStart(session, 'Quantitative Methods', 'Theme 1');
    await telemetry.trackQuizStart(session, 'Exploring Economics', 'Theme 3');

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 3);
    const sid = raw[0].session_id;
    assert.equal(raw[1].session_id, sid);
    assert.equal(raw[2].session_id, sid);
  });

  await t.test('F2.5: Quiz start event does not trigger an erroneous quiz_complete event', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizStart(session, 'Fundamentals of Statistics', 'Theme 1');
    const completes = store.getAllRawEvents().filter((e) => e.event_type === EVENT_TYPES.QUIZ_COMPLETE);
    assert.equal(completes.length, 0);
  });

  // =========================================================================
  // Feature 3: Quiz Complete Logging with Score/Time (5 tests)
  // =========================================================================
  await t.test('F3.1: Completing quiz records quiz_complete event with score, total (25), and time', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizComplete(session, {
      subject: 'Financial Accounting',
      theme: 'Theme 1',
      score: 20,
      total: 25,
      timeUsedSeconds: 145,
    });

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 1);
    assert.equal(raw[0].event_type, EVENT_TYPES.QUIZ_COMPLETE);
    assert.equal(raw[0].score, 20);
    assert.equal(raw[0].total_questions, 25);
    assert.equal(raw[0].time_taken_seconds, 145);
  });

  await t.test('F3.2: Completing quiz with 0/25 score records valid 0 score and 25 total', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizComplete(session, {
      subject: 'Math for Eco',
      theme: 'Theme 2',
      score: 0,
      total: 25,
      timeUsedSeconds: 300,
    });

    const raw = store.getAllRawEvents();
    assert.equal(raw[0].score, 0);
    assert.equal(raw[0].total_questions, 25);
  });

  await t.test('F3.3: Completing quiz with perfect score 25/25 records score 25', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizComplete(session, {
      subject: 'Critical Thinking & Citizenship',
      theme: 'Theme 4',
      score: 25,
      total: 25,
      timeUsedSeconds: 180,
    });

    const raw = store.getAllRawEvents();
    assert.equal(raw[0].score, 25);
  });

  await t.test('F3.4: Time taken in seconds is recorded as a positive elapsed duration', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizComplete(session, {
      subject: 'Understanding Finance',
      theme: 'Theme 6',
      score: 18,
      total: 25,
      timeUsedSeconds: 42,
    });

    const raw = store.getAllRawEvents();
    assert.ok(raw[0].time_taken_seconds > 0);
    assert.equal(raw[0].time_taken_seconds, 42);
  });

  await t.test('F3.5: Quiz complete preserves subject, theme, and session linkage from quiz start', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackQuizStart(session, 'Essentials of Economics', 'Theme 1');
    await telemetry.trackQuizComplete(session, {
      subject: 'Essentials of Economics',
      theme: 'Theme 1',
      score: 22,
      total: 25,
      timeUsedSeconds: 120,
    });

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 2);
    assert.equal(raw[0].session_id, raw[1].session_id);
    assert.equal(raw[0].subject, raw[1].subject);
    assert.equal(raw[0].theme, raw[1].theme);
  });

  // =========================================================================
  // Feature 4: Executive KPI Cards (5 tests)
  // =========================================================================
  await t.test('F4.1: Total Visitors KPI accurately counts unique session IDs from page_visit events', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s1 = createSession();
    const s2 = createSession();
    const s3 = createSession();

    await telemetry.trackPageVisit(s1);
    await telemetry.trackPageVisit(s2);
    await telemetry.trackPageVisit(s3);
    s1.reload();
    await telemetry.trackPageVisit(s1);

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.totalVisitors, 3);
  });

  await t.test('F4.2: Total Quizzes Started KPI matches total count of quiz_start events', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1');
    await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 2');

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.quizzesStarted, 2);
  });

  await t.test('F4.3: Total Quizzes Completed KPI matches total count of quiz_complete events', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    await telemetry.trackQuizComplete(s, {
      subject: 'Quantitative Methods',
      theme: 'Theme 1',
      score: 24,
      total: 25,
      timeUsedSeconds: 100,
    });

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.quizzesCompleted, 1);
  });

  await t.test('F4.4: Overall Completion Rate computes accurately as (Completions / Starts) * 100', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s1 = createSession();
    const s2 = createSession();

    await telemetry.trackQuizStart(s1, 'Financial Accounting', 'Theme 1');
    await telemetry.trackQuizComplete(s1, {
      subject: 'Financial Accounting',
      theme: 'Theme 1',
      score: 20,
      total: 25,
      timeUsedSeconds: 90,
    });

    await telemetry.trackQuizStart(s2, 'Financial Accounting', 'Theme 2');
    // s2 abandons without completion

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.quizzesStarted, 2);
    assert.equal(data.kpis.quizzesCompleted, 1);
    assert.equal(data.kpis.completionRate, 50.0);
  });

  await t.test('F4.5: Overall Completion Rate safely returns 0% when zero quizzes have been started', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();
    await telemetry.trackPageVisit(s);

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.quizzesStarted, 0);
    assert.equal(data.kpis.quizzesCompleted, 0);
    assert.equal(data.kpis.completionRate, 0);
  });

  // =========================================================================
  // Feature 5: Interactive Conversion Funnel (5 tests)
  // =========================================================================
  await t.test('F5.1: Conversion funnel renders exactly 3 stages: Visitors, Starts, Completions', async () => {
    const { analytics } = createTestEnvironment();
    const data = await analytics.getDashboardData();

    assert.equal(data.funnel.length, 3);
    assert.equal(data.funnel[0].stage, 'Visitors');
    assert.equal(data.funnel[1].stage, 'Starts');
    assert.equal(data.funnel[2].stage, 'Completions');
  });

  await t.test('F5.2: Stage 1 (Visitors) has count = visitors, rate = 100%, and dropOff = 0%', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s1 = createSession();
    const s2 = createSession();
    await telemetry.trackPageVisit(s1);
    await telemetry.trackPageVisit(s2);

    const data = await analytics.getDashboardData();
    const stage1 = data.funnel[0];
    assert.equal(stage1.count, 2);
    assert.equal(stage1.rate, 100);
    assert.equal(stage1.dropOff, 0);
  });

  await t.test('F5.3: Stage 2 (Starts) calculates conversion rate and drop-off percentage accurately', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    // 4 visitors, 3 start a quiz -> 75% rate, 25% drop-off
    for (let i = 0; i < 4; i++) {
      const s = createSession();
      await telemetry.trackPageVisit(s);
      if (i < 3) {
        await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1');
      }
    }

    const data = await analytics.getDashboardData();
    const stage2 = data.funnel[1];
    assert.equal(stage2.count, 3);
    assert.equal(stage2.rate, 75.0);
    assert.equal(stage2.dropOff, 25.0);
  });

  await t.test('F5.4: Stage 3 (Completions) calculates conversion rate and drop-off percentage accurately', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    // 2 starts, 1 completes -> 50% rate, 50% drop-off
    const s1 = createSession();
    const s2 = createSession();
    await telemetry.trackQuizStart(s1, 'Financial Accounting', 'Theme 1');
    await telemetry.trackQuizComplete(s1, {
      subject: 'Financial Accounting',
      theme: 'Theme 1',
      score: 18,
      total: 25,
      timeUsedSeconds: 120,
    });

    await telemetry.trackQuizStart(s2, 'Financial Accounting', 'Theme 1');

    const data = await analytics.getDashboardData();
    const stage3 = data.funnel[2];
    assert.equal(stage3.count, 1);
    assert.equal(stage3.rate, 50.0);
    assert.equal(stage3.dropOff, 50.0);
  });

  await t.test('F5.5: Funnel handles repeating quiz takers (Starts > Visitors) without negative dropOff', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();
    await telemetry.trackPageVisit(s);
    await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 1');
    await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 2');

    const data = await analytics.getDashboardData();
    const stage2 = data.funnel[1];
    assert.equal(stage2.count, 2);
    assert.ok(stage2.rate >= 100);
    assert.equal(stage2.dropOff, 0, 'Drop-off cannot be negative');
  });

  // =========================================================================
  // Feature 6: Subject & Theme Breakdown (5 tests)
  // =========================================================================
  await t.test('F6.1: Correctly tallies quiz starts and completions aggregated by subject', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1');
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 2');
    await telemetry.trackQuizComplete(s, {
      subject: 'Quantitative Methods',
      theme: 'Theme 1',
      score: 22,
      total: 25,
      timeUsedSeconds: 110,
    });

    await telemetry.trackQuizStart(s, 'Financial Accounting', 'Theme 1');

    const data = await analytics.getDashboardData();
    const qm = data.subjectBreakdown.find((x) => x.subject === 'Quantitative Methods');
    const fa = data.subjectBreakdown.find((x) => x.subject === 'Financial Accounting');

    assert.ok(qm);
    assert.equal(qm.starts, 2);
    assert.equal(qm.completions, 1);

    assert.ok(fa);
    assert.equal(fa.starts, 1);
    assert.equal(fa.completions, 0);
  });

  await t.test('F6.2: Correctly tallies engagement down to theme level within each subject', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    await telemetry.trackQuizStart(s, 'Financial Accounting', 'Theme 1');
    await telemetry.trackQuizStart(s, 'Financial Accounting', 'Theme 2');

    const data = await analytics.getDashboardData();
    const fa = data.subjectBreakdown.find((x) => x.subject === 'Financial Accounting');
    assert.ok(fa);
    assert.equal(fa.themes.length, 2);
    assert.ok(fa.themes.some((t) => t.theme === 'Theme 1' && t.starts === 1));
    assert.ok(fa.themes.some((t) => t.theme === 'Theme 2' && t.starts === 1));
  });

  await t.test('F6.3: Computes subject-specific completion rates: (Completions / Starts) * 100', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 1');
    await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 2');
    await telemetry.trackQuizComplete(s, {
      subject: 'Math for Eco',
      theme: 'Theme 1',
      score: 15,
      total: 25,
      timeUsedSeconds: 200,
    });

    const data = await analytics.getDashboardData();
    const mfe = data.subjectBreakdown.find((x) => x.subject === 'Math for Eco');
    assert.ok(mfe);
    assert.equal(mfe.completionRate, 50.0);
  });

  await t.test('F6.4: Ranks subjects by engagement (highest activity first)', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    // Subject A: 1 start
    await telemetry.trackQuizStart(s, 'Understanding Finance', 'Theme 1');

    // Subject B: 3 starts
    await telemetry.trackQuizStart(s, 'Exploring Economics', 'Theme 1');
    await telemetry.trackQuizStart(s, 'Exploring Economics', 'Theme 2');
    await telemetry.trackQuizStart(s, 'Exploring Economics', 'Theme 3');

    const data = await analytics.getDashboardData();
    assert.equal(data.subjectBreakdown[0].subject, 'Exploring Economics');
    assert.equal(data.subjectBreakdown[1].subject, 'Understanding Finance');
  });

  await t.test('F6.5: Empty breakdown produces empty array without errors or exceptions', async () => {
    const { analytics } = createTestEnvironment();
    const data = await analytics.getDashboardData();
    assert.deepEqual(data.subjectBreakdown, []);
  });

  // =========================================================================
  // Feature 7: Time Range Filters (5 tests)
  // =========================================================================
  await t.test('F7.1: All Time filter aggregates all historical telemetry events', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    // Event 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1', { createdAt: tenDaysAgo });

    // Event today
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 2');

    const data = await analytics.getDashboardData(TIME_RANGES.ALL);
    assert.equal(data.kpis.quizzesStarted, 2);
  });

  await t.test('F7.2: Last 7 Days filter includes events within past 7 days and excludes older events', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    // Event 10 days ago (should be excluded)
    const tenDaysAgo = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1', { createdAt: tenDaysAgo });

    // Event 3 days ago (should be included)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 2', { createdAt: threeDaysAgo });

    const data = await analytics.getDashboardData(TIME_RANGES.LAST_7_DAYS);
    assert.equal(data.kpis.quizzesStarted, 1);
  });

  await t.test('F7.3: Today filter includes only events created since midnight today', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    // Event yesterday at 23:00 (excluded)
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1', { createdAt: yesterday });

    // Event right now (included)
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 2');

    const data = await analytics.getDashboardData(TIME_RANGES.TODAY);
    assert.equal(data.kpis.quizzesStarted, 1);
  });

  await t.test('F7.4: Switching filter selection dynamically recalculates KPIs, funnel, and breakdown', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    const oldDate = new Date(Date.now() - 5 * 86400 * 1000).toISOString();
    await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 1', { createdAt: oldDate });

    const allData = await analytics.getDashboardData(TIME_RANGES.ALL);
    const todayData = await analytics.getDashboardData(TIME_RANGES.TODAY);

    assert.equal(allData.kpis.quizzesStarted, 1);
    assert.equal(todayData.kpis.quizzesStarted, 0);
  });

  await t.test('F7.5: Filter periods with zero matching events return clean zero-state dashboard metrics', async () => {
    const { analytics } = createTestEnvironment();
    const todayData = await analytics.getDashboardData(TIME_RANGES.TODAY);

    assert.equal(todayData.kpis.totalVisitors, 0);
    assert.equal(todayData.kpis.quizzesStarted, 0);
    assert.equal(todayData.kpis.quizzesCompleted, 0);
    assert.equal(todayData.kpis.completionRate, 0);
    assert.equal(todayData.funnel[0].count, 0);
    assert.equal(todayData.funnel[1].count, 0);
    assert.equal(todayData.funnel[2].count, 0);
  });
});
