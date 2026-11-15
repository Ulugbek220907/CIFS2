import type { Subject, Theme } from '../types';

// Telemetry maths for the admin dashboard, without any DOM or network (so Node can test it). The numbers normally
// come ready-added from the database (admin_analytics_summary); the event-by-event functions below remain as the
// fallback for a database where migration 0015 has not been run, and as the reference the summary is checked against.

export type AnalyticsTimeRange = 'all' | '7d' | 'today';

export interface AnalyticsEvent {
  id: string;
  event_type: 'page_visit' | 'quiz_start' | 'quiz_complete';
  session_id: string;
  subject?: Subject | null;
  theme?: Theme | null;
  score?: number | null;
  total_questions?: number | null;
  time_taken_seconds?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AnalyticsKpis {
  totalVisitors: number;
  totalVisits: number;
  quizzesStarted: number;
  quizzesCompleted: number;
  completionRate: number;
  avgScore: number | null;
  avgTimeSeconds: number | null;
}

export interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
  dropOff: number;
}

export interface SubjectBreakdownItem {
  subject: string;
  starts: number;
  completions: number;
  completionRate: number;
  themes: {
    theme: string;
    starts: number;
    completions: number;
    completionRate: number;
  }[];
}

export function computeAnalyticsKpis(events: AnalyticsEvent[]): AnalyticsKpis {
  const pageVisits = events.filter((e) => e.event_type === 'page_visit');
  const quizStarts = events.filter((e) => e.event_type === 'quiz_start');
  const quizCompletes = events.filter((e) => e.event_type === 'quiz_complete');

  const scored = quizCompletes.filter((e) => typeof e.score === 'number' && e.score !== null);
  const timed = quizCompletes.filter((e) => typeof e.time_taken_seconds === 'number' && e.time_taken_seconds !== null);

  return kpisFromTotals({
    totalVisitors: new Set(pageVisits.map((e) => e.session_id)).size,
    totalVisits: pageVisits.length,
    quizzesStarted: quizStarts.length,
    quizzesCompleted: quizCompletes.length,
    scoreSum: scored.reduce((sum, e) => sum + (e.score ?? 0), 0),
    scoreCount: scored.length,
    timeSum: timed.reduce((sum, e) => sum + (e.time_taken_seconds ?? 0), 0),
    timeCount: timed.length,
  });
}

export function computeAnalyticsFunnel(events: AnalyticsEvent[], kpis: AnalyticsKpis): FunnelStage[] {
  const visitors = kpis.totalVisitors;
  const starts = kpis.quizzesStarted;
  const completions = kpis.quizzesCompleted;

  const stage1: FunnelStage = {
    stage: 'Entered Webpage',
    count: visitors,
    rate: 100,
    dropOff: 0,
  };

  const startRate = visitors > 0 ? (starts / visitors) * 100 : 0;
  const startDropOff = visitors > 0 ? Math.max(0, 100 - startRate) : 0;
  const stage2: FunnelStage = {
    stage: 'Started Quiz',
    count: starts,
    rate: Number(startRate.toFixed(1)),
    dropOff: Number(startDropOff.toFixed(1)),
  };

  const completionRate = starts > 0 ? (completions / starts) * 100 : 0;
  const completionDropOff = starts > 0 ? Math.max(0, 100 - completionRate) : 0;
  const stage3: FunnelStage = {
    stage: 'Ended Quiz',
    count: completions,
    rate: Number(completionRate.toFixed(1)),
    dropOff: Number(completionDropOff.toFixed(1)),
  };

  return [stage1, stage2, stage3];
}

export function computeSubjectBreakdown(events: AnalyticsEvent[]): SubjectBreakdownItem[] {
  const subjectMap = new Map<string, {
    subject: string;
    starts: number;
    completions: number;
    themes: Map<string, { theme: string; starts: number; completions: number }>;
  }>();

  for (const event of events) {
    if (!event.subject) continue;
    const sub = event.subject;

    if (!subjectMap.has(sub)) {
      subjectMap.set(sub, {
        subject: sub,
        starts: 0,
        completions: 0,
        themes: new Map(),
      });
    }

    const item = subjectMap.get(sub)!;
    // Mock exams have no theme of their own, so they get a row per exam title.
    const mockTitle =
      typeof event.metadata?.mock_exam_title === 'string' ? event.metadata.mock_exam_title.trim().slice(0, 80) : '';
    const themeKey = mockTitle ? `Mock Exam: ${mockTitle}` : event.theme || 'Theme 1';

    if (!item.themes.has(themeKey)) {
      item.themes.set(themeKey, { theme: themeKey, starts: 0, completions: 0 });
    }
    const themeItem = item.themes.get(themeKey)!;

    if (event.event_type === 'quiz_start') {
      item.starts++;
      themeItem.starts++;
    } else if (event.event_type === 'quiz_complete') {
      item.completions++;
      themeItem.completions++;
    }
  }

  const breakdown: SubjectBreakdownItem[] = Array.from(subjectMap.values()).map((sub) => {
    const compRate = sub.starts > 0 ? (sub.completions / sub.starts) * 100 : 0;
    const themesArray = Array.from(sub.themes.values()).map((t) => ({
      theme: t.theme,
      starts: t.starts,
      completions: t.completions,
      completionRate: t.starts > 0 ? Number(((t.completions / t.starts) * 100).toFixed(1)) : 0,
    }));
    themesArray.sort((a, b) => b.starts - a.starts);

    return {
      subject: sub.subject,
      starts: sub.starts,
      completions: sub.completions,
      completionRate: Number(compRate.toFixed(1)),
      themes: themesArray,
    };
  });

  breakdown.sort((a, b) => b.starts - a.starts);
  return breakdown;
}

/** The raw counts the dashboard's headline numbers are made from. */
export interface AnalyticsTotals {
  totalVisitors: number;
  totalVisits: number;
  quizzesStarted: number;
  quizzesCompleted: number;
  /** Sum and count of the scores / durations of completed quizzes that recorded one. */
  scoreSum: number;
  scoreCount: number;
  timeSum: number;
  timeCount: number;
}

export interface SubjectSummaryRow {
  subject: string;
  starts: number;
  completions: number;
  themes: { theme: string; starts: number; completions: number }[];
}

/** What admin_analytics_summary() returns: totals plus a per-subject, per-theme count. */
export interface AnalyticsSummary {
  totals: AnalyticsTotals;
  subjects: SubjectSummaryRow[];
}

/** Everything the dashboard shows, ready to draw. */
export interface AnalyticsView {
  kpis: AnalyticsKpis;
  funnel: FunnelStage[];
  breakdown: SubjectBreakdownItem[];
}

export function kpisFromTotals(totals: AnalyticsTotals): AnalyticsKpis {
  const completionRate = totals.quizzesStarted > 0 ? (totals.quizzesCompleted / totals.quizzesStarted) * 100 : 0;
  return {
    totalVisitors: totals.totalVisitors,
    totalVisits: totals.totalVisits,
    quizzesStarted: totals.quizzesStarted,
    quizzesCompleted: totals.quizzesCompleted,
    completionRate: Number(completionRate.toFixed(1)),
    avgScore: totals.scoreCount > 0 ? Number((totals.scoreSum / totals.scoreCount).toFixed(1)) : null,
    avgTimeSeconds: totals.timeCount > 0 ? Math.round(totals.timeSum / totals.timeCount) : null,
  };
}

function rateOf(part: number, whole: number): number {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

/** Turns per-subject counts into the sorted rows the breakdown table draws. */
export function breakdownFromSummary(subjects: readonly SubjectSummaryRow[]): SubjectBreakdownItem[] {
  const rows: SubjectBreakdownItem[] = subjects.map((row) => ({
    subject: row.subject,
    starts: row.starts,
    completions: row.completions,
    completionRate: rateOf(row.completions, row.starts),
    themes: row.themes
      .map((theme) => ({ theme: theme.theme, starts: theme.starts, completions: theme.completions, completionRate: rateOf(theme.completions, theme.starts) }))
      .sort((a, b) => b.starts - a.starts),
  }));
  rows.sort((a, b) => b.starts - a.starts);
  return rows;
}

export function viewFromSummary(summary: AnalyticsSummary): AnalyticsView {
  const kpis = kpisFromTotals(summary.totals);
  return { kpis, funnel: computeAnalyticsFunnel([], kpis), breakdown: breakdownFromSummary(summary.subjects) };
}

/** The same view built the slow way, from every event. Used when the summary function is not installed. */
export function viewFromEvents(events: AnalyticsEvent[]): AnalyticsView {
  const kpis = computeAnalyticsKpis(events);
  return { kpis, funnel: computeAnalyticsFunnel(events, kpis), breakdown: computeSubjectBreakdown(events) };
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Reads the function's JSON defensively. Returns null when it is not the document we expect at all. */
export function parseAnalyticsSummary(json: unknown): AnalyticsSummary | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const raw = json as Record<string, unknown>;
  if (!('totalVisitors' in raw) || !('quizzesStarted' in raw)) return null;
  const subjects: SubjectSummaryRow[] = [];
  if (Array.isArray(raw.subjects)) {
    for (const entry of raw.subjects) {
      if (typeof entry !== 'object' || entry === null) continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.subject !== 'string') continue;
      const themes: SubjectSummaryRow['themes'] = [];
      if (Array.isArray(row.themes)) {
        for (const t of row.themes) {
          if (typeof t !== 'object' || t === null) continue;
          const theme = t as Record<string, unknown>;
          if (typeof theme.theme !== 'string') continue;
          themes.push({ theme: theme.theme, starts: count(theme.starts), completions: count(theme.completions) });
        }
      }
      subjects.push({ subject: row.subject, starts: count(row.starts), completions: count(row.completions), themes });
    }
  }
  return {
    totals: {
      totalVisitors: count(raw.totalVisitors),
      totalVisits: count(raw.totalVisits),
      quizzesStarted: count(raw.quizzesStarted),
      quizzesCompleted: count(raw.quizzesCompleted),
      scoreSum: count(raw.scoreSum),
      scoreCount: count(raw.scoreCount),
      timeSum: count(raw.timeSum),
      timeCount: count(raw.timeCount),
    },
    subjects,
  };
}

/** The start of the chosen time range as an ISO time, or null for "all time". */
export function analyticsSince(range: AnalyticsTimeRange, now: Date): string | null {
  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (range === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}
