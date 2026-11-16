import { escapeHtml } from './dom';
import { readLocal, removeLocal, writeLocal } from './storage';
import { ACS_NOTES_MAX, clampNotes, countWords, type AcsKind } from './acsModel';

// The student's own notes for one listening. They live only on this device (localStorage):
// students are anonymous, so there is no account to attach them to. Nothing here is ever sent to Supabase.

function key(kind: AcsKind, position: number): string {
  return `acs-notes:${kind}:${position}`;
}

export function loadAcsNotes(kind: AcsKind, position: number): string {
  const saved = readLocal<unknown>(key(kind, position));
  return typeof saved === 'string' ? clampNotes(saved) : '';
}

export function saveAcsNotes(kind: AcsKind, position: number, text: string): void {
  const clean = clampNotes(text);
  if (clean.trim()) writeLocal(key(kind, position), clean);
  else removeLocal(key(kind, position));
}

export function renderNotesCard(kind: AcsKind, position: number): string {
  const initial = loadAcsNotes(kind, position);
  return `
    <article class="acs-card acs-notes-card" data-notes-card>
      <div class="acs-card-head">
        <h3>Your notes</h3>
        <span class="acs-notes-status" data-notes-status role="status" aria-live="polite">Saved on this device</span>
      </div>
      <label class="visually-hidden" for="acs-notes-input">Your notes</label>
      <textarea
        id="acs-notes-input"
        class="acs-notes-input"
        data-notes-input
        rows="9"
        maxlength="${ACS_NOTES_MAX}"
        spellcheck="true"
        placeholder="Type your notes here as you listen and read. They are saved automatically."
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
export function mountNotes(root: HTMLElement, kind: AcsKind, position: number): () => void {
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
    saveAcsNotes(kind, position, input.value);
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
