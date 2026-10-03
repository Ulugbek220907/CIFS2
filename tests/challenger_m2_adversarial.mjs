import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Helper to set up fake browser DOM globals in Node.js
function setupFakeDom(options = {}) {
  const sessionStorageMap = new Map(options.sessionStorageEntries || []);
  const sessionStorage = {
    getItem: (key) => {
      if (options.storageThrowsGet) {
        throw new Error('SecurityError: The operation is insecure.');
      }
      return sessionStorageMap.get(key) ?? null;
    },
    setItem: (key, val) => {
      if (options.storageThrowsSet) {
        throw new Error('QuotaExceededError: Storage quota exceeded.');
      }
      sessionStorageMap.set(key, String(val));
    },
    removeItem: (key) => sessionStorageMap.delete(key),
    clear: () => sessionStorageMap.clear(),
  };

  const localStorageMap = new Map();
  const localStorage = {
    getItem: (key) => localStorageMap.get(key) ?? null,
    setItem: (key, val) => localStorageMap.set(key, String(val)),
    removeItem: (key) => localStorageMap.delete(key),
    clear: () => localStorageMap.clear(),
  };

  const elements = new Map();
  const document = {
    referrer: options.referrer !== undefined ? options.referrer : 'https://google.com/search?q=cifs',
    body: {
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
      },
    },
    getElementById: (id) => elements.get(id) ?? null,
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
      addEventListener: () => {},
      innerHTML: '',
      replaceChildren: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const window = {
    sessionStorage: options.noSessionStorage ? undefined : sessionStorage,
    localStorage,
    location: {
      pathname: options.pathname || '/quiz',
      origin: 'http://localhost:5173',
      search: '',
      hash: '',
    },
    crypto: options.noCrypto ? undefined : globalThis.crypto,
  };

  globalThis.window = window;
  globalThis.document = document;

  return {
    window,
    document,
    sessionStorage,
    sessionStorageMap,
    cleanup: () => {
      delete globalThis.window;
      delete globalThis.document;
    },
  };
}

function createMockContainer() {
  return {
    innerHTML: '',
    replaceChildren() {
      this.innerHTML = '';
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

test('SUITE 1: Failure Isolation — Behavior when isSupabaseConfigured is false', async () => {
  const dom = setupFakeDom();
  let viteServer;
  try {
    // In default environment without VITE_SUPABASE_URL, isSupabaseConfigured is false
    viteServer = await createServer({
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
    });

    const supabaseMod = await viteServer.ssrLoadModule('./src/supabase.ts');
    assert.equal(supabaseMod.isSupabaseConfigured, false, 'Precondition: Supabase is unconfigured');

    // Spy on supabase.from to ensure zero calls
    let supabaseFromCalls = 0;
    const originalFrom = supabaseMod.supabase.from;
    supabaseMod.supabase.from = (...args) => {
      supabaseFromCalls++;
      return originalFrom.apply(supabaseMod.supabase, args);
    };

    const telemetryMod = await viteServer.ssrLoadModule('./src/telemetry.ts');
    telemetryMod._resetTelemetryStateForTesting();

    // 1.1 Verify trackPageVisit
    assert.doesNotThrow(() => {
      telemetryMod.trackPageVisit();
    }, 'trackPageVisit must not throw when Supabase is not configured');

    // 1.2 Verify trackQuizStart
    assert.doesNotThrow(() => {
      telemetryMod.trackQuizStart('Quantitative Methods', 'Theme 1');
    }, 'trackQuizStart must not throw when Supabase is not configured');

    // 1.3 Verify trackQuizComplete
    assert.doesNotThrow(() => {
      telemetryMod.trackQuizComplete({
        subject: 'Quantitative Methods',
        theme: 'Theme 1',
        score: 18,
        total: 25,
        timeUsedSeconds: 300,
      });
    }, 'trackQuizComplete must not throw when Supabase is not configured');

    // Wait a tick for async promises
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert zero network calls to Supabase
    assert.equal(supabaseFromCalls, 0, 'Zero network calls made to Supabase when isSupabaseConfigured is false');

    // Assert session ID was generated and stored locally safely
    const sessionId = telemetryMod.getAnalyticsSessionId();
    assert.ok(sessionId, 'Session ID is generated cleanly');
    assert.equal(dom.sessionStorage.getItem(telemetryMod.SESSION_STORAGE_SESSION_ID_KEY), sessionId);

    // 1.4 Test QuizApp.startQuiz when isSupabaseConfigured is false
    const quizMod = await viteServer.ssrLoadModule('./src/quiz.ts');
    const container = createMockContainer();
    const quizApp = new quizMod.QuizApp(container);

    // Call startQuiz
    await quizApp['startQuiz']({ subject: 'Quantitative Methods', theme: 'Theme 1' });

    assert.equal(quizApp['state'].phase, 'error', 'Phase transitions to error');
    assert.equal(quizApp['state'].errorKind, 'connection', 'Error kind is connection');
    assert.match(quizApp['state'].error, /could not connect/i, 'Error message warns about connection');
    assert.equal(supabaseFromCalls, 0, 'No quiz_start telemetry emitted when unconfigured');
  } finally {
    if (viteServer) await viteServer.close();
    dom.cleanup();
  }
});

test('SUITE 2: Supabase Error & Network Drop Resilience (Silent Failure, Non-Blocking)', async () => {
  const dom = setupFakeDom();
  let viteServer;
  try {
    viteServer = await createServer({
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://real-cifs-test.supabase.co'),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('valid-anon-key-12345'),
      },
    });

    const supabaseMod = await viteServer.ssrLoadModule('./src/supabase.ts');
    assert.equal(supabaseMod.isSupabaseConfigured, true, 'Precondition: Supabase is configured');

    const telemetryMod = await viteServer.ssrLoadModule('./src/telemetry.ts');

    let insertBehavior = 'error_response';
    const insertedEvents = [];

    // Monkey-patch supabase.from to simulate network/database conditions
    supabaseMod.supabase.from = (tableName) => {
      assert.equal(tableName, 'site_analytics', 'Querying site_analytics table');
      return {
        insert: async (row) => {
          insertedEvents.push(row);
          if (insertBehavior === 'error_response') {
            return { error: { message: 'Database 500: Connection refused' } };
          }
          if (insertBehavior === 'throw_sync') {
            throw new Error('Supabase client synchronous crash');
          }
          if (insertBehavior === 'reject_async') {
            return Promise.reject(new TypeError('Failed to fetch: Network offline'));
          }
          if (insertBehavior === 'hang') {
            // Simulate extreme 10-second latency
            return new Promise((resolve) => setTimeout(() => resolve({ error: null }), 10000));
          }
          return { error: null };
        },
      };
    };

    // 2.1: Supabase returns { error: { message } }
    insertBehavior = 'error_response';
    telemetryMod._resetTelemetryStateForTesting();
    dom.sessionStorage.clear();

    assert.doesNotThrow(() => {
      telemetryMod.trackPageVisit();
      telemetryMod.trackQuizStart('Quantitative Methods', 'Theme 1');
      telemetryMod.trackQuizComplete({
        subject: 'Quantitative Methods',
        theme: 'Theme 1',
        score: 22,
        total: 25,
        timeUsedSeconds: 150,
      });
    }, 'Must not throw when Supabase returns error object');

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2.2: Supabase throws synchronously
    insertBehavior = 'throw_sync';
    telemetryMod._resetTelemetryStateForTesting();
    dom.sessionStorage.clear();

    assert.doesNotThrow(() => {
      telemetryMod.trackPageVisit();
      telemetryMod.trackQuizStart('Financial Accounting', 'Theme 2');
      telemetryMod.trackQuizComplete({
        subject: 'Financial Accounting',
        theme: 'Theme 2',
        score: 10,
        total: 25,
        timeUsedSeconds: 80,
      });
    }, 'Must not throw when Supabase throws synchronously');

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2.3: Supabase rejects asynchronously (Network drop / offline)
    insertBehavior = 'reject_async';
    telemetryMod._resetTelemetryStateForTesting();
    dom.sessionStorage.clear();

    assert.doesNotThrow(() => {
      telemetryMod.trackPageVisit();
      telemetryMod.trackQuizStart('Essentials of Economics', 'Theme 3');
      telemetryMod.trackQuizComplete({
        subject: 'Essentials of Economics',
        theme: 'Theme 3',
        score: 25,
        total: 25,
        timeUsedSeconds: 200,
      });
    }, 'Must not throw when Supabase rejects with network failure');

    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2.4: Supabase hangs (Non-blocking check)
    insertBehavior = 'hang';
    telemetryMod._resetTelemetryStateForTesting();
    dom.sessionStorage.clear();

    const startTimestamp = Date.now();
    telemetryMod.trackPageVisit();
    telemetryMod.trackQuizStart('Math for Eco', 'Theme 1');
    telemetryMod.trackQuizComplete({
      subject: 'Math for Eco',
      theme: 'Theme 1',
      score: 15,
      total: 25,
      timeUsedSeconds: 90,
    });
    const executionDuration = Date.now() - startTimestamp;

    assert.ok(
      executionDuration < 50,
      `Telemetry operations must return immediately without blocking UI (took ${executionDuration}ms)`
    );
  } finally {
    if (viteServer) await viteServer.close();
    dom.cleanup();
  }
});

test('SUITE 3: Lifecycle Transitions — Quiz Abort vs Completion', async () => {
  const dom = setupFakeDom();
  let viteServer;
  try {
    viteServer = await createServer({
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://real-cifs-test.supabase.co'),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('valid-anon-key-12345'),
      },
    });

    const supabaseMod = await viteServer.ssrLoadModule('./src/supabase.ts');
    const recordedEvents = [];
    supabaseMod.supabase.from = (tableName) => ({
      insert: async (row) => {
        recordedEvents.push(row);
        return { error: null };
      },
    });

    const quizMod = await viteServer.ssrLoadModule('./src/quiz.ts');
    const container = createMockContainer();
    const quizApp = new quizMod.QuizApp(container);

    // Initial state: setup phase
    assert.equal(quizApp['state'].phase, 'setup');

    // Simulate quiz in progress (user on question index 5)
    const mockQuestions = Array.from({ length: 25 }, (_, i) => ({
      id: `q-${i + 1}`,
      question: `Question ${i + 1}`,
      options: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      explanation: 'Explanation',
      subject: 'Quantitative Methods',
      theme: 'Theme 1',
    }));

    quizApp['state'] = {
      ...quizApp['state'],
      phase: 'question',
      userId: 'test-user-123',
      questions: mockQuestions,
      currentIndex: 5,
      score: 4,
      startedAt: Date.now() - 30000,
      config: { subject: 'Quantitative Methods', theme: 'Theme 1' },
    };

    // ACTION: ABORT the quiz!
    quizApp['abortQuiz']();

    // Verification 1: Phase is reset to 'setup'
    assert.equal(quizApp['state'].phase, 'setup', 'Aborting resets phase to setup');
    assert.equal(quizApp['state'].questions.length, 0, 'Questions cleared on abort');
    assert.equal(quizApp['state'].startedAt, null, 'startedAt cleared on abort');
    assert.equal(quizApp['state'].score, 0, 'Score reset to 0');
    assert.equal(quizApp['state'].result, null, 'Result is null');

    // Verification 2: Check recorded events - NEVER quiz_complete on abort
    await new Promise((resolve) => setTimeout(resolve, 50));
    const completeEventsAfterAbort = recordedEvents.filter((e) => e.event_type === 'quiz_complete');
    assert.equal(
      completeEventsAfterAbort.length,
      0,
      'CRITICAL: Starting a quiz and clicking abort must NEVER fire quiz_complete'
    );

    // Verification 3: If finishQuiz is invoked after abort, it is guarded and does nothing
    await quizApp['finishQuiz']('completed');
    assert.equal(quizApp['state'].phase, 'setup', 'finishQuiz after abort is a no-op');
    assert.equal(recordedEvents.filter((e) => e.event_type === 'quiz_complete').length, 0);

    // Verification 4: User begins another quiz and finishes all 25 questions
    quizApp['state'] = {
      ...quizApp['state'],
      phase: 'question',
      userId: 'test-user-123',
      questions: mockQuestions,
      currentIndex: 24,
      score: 22,
      startedAt: Date.now() - 75000,
      config: { subject: 'Quantitative Methods', theme: 'Theme 1' },
    };

    await quizApp['finishQuiz']('completed');
    assert.equal(quizApp['state'].phase, 'results', 'Completing quiz transitions to results');
    assert.ok(quizApp['state'].result, 'Result object created');
    assert.equal(quizApp['state'].result.score, 22);
    assert.equal(quizApp['state'].result.total, 25);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const finalCompleteEvents = recordedEvents.filter((e) => e.event_type === 'quiz_complete');
    assert.equal(finalCompleteEvents.length, 1, 'Exactly 1 quiz_complete event emitted for the finished quiz');
    assert.equal(finalCompleteEvents[0].score, 22);
    assert.equal(finalCompleteEvents[0].total_questions, 25);
    assert.equal(finalCompleteEvents[0].subject, 'Quantitative Methods');
    assert.equal(finalCompleteEvents[0].theme, 'Theme 1');
  } finally {
    if (viteServer) await viteServer.close();
    dom.cleanup();
  }
});

test('SUITE 4: Question Pool Failure / Insufficiency (quiz_start NOT fired)', async () => {
  const dom = setupFakeDom();
  let viteServer;
  try {
    viteServer = await createServer({
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://real-cifs-test.supabase.co'),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('valid-anon-key-12345'),
      },
    });

    const recordedEvents = [];
    const supabaseMod = await viteServer.ssrLoadModule('./src/supabase.ts');
    supabaseMod.supabase.from = (tableName) => {
      if (tableName === 'site_analytics') {
        return {
          insert: async (row) => {
            recordedEvents.push(row);
            return { error: null };
          },
        };
      }
      // When questions table is queried, return error / insufficient pool
      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({
              // Return only 5 questions (insufficient: needs 25)
              data: Array.from({ length: 5 }, (_, i) => ({
                id: `q-${i}`,
                question: `Q ${i}`,
                options: ['1', '2', '3', '4'],
                correct_index: 0,
                explanation: 'E',
                subject: 'Quantitative Methods',
                theme: 'Theme 1',
              })),
              error: null,
            }),
          }),
        }),
      };
    };

    const quizMod = await viteServer.ssrLoadModule('./src/quiz.ts');
    const container = createMockContainer();
    const quizApp = new quizMod.QuizApp(container);

    // Attempt to start quiz with insufficient pool
    await quizApp['startQuiz']({ subject: 'Quantitative Methods', theme: 'Theme 1' });

    // Assert state transitions to error with 'insufficient' kind
    assert.equal(quizApp['state'].phase, 'error', 'Phase must be error');
    assert.equal(quizApp['state'].errorKind, 'insufficient', 'Error kind must be insufficient');
    assert.match(quizApp['state'].error, /currently being prepared/i);

    // CRITICAL: quiz_start must NOT be fired!
    await new Promise((resolve) => setTimeout(resolve, 50));
    const startEvents = recordedEvents.filter((e) => e.event_type === 'quiz_start');
    assert.equal(
      startEvents.length,
      0,
      'CRITICAL: If question pool is insufficient, quiz_start must NOT be fired'
    );

    // 4.2: Now test when Supabase throws a network exception during loadQuestionPool
    supabaseMod.supabase.from = (tableName) => {
      if (tableName === 'site_analytics') {
        return {
          insert: async (row) => {
            recordedEvents.push(row);
            return { error: null };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: async () => {
              throw new Error('503 Service Unavailable: Network dropped');
            },
          }),
        }),
      };
    };

    await quizApp['startQuiz']({ subject: 'Financial Accounting', theme: 'Theme 1' });
    assert.equal(quizApp['state'].phase, 'error', 'Phase must be error on network drop');
    assert.equal(quizApp['state'].errorKind, 'generic', 'Error kind must be generic');

    await new Promise((resolve) => setTimeout(resolve, 50));
    const totalStartEvents = recordedEvents.filter((e) => e.event_type === 'quiz_start');
    assert.equal(
      totalStartEvents.length,
      0,
      'CRITICAL: If question pool fetch throws network error, quiz_start must NOT be fired'
    );
  } finally {
    if (viteServer) await viteServer.close();
    dom.cleanup();
  }
});

test('SUITE 5: Session Storage Edge Cases & Deduplication Stress', async () => {
  const dom = setupFakeDom();
  let viteServer;
  try {
    viteServer = await createServer({
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
    });
    const telemetryMod = await viteServer.ssrLoadModule('./src/telemetry.ts');

    // 5.1: 100 rapid concurrent calls to trackPageVisit in same session
    telemetryMod._resetTelemetryStateForTesting();
    dom.sessionStorage.clear();

    for (let i = 0; i < 100; i++) {
      telemetryMod.trackPageVisit();
    }
    assert.equal(dom.sessionStorage.getItem(telemetryMod.SESSION_STORAGE_VISIT_LOGGED_KEY), 'true');

    // 5.2: Storage throws SecurityError (restricted Safari private browsing)
    dom.cleanup();
    const throwingDom = setupFakeDom({ storageThrowsGet: true, storageThrowsSet: true });

    telemetryMod._resetTelemetryStateForTesting();
    assert.doesNotThrow(() => {
      const sessionId = telemetryMod.getAnalyticsSessionId();
      assert.ok(sessionId, 'Session ID generated despite storage security errors');
      telemetryMod.trackPageVisit();
    }, 'trackPageVisit must survive restricted storage without throwing');

    throwingDom.cleanup();

    // 5.3: Environment without window.sessionStorage
    const noStorageDom = setupFakeDom({ noSessionStorage: true });
    telemetryMod._resetTelemetryStateForTesting();

    assert.doesNotThrow(() => {
      const sessionId = telemetryMod.getAnalyticsSessionId();
      assert.ok(sessionId, 'Fallback session ID generated when window.sessionStorage is undefined');
      telemetryMod.trackPageVisit();
    }, 'trackPageVisit must survive undefined sessionStorage');

    noStorageDom.cleanup();

    // 5.4: Fallback when crypto.randomUUID is undefined
    const noCryptoDom = setupFakeDom({ noCrypto: true });
    telemetryMod._resetTelemetryStateForTesting();

    assert.doesNotThrow(() => {
      const sessionId = telemetryMod.getAnalyticsSessionId();
      assert.ok(sessionId, 'Fallback session ID generated when crypto.randomUUID is undefined');
      assert.ok(typeof sessionId === 'string' && sessionId.length > 5);
    }, 'getAnalyticsSessionId must survive missing crypto.randomUUID');

    noCryptoDom.cleanup();
  } finally {
    if (viteServer) await viteServer.close();
  }
});

test('SUITE 6: Telemetry Payload Schema & Data Integrity Conformance', async () => {
  const dom = setupFakeDom({ pathname: '/quiz', referrer: 'https://school.edu/courses' });
  let viteServer;
  try {
    viteServer = await createServer({
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://real-cifs-test.supabase.co'),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('valid-anon-key-12345'),
      },
    });

    const supabaseMod = await viteServer.ssrLoadModule('./src/supabase.ts');
    const insertedRows = [];
    supabaseMod.supabase.from = (tableName) => ({
      insert: async (row) => {
        insertedRows.push(row);
        return { error: null };
      },
    });

    const telemetryMod = await viteServer.ssrLoadModule('./src/telemetry.ts');
    telemetryMod._resetTelemetryStateForTesting();

    // 6.1 Test page_visit payload structure
    telemetryMod.trackPageVisit();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(insertedRows.length, 1);
    const visitRow = insertedRows[0];
    assert.equal(visitRow.event_type, 'page_visit');
    assert.ok(visitRow.session_id, 'session_id is non-empty');
    assert.ok(visitRow.created_at, 'created_at is defined');
    assert.equal(visitRow.metadata.path, '/quiz');
    assert.equal(visitRow.metadata.referrer, 'https://school.edu/courses');

    // 6.2 Test quiz_start payload structure
    telemetryMod.trackQuizStart('Math for Eco', 'Theme 1');
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(insertedRows.length, 2);
    const startRow = insertedRows[1];
    assert.equal(startRow.event_type, 'quiz_start');
    assert.equal(startRow.session_id, visitRow.session_id, 'Preserves same session_id');
    assert.equal(startRow.subject, 'Math for Eco');
    assert.equal(startRow.theme, 'Theme 1');
    assert.ok(startRow.created_at, 'created_at timestamp attached');

    // 6.3 Test quiz_complete payload structure
    telemetryMod.trackQuizComplete({
      subject: 'Math for Eco',
      theme: 'Theme 1',
      score: 25,
      total: 25,
      timeUsedSeconds: 180,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(insertedRows.length, 3);
    const completeRow = insertedRows[2];
    assert.equal(completeRow.event_type, 'quiz_complete');
    assert.equal(completeRow.session_id, visitRow.session_id, 'Preserves same session_id');
    assert.equal(completeRow.subject, 'Math for Eco');
    assert.equal(completeRow.theme, 'Theme 1');
    assert.equal(completeRow.score, 25);
    assert.equal(completeRow.total_questions, 25);
    assert.equal(completeRow.time_taken_seconds, 180);
    assert.ok(completeRow.created_at, 'created_at timestamp attached');
  } finally {
    if (viteServer) await viteServer.close();
    dom.cleanup();
  }
});
