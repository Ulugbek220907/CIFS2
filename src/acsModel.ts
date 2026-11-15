// Academic Communication Skills (ACS): pure rules and helpers. No DOM and no network, so Node can test it.
//
// ACS has two sections, "Listening Preparation" (audio + notes) and "Argumentation Preparation" (arguments + notes),
// and each section has 8 numbered items ("Listening 1" ... "Listening 8"). An admin can name every item, upload the
// audio of a listening, and write the arguments of an argumentation item.

export type AcsKind = 'listening' | 'argumentation';

export const ACS_SUBJECT = 'Academic Communication Skills';
export const ACS_KINDS: readonly AcsKind[] = ['listening', 'argumentation'];
export const ACS_SLOTS = 8;
export const ACS_TITLE_MAX = 80;
export const ACS_ARGUMENT_MAX = 4000;
export const ACS_ARGUMENTS_MAX = 40;
export const ACS_NOTES_MAX = 20000;
export const ACS_AUDIO_BUCKET = 'acs-audio';
export const ACS_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
/** Audio formats browsers can play. The extension is checked as well, because some systems report no MIME type. */
export const ACS_AUDIO_EXTENSIONS: readonly string[] = ['mp3', 'm4a', 'mp4', 'aac', 'wav', 'ogg', 'oga', 'opus', 'webm', 'flac'];

export interface AcsItem {
  kind: AcsKind;
  /** 1 to 8. */
  position: number;
  /** Optional name shown next to "Listening N"; blank means just "Listening N". */
  title: string;
  /** Path inside the public audio bucket, e.g. "listening/3-k2j9x.mp3" (listening items only). */
  audio_path: string | null;
  audio_name: string | null;
  audio_size: number | null;
  /** The arguments / questions, in order (argumentation items only). */
  arguments: string[];
  updated_at: string;
}

export interface AcsSectionInfo {
  kind: AcsKind;
  label: string;
  /** Word used for the numbered buttons: "Listening 1". */
  itemNoun: string;
  blurb: string;
}

export const ACS_SECTIONS: Record<AcsKind, AcsSectionInfo> = {
  listening: {
    kind: 'listening',
    label: 'Listening Preparation',
    itemNoun: 'Listening',
    blurb: 'Listen to the recording and take notes',
  },
  argumentation: {
    kind: 'argumentation',
    label: 'Argumentation Preparation',
    itemNoun: 'Listening',
    blurb: 'Read the arguments and take notes',
  },
};

export function isAcsKind(value: unknown): value is AcsKind {
  return value === 'listening' || value === 'argumentation';
}

export function isAcsPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= ACS_SLOTS;
}

export function blankAcsItem(kind: AcsKind, position: number): AcsItem {
  return { kind, position, title: '', audio_path: null, audio_name: null, audio_size: null, arguments: [], updated_at: '' };
}

/** "Listening 3": the fixed label of a slot. */
export function acsSlotLabel(kind: AcsKind, position: number): string {
  return `${ACS_SECTIONS[kind].itemNoun} ${position}`;
}

/** The label plus the admin's name for it: "Listening 3: Trade and growth". */
export function acsFullLabel(item: AcsItem): string {
  const title = item.title.trim();
  return title ? `${acsSlotLabel(item.kind, item.position)}: ${title}` : acsSlotLabel(item.kind, item.position);
}

function cleanArguments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const text = entry.trim();
    if (text) out.push(text.slice(0, ACS_ARGUMENT_MAX));
    if (out.length >= ACS_ARGUMENTS_MAX) break;
  }
  return out;
}

/** True only for a path this app itself creates, so a tampered row can never point the player somewhere else. */
export function isSafeAudioPath(path: unknown): path is string {
  return typeof path === 'string' && /^listening\/[a-z0-9][a-z0-9._-]{0,119}$/.test(path);
}

/** Turns whatever came back from the database (or from the local copy) into exactly 16 clean items. */
export function normalizeAcsRows(rows: unknown): AcsItem[] {
  const byKey = new Map<string, AcsItem>();
  if (Array.isArray(rows)) {
    for (const raw of rows) {
      if (typeof raw !== 'object' || raw === null) continue;
      const row = raw as Record<string, unknown>;
      const kind = row.kind;
      const position = typeof row.position === 'string' ? Number(row.position) : row.position;
      if (!isAcsKind(kind) || !isAcsPosition(position)) continue;
      const audioPath = kind === 'listening' && isSafeAudioPath(row.audio_path) ? row.audio_path : null;
      byKey.set(`${kind}:${position}`, {
        kind,
        position,
        title: typeof row.title === 'string' ? row.title.trim().slice(0, ACS_TITLE_MAX) : '',
        audio_path: audioPath,
        audio_name: audioPath && typeof row.audio_name === 'string' ? row.audio_name.slice(0, 200) : null,
        audio_size: audioPath && typeof row.audio_size === 'number' && row.audio_size >= 0 ? row.audio_size : null,
        arguments: kind === 'argumentation' ? cleanArguments(row.arguments) : [],
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
      });
    }
  }
  const items: AcsItem[] = [];
  for (const kind of ACS_KINDS) {
    for (let position = 1; position <= ACS_SLOTS; position += 1) {
      items.push(byKey.get(`${kind}:${position}`) ?? blankAcsItem(kind, position));
    }
  }
  return items;
}

/** Does the item have what a student needs to use it? */
export function acsItemHasContent(item: AcsItem): boolean {
  return item.kind === 'listening' ? Boolean(item.audio_path) : item.arguments.length > 0;
}

/** Short status for the item buttons, e.g. "Audio ready", "3 arguments", "Coming soon". */
export function acsItemStatus(item: AcsItem): string {
  if (item.kind === 'listening') return item.audio_path ? 'Audio ready' : 'Coming soon';
  const count = item.arguments.length;
  if (count === 0) return 'Coming soon';
  return count === 1 ? '1 argument' : `${count} arguments`;
}

export interface AudioFileCheck {
  ok: boolean;
  error?: string;
  extension?: string;
  contentType?: string;
}

const EXTENSION_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : '';
}

/** Checks a chosen file before any upload starts, with a message an admin can act on. */
export function checkAudioFile(file: { name: string; size: number; type: string }): AudioFileCheck {
  const extension = fileExtension(file.name);
  const typeIsAudio = file.type.startsWith('audio/') || file.type === 'video/mp4' || file.type === 'video/webm';
  if (!ACS_AUDIO_EXTENSIONS.includes(extension) || (file.type && !typeIsAudio)) {
    return { ok: false, error: `That file is not a supported audio file. Use MP3, M4A, WAV, OGG, AAC, FLAC or WebM.` };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'That file is empty.' };
  }
  if (file.size > ACS_AUDIO_MAX_BYTES) {
    return { ok: false, error: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(ACS_AUDIO_MAX_BYTES)}.` };
  }
  const contentType = file.type.startsWith('audio/') ? file.type : (EXTENSION_TYPES[extension] ?? 'audio/mpeg');
  return { ok: true, extension, contentType };
}

/** A fresh, unguessable path per upload, so a replaced recording is never served stale from a cache. */
export function buildAudioPath(position: number, extension: string, random: string): string {
  const ext = ACS_AUDIO_EXTENSIONS.includes(extension) ? extension : 'mp3';
  const token = random.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || '0';
  return `listening/${position}-${token}.${ext}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** 83 -> "1:23", 3725 -> "1:02:05". Unknown or negative values read as "0:00". */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** What an admin typed in the arguments editor, cleaned up exactly as the database will accept it. */
export function prepareArgumentsForSave(entries: readonly string[]): { ok: true; value: string[] } | { ok: false; error: string } {
  const value: string[] = [];
  for (const entry of entries) {
    const text = entry.trim();
    if (!text) continue;
    if (text.length > ACS_ARGUMENT_MAX) {
      return { ok: false, error: `An argument is longer than ${ACS_ARGUMENT_MAX} characters. Shorten or split it.` };
    }
    value.push(text);
  }
  if (value.length > ACS_ARGUMENTS_MAX) {
    return { ok: false, error: `A section can hold at most ${ACS_ARGUMENTS_MAX} arguments.` };
  }
  return { ok: true, value };
}

/** Keeps a note to the size the notepad accepts. */
export function clampNotes(text: string): string {
  return text.length > ACS_NOTES_MAX ? text.slice(0, ACS_NOTES_MAX) : text;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
