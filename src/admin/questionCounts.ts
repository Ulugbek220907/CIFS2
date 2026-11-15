import type { Question } from '../types';

// Question totals per subject / theme / mock exam, as the database's admin_question_counts() returns them. A few dozen
// small rows replace "download every question just to count them". Pure, so Node can test it.

export interface QuestionCountRow {
  subject: string;
  theme: string | null;
  mock_exam_id: string | null;
  count: number;
}

/** Reads the function's rows defensively: anything unexpected is dropped instead of breaking the dashboard. */
export function parseQuestionCounts(rows: unknown): QuestionCountRow[] {
  if (!Array.isArray(rows)) return [];
  const out: QuestionCountRow[] = [];
  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const count = Number(row.question_count ?? row.count);
    if (typeof row.subject !== 'string' || !Number.isFinite(count) || count < 0) continue;
    out.push({
      subject: row.subject,
      theme: typeof row.theme === 'string' ? row.theme : null,
      mock_exam_id: typeof row.mock_exam_id === 'string' ? row.mock_exam_id : null,
      count: Math.round(count),
    });
  }
  return out;
}

export function totalQuestions(rows: readonly QuestionCountRow[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/** Questions of one theme. `names` is the subject's name plus any legacy name it still has rows under. */
export function countThemeQuestions(rows: readonly QuestionCountRow[], names: readonly string[], theme: string): number {
  return rows.filter((row) => !row.mock_exam_id && names.includes(row.subject) && row.theme === theme).reduce((sum, row) => sum + row.count, 0);
}

/** Questions a mock exam can borrow from the ticked themes. */
export function countAvailableQuestions(rows: readonly QuestionCountRow[], names: readonly string[], sourceThemes: readonly string[]): number {
  return rows
    .filter((row) => !row.mock_exam_id && names.includes(row.subject) && row.theme !== null && sourceThemes.includes(row.theme))
    .reduce((sum, row) => sum + row.count, 0);
}

/** A mock exam's own questions. */
export function countOwnQuestions(rows: readonly QuestionCountRow[], examId: string | null): number {
  return examId ? rows.filter((row) => row.mock_exam_id === examId).reduce((sum, row) => sum + row.count, 0) : 0;
}

/** Applies a +1 / -1 for one question to the counts, so numbers stay right between refreshes. Returns a new array. */
export function adjustQuestionCounts(
  rows: readonly QuestionCountRow[],
  question: Pick<Question, 'subject' | 'theme' | 'mock_exam_id'>,
  delta: number,
): QuestionCountRow[] {
  const theme = question.mock_exam_id ? null : (question.theme ?? null);
  const mock = question.mock_exam_id ?? null;
  const next = rows.map((row) => ({ ...row }));
  const hit = next.find((row) => row.subject === question.subject && row.theme === theme && row.mock_exam_id === mock);
  if (hit) hit.count = Math.max(0, hit.count + delta);
  else if (delta > 0) next.push({ subject: question.subject, theme, mock_exam_id: mock, count: delta });
  return next.filter((row) => row.count > 0);
}

/** Drops every question of a deleted mock exam from the counts. */
export function removeExamFromCounts(rows: readonly QuestionCountRow[], examId: string): QuestionCountRow[] {
  return rows.filter((row) => row.mock_exam_id !== examId);
}
