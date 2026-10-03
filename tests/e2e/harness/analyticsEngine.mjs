import { EVENT_TYPES, TIME_RANGES } from './types.mjs';

/**
 * Admin Analytics Engine conforming to PROJECT.md § Interface Contracts & ORIGINAL_REQUEST.md §R2
 */
export class AnalyticsEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Determine the cutoff timestamp based on the selected time range filter
   */
  getCutoffDate(range, now = new Date(), useUtc = false) {
    const reference = new Date(now);
    if (range === TIME_RANGES.TODAY) {
      const todayStart = new Date(reference);
      if (useUtc) {
        todayStart.setUTCHours(0, 0, 0, 0);
      } else {
        todayStart.setHours(0, 0, 0, 0);
      }
      return todayStart.toISOString();
    }
    if (range === TIME_RANGES.LAST_7_DAYS) {
      const sevenDaysAgo = new Date(reference.getTime() - 7 * 24 * 60 * 60 * 1000);
      return sevenDaysAgo.toISOString();
    }
    return null; // 'all' time
  }

  /**
   * Fetch and filter events from store as authenticated admin
   */
  async fetchEvents(range = TIME_RANGES.ALL, options = {}) {
    const cutoff = this.getCutoffDate(range, options.now, options.useUtc);
    const { data, error } = await this.store.select({
      role: 'admin',
      since: cutoff,
    });

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Computes the 4 Executive KPI Cards
   */
  computeKpiMetrics(events) {
    const pageVisits = events.filter((e) => e.event_type === EVENT_TYPES.PAGE_VISIT);
    const quizStarts = events.filter((e) => e.event_type === EVENT_TYPES.QUIZ_START);
    const quizCompletes = events.filter((e) => e.event_type === EVENT_TYPES.QUIZ_COMPLETE);

    const totalVisitors = new Set(pageVisits.map((e) => e.session_id)).size;
    const totalStarts = quizStarts.length;
    const totalCompletions = quizCompletes.length;

    const completionRate = totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0;

    return {
      totalVisitors,
      quizzesStarted: totalStarts,
      quizzesCompleted: totalCompletions,
      completionRate: Number(completionRate.toFixed(2)),
    };
  }

  /**
   * Computes the 3-stage interactive Conversion Funnel:
   * Visit -> Start -> Finish
   */
  computeFunnel(events) {
    const kpis = this.computeKpiMetrics(events);
    const visitors = kpis.totalVisitors;
    const starts = kpis.quizzesStarted;
    const completions = kpis.quizzesCompleted;

    // Stage 1: Visitors
    const stage1 = {
      stage: 'Visitors',
      count: visitors,
      rate: 100,
      dropOff: 0,
    };

    // Stage 2: Starts
    const startRate = visitors > 0 ? (starts / visitors) * 100 : 0;
    const startDropOff = visitors > 0 ? Math.max(0, 100 - startRate) : 0;
    const stage2 = {
      stage: 'Starts',
      count: starts,
      rate: Number(startRate.toFixed(2)),
      dropOff: Number(startDropOff.toFixed(2)),
    };

    // Stage 3: Completions
    const completionRate = starts > 0 ? (completions / starts) * 100 : 0;
    const completionDropOff = starts > 0 ? Math.max(0, 100 - completionRate) : 0;
    const stage3 = {
      stage: 'Completions',
      count: completions,
      rate: Number(completionRate.toFixed(2)),
      dropOff: Number(completionDropOff.toFixed(2)),
    };

    return [stage1, stage2, stage3];
  }

  /**
   * Computes Subject and Theme engagement breakdown
   */
  computeSubjectBreakdown(events) {
    const subjectMap = new Map();

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

      const item = subjectMap.get(sub);
      const themeKey = event.theme || 'Unknown';

      if (!item.themes.has(themeKey)) {
        item.themes.set(themeKey, { theme: themeKey, starts: 0, completions: 0 });
      }
      const themeItem = item.themes.get(themeKey);

      if (event.event_type === EVENT_TYPES.QUIZ_START) {
        item.starts++;
        themeItem.starts++;
      } else if (event.event_type === EVENT_TYPES.QUIZ_COMPLETE) {
        item.completions++;
        themeItem.completions++;
      }
    }

    const breakdown = Array.from(subjectMap.values()).map((sub) => {
      const completionRate = sub.starts > 0 ? (sub.completions / sub.starts) * 100 : 0;
      const themesArray = Array.from(sub.themes.values()).map((t) => ({
        ...t,
        completionRate: t.starts > 0 ? Number(((t.completions / t.starts) * 100).toFixed(2)) : 0,
      }));

      // Sort themes by starts desc
      themesArray.sort((a, b) => b.starts - a.starts);

      return {
        subject: sub.subject,
        starts: sub.starts,
        completions: sub.completions,
        completionRate: Number(completionRate.toFixed(2)),
        themes: themesArray,
      };
    });

    // Sort subjects by total starts descending (highest engagement first)
    breakdown.sort((a, b) => b.starts - a.starts || b.completions - a.completions);

    return breakdown;
  }

  /**
   * Full executive dashboard model
   */
  async getDashboardData(range = TIME_RANGES.ALL, options = {}) {
    const events = await this.fetchEvents(range, options);
    return {
      range,
      kpis: this.computeKpiMetrics(events),
      funnel: this.computeFunnel(events),
      subjectBreakdown: this.computeSubjectBreakdown(events),
      rawEventCount: events.length,
    };
  }
}
