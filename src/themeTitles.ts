import { supabase, isSupabaseConfigured } from './supabase';
import { readLocal, writeLocal } from './storage';
import {
  themes,
  getCustomThemeTitle,
  updateCustomThemeTitlesCache,
} from './constants';
import type { Subject, Theme } from './types';

const STORAGE_KEY = 'cifs_theme_titles';

type ThemeTitlesMap = Record<string, Record<string, string>>;

function getLocalMap(): ThemeTitlesMap {
  try {
    return readLocal<ThemeTitlesMap>(STORAGE_KEY) ?? {};
  } catch {
    return {};
  }
}

export function initThemeTitles(): void {
  const local = getLocalMap();
  updateCustomThemeTitlesCache(local);
  void syncThemeTitlesFromRemote();
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
  const trimmed = title.trim();
  const current = getLocalMap();
  if (!current[subject]) {
    current[subject] = {};
  }

  if (trimmed) {
    current[subject][theme] = trimmed;
  } else {
    delete current[subject][theme];
  }

  writeLocal(STORAGE_KEY, current);
  updateCustomThemeTitlesCache(current);

  if (!isSupabaseConfigured) return;

  try {
    if (trimmed) {
      await supabase.from('theme_titles').upsert(
        {
          subject,
          theme,
          title: trimmed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'subject,theme' },
      );
    } else {
      await supabase
        .from('theme_titles')
        .delete()
        .eq('subject', subject)
        .eq('theme', theme);
    }
  } catch {
    // Local storage keeps functioning as fallback
  }
}

export async function setAllCustomThemeTitles(
  subject: Subject,
  titles: Record<string, string>,
): Promise<void> {
  const current = getLocalMap();
  if (!current[subject]) {
    current[subject] = {};
  }

  const toUpsert: Array<{ subject: string; theme: string; title: string; updated_at: string }> = [];
  const toDelete: string[] = [];

  for (const [theme, rawTitle] of Object.entries(titles)) {
    const trimmed = (rawTitle ?? '').trim();
    if (trimmed) {
      current[subject][theme] = trimmed;
      toUpsert.push({
        subject,
        theme,
        title: trimmed,
        updated_at: new Date().toISOString(),
      });
    } else {
      delete current[subject][theme];
      toDelete.push(theme);
    }
  }

  writeLocal(STORAGE_KEY, current);
  updateCustomThemeTitlesCache(current);

  if (!isSupabaseConfigured) return;

  try {
    if (toUpsert.length > 0) {
      await supabase.from('theme_titles').upsert(toUpsert, { onConflict: 'subject,theme' });
    }
    for (const theme of toDelete) {
      await supabase
        .from('theme_titles')
        .delete()
        .eq('subject', subject)
        .eq('theme', theme);
    }
  } catch {
    // Graceful fallback to local storage
  }
}

export async function syncThemeTitlesFromRemote(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { data, error } = await supabase
      .from('theme_titles')
      .select('subject, theme, title');

    if (!error && Array.isArray(data)) {
      const remoteMap: ThemeTitlesMap = {};
      for (const row of data as Array<{ subject: string; theme: string; title: string }>) {
        if (!remoteMap[row.subject]) {
          remoteMap[row.subject] = {};
        }
        if (row.title && row.title.trim()) {
          remoteMap[row.subject][row.theme] = row.title.trim();
        }
      }
      writeLocal(STORAGE_KEY, remoteMap);
      updateCustomThemeTitlesCache(remoteMap);
    }
  } catch {
    // Ignore if table does not exist
  }
}

export { getCustomThemeTitle };
