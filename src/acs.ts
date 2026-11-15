import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import { readLocal, writeLocal } from './storage';
import { describeWriteError, type WriteContext } from './dbErrors';
import {
  ACS_AUDIO_BUCKET,
  ACS_TITLE_MAX,
  buildAudioPath,
  checkAudioFile,
  isSafeAudioPath,
  normalizeAcsRows,
  prepareArgumentsForSave,
  type AcsItem,
  type AcsKind,
} from './acsModel';

// Data layer for the Academic Communication Skills content (see acsModel.ts for the rules).

const STORAGE_KEY = 'acs-items';
const COLUMNS = 'kind, position, title, audio_path, audio_name, audio_size, arguments, updated_at';

const writeContext: WriteContext = {
  failure: 'The ACS content was not saved.',
  table: 'acs_items',
  migration: '0014_acs_listening_argumentation.sql',
};

let cache: AcsItem[] = normalizeAcsRows([]);

function fingerprint(items: AcsItem[]): string {
  return JSON.stringify(items);
}

function setCache(items: AcsItem[]): void {
  cache = items;
  writeLocal(STORAGE_KEY, items);
}

/** Copies the last saved content from localStorage into memory. Synchronous, so the first render has something. */
export function initAcs(): void {
  try {
    cache = normalizeAcsRows(readLocal<unknown>(STORAGE_KEY));
  } catch {
    cache = normalizeAcsRows([]);
  }
}

export function getAcsItems(kind: AcsKind): AcsItem[] {
  return cache.filter((item) => item.kind === kind);
}

export function getAcsItem(kind: AcsKind, position: number): AcsItem {
  return cache.find((item) => item.kind === kind && item.position === position) ?? normalizeAcsRows([]).find((item) => item.kind === kind && item.position === position)!;
}

/** The address students stream a recording from. Only paths this app creates are ever turned into a link. */
export function acsAudioUrl(item: Pick<AcsItem, 'audio_path'>): string {
  if (!isSafeAudioPath(item.audio_path)) return '';
  return supabase.storage.from(ACS_AUDIO_BUCKET).getPublicUrl(item.audio_path).data.publicUrl;
}

/**
 * Reads the 16 items from Supabase into memory and localStorage.
 * Returns 'changed' when what students see is different now, 'same' when it is not, and 'failed' when Supabase is
 * not configured or the read fails (for example before migration 0014 is run), keeping the local copy.
 */
export async function syncAcsFromRemote(): Promise<'changed' | 'same' | 'failed'> {
  if (!isSupabaseConfigured) return 'failed';
  try {
    const { data, error } = await supabase.from('acs_items').select(COLUMNS);
    if (error || !Array.isArray(data)) return 'failed';
    const next = normalizeAcsRows(data);
    const changed = fingerprint(next) !== fingerprint(cache);
    setCache(next);
    return changed ? 'changed' : 'same';
  } catch {
    return 'failed';
  }
}

/** Admin read: like syncAcsFromRemote, but says why it failed so the manager can tell the admin what to do. */
export async function fetchAcsForAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase is not configured for this site.' };
  try {
    const { data, error } = await supabase.from('acs_items').select(COLUMNS);
    if (error) return { ok: false, error: describeWriteError(error, { ...writeContext, failure: '' }).trim() };
    setCache(normalizeAcsRows(data));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reach Supabase.' };
  }
}

async function saveRow(row: Record<string, unknown>, kind: AcsKind, position: number): Promise<AcsItem> {
  const { data, error } = await supabase
    .from('acs_items')
    .upsert({ kind, position, ...row }, { onConflict: 'kind,position' })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`${writeContext.failure} ${describeWriteError(error, writeContext)}`);
  const saved = normalizeAcsRows([data]).find((item) => item.kind === kind && item.position === position);
  if (!saved) throw new Error(`${writeContext.failure} Supabase returned an unexpected answer.`);
  setCache(cache.map((item) => (item.kind === kind && item.position === position ? saved : item)));
  return saved;
}

/** Saves the name (and, for an argumentation item, the arguments). Throws a readable Error when it did not save. */
export async function saveAcsText(
  kind: AcsKind,
  position: number,
  fields: { title: string; arguments?: readonly string[] },
): Promise<AcsItem> {
  const title = fields.title.trim();
  if (title.length > ACS_TITLE_MAX) {
    throw new Error(`${writeContext.failure} The name is longer than ${ACS_TITLE_MAX} characters.`);
  }
  const row: Record<string, unknown> = { title };
  if (kind === 'argumentation' && fields.arguments) {
    const prepared = prepareArgumentsForSave(fields.arguments);
    if (!prepared.ok) throw new Error(`${writeContext.failure} ${prepared.error}`);
    row.arguments = prepared.value;
  }
  return saveRow(row, kind, position);
}

interface UploadHandle {
  promise: Promise<void>;
  abort: () => void;
}

/** Uploads with a real progress callback (supabase-js reports none). Rejects with a readable Error. */
function uploadWithProgress(path: string, file: File, contentType: string, onProgress: (fraction: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Your admin session has expired. Sign in again and retry.');
    await new Promise<void>((resolve, reject) => {
      xhr.open('POST', `${supabaseUrl}/storage/v1/object/${ACS_AUDIO_BUCKET}/${path}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', supabaseAnonKey);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(1);
          resolve();
          return;
        }
        let message = '';
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
          message = body.message ?? body.error ?? '';
        } catch {
          message = '';
        }
        if (xhr.status === 413) reject(new Error('That file is too large for the server.'));
        else if (xhr.status === 401 || xhr.status === 403 || /row-level security|unauthori[sz]ed/i.test(message)) {
          reject(new Error('Supabase refused the upload. Sign out and sign back in as an admin.'));
        } else if (/bucket not found/i.test(message) || xhr.status === 404) {
          reject(new Error('The audio storage is not set up yet. Run supabase/migrations/0014_acs_listening_argumentation.sql in the Supabase SQL editor.'));
        } else if (/mime/i.test(message)) {
          reject(new Error('The server does not accept that audio format. Use MP3, M4A, WAV or OGG.'));
        } else {
          reject(new Error(message ? `Upload failed: ${message}` : `Upload failed (error ${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.onabort = () => reject(new Error('Upload cancelled.'));
      const form = new FormData();
      form.append('cacheControl', '31536000');
      form.append('', file.slice(0, file.size, contentType), file.name);
      xhr.send(form);
    });
  })();
  return { promise, abort: () => xhr.abort() };
}

async function removeStoredAudio(path: string | null): Promise<void> {
  if (!isSafeAudioPath(path)) return;
  try {
    await supabase.storage.from(ACS_AUDIO_BUCKET).remove([path]);
  } catch {
    // The row no longer points at the file, so a leftover file is only wasted space, never a broken page.
  }
}

export interface AcsUpload {
  promise: Promise<AcsItem>;
  abort: () => void;
}

/**
 * Uploads a recording for a listening and points the item at it. The old recording is deleted afterwards, and if
 * saving fails the new file is deleted again, so nothing is left half done.
 */
export function uploadAcsAudio(position: number, file: File, onProgress: (fraction: number) => void): AcsUpload {
  const check = checkAudioFile(file);
  if (!check.ok || !check.extension || !check.contentType) {
    return { promise: Promise.reject(new Error(check.error ?? 'That file cannot be uploaded.')), abort: () => undefined };
  }
  const previous = getAcsItem('listening', position).audio_path;
  const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const path = buildAudioPath(position, check.extension, token);
  const upload = uploadWithProgress(path, file, check.contentType, onProgress);

  const promise = (async () => {
    await upload.promise;
    try {
      const saved = await saveRow({ audio_path: path, audio_name: file.name.slice(0, 200), audio_size: file.size }, 'listening', position);
      if (previous && previous !== path) void removeStoredAudio(previous);
      return saved;
    } catch (error) {
      void removeStoredAudio(path);
      throw error;
    }
  })();
  return { promise, abort: upload.abort };
}

/** Detaches the recording from a listening, then deletes the file. */
export async function removeAcsAudio(position: number): Promise<AcsItem> {
  const previous = getAcsItem('listening', position).audio_path;
  const saved = await saveRow({ audio_path: null, audio_name: null, audio_size: null }, 'listening', position);
  void removeStoredAudio(previous);
  return saved;
}
