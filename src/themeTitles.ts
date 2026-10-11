import { supabase, isSupabaseConfigured } from './supabase';
import { readLocal, writeLocal } from './storage';
import {
  themes,
  getCustomThemeTitle,
  updateCustomThemeTitlesCache,
} from './constants';
import { assertWriteOk as assertOk, type WriteContext } from './dbErrors';
import type { Subject, Theme } from './types';

const STORAGE_KEY = 'cifs_theme_titles';

type ThemeTitlesMap = Record<string, Record<string, string>>;

interface ThemeTitleRow {
  subject: string;
  theme: string;
  title: string | null;
}

interface ThemeTitleUpsert {
  subject: string;
  theme: string;
  title: string;
  updated_at: string;
}

function getLocalMap(): ThemeTitlesMap {
  try {
    return readLocal<ThemeTitlesMap>(STORAGE_KEY) ?? {};
  } catch {
    return {};
  }
}

function applyTitlesMap(map: ThemeTitlesMap): void {
  writeLocal(STORAGE_KEY, map);
  updateCustomThemeTitlesCache(map);
}

const writeContext: WriteContext = {
  failure: 'Theme names were not saved.',
  table: 'theme_titles',
  migration: '0006_theme_titles.sql',
};

function assertWriteOk(request: Parameters<typeof assertOk>[0]): Promise<void> {
  return assertOk(request, writeContext);
}

/** Returns the Supabase copy as a map, or null when Supabase is unset or the read fails. */
async function fetchRemoteTitles(): Promise<ThemeTitlesMap | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('theme_titles')
      .select('subject, theme, title');

    if (error || !Array.isArray(data)) return null;

    const remoteMap: ThemeTitlesMap = {};
    for (const row of data as ThemeTitleRow[]) {
      const title = row.title?.trim();
      if (!title) continue;
      remoteMap[row.subject] ??= {};
      remoteMap[row.subject][row.theme] = title;
    }
    return remoteMap;
  } catch {
    return null;
  }
}

/**
 * Copies the saved names from localStorage into memory. Synchronous, so anything
 * rendered right after this call already shows the custom names.
 */
export function initThemeTitles(): void {
  updateCustomThemeTitlesCache(getLocalMap());
}

export function getAllCustomThemeTitles(subject: Subject): Record<Theme, string> {
  const result: Partial<Record<Theme, string>> = {};
  for (const t of themes) {
    result[t] = getCustomThemeTitle(subject, t);
  }
  return result as Record<Theme, string>;
}

export async function setCustomThemeTitle(
  subject: Subject,
  theme: Theme,
  title: string,
): Promise<void> {
  await setAllCustomThemeTitles(subject, { [theme]: title });
}

/**
 * Saves the given themes for one subject. Supabase is written first and any
 * rejected write throws, so the local copy only changes when the database did.
 * Blank titles clear that theme back to its standard name.
 */
export async function setAllCustomThemeTitles(
  subject: Subject,
  titles: Record<string, string>,
): Promise<void> {
  const current = getLocalMap();
  const nextSubjectTitles: Record<string, string> = { ...(current[subject] ?? {}) };
  const updatedAt = new Date().toISOString();

  const toUpsert: ThemeTitleUpsert[] = [];
  const toClear: string[] = [];

  for (const [theme, rawTitle] of Object.entries(titles)) {
    const trimmed = (rawTitle ?? '').trim();
    if (trimmed) {
      nextSubjectTitles[theme] = trimmed;
      toUpsert.push({ subject, theme, title: trimmed, updated_at: updatedAt });
    } else {
      delete nextSubjectTitles[theme];
      toClear.push(theme);
    }
  }

  if (isSupabaseConfigured) {
    if (toUpsert.length > 0) {
      await assertWriteOk(
        supabase.from('theme_titles').upsert(toUpsert, { onConflict: 'subject,theme' }),
      );
    }
    if (toClear.length > 0) {
      await assertWriteOk(
        supabase.from('theme_titles').delete().eq('subject', subject).in('theme', toClear),
      );
    }
  }

  applyTitlesMap({ ...current, [subject]: nextSubjectTitles });
}

/**
 * Public pages: replaces the local copy with the Supabase copy. Returns false when
 * Supabase is not configured or the read fails, in which case the local copy is kept.
 */
export async function syncThemeTitlesFromRemote(): Promise<boolean> {
  const remoteMap = await fetchRemoteTitles();
  if (!remoteMap) return false;
  applyTitlesMap(remoteMap);
  return true;
}

/**
 * Admin dashboard: loads the Supabase copy. Names that exist only in this browser
 * (saved before the database was reachable) are uploaded instead of being dropped.
 * Returns an error message when that upload fails, otherwise null.
 */
export async function loadThemeTitlesForAdmin(): Promise<string | null> {
  initThemeTitles();
  const remoteMap = await fetchRemoteTitles();
  if (!remoteMap) return null;

  const localOnly = findLocalOnlyTitles(getLocalMap(), remoteMap);
  const merged: ThemeTitlesMap = {};
  for (const [subject, titles] of Object.entries(remoteMap)) {
    merged[subject] = { ...titles };
  }
  for (const row of localOnly) {
    merged[row.subject] ??= {};
    merged[row.subject][row.theme] = row.title;
  }

  let uploadError: string | null = null;
  if (localOnly.length > 0) {
    try {
      await assertWriteOk(
        supabase.from('theme_titles').upsert(localOnly, { onConflict: 'subject,theme' }),
      );
    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'Theme names were not saved.';
    }
  }

  // Keep unuploaded names visible in this browser; the returned error explains why they are not in the database yet.
  applyTitlesMap(merged);
  return uploadError;
}

function findLocalOnlyTitles(local: ThemeTitlesMap, remote: ThemeTitlesMap): ThemeTitleUpsert[] {
  const updatedAt = new Date().toISOString();
  const rows: ThemeTitleUpsert[] = [];
  for (const [subject, titles] of Object.entries(local)) {
    for (const [theme, rawTitle] of Object.entries(titles)) {
      const title = rawTitle?.trim();
      if (title && !remote[subject]?.[theme]) {
        rows.push({ subject, theme, title, updated_at: updatedAt });
      }
    }
  }
  return rows;
}

export { getCustomThemeTitle };
