import { supabase, isSupabaseConfigured } from './supabase';
import { readLocal, writeLocal } from './storage';
import { themes, updateMockExamsCache } from './constants';
import { describeWriteError, type WriteContext } from './dbErrors';
import { uid } from './dom';
import type { MockExamInput } from './mockExam';
import type { MockExam, Subject, Theme } from './types';

const STORAGE_KEY = 'cifs_mock_exams';
const COLUMNS = 'id, subject, title, after_theme, source_themes, question_count, created_at';

const saveContext: WriteContext = {
  failure: 'Mock exam was not saved.',
  table: 'mock_exams',
  migration: '0008_mock_exams.sql',
};

const deleteContext: WriteContext = { ...saveContext, failure: 'Mock exam was not deleted.' };

/** Accepts a Supabase row or a stored entry and returns a clean MockExam, or null when unusable. */
function toMockExam(raw: unknown): MockExam | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const { id, subject, title } = row;
  if (typeof id !== 'string' || !id || typeof subject !== 'string' || typeof title !== 'string' || !title.trim()) {
    return null;
  }

  const afterTheme = Number(row.after_theme);
  const questionCount = Number(row.question_count);
  if (!Number.isInteger(afterTheme) || afterTheme < 0 || afterTheme > themes.length) return null;
  if (!Number.isInteger(questionCount) || questionCount < 1) return null;

  const picked = new Set(Array.isArray(row.source_themes) ? row.source_themes.map(String) : []);
  const sourceThemes = themes.filter((theme) => picked.has(theme));
  if (sourceThemes.length === 0) return null;

  return {
    id,
    subject: subject as Subject,
    title: title.trim(),
    after_theme: afterTheme,
    source_themes: sourceThemes as Theme[],
    question_count: questionCount,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
  };
}

function toMockExams(rows: unknown): MockExam[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(toMockExam).filter((exam): exam is MockExam => exam !== null);
}

function getLocalExams(): MockExam[] {
  try {
    return toMockExams(readLocal<unknown>(STORAGE_KEY));
  } catch {
    return [];
  }
}

function applyExams(exams: MockExam[]): void {
  writeLocal(STORAGE_KEY, exams);
  updateMockExamsCache(exams);
}

async function fetchRemoteExams(): Promise<MockExam[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from('mock_exams').select(COLUMNS);
    if (error || !Array.isArray(data)) return null;
    return toMockExams(data);
  } catch {
    return null;
  }
}

/** Copies saved mock exams from localStorage into memory. Synchronous, so the first render has them. */
export function initMockExams(): void {
  updateMockExamsCache(getLocalExams());
}

/**
 * Replaces the local copy with the Supabase copy. Returns false when Supabase is not
 * configured or the read fails (for example before migration 0008 is run), keeping the local copy.
 */
export async function syncMockExamsFromRemote(): Promise<boolean> {
  const remote = await fetchRemoteExams();
  if (!remote) return false;
  applyExams(remote);
  return true;
}

/** Primes from localStorage, then syncs from Supabase. Never throws. */
export async function loadMockExams(): Promise<void> {
  initMockExams();
  await syncMockExamsFromRemote();
}

/**
 * Creates a mock exam, or updates it when `id` is given. Supabase is written first and any
 * rejected write throws, so the local copy only changes when the database did.
 */
export async function saveMockExam(subject: Subject, input: MockExamInput, id?: string): Promise<MockExam> {
  const fields = {
    subject,
    title: input.title,
    after_theme: input.after_theme,
    source_themes: input.source_themes,
    question_count: input.question_count,
  };
  const createdAtById = new Map(getLocalExams().map((exam) => [exam.id, exam.created_at]));
  let saved: MockExam | null;

  if (!isSupabaseConfigured) {
    saved = toMockExam({
      ...fields,
      id: id ?? uid(),
      created_at: (id && createdAtById.get(id)) || new Date().toISOString(),
    });
  } else if (id) {
    // RLS turns a refused UPDATE into "0 rows" rather than an error, so require the row back.
    const { data, error } = await supabase
      .from('mock_exams')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUMNS);
    if (error) throw new Error(`${saveContext.failure} ${describeWriteError(error, saveContext)}`);
    saved = toMockExams(data)[0] ?? null;
    if (!saved) {
      throw new Error(
        `${saveContext.failure} Supabase did not update it. It may have been deleted, or you are not signed in as an admin.`,
      );
    }
  } else {
    const { data, error } = await supabase.from('mock_exams').insert(fields).select(COLUMNS);
    if (error) throw new Error(`${saveContext.failure} ${describeWriteError(error, saveContext)}`);
    saved = toMockExams(data)[0] ?? null;
    if (!saved) {
      throw new Error(`${saveContext.failure} Supabase did not return the new mock exam.`);
    }
  }

  if (!saved) {
    throw new Error(`${saveContext.failure} The details were not valid.`);
  }

  // Re-read the list now: a delete or sync may have landed while the request was in flight.
  const result = saved;
  applyExams([...getLocalExams().filter((exam) => exam.id !== result.id), result]);
  return result;
}

export async function deleteMockExam(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('mock_exams').delete().eq('id', id).select('id');
    if (error) throw new Error(`${deleteContext.failure} ${describeWriteError(error, deleteContext)}`);

    // RLS turns a refused DELETE into "0 rows" rather than an error. Zero rows also means the exam
    // was already gone, so only treat it as a refusal when the row still exists.
    if (Array.isArray(data) && data.length === 0) {
      const check = await supabase.from('mock_exams').select('id').eq('id', id);
      if (check.error) {
        throw new Error(`${deleteContext.failure} ${describeWriteError(check.error, deleteContext)}`);
      }
      if (Array.isArray(check.data) && check.data.length > 0) {
        throw new Error(
          `${deleteContext.failure} Supabase refused the delete. Sign out and sign back in as an admin.`,
        );
      }
    }
  }

  applyExams(getLocalExams().filter((exam) => exam.id !== id));
}
