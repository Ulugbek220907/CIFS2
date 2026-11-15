import type { Question, Subject } from '../types';

// Pure helpers for reading the question library one page at a time: building the Supabase filters, the "next page"
// cursor, and a client-side mirror of the filters (used to decide whether a just-saved question belongs on screen).
// No DOM and no network, so Node can test it.

/** Enough to fill a tall screen, small enough to arrive fast (and to typeset the maths of) in one go. */
export const QUESTION_PAGE_SIZE = 24;
export const QUESTION_COLUMNS = 'id, subject, theme, question_text, options, correct_index, explanation, created_at';
export const MOCK_TARGET_PREFIX = 'mock:';
/** Longer searches add nothing and only make the request address huge. */
export const SEARCH_MAX_LENGTH = 100;

export interface QuestionFilters {
  subject: Subject | 'All';
  /** 'All', a theme ("Theme 3"), or `mock:<id>` for one mock exam's own questions. */
  theme: string;
  search: string;
}

export interface QuestionCursor {
  created_at: string;
  id: string;
}

/**
 * Makes a typed search literal inside a regular expression. (LIKE cannot be used: PostgREST turns every "*" into a
 * wildcard even inside quotes, so a typed "*" could never be searched for literally.)
 */
export function escapeRegexTerm(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);
}

/** Wraps a value for a PostgREST filter list, so commas, brackets and quotes in it cannot change the filter. */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/** What the search box really searches for: trimmed and limited in length. Empty means "no search". */
export function normalizeSearchTerm(term: string): string {
  return term.trim().slice(0, SEARCH_MAX_LENGTH);
}

/** The body of a PostgREST `or(...)` that matches the term in the prompt, the explanation or any option. */
export function buildSearchFilter(term: string): string | null {
  const clean = normalizeSearchTerm(term);
  if (!clean) return null;
  const pattern = quoteFilterValue(escapeRegexTerm(clean));
  return ['question_text', 'explanation', 'options->>0', 'options->>1', 'options->>2', 'options->>3']
    .map((column) => `${column}.imatch.${pattern}`)
    .join(',');
}

/** The rows strictly after `cursor` in "newest first, then id" order. Bulk imports share one timestamp, so the id breaks ties. */
export function buildKeysetFilter(cursor: QuestionCursor): string {
  const at = quoteFilterValue(cursor.created_at);
  return `created_at.lt.${at},and(created_at.eq.${at},id.lt.${quoteFilterValue(cursor.id)})`;
}

export function cursorOf(question: Pick<Question, 'created_at' | 'id'>): QuestionCursor {
  return { created_at: question.created_at, id: question.id };
}

/** The select/filter value for a question: its theme, or `mock:<id>` for a mock exam's own question. */
export function questionTarget(question: Pick<Question, 'theme' | 'mock_exam_id'>): string {
  return question.mock_exam_id ? `${MOCK_TARGET_PREFIX}${question.mock_exam_id}` : (question.theme ?? '');
}

/** Would the library show this question under these filters? Mirrors what the database query returns. */
export function questionMatchesFilters(question: Question, filters: QuestionFilters): boolean {
  if (filters.subject !== 'All' && question.subject !== filters.subject) return false;
  if (filters.theme !== 'All' && questionTarget(question) !== filters.theme) return false;
  const term = normalizeSearchTerm(filters.search).toLowerCase();
  if (!term) return true;
  return (
    question.question_text.toLowerCase().includes(term) ||
    question.explanation.toLowerCase().includes(term) ||
    question.options.some((option) => option.toLowerCase().includes(term))
  );
}

export function sameFilters(a: QuestionFilters, b: QuestionFilters): boolean {
  return a.subject === b.subject && a.theme === b.theme && normalizeSearchTerm(a.search) === normalizeSearchTerm(b.search);
}
