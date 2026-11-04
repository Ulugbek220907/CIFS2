import { supabase, isSupabaseConfigured } from './supabase';
import { readLocal, writeLocal } from './storage';
import { themes, updateThemeNotesCache } from './constants';
import { assertWriteOk as assertOk, describeWriteError, type WriteContext } from './dbErrors';
import { normalizeNotesUrl } from './notesLink';
import type { Subject } from './types';

const STORAGE_KEY = 'cifs_theme_notes';

type ThemeNotesMap = Record<string, Record<string, string>>;

const writeContext: WriteContext = {
  failure: 'Lecture notes links were not saved.',
  table: 'theme_notes',
  migration: '0011_level5_and_theme_notes.sql',
};

function getLocalMap(): ThemeNotesMap {
  try {
    return readLocal<ThemeNotesMap>(STORAGE_KEY) ?? {};
  } catch {
    return {};
  }
}

function applyNotesMap(map: ThemeNotesMap): void {
  writeLocal(STORAGE_KEY, map);
  updateThemeNotesCache(map);
}

/** Copies saved links from localStorage into memory. Synchronous, so the first render has them. */
export function initThemeNotes(): void {
  updateThemeNotesCache(getLocalMap());
}

/**
 * Replaces the local copy with the Supabase copy. Returns false when Supabase is not configured
 * or the read fails (for example before migration 0011 is run), keeping the local copy.
 */
export async function syncThemeNotesFromRemote(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase.from('theme_notes').select('subject, theme, url');
    if (error || !Array.isArray(data)) return false;

    const remote: ThemeNotesMap = {};
    for (const row of data as Array<{ subject: string; theme: string; url: string | null }>) {
      const check = normalizeNotesUrl(row.url);
      // Re-validate what comes back too, so a bad row can never become a link.
      if (!check.ok || !check.value) continue;
      remote[row.subject] ??= {};
      remote[row.subject][row.theme] = check.value;
    }
    applyNotesMap(remote);
    return true;
  } catch {
    return false;
  }
}

/** Primes from localStorage, then syncs from Supabase. Never throws. */
export async function loadThemeNotes(): Promise<void> {
  initThemeNotes();
  await syncThemeNotesFromRemote();
}

/**
 * Validates every link first (nothing is written if any is invalid), then writes Supabase and only
 * then the local copy. Blank removes a theme's link. Throws a readable Error on any failure.
 */
export async function setAllThemeNotes(subject: Subject, urls: Record<string, string>): Promise<void> {
  const clean: Record<string, string> = {};
  for (const [theme, raw] of Object.entries(urls)) {
    const result = normalizeNotesUrl(raw);
    if (!result.ok) {
      throw new Error(`${writeContext.failure} ${theme}: ${result.error}`);
    }
    clean[theme] = result.value;
  }

  const current = getLocalMap();
  const next: Record<string, string> = { ...(current[subject] ?? {}) };
  const toUpsert: Array<{ subject: string; theme: string; url: string; updated_at: string }> = [];
  const toClear: string[] = [];
  const updatedAt = new Date().toISOString();

  for (const theme of themes) {
    if (!(theme in clean)) continue;
    if (clean[theme]) {
      if (next[theme] === clean[theme]) continue; // unchanged: nothing to write
      next[theme] = clean[theme];
      toUpsert.push({ subject, theme, url: clean[theme], updated_at: updatedAt });
    } else if (theme in next) {
      // Only links that exist need clearing; blank fields stay a no-op (and never touch the table).
      delete next[theme];
      toClear.push(theme);
    }
  }

  if (isSupabaseConfigured) {
    if (toUpsert.length > 0) {
      await assertOk(supabase.from('theme_notes').upsert(toUpsert, { onConflict: 'subject,theme' }), writeContext);
    }
    if (toClear.length > 0) {
      await assertOk(supabase.from('theme_notes').delete().eq('subject', subject).in('theme', toClear), writeContext);
      // RLS turns a refused DELETE into "0 rows" instead of an error, so confirm the links are really gone.
      const check = await supabase.from('theme_notes').select('theme').eq('subject', subject).in('theme', toClear);
      if (check.error) throw new Error(`${writeContext.failure} ${describeWriteError(check.error, writeContext)}`);
      if (Array.isArray(check.data) && check.data.length > 0) {
        throw new Error(`${writeContext.failure} Supabase refused the change. Sign out and sign back in as an admin.`);
      }
    }
  }

  applyNotesMap({ ...current, [subject]: next });
}
