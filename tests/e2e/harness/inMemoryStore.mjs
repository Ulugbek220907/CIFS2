import crypto from 'node:crypto';
import { EVENT_TYPES } from './types.mjs';

/**
 * In-memory simulation of Supabase `public.site_analytics` table
 * Enforces schema integrity, RLS permissions, and network failure modes.
 */
export class InMemoryTelemetryStore {
  constructor() {
    this.events = [];
    this.networkError = false;
  }

  /**
   * Reset store state between tests
   */
  clear() {
    this.events = [];
    this.networkError = false;
  }

  /**
   * Toggle network failure simulation
   */
  setNetworkError(enabled) {
    this.networkError = !!enabled;
  }

  /**
   * Insert event into site_analytics
   * RLS policy: anonymous and authenticated clients can INSERT (with check (true))
   */
  async insert(record, options = { role: 'anon' }) {
    if (this.networkError) {
      throw new Error('NetworkError: Failed to connect to Supabase database (503 Service Unavailable)');
    }

    if (!record || typeof record !== 'object') {
      throw new Error('PayloadValidationError: Record must be a valid object');
    }

    if (!record.event_type || !Object.values(EVENT_TYPES).includes(record.event_type)) {
      throw new Error(`PayloadValidationError: Invalid event_type '${record.event_type}'`);
    }

    if (!record.session_id || typeof record.session_id !== 'string') {
      throw new Error('PayloadValidationError: session_id is required');
    }

    if (record.score !== undefined && record.score !== null && Number(record.score) < 0) {
      throw new Error('CheckConstraintViolation: score must be >= 0');
    }

    if (record.total_questions !== undefined && record.total_questions !== null && Number(record.total_questions) <= 0) {
      throw new Error('CheckConstraintViolation: total_questions must be > 0');
    }

    if (record.time_taken_seconds !== undefined && record.time_taken_seconds !== null && Number(record.time_taken_seconds) < 0) {
      throw new Error('CheckConstraintViolation: time_taken_seconds must be >= 0');
    }

    const newRecord = {
      id: crypto.randomUUID(),
      created_at: record.created_at || new Date().toISOString(),
      event_type: record.event_type,
      session_id: record.session_id,
      subject: record.subject ?? null,
      theme: record.theme ?? null,
      score: record.score !== undefined ? Number(record.score) : null,
      total_questions: record.total_questions !== undefined ? Number(record.total_questions) : null,
      time_taken_seconds: record.time_taken_seconds !== undefined ? Number(record.time_taken_seconds) : null,
      metadata: record.metadata ? JSON.parse(JSON.stringify(record.metadata)) : null,
    };

    this.events.push(newRecord);
    return { data: [newRecord], error: null };
  }

  /**
   * Select events from site_analytics
   * RLS policy: strictly admin-only select (using public.is_admin())
   * Anonymous select returns access denied.
   */
  async select(options = { role: 'admin', since: null }) {
    if (this.networkError) {
      throw new Error('NetworkError: Failed to connect to Supabase database (503 Service Unavailable)');
    }

    if (options.role !== 'admin') {
      return {
        data: null,
        error: new Error('PGRST301: Permission denied by Row Level Security (admin role required)'),
      };
    }

    let results = [...this.events];

    if (options.since) {
      const sinceTime = new Date(options.since).getTime();
      results = results.filter((e) => new Date(e.created_at).getTime() >= sinceTime);
    }

    // Default order by created_at desc
    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { data: results, error: null };
  }

  /**
   * Direct inspection for test assertions
   */
  getAllRawEvents() {
    return [...this.events];
  }
}

export const globalStore = new InMemoryTelemetryStore();
