export * from './types.mjs';
export * from './inMemoryStore.mjs';
export * from './browserSession.mjs';
export * from './telemetryClient.mjs';
export * from './analyticsEngine.mjs';

import { InMemoryTelemetryStore } from './inMemoryStore.mjs';
import { TelemetryClient } from './telemetryClient.mjs';
import { AnalyticsEngine } from './analyticsEngine.mjs';
import { BrowserSession } from './browserSession.mjs';

/**
 * Creates a fresh, isolated test environment
 */
export function createTestEnvironment() {
  const store = new InMemoryTelemetryStore();
  const telemetry = new TelemetryClient(store);
  const analytics = new AnalyticsEngine(store);

  return {
    store,
    telemetry,
    analytics,
    createSession: (opts) => BrowserSession.createNewTab(opts),
  };
}
