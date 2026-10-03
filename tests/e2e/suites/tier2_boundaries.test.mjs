import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestEnvironment,
  EVENT_TYPES,
  TIME_RANGES,
} from '../harness/index.mjs';

test('Tier 2: Boundary & Corner Cases (8 comprehensive edge tests)', async (t) => {
  await t.test('B1: Rapid refreshes burst produces strictly 1 page_visit event', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession({ route: '/' });

    // Emulate 10 rapid refresh calls in parallel/tight loop
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(telemetry.trackPageVisit(session));
    }
    await Promise.all(promises);

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 1, 'Burst of rapid page refreshes must only log 1 visit');
  });

  await t.test('B2: Zero events empty state yields clean zeros without NaN or division by zero', async () => {
    const { analytics } = createTestEnvironment();
    const data = await analytics.getDashboardData();

    assert.equal(data.kpis.totalVisitors, 0);
    assert.equal(data.kpis.quizzesStarted, 0);
    assert.equal(data.kpis.quizzesCompleted, 0);
    assert.equal(data.kpis.completionRate, 0);
    assert.ok(!Number.isNaN(data.kpis.completionRate));

    assert.equal(data.funnel[0].count, 0);
    assert.equal(data.funnel[0].rate, 100);
    assert.equal(data.funnel[1].count, 0);
    assert.equal(data.funnel[1].rate, 0);
    assert.equal(data.funnel[2].count, 0);
    assert.equal(data.funnel[2].rate, 0);
    assert.deepEqual(data.subjectBreakdown, []);
  });

  await t.test('B3: 100% completion rate boundary: Funnel reports 100% rate and 0% drop-off', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    for (let i = 0; i < 5; i++) {
      const s = createSession();
      await telemetry.trackPageVisit(s);
      await telemetry.trackQuizStart(s, 'Quantitative Methods', 'Theme 1');
      await telemetry.trackQuizComplete(s, {
        subject: 'Quantitative Methods',
        theme: 'Theme 1',
        score: 25,
        total: 25,
        timeUsedSeconds: 90,
      });
    }

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.totalVisitors, 5);
    assert.equal(data.kpis.quizzesStarted, 5);
    assert.equal(data.kpis.quizzesCompleted, 5);
    assert.equal(data.kpis.completionRate, 100.0);

    const stage3 = data.funnel[2];
    assert.equal(stage3.rate, 100.0);
    assert.equal(stage3.dropOff, 0.0);
  });

  await t.test('B4: 0% completion rate boundary: 10 starts with 0 completions reports 100% drop-off', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    for (let i = 0; i < 10; i++) {
      const s = createSession();
      await telemetry.trackPageVisit(s);
      await telemetry.trackQuizStart(s, 'Financial Accounting', 'Theme 2');
      // Abandons without complete
    }

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.quizzesStarted, 10);
    assert.equal(data.kpis.quizzesCompleted, 0);
    assert.equal(data.kpis.completionRate, 0.0);

    const stage3 = data.funnel[2];
    assert.equal(stage3.rate, 0.0);
    assert.equal(stage3.dropOff, 100.0);
  });

  await t.test('B5: Partial quizzes / mid-session abandonment records start but never complete', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    await telemetry.trackPageVisit(session);
    await telemetry.trackQuizStart(session, 'Math for Eco', 'Theme 1');

    // Student answers questions 1..7 then closes tab
    session.clearStorage();

    const raw = store.getAllRawEvents();
    assert.equal(raw.length, 2);
    assert.equal(raw.some((e) => e.event_type === EVENT_TYPES.QUIZ_COMPLETE), false);
  });

  await t.test('B6: Missing optional fields and malformed payloads handled gracefully', async () => {
    const { store, analytics } = createTestEnvironment();

    // Directly insert record missing theme and metadata
    await store.insert({
      event_type: EVENT_TYPES.QUIZ_START,
      session_id: 'sess-malformed-1',
      subject: 'Exploring Economics',
      theme: null,
      metadata: null,
    });

    const data = await analytics.getDashboardData();
    assert.equal(data.kpis.quizzesStarted, 1);
    const sub = data.subjectBreakdown.find((s) => s.subject === 'Exploring Economics');
    assert.ok(sub);
    assert.equal(sub.starts, 1);
  });

  await t.test('B7: Timezone and midnight boundary: Precision windowing at 23:59:59 vs 00:00:00', async () => {
    const { telemetry, analytics, createSession } = createTestEnvironment();
    const s1 = createSession();
    const s2 = createSession();

    // Set fixed reference point for "now"
    const now = new Date('2026-10-04T12:00:00.000Z');

    // 1 second before midnight UTC today (yesterday 23:59:59.000Z)
    const justBeforeMidnight = new Date('2026-10-03T23:59:59.000Z').toISOString();
    // Midnight UTC today (2026-10-04T00:00:00.000Z)
    const exactlyMidnight = new Date('2026-10-04T00:00:00.000Z').toISOString();

    await telemetry.trackQuizStart(s1, 'Quantitative Methods', 'Theme 1', { createdAt: justBeforeMidnight });
    await telemetry.trackQuizStart(s2, 'Quantitative Methods', 'Theme 1', { createdAt: exactlyMidnight });

    // Under UTC boundary, only event at or after 00:00:00 UTC is today
    const todayDataUtc = await analytics.getDashboardData(TIME_RANGES.TODAY, { now, useUtc: true });
    assert.equal(todayDataUtc.kpis.quizzesStarted, 1, 'Only event on or after UTC midnight is included in Today UTC');

    // Under local boundary, an event 1 second before local midnight is excluded
    const localTodayStart = new Date(now);
    localTodayStart.setHours(0, 0, 0, 0);
    const beforeLocalMidnight = new Date(localTodayStart.getTime() - 1000).toISOString();
    const afterLocalMidnight = new Date(localTodayStart.getTime() + 1000).toISOString();

    const s3 = createSession();
    const s4 = createSession();
    await telemetry.trackQuizStart(s3, 'Financial Accounting', 'Theme 1', { createdAt: beforeLocalMidnight });
    await telemetry.trackQuizStart(s4, 'Financial Accounting', 'Theme 1', { createdAt: afterLocalMidnight });

    const todayDataLocal = await analytics.getDashboardData(TIME_RANGES.TODAY, { now, useUtc: false });
    const localEvents = await analytics.fetchEvents(TIME_RANGES.TODAY, { now, useUtc: false });
    assert.ok(!localEvents.some((e) => e.created_at === beforeLocalMidnight), 'Event before local midnight must be excluded');
    assert.ok(localEvents.some((e) => e.created_at === afterLocalMidnight), 'Event after local midnight must be included');
  });

  await t.test('B8: Offline / Network Error degradation: Telemetry failure never throws to client', async () => {
    const { telemetry, store, createSession } = createTestEnvironment();
    const session = createSession();

    // Simulate Supabase service disruption (503 / network drop)
    store.setNetworkError(true);

    // Call telemetry methods - MUST NOT THROW
    await assert.doesNotReject(async () => {
      await telemetry.trackPageVisit(session);
      await telemetry.trackQuizStart(session, 'Financial Accounting', 'Theme 1');
      await telemetry.trackQuizComplete(session, {
        subject: 'Financial Accounting',
        theme: 'Theme 1',
        score: 20,
        total: 25,
        timeUsedSeconds: 85,
      });
    }, 'Telemetry client calls must never throw or disrupt student app');

    store.setNetworkError(false);
  });
});
