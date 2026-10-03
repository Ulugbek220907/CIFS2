import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

/**
 * Mock Window & SessionStorage environment helper
 */
function createMockBrowserEnv() {
  const store = new Map();
  return {
    window: {
      sessionStorage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, val) => store.set(key, String(val)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
      },
      location: {
        pathname: '/quiz',
      },
    },
    document: {
      referrer: 'https://example.edu/course',
    },
    _rawStore: store,
  };
}

test('Adversarial Telemetry Stress & Verification Suite', async (suite) => {
  process.env.VITE_SUPABASE_URL = 'https://adversarial-test.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'adversarial-anon-key';

  // Spin up Vite SSR runtime to load production TypeScript modules directly
  const viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  const capturedEvents = [];
  let insertShouldThrow = false;
  let insertShouldError = false;

  // Load and patch supabase module
  const supabaseMod = await viteServer.ssrLoadModule('./src/supabase.ts');
  supabaseMod.supabase.from = (table) => ({
    insert: async (row) => {
      if (insertShouldThrow) {
        throw new Error('Adversarial fatal network disconnect');
      }
      if (insertShouldError) {
        return { data: null, error: { message: 'Adversarial Postgres RLS policy check failure' } };
      }
      capturedEvents.push({ table, row });
      return { data: null, error: null };
    },
  });

  // Load telemetry module
  const telemetry = await viteServer.ssrLoadModule('./src/telemetry.ts');

  suite.after(async () => {
    await viteServer.close();
  });

  // =========================================================================
  // Test 1: Multiple consecutive calls in the same session only log 1 visit
  // =========================================================================
  await suite.test('Test 1: Consecutive burst calls to trackPageVisit() in same session log strictly 1 visit', async () => {
    capturedEvents.length = 0;
    telemetry._resetTelemetryStateForTesting();

    const env = createMockBrowserEnv();
    globalThis.window = env.window;
    globalThis.document = env.document;

    // Call trackPageVisit 100 consecutive times
    for (let i = 0; i < 100; i++) {
      telemetry.trackPageVisit();
    }

    // Wait a tick for microtasks
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(capturedEvents.length, 1, 'Exactly 1 page_visit event must be captured despite 100 calls');
    assert.equal(capturedEvents[0].table, 'site_analytics');
    assert.equal(capturedEvents[0].row.event_type, 'page_visit');
    assert.ok(capturedEvents[0].row.session_id, 'Must contain a valid session_id');
    assert.equal(capturedEvents[0].row.metadata.path, '/quiz');
    assert.equal(capturedEvents[0].row.metadata.referrer, 'https://example.edu/course');
  });

  // =========================================================================
  // Test 2: Rapid concurrent async calls (race condition resistance)
  // =========================================================================
  await suite.test('Test 2: Rapid concurrent async calls to trackPageVisit() log strictly 1 visit', async () => {
    capturedEvents.length = 0;
    telemetry._resetTelemetryStateForTesting();

    const env = createMockBrowserEnv();
    globalThis.window = env.window;
    globalThis.document = env.document;

    // Dispatch 50 asynchronous concurrent promises
    await Promise.all(
      Array.from({ length: 50 }, () => {
        telemetry.trackPageVisit();
        return Promise.resolve();
      })
    );

    await new Promise((r) => setTimeout(r, 20));

    assert.equal(capturedEvents.length, 1, 'Concurrent burst must still only insert 1 page_visit');
  });

  // =========================================================================
  // Test 3: sessionStorage persistence preserves session_id and visit flag across simulated refresh
  // =========================================================================
  await suite.test('Test 3: Simulated page refresh preserves session_id and suppresses duplicate page_visit', async () => {
    capturedEvents.length = 0;
    telemetry._resetTelemetryStateForTesting();

    const env = createMockBrowserEnv();
    globalThis.window = env.window;
    globalThis.document = env.document;

    // Visit page initially
    telemetry.trackPageVisit();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(capturedEvents.length, 1);
    const initialSessionId = capturedEvents[0].row.session_id;
    assert.ok(initialSessionId);

    // Verify sessionStorage state
    const storedSessionId = env.window.sessionStorage.getItem(telemetry.SESSION_STORAGE_SESSION_ID_KEY);
    const storedVisited = env.window.sessionStorage.getItem(telemetry.SESSION_STORAGE_VISIT_LOGGED_KEY);
    assert.equal(storedSessionId, initialSessionId);
    assert.equal(storedVisited, 'true');

    // Simulate page refresh:
    // In a browser refresh, sessionStorage stays intact, but in-memory JS runtime state is reset
    telemetry._resetTelemetryStateForTesting();

    // Re-execute page boot visit after refresh
    telemetry.trackPageVisit();
    await new Promise((r) => setTimeout(r, 10));

    // Must NOT have logged another visit
    assert.equal(capturedEvents.length, 1, 'Simulated refresh must NOT create a second page_visit');

    // Active session ID must remain identical to pre-refresh session ID
    const currentSessionId = telemetry.getAnalyticsSessionId();
    assert.equal(currentSessionId, initialSessionId, 'Session ID must remain stable across page refresh');
  });

  // =========================================================================
  // Test 4: Starting a new session generates distinct session_id and logs a new visit
  // =========================================================================
  await suite.test('Test 4: Starting a new session generates distinct session_id and logs new visit', async () => {
    // Current state has 1 event from previous session
    const prevSessionId = telemetry.getAnalyticsSessionId();
    const prevEventsCount = capturedEvents.length;

    // Simulate opening a new browser tab/session (empty storage, reset in-memory)
    const newEnv = createMockBrowserEnv();
    globalThis.window = newEnv.window;
    globalThis.document = newEnv.document;
    telemetry._resetTelemetryStateForTesting();

    // Trigger visit in new session
    telemetry.trackPageVisit();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(capturedEvents.length, prevEventsCount + 1, 'New session must log exactly 1 new visit');
    const newEvent = capturedEvents[capturedEvents.length - 1];
    assert.equal(newEvent.row.event_type, 'page_visit');
    assert.ok(newEvent.row.session_id);
    assert.notEqual(newEvent.row.session_id, prevSessionId, 'New session ID must differ from previous session ID');
  });

  // =========================================================================
  // Test 5: Storage failure fallback (sessionStorage throws SecurityError)
  // =========================================================================
  await suite.test('Test 5: Storage throwing exception degrades safely to in-memory deduplication', async () => {
    capturedEvents.length = 0;
    telemetry._resetTelemetryStateForTesting();

    // Restrictive iframe or private mode where sessionStorage throws SecurityError
    globalThis.window = {
      get sessionStorage() {
        throw new Error('SecurityError: Access to Storage is denied for document');
      },
      location: { pathname: '/quiz' },
    };
    globalThis.document = { referrer: '' };

    // Should not throw
    assert.doesNotThrow(() => {
      telemetry.trackPageVisit();
      telemetry.trackPageVisit();
      telemetry.trackPageVisit();
    });

    await new Promise((r) => setTimeout(r, 20));

    assert.equal(capturedEvents.length, 1, 'In-memory fallback must deduplicate even when storage access throws');
    assert.ok(capturedEvents[0].row.session_id, 'Fallback in-memory UUID must be generated');
  });

  // =========================================================================
  // Test 6: Full conversion funnel sequence sharing identical session_id
  // =========================================================================
  await suite.test('Test 6: Full Visit -> Start -> Complete journey preserves exact session_id linkage', async () => {
    capturedEvents.length = 0;
    telemetry._resetTelemetryStateForTesting();

    const env = createMockBrowserEnv();
    globalThis.window = env.window;
    globalThis.document = env.document;

    // 1. Visit
    telemetry.trackPageVisit();

    // 2. Quiz Start 1
    telemetry.trackQuizStart('Financial Accounting', 'Theme 1');

    // 3. Quiz Complete 1
    telemetry.trackQuizComplete({
      subject: 'Financial Accounting',
      theme: 'Theme 1',
      score: 23,
      total: 25,
      timeUsedSeconds: 140,
    });

    // 4. Quiz Start 2 (student retakes or switches subject)
    telemetry.trackQuizStart('Fundamentals of Statistics', 'Theme 4');

    // 5. Quiz Complete 2
    telemetry.trackQuizComplete({
      subject: 'Fundamentals of Statistics',
      theme: 'Theme 4',
      score: 25,
      total: 25,
      timeUsedSeconds: 195,
    });

    await new Promise((r) => setTimeout(r, 25));

    assert.equal(capturedEvents.length, 5, 'Must capture 5 distinct events');

    const expectedSessionId = telemetry.getAnalyticsSessionId();
    for (const ev of capturedEvents) {
      assert.equal(ev.row.session_id, expectedSessionId, 'Every lifecycle event must share the same session_id');
    }

    // Verify individual row payloads
    assert.equal(capturedEvents[0].row.event_type, 'page_visit');

    assert.equal(capturedEvents[1].row.event_type, 'quiz_start');
    assert.equal(capturedEvents[1].row.subject, 'Financial Accounting');
    assert.equal(capturedEvents[1].row.theme, 'Theme 1');

    assert.equal(capturedEvents[2].row.event_type, 'quiz_complete');
    assert.equal(capturedEvents[2].row.subject, 'Financial Accounting');
    assert.equal(capturedEvents[2].row.theme, 'Theme 1');
    assert.equal(capturedEvents[2].row.score, 23);
    assert.equal(capturedEvents[2].row.total_questions, 25);
    assert.equal(capturedEvents[2].row.time_taken_seconds, 140);

    assert.equal(capturedEvents[3].row.event_type, 'quiz_start');
    assert.equal(capturedEvents[3].row.subject, 'Fundamentals of Statistics');
    assert.equal(capturedEvents[3].row.theme, 'Theme 4');

    assert.equal(capturedEvents[4].row.event_type, 'quiz_complete');
    assert.equal(capturedEvents[4].row.score, 25);
    assert.equal(capturedEvents[4].row.total_questions, 25);
    assert.equal(capturedEvents[4].row.time_taken_seconds, 195);
  });

  // =========================================================================
  // Test 7: Adversarial Network / Database Failure Handling (Never throws to UI)
  // =========================================================================
  await suite.test('Test 7: Fatal Supabase throw and RLS failure do not throw or break caller execution', async () => {
    capturedEvents.length = 0;
    telemetry._resetTelemetryStateForTesting();

    const env = createMockBrowserEnv();
    globalThis.window = env.window;
    globalThis.document = env.document;

    // Subcase 7A: Database throws exception
    insertShouldThrow = true;
    insertShouldError = false;

    assert.doesNotThrow(() => {
      telemetry.trackPageVisit();
      telemetry.trackQuizStart('Math for Eco', 'Theme 2');
      telemetry.trackQuizComplete({
        subject: 'Math for Eco',
        theme: 'Theme 2',
        score: 10,
        total: 25,
        timeUsedSeconds: 30,
      });
    });

    await new Promise((r) => setTimeout(r, 20));

    // Subcase 7B: Database returns RLS error object
    insertShouldThrow = false;
    insertShouldError = true;

    assert.doesNotThrow(() => {
      telemetry.trackQuizStart('Exploring Economics', 'Theme 1');
      telemetry.trackQuizComplete({
        subject: 'Exploring Economics',
        theme: 'Theme 1',
        score: 20,
        total: 25,
        timeUsedSeconds: 80,
      });
    });

    await new Promise((r) => setTimeout(r, 20));

    // Restore clean state
    insertShouldThrow = false;
    insertShouldError = false;
  });
});
