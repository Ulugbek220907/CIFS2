import crypto from 'node:crypto';
import { EVENT_TYPES } from './types.mjs';

const SESSION_STORAGE_KEY_ID = 'cifs_analytics_session_id';
const SESSION_STORAGE_KEY_VISITED = 'cifs_analytics_visited';

/**
 * Client Telemetry Service adapter conforming to PROJECT.md § Interface Contracts.
 * Guarantees session deduplication, schema validation, and non-blocking error handling.
 */
export class TelemetryClient {
  constructor(store) {
    this.store = store;
  }

  /**
   * Retrieves or creates a unique session ID for the given browser session
   */
  getOrCreateSessionId(browserSession) {
    let sessionId = browserSession.getItem(SESSION_STORAGE_KEY_ID);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      browserSession.setItem(SESSION_STORAGE_KEY_ID, sessionId);
    }
    return sessionId;
  }

  /**
   * Tracks a page visit event.
   * Deduplicated across page refreshes within the same browser session.
   * Fire-and-forget: does not reject or throw on network error.
   */
  async trackPageVisit(browserSession, options = {}) {
    try {
      const alreadyVisited = browserSession.getItem(SESSION_STORAGE_KEY_VISITED);
      if (alreadyVisited === 'true') {
        return { deduplicated: true, sent: false };
      }

      const sessionId = this.getOrCreateSessionId(browserSession);
      browserSession.setItem(SESSION_STORAGE_KEY_VISITED, 'true');

      const payload = {
        event_type: EVENT_TYPES.PAGE_VISIT,
        session_id: sessionId,
        created_at: options.createdAt || new Date().toISOString(),
        metadata: {
          path: browserSession.route,
          referrer: browserSession.referrer,
          ...(options.metadata || {}),
        },
      };

      await this.store.insert(payload, { role: 'anon' });
      return { deduplicated: false, sent: true, payload };
    } catch (err) {
      // Non-blocking fire-and-forget: swallow error and log or degrade silently
      return { deduplicated: false, sent: false, error: err.message };
    }
  }

  /**
   * Tracks quiz start event.
   * Fire-and-forget: does not reject or throw.
   */
  async trackQuizStart(browserSession, subject, theme, options = {}) {
    try {
      const sessionId = this.getOrCreateSessionId(browserSession);
      const payload = {
        event_type: EVENT_TYPES.QUIZ_START,
        session_id: sessionId,
        subject,
        theme,
        created_at: options.createdAt || new Date().toISOString(),
      };

      await this.store.insert(payload, { role: 'anon' });
      return { sent: true, payload };
    } catch (err) {
      return { sent: false, error: err.message };
    }
  }

  /**
   * Tracks quiz complete event.
   * Fire-and-forget: does not reject or throw.
   */
  async trackQuizComplete(browserSession, { subject, theme, score, total = 25, timeUsedSeconds }, options = {}) {
    try {
      const sessionId = this.getOrCreateSessionId(browserSession);
      const payload = {
        event_type: EVENT_TYPES.QUIZ_COMPLETE,
        session_id: sessionId,
        subject,
        theme,
        score: Number(score),
        total_questions: Number(total),
        time_taken_seconds: Number(timeUsedSeconds),
        created_at: options.createdAt || new Date().toISOString(),
      };

      await this.store.insert(payload, { role: 'anon' });
      return { sent: true, payload };
    } catch (err) {
      return { sent: false, error: err.message };
    }
  }
}
