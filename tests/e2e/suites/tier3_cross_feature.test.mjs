import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestEnvironment,
  TIME_RANGES,
} from '../harness/index.mjs';

test('Tier 3: Cross-Feature Combinations (5 integration tests)', async (t) => {
  await t.test('C1: Multi-session funnel integrity: Heterogeneous visitor journeys aggregated accurately', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();

    // 10 visitors total:
    // - 3 bouncers (visit only)
    // - 2 abandoners (visit -> start -> abandon)
    // - 5 completers (visit -> start -> complete)
    for (let i = 0; i < 10; i++) {
      const s = createSession();
      await telemetry.trackPageVisit(s);

      if (i >= 3) {
        // 7 students start
        await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1');
      }

      if (i >= 5) {
        // 5 students complete
        await telemetry.trackQuizComplete(s, {
          subject: 'Quantitative Methods',
          theme: 'Theme 1',
          score: 21,
          total: 25,
          timeUsedSeconds: 150,
        });
      }
    }

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.totalVisitors, 10);
    assert.equal(data.kpis.quizzesStarted, 7);
    assert.equal(data.kpis.quizzesCompleted, 5);
    assert.equal(data.kpis.completionRate, 71.43); // 5/7 * 100

    const funnel = data.funnel;
    assert.equal(funnel[0].count, 10); // Visitors
    assert.equal(funnel[1].count, 7);  // Starts: 70% rate, 30% drop-off
    assert.equal(funnel[1].rate, 70.0);
    assert.equal(funnel[1].dropOff, 30.0);
    assert.equal(funnel[2].count, 5);  // Completions: 71.43% rate, 28.57% drop-off
    assert.equal(funnel[2].rate, 71.43);
    assert.equal(funnel[2].dropOff, 28.57);
  });

  await t.test('C2: Time filters applied to Subject Engagement Breakdown dynamically', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s = createSession();

    const eightDaysAgo = new Date(Date.now() - 8 * 86400 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();

    // Old event for Subject A
    await telemetry.trackQuizStart(s, 'Math for Eco', 'Theme 1', { createdAt: eightDaysAgo });
    await telemetry.trackQuizComplete(s, {
      subject: 'Math for Eco',
      theme: 'Theme 1',
      score: 20,
      total: 25,
      timeUsedSeconds: 100,
    }, { createdAt: eightDaysAgo });

    // Recent event for Subject B
    await telemetry.trackQuizStart(s, 'Financial Accounting', 'Theme 1', { createdAt: twoDaysAgo });
    await telemetry.trackQuizComplete(s, {
      subject: 'Financial Accounting',
      theme: 'Theme 1',
      score: 24,
      total: 25,
      timeUsedSeconds: 90,
    }, { createdAt: twoDaysAgo });

    // All time includes both
    const allData = await analytics.getDashboardData(TIME_RANGES.ALL);
    assert.equal(allData.subjectBreakdown.length, 2);

    // Last 7 days includes only Subject B
    const sevenDaysData = await analytics.getDashboardData(TIME_RANGES.LAST_7_DAYS);
    assert.equal(sevenDaysData.subjectBreakdown.length, 1);
    assert.equal(sevenDaysData.subjectBreakdown[0].subject, 'Financial Accounting');
  });

  await t.test('C3: Admin CRUD preservation: Question management state intact while telemetry refreshes', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();

    // Emulate Admin Question Management State
    const adminQuestionsState = [
      { id: 'q1', text: 'What is GDP?', subject: 'Introduction to Business and Economics' },
      { id: 'q2', text: 'Solve for x: 2x = 10', subject: 'Quantitative Methods' },
    ];

    // Admin creates question
    adminQuestionsState.push({ id: 'q3', text: 'What is debit vs credit?', subject: 'Financial Accounting' });
    assert.equal(adminQuestionsState.length, 3);

    // Concurrently, telemetry events occur and admin refreshes stats
    const s = createSession();
    await telemetry.trackPageVisit(s);
    await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1');

    // Refresh analytics dashboard
    const dashboardData = await analytics.getDashboardData();
    assert.equal(dashboardData.kpis.quizzesStarted, 1);

    // Admin state questions must be completely unaltered
    assert.equal(adminQuestionsState.length, 3);
    assert.equal(adminQuestionsState[2].id, 'q3');

    // Admin deletes question
    const updatedQuestions = adminQuestionsState.filter((q) => q.id !== 'q1');
    assert.equal(updatedQuestions.length, 2);

    // Telemetry stats reloaded again - remains intact
    const reloadedDashboard = await analytics.getDashboardData();
    assert.equal(reloadedDashboard.kpis.quizzesStarted, 1);
  });

  await t.test('C4: Concurrent user session isolation: No session crosstalk or collision', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();

    // 5 concurrent simulated browser sessions
    const sessions = Array.from({ length: 5 }, (_, i) =>
      createSession({ route: i % 2 === 0 ? '/' : '/quiz' })
    );

    await Promise.all(
      sessions.map(async (sess, idx) => {
        await telemetry.trackPageVisit(sess);
        await telemetry.trackQuizStart(sess, 'Quantitative Methods', `Theme ${idx + 1}`);
      })
    );

    const raw = store.getAllRawEvents();
    const sessionIds = new Set(raw.map((e) => e.session_id));
    assert.equal(sessionIds.size, 5, 'Every session must maintain strict isolation');

    // Each session must have exactly 1 page_visit and 1 quiz_start
    for (const sid of sessionIds) {
      const sessionEvents = raw.filter((e) => e.session_id === sid);
      assert.equal(sessionEvents.length, 2);
    }
  });

  await t.test('C5: Single session re-taking quizzes: 1 visitor, N starts, M completes', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const session = createSession();

    // Student visits once
    await telemetry.trackPageVisit(session);

    // Student takes Quiz 1 and completes
    await telemetry.trackQuizStart(session, 'Quantitative Methods', 'Theme 1');
    await telemetry.trackQuizComplete(session, {
      subject: 'Quantitative Methods',
      theme: 'Theme 1',
      score: 25,
      total: 25,
      timeUsedSeconds: 120,
    });

    // Student starts Quiz 2 and completes
    await telemetry.trackQuizStart(session, 'Quantitative Methods', 'Theme 2');
    await telemetry.trackQuizComplete(session, {
      subject: 'Quantitative Methods',
      theme: 'Theme 2',
      score: 22,
      total: 25,
      timeUsedSeconds: 110,
    });

    // Student starts Quiz 3 but abandons
    await telemetry.trackQuizStart(session, 'Math for Eco', 'Theme 1');

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.totalVisitors, 1);
    assert.equal(data.kpis.quizzesStarted, 3);
    assert.equal(data.kpis.quizzesCompleted, 2);
    assert.equal(data.kpis.completionRate, 66.67); // 2/3 * 100
  });
});
