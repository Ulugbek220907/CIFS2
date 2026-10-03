import { isSupabaseConfigured, supabase } from './supabase';
import { uid } from './dom';
import type { Subject, Theme } from './types';

export const SESSION_STORAGE_SESSION_ID_KEY = 'pulse-quiz:analytics-session-id';
export const SESSION_STORAGE_VISIT_LOGGED_KEY = 'pulse-quiz:analytics-visit-logged';

let inMemorySessionId: string | null = null;
let inMemoryVisitLogged = false;

function getSafeSessionStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch {
    // Ignore restricted environment storage errors
  }
  return null;
}

function setSafeSessionStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota or permission errors
  }
}

export function getAnalyticsSessionId(): string {
  try {
    const existing = getSafeSessionStorageItem(SESSION_STORAGE_SESSION_ID_KEY);
    if (existing) {
      inMemorySessionId = existing;
      return existing;
    }

    if (!inMemorySessionId) {
      inMemorySessionId = globalThis.crypto?.randomUUID?.() ?? uid();
    }

    setSafeSessionStorageItem(SESSION_STORAGE_SESSION_ID_KEY, inMemorySessionId);
    return inMemorySessionId;
  } catch {
    if (!inMemorySessionId) {
      inMemorySessionId = uid();
    }
    return inMemorySessionId;
  }
}

interface TelemetryRow {
  session_id: string;
  event_type: 'page_visit' | 'quiz_start' | 'quiz_complete';
  subject?: Subject;
  theme?: Theme;
  score?: number;
  total_questions?: number;
  time_taken_seconds?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

async function insertTelemetryEvent(payload: TelemetryRow): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const row = {
      ...payload,
      created_at: payload.created_at || new Date().toISOString(),
      metadata: payload.metadata ?? {},
    };

    const { error } = await supabase.from('site_analytics').insert(row);
    if (error) {
      console.warn('[Telemetry] Failed to log telemetry event:', error.message);
    }
  } catch (error) {
    console.warn('[Telemetry] Error inserting telemetry event:', error);
  }
}

export function trackPageVisit(): void {
  try {
    const storedVisit = getSafeSessionStorageItem(SESSION_STORAGE_VISIT_LOGGED_KEY);
    if (inMemoryVisitLogged || storedVisit === 'true') {
      return;
    }

    inMemoryVisitLogged = true;
    setSafeSessionStorageItem(SESSION_STORAGE_VISIT_LOGGED_KEY, 'true');

    const sessionId = getAnalyticsSessionId();
    const path = typeof window !== 'undefined' && window.location?.pathname ? window.location.pathname : '/';
    const referrer = typeof document !== 'undefined' && document.referrer ? document.referrer : null;

    void insertTelemetryEvent({
      session_id: sessionId,
      event_type: 'page_visit',
      metadata: {
        path,
        referrer,
      },
    });
  } catch (error) {
    console.warn('[Telemetry] Error in trackPageVisit:', error);
  }
}

export function trackQuizStart(subject: Subject, theme: Theme): void {
  try {
    const sessionId = getAnalyticsSessionId();

    void insertTelemetryEvent({
      session_id: sessionId,
      event_type: 'quiz_start',
      subject,
      theme,
    });
  } catch (error) {
    console.warn('[Telemetry] Error in trackQuizStart:', error);
  }
}

export function trackQuizComplete(data: {
  subject: Subject;
  theme: Theme;
  score: number;
  total: number;
  timeUsedSeconds: number;
}): void {
  try {
    const sessionId = getAnalyticsSessionId();

    void insertTelemetryEvent({
      session_id: sessionId,
      event_type: 'quiz_complete',
      subject: data.subject,
      theme: data.theme,
      score: data.score,
      total_questions: data.total,
      time_taken_seconds: data.timeUsedSeconds,
    });
  } catch (error) {
    console.warn('[Telemetry] Error in trackQuizComplete:', error);
  }
}

export function _resetTelemetryStateForTesting(): void {
  inMemorySessionId = null;
  inMemoryVisitLogged = false;
}
