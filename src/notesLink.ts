// Pure helper for the per-theme "Notes From Lecture" link. No runtime imports, so Node tests can load it.

export const NOTES_URL_MAX = 500;

export type NotesUrlResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Cleans a link typed into the admin form. Blank is allowed (it removes the link). A bare
 * "notion.so/page" gets https:// added. Only https links are accepted, so a javascript: or
 * data: URL can never end up in a href.
 */
export function normalizeNotesUrl(input: unknown): NotesUrlResult {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { ok: true, value: '' };

  if (raw.startsWith('/')) {
    return { ok: false, error: 'That does not look like a valid link.' };
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  if (/\s/.test(withScheme)) {
    return { ok: false, error: 'The link must not contain spaces.' };
  }

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That does not look like a valid link.' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Use a link that starts with https://' };
  }
  if (!url.hostname.includes('.') || url.username || url.password) {
    return { ok: false, error: 'That does not look like a valid link.' };
  }

  const value = url.toString();
  if (value.length > NOTES_URL_MAX) {
    return { ok: false, error: `The link is too long (${NOTES_URL_MAX} characters at most).` };
  }
  return { ok: true, value };
}
