import { escapeHtml } from './dom';
import { readLocal, removeLocal, writeLocal } from './storage';
import { ACS_NOTES_MAX, clampNotes, countWords, type AcsKind } from './acsModel';

// The student's own notes for one listening. They live only on this device (localStorage):
// students are anonymous, so there is no account to attach them to. Nothing here is ever sent to Supabase.

/** The three note-taking areas under every listening, in the order they are shown. */
export type AcsNoteField = 'notes' | 'summary' | 'argumentation';

export const ACS_NOTE_FIELDS: readonly { field: AcsNoteField; title: string; placeholder: string }[] = [
  { field: 'notes', title: 'Your Notes', placeholder: 'Type your notes here as you listen and read. They are saved automatically.' },
  { field: 'summary', title: 'Listening summary', placeholder: 'Write a short summary of what you heard. It is saved automatically.' },
  { field: 'argumentation', title: 'Argumentation', placeholder: 'Write the arguments you noticed or want to make. They are saved automatically.' },
];

/** "Your Notes" keeps the storage key it always had, so notes written before the other two areas existed are still there. */
export function notesStorageKey(kind: AcsKind, position: number, field: AcsNoteField = 'notes'): string {
  return field === 'notes' ? `acs-notes:${kind}:${position}` : `acs-notes:${kind}:${position}:${field}`;
}

export function loadAcsNotes(kind: AcsKind, position: number, field: AcsNoteField = 'notes'): string {
  const saved = readLocal<unknown>(notesStorageKey(kind, position, field));
  return typeof saved === 'string' ? clampNotes(saved) : '';
}

export function saveAcsNotes(kind: AcsKind, position: number, text: string, field: AcsNoteField = 'notes'): void {
  const clean = clampNotes(text);
  if (clean.trim()) writeLocal(notesStorageKey(kind, position, field), clean);
  else removeLocal(notesStorageKey(kind, position, field));
}

export function renderNotesCard(kind: AcsKind, position: number, field: AcsNoteField = 'notes'): string {
  const initial = loadAcsNotes(kind, position, field);
  const info = ACS_NOTE_FIELDS.find((item) => item.field === field) ?? ACS_NOTE_FIELDS[0];
  const id = `acs-${field}-input`;
  return `
    <article class="acs-card acs-notes-card" data-notes-card data-notes-field="${field}">
      <div class="acs-card-head">
        <h3>${escapeHtml(info.title)}</h3>
        <span class="acs-notes-status" data-notes-status role="status" aria-live="polite">Saved on this device</span>
      </div>
      <label class="visually-hidden" for="${id}">${escapeHtml(info.title)}</label>
      <textarea
        id="${id}"
        class="acs-notes-input"
        data-notes-input
        rows="9"
        maxlength="${ACS_NOTES_MAX}"
        spellcheck="true"
        placeholder="${escapeHtml(info.placeholder)}"
      >${escapeHtml(initial)}</textarea>
      <div class="acs-notes-foot">
        <span class="acs-notes-count" data-notes-count>${countWords(initial)} words</span>
        <span class="acs-notes-actions">
          <button type="button" class="acs-link-btn" data-notes-copy>Copy</button>
          <button type="button" class="acs-link-btn danger" data-notes-clear>Clear</button>
        </span>
      </div>
      <p class="acs-notes-hint">Notes stay on this device and are not shared with anyone.</p>
    </article>
  `;
}

/** Makes a notes card work: autosave while typing, copy, and a two-step clear. Returns a function that saves and stops. */
export function mountNotes(root: HTMLElement, kind: AcsKind, position: number, field: AcsNoteField = 'notes'): () => void {
  const input = root.querySelector<HTMLTextAreaElement>('[data-notes-input]');
  const status = root.querySelector<HTMLElement>('[data-notes-status]');
  const count = root.querySelector<HTMLElement>('[data-notes-count]');
  const copyButton = root.querySelector<HTMLButtonElement>('[data-notes-copy]');
  const clearButton = root.querySelector<HTMLButtonElement>('[data-notes-clear]');
  if (!input || !status || !count || !copyButton || !clearButton) return () => undefined;

  let timer = 0;
  let dirty = false;
  let clearArmed = 0;
  let copyTimer = 0;

  const setStatus = (text: string): void => {
    status.textContent = text;
  };
  const flush = (): void => {
    window.clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    saveAcsNotes(kind, position, input.value, field);
    setStatus('Saved on this device');
  };
  const grow = (): void => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 200), 560)}px`;
  };

  const onInput = (): void => {
    dirty = true;
    setStatus('Saving…');
    count.textContent = `${countWords(input.value)} words`;
    grow();
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 450);
  };

  const onClick = async (event: Event): Promise<void> => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-notes-copy]')) {
      try {
        await navigator.clipboard.writeText(input.value);
        copyButton.textContent = 'Copied';
      } catch {
        input.select();
        copyButton.textContent = document.execCommand?.('copy') ? 'Copied' : 'Press Ctrl+C';
      }
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1800);
      return;
    }
    if (target.closest('[data-notes-clear]')) {
      if (!input.value) return;
      if (!clearArmed) {
        clearButton.textContent = 'Tap again to clear';
        clearArmed = window.setTimeout(() => {
          clearArmed = 0;
          clearButton.textContent = 'Clear';
        }, 3000);
        return;
      }
      window.clearTimeout(clearArmed);
      clearArmed = 0;
      clearButton.textContent = 'Clear';
      input.value = '';
      dirty = true;
      onInput();
      flush();
      input.focus();
    }
  };

  // The tab may be closed or the phone locked while a note is still waiting for its autosave.
  const onHide = (): void => flush();
  input.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onHide);
  grow();

  return () => {
    flush();
    window.clearTimeout(clearArmed);
    window.clearTimeout(copyTimer);
    input.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick);
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onHide);
  };
}
