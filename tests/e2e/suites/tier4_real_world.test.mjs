import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestEnvironment,
  TIME_RANGES,
} from '../harness/index.mjs';

test('Tier 4: Real-World Application Scenarios (3 end-to-end cohort simulations)', async (t) => {
  await t.test('R1: 50-student cohort simulation: Full lifecycle from arrival to admin executive review', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();

    // -----------------------------------------------------------------------
    // Cohort A: 30 students taking CIFS "Quantitative Methods"
    // - 25 complete all 25 questions
    // - 5 abandon midway
    // -----------------------------------------------------------------------
    for (let i = 0; i < 30; i++) {
      const s = createSession({ route: '/' });
      await telemetry.trackPageVisit(s);
      await telemetry.trackQuizStart(s, 'Quantitative Methods', `Theme ${(i % 4) + 1}`);

      if (i < 25) {
        await telemetry.trackQuizComplete(s, {
          subject: 'Quantitative Methods',
          theme: `Theme ${(i % 4) + 1}`,
          score: 18 + (i % 8),
          total: 25,
          timeUsedSeconds: 90 + i * 5,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Cohort B: 15 students taking Level 4 "Financial Accounting"
    // - 12 complete all 25 questions
    // - 3 abandon midway
    // -----------------------------------------------------------------------
    for (let i = 0; i < 15; i++) {
      const s = createSession({ route: '/' });
      await telemetry.trackPageVisit(s);
      await telemetry.trackQuizStart(s, 'Financial Accounting', `Theme ${(i % 3) + 1}`);

      if (i < 12) {
        await telemetry.trackQuizComplete(s, {
          subject: 'Financial Accounting',
          theme: `Theme ${(i % 3) + 1}`,
          score: 20 + (i % 6),
          total: 25,
          timeUsedSeconds: 120 + i * 3,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Cohort C: 5 students who visit but never start a quiz (pure bounces)
    // -----------------------------------------------------------------------
    for (let i = 0; i < 5; i++) {
      const s = createSession({ route: '/' });
      await telemetry.trackPageVisit(s);
      // Browse around and leave
      s.reload();
      await telemetry.trackPageVisit(s); // Deduplication test under cohort
    }

    // -----------------------------------------------------------------------
    // Admin Executive Review Verification
    // -----------------------------------------------------------------------
    const dashboard = await analytics.getDashboardData();

    // 1. KPI Cards Verification
    // Total Visitors: 30 + 15 + 5 = 50
    assert.equal(dashboard.kpis.totalVisitors, 50, 'Total unique visitors must equal 50');
    // Total Quizzes Started: 30 + 15 = 45
    assert.equal(dashboard.kpis.quizzesStarted, 45, 'Total quizzes started must equal 45');
    // Total Quizzes Completed: 25 + 12 = 37
    assert.equal(dashboard.kpis.quizzesCompleted, 37, 'Total quizzes completed must equal 37');
    // Overall Completion Rate: (37 / 45) * 100 = 82.22%
    assert.equal(dashboard.kpis.completionRate, 82.22, 'Overall completion rate must be 82.22%');

    // 2. Conversion Funnel Verification
    // Stage 1: Visitors (50 count, 100% rate, 0% drop-off)
    const funnel = dashboard.funnel;
    assert.equal(funnel[0].stage, 'Visitors');
    assert.equal(funnel[0].count, 50);
    assert.equal(funnel[0].rate, 100);
    assert.equal(funnel[0].dropOff, 0);

    // Stage 2: Starts (45 count, 90.00% rate, 10.00% drop-off)
    assert.equal(funnel[1].stage, 'Starts');
    assert.equal(funnel[1].count, 45);
    assert.equal(funnel[1].rate, 90.0);
    assert.equal(funnel[1].dropOff, 10.0);

    // Stage 3: Completions (37 count, 82.22% rate, 17.78% drop-off)
    assert.equal(funnel[2].stage, 'Completions');
    assert.equal(funnel[2].count, 37);
    assert.equal(funnel[2].rate, 82.22);
    assert.equal(funnel[2].dropOff, 17.78);

    // 3. Subject Breakdown Verification
    assert.equal(dashboard.subjectBreakdown.length, 2);

    const qm = dashboard.subjectBreakdown.find((s) => s.subject === 'Quantitative Methods');
    assert.ok(qm, 'Quantitative Methods breakdown must be present');
    assert.equal(qm.starts, 30);
    assert.equal(qm.completions, 25);
    assert.equal(qm.completionRate, 83.33); // (25 / 30) * 100

    const fa = dashboard.subjectBreakdown.find((s) => s.subject === 'Financial Accounting');
    assert.ok(fa, 'Financial Accounting breakdown must be present');
    assert.equal(fa.starts, 15);
    assert.equal(fa.completions, 12);
    assert.equal(fa.completionRate, 80.0); // (12 / 15) * 100
  });

  await t.test('R2: Multi-day exam revision cycle: Time filtering across historical cohort windows', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();

    const now = new Date('2026-10-10T15:00:00.000Z');
    const day10DaysAgo = new Date('2026-09-30T10:00:00.000Z').toISOString();
    const day3DaysAgo = new Date('2026-10-07T10:00:00.000Z').toISOString();
    const todayMorning = new Date('2026-10-10T09:00:00.000Z').toISOString();

    // Past exam wave 1 (10 days ago): 10 students
    for (let i = 0; i < 10; i++) {
      const s = createSession();
      await telemetry.trackPageVisit(s, { createdAt: day10DaysAgo });
      await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 1', { createdAt: day10DaysAgo });
      await telemetry.trackQuizComplete(s, {
        subject: 'Math for Eco',
        theme: 'Theme 1',
        score: 22,
        total: 25,
        timeUsedSeconds: 110,
      }, { createdAt: day10DaysAgo });
    }

    // Past exam wave 2 (3 days ago): 8 students
    for (let i = 0; i < 8; i++) {
      const s = createSession();
      await telemetry.trackPageVisit(s, { createdAt: day3DaysAgo });
      await telemetry.trackQuizStart(s, 'Exploring Economics', 'Theme 1', { createdAt: day3DaysAgo });
      await telemetry.trackQuizComplete(s, {
        subject: 'Exploring Economics',
        theme: 'Theme 1',
        score: 21,
        total: 25,
        timeUsedSeconds: 95,
      }, { createdAt: day3DaysAgo });
    }

    // Active wave today: 5 students
    for (let i = 0; i < 5; i++) {
      const s = createSession();
      await telemetry.trackPageVisit(s, { createdAt: todayMorning });
      await telemetry.trackQuizStart(s, 'Contemporary Issues in Global Economy', 'Theme 1', { createdAt: todayMorning });
      if (i < 4) {
        await telemetry.trackQuizComplete(s, {
          subject: 'Contemporary Issues in Global Economy',
          theme: 'Theme 1',
          score: 24,
          total: 25,
          timeUsedSeconds: 100,
        }, { createdAt: todayMorning });
      }
    }

    // Check All Time
    const allData = await analytics.getDashboardData(TIME_RANGES.ALL, { now });
    assert.equal(allData.kpis.totalVisitors, 23);
    assert.equal(allData.kpis.quizzesStarted, 23);
    assert.equal(allData.kpis.quizzesCompleted, 22);

    // Check Last 7 Days (excludes wave 1)
    const sevenDaysData = await analytics.getDashboardData(TIME_RANGES.LAST_7_DAYS, { now });
    assert.equal(sevenDaysData.kpis.totalVisitors, 13); // 8 + 5
    assert.equal(sevenDaysData.kpis.quizzesStarted, 13);
    assert.equal(sevenDaysData.kpis.quizzesCompleted, 12); // 8 + 4

    // Check Today (only wave 3)
    const todayData = await analytics.getDashboardData(TIME_RANGES.TODAY, { now });
    assert.equal(todayData.kpis.totalVisitors, 5);
    assert.equal(todayData.kpis.quizzesStarted, 5);
    assert.equal(todayData.kpis.quizzesCompleted, 4);
    assert.equal(todayData.kpis.completionRate, 80.0);
  });

  await t.test('R3: High-throughput rush simulation with intermittent network drops', async () => {
    const { telemetry, analytics, store, createSession } = createTestEnvironment();

    // 20 students concurrently taking quizzes during high rush
    const students = Array.from({ length: 20 }, () => createSession());

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      // Occasional network blip for every 5th student
      const hasDrop = i % 5 === 0;
      if (hasDrop) store.setNetworkError(true);

      await telemetry.trackPageVisit(s);
      await telemetry.trackQuizStart(s, 'Fundamentals of Statistics', 'Theme 1');
      await telemetry.trackQuizComplete(s, {
        subject: 'Fundamentals of Statistics',
        theme: 'Theme 1',
        score: 23,
        total: 25,
        timeUsedSeconds: 80,
      });

      if (hasDrop) store.setNetworkError(false);
    }

    // Admin reviews recorded data
    const data = await analytics.getDashboardData();
    // 20 total students; 4 dropped during network errors, 16 successfully logged
    assert.equal(data.kpis.totalVisitors, 16);
    assert.equal(data.kpis.quizzesStarted, 16);
    assert.equal(data.kpis.quizzesCompleted, 16);
    assert.equal(data.kpis.completionRate, 100.0);
  });
});
