import { escapeHtml } from '../dom';
import { fetchAcsForAdmin, getAcsItem, removeAcsAudio, saveAcsText, uploadAcsAudio, acsAudioUrl, type AcsUpload } from '../acs';
import {
  ACS_ARGUMENT_MAX,
  ACS_ARGUMENTS_MAX,
  ACS_KINDS,
  ACS_AUDIO_EXTENSIONS,
  ACS_AUDIO_MAX_BYTES,
  ACS_SECTIONS,
  ACS_SLOTS,
  ACS_SUBJECT,
  ACS_TITLE_MAX,
  acsSlotLabel,
  checkAudioFile,
  formatBytes,
  prepareArgumentsForSave,
  type AcsItem,
  type AcsKind,
} from '../acsModel';

// "Academic Communication Skills" manager: a dialog where an admin names the 8 listenings of each section, uploads the
// recordings, and writes the arguments. It owns its own small state and DOM, separate from the dashboard's render loop,
// so a dashboard refresh can never wipe a half-typed argument or a running upload.

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

interface Draft {
  title: string;
  /** One entry per textarea (blank rows allowed while typing). */
  arguments: string[];
}

type Busy = 'saving' | 'uploading' | 'removing';

const FILE_ACCEPT = ['audio/*', ...ACS_AUDIO_EXTENSIONS.map((ext) => `.${ext}`)].join(',');

const key = (kind: AcsKind, position: number): string => `${kind}:${position}`;

let openInstance: { close: () => void } | null = null;

export function openAcsManager(notify: Notify): void {
  if (openInstance) return;

  const kind: AcsKind = 'listening';
  let loading = true;
  let loadError: string | null = null;
  const drafts = new Map<string, Draft>();
  const busy = new Map<string, Busy>();
  const progress = new Map<string, number>();
  const messages = new Map<string, { text: string; error: boolean }>();
  const uploads = new Map<string, AcsUpload>();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const backdrop = document.createElement('div');
  backdrop.className = 'theme-modal-backdrop acs-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'acs-modal-title');
  backdrop.innerHTML = `
    <div class="theme-modal-card acs-modal-card">
      <div class="theme-modal-header">
        <div>
          <h2 id="acs-modal-title">${escapeHtml(ACS_SUBJECT)}</h2>
          <p>${escapeHtml(ACS_SECTIONS.listening.label)}: name each listening, upload its recording, and add arguments under it. Students see changes as soon as you save.</p>
        </div>
        <button class="theme-modal-close" type="button" data-acs-close aria-label="Close">&times;</button>
      </div>
      <div class="theme-modal-body acs-modal-body" data-lenis-prevent>
        <div data-acs-content></div>
      </div>
      <div class="theme-modal-footer">
        <span class="acs-footer-note" data-acs-footer-note></span>
        <button class="button ghost" type="button" data-acs-close>Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  window.siteScroll?.stop();

  const content = backdrop.querySelector<HTMLElement>('[data-acs-content]')!;
  const footerNote = backdrop.querySelector<HTMLElement>('[data-acs-footer-note]')!;

  const draftFor = (k: AcsKind, position: number): Draft => {
    const id = key(k, position);
    let draft = drafts.get(id);
    if (!draft) {
      const item = getAcsItem(k, position);
      draft = { title: item.title, arguments: [...item.arguments] };
      drafts.set(id, draft);
    }
    return draft;
  };

  const isDirty = (k: AcsKind, position: number): boolean => {
    const draft = drafts.get(key(k, position));
    if (!draft) return false;
    const item = getAcsItem(k, position);
    if (draft.title.trim() !== item.title.trim()) return true;
    const prepared = draft.arguments.map((entry) => entry.trim()).filter(Boolean);
    return JSON.stringify(prepared) !== JSON.stringify(item.arguments);
  };

  const anyDirty = (): boolean => {
    for (const k of ACS_KINDS) {
      for (let position = 1; position <= ACS_SLOTS; position += 1) if (isDirty(k, position)) return true;
    }
    return false;
  };

  const chipFor = (item: AcsItem, dirty: boolean): { text: string; tone: string } => {
    if (dirty) return { text: 'Unsaved changes', tone: 'is-dirty' };
    const count = item.arguments.length;
    const extra = count > 0 ? ` · ${count} ${count === 1 ? 'argument' : 'arguments'}` : '';
    return item.audio_path ? { text: `Audio ready${extra}`, tone: 'is-ok' } : { text: `No audio yet${extra}`, tone: 'is-soon' };
  };

  const renderAudio = (item: AcsItem): string => {
    const id = key(item.kind, item.position);
    const state = busy.get(id);
    if (state === 'uploading') {
      const percent = Math.round((progress.get(id) ?? 0) * 100);
      return `
        <div class="acs-admin-upload" data-acs-uploading>
          <div class="acs-admin-upload-row">
            <span>Uploading… <strong data-acs-percent>${percent}%</strong></span>
            <button type="button" class="action-btn-sm" data-acs-cancel-upload>Cancel</button>
          </div>
          <div class="acs-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Upload progress"><span data-acs-bar style="width:${percent}%"></span></div>
        </div>
      `;
    }
    const picker = `<input class="acs-file-input" type="file" accept="${escapeHtml(FILE_ACCEPT)}" data-acs-file aria-label="Choose an audio file for ${escapeHtml(acsSlotLabel(item.kind, item.position))}" />`;
    const url = acsAudioUrl(item);
    if (url) {
      return `
        <div class="acs-admin-audio">
          <div class="acs-admin-audio-meta">
            <span class="acs-admin-file" title="${escapeHtml(item.audio_name ?? '')}">${escapeHtml(item.audio_name ?? 'Recording')}</span>
            ${item.audio_size ? `<span class="acs-admin-size">${escapeHtml(formatBytes(item.audio_size))}</span>` : ''}
          </div>
          <audio class="acs-admin-preview" controls preload="none" src="${escapeHtml(url)}"></audio>
          <div class="acs-admin-audio-actions">
            <label class="action-btn-sm acs-replace">Replace audio${picker}</label>
            <button type="button" class="action-btn-sm danger" data-acs-remove-audio ${state ? 'disabled' : ''}>${state === 'removing' ? 'Removing…' : 'Remove'}</button>
          </div>
        </div>
      `;
    }
    return `
      <label class="acs-dropzone" data-acs-drop>
        ${picker}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span class="acs-dropzone-text">
          <strong>Choose an audio file</strong> or drop it here
          <small>MP3, M4A, WAV, OGG, AAC, FLAC or WebM · up to ${escapeHtml(formatBytes(ACS_AUDIO_MAX_BYTES))}</small>
        </span>
      </label>
    `;
  };

  const renderArguments = (draft: Draft, saving: boolean): string => {
    const rows = draft.arguments
      .map(
        (text, index) => `
          <div class="acs-arg-row" data-acs-arg-row="${index}">
            <span class="acs-arg-num" aria-hidden="true">${index + 1}</span>
            <textarea rows="2" maxlength="${ACS_ARGUMENT_MAX}" data-acs-arg="${index}" placeholder="Type the argument or question…" aria-label="Argument ${index + 1}">${escapeHtml(text)}</textarea>
            <div class="acs-arg-actions">
              <button type="button" class="action-btn-sm" data-acs-arg-up="${index}" aria-label="Move argument ${index + 1} up" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="action-btn-sm" data-acs-arg-down="${index}" aria-label="Move argument ${index + 1} down" ${index === draft.arguments.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="action-btn-sm danger" data-acs-arg-remove="${index}" aria-label="Remove argument ${index + 1}">✕</button>
            </div>
          </div>
        `,
      )
      .join('');
    return `
      <div class="acs-admin-args">
        ${rows || '<p class="acs-arg-empty">No arguments yet. Add the first one below.</p>'}
        <button type="button" class="action-btn-sm primary" data-acs-arg-add ${draft.arguments.length >= ACS_ARGUMENTS_MAX || saving ? 'disabled' : ''}>+ Add argument</button>
      </div>
    `;
  };

  const renderItem = (k: AcsKind, position: number): string => {
    const id = key(k, position);
    const item = getAcsItem(k, position);
    const draft = draftFor(k, position);
    const state = busy.get(id);
    const dirty = isDirty(k, position);
    const chip = chipFor(item, dirty);
    const message = messages.get(id);
    return `
      <li class="acs-admin-item" data-acs-item="${id}" data-kind="${k}" data-position="${position}">
        <div class="acs-admin-item-head">
          <span class="acs-admin-num" aria-hidden="true">${position}</span>
          <div class="acs-admin-name">
            <label for="acs-name-${k}-${position}">${escapeHtml(acsSlotLabel(k, position))} <span class="acs-opt">name (optional)</span></label>
            <input id="acs-name-${k}-${position}" type="text" maxlength="${ACS_TITLE_MAX}" data-acs-name placeholder="e.g. Global trade and growth" value="${escapeHtml(draft.title)}" autocomplete="off" />
          </div>
          <span class="acs-admin-chip ${chip.tone}" data-acs-chip>${escapeHtml(chip.text)}</span>
        </div>
        <div class="acs-admin-block">
          <div class="acs-admin-block-title">Recording</div>
          ${renderAudio(item)}
        </div>
        <div class="acs-admin-block">
          <div class="acs-admin-block-title">Arguments <span class="acs-opt">(optional, shown under the recording)</span></div>
          ${renderArguments(draft, state === 'saving')}
        </div>
        <div class="acs-admin-item-foot">
          <span class="acs-admin-msg ${message?.error ? 'is-error' : ''}" data-acs-msg role="status" aria-live="polite">${escapeHtml(message?.text ?? '')}</span>
          <button type="button" class="acs-save" data-acs-save ${dirty && !state ? '' : 'disabled'}>${state === 'saving' ? 'Saving…' : 'Save'}</button>
        </div>
      </li>
    `;
  };

  const refreshItem = (k: AcsKind, position: number): void => {
    const el = content.querySelector<HTMLElement>(`[data-acs-item="${key(k, position)}"]`);
    if (!el) return;
    const next = document.createElement('div');
    next.innerHTML = renderItem(k, position);
    el.replaceWith(next.firstElementChild!);
  };

  const patchDirty = (k: AcsKind, position: number): void => {
    const el = content.querySelector<HTMLElement>(`[data-acs-item="${key(k, position)}"]`);
    if (!el) return;
    const dirty = isDirty(k, position);
    const chip = chipFor(getAcsItem(k, position), dirty);
    const chipEl = el.querySelector<HTMLElement>('[data-acs-chip]');
    if (chipEl) {
      chipEl.textContent = chip.text;
      chipEl.className = `acs-admin-chip ${chip.tone}`;
    }
    const save = el.querySelector<HTMLButtonElement>('[data-acs-save]');
    if (save) save.disabled = !dirty || busy.has(key(k, position));
    footerNote.textContent = anyDirty() ? 'You have unsaved changes' : '';
  };

  const render = (): void => {
    if (loading) {
      content.innerHTML = '<div class="acs-admin-state"><div class="spinner" aria-hidden="true"></div><p>Loading…</p></div>';
      return;
    }
    const intro = 'Each Listening button opens the audio player, then the arguments (if you add any), then a note-taking area for the student.';
    const banner = loadError
      ? `<div class="acs-admin-warning" role="alert"><strong>Could not load the saved content.</strong><span>${escapeHtml(loadError)}</span><button type="button" class="action-btn-sm" data-acs-retry>Try again</button></div>`
      : '';
    const items = Array.from({ length: ACS_SLOTS }, (_, index) => renderItem(kind, index + 1)).join('');
    content.innerHTML = `${banner}<p class="acs-admin-intro">${escapeHtml(intro)}</p><ol class="acs-admin-list">${items}</ol>`;
    footerNote.textContent = anyDirty() ? 'You have unsaved changes' : '';
  };

  const setMessage = (k: AcsKind, position: number, text: string, error = false): void => {
    if (text) messages.set(key(k, position), { text, error });
    else messages.delete(key(k, position));
  };

  const load = async (): Promise<void> => {
    loading = true;
    render();
    const result = await fetchAcsForAdmin();
    loadError = result.ok ? null : result.error;
    // The saved content may have just changed: untouched drafts start again from it, edited ones are kept.
    for (const id of [...drafts.keys()]) {
      const [k, position] = id.split(':') as [AcsKind, string];
      if (!isDirty(k, Number(position)) && !busy.has(id)) drafts.delete(id);
    }
    loading = false;
    render();
  };

  const save = async (k: AcsKind, position: number): Promise<void> => {
    const id = key(k, position);
    if (busy.has(id)) return;
    const draft = draftFor(k, position);
    const prepared = prepareArgumentsForSave(draft.arguments);
    if (!prepared.ok) {
      setMessage(k, position, prepared.error, true);
      refreshItem(k, position);
      return;
    }
    busy.set(id, 'saving');
    setMessage(k, position, '');
    refreshItem(k, position);
    try {
      const saved = await saveAcsText(k, position, { title: draft.title, arguments: draft.arguments });
      drafts.set(id, { title: saved.title, arguments: [...saved.arguments] });
      setMessage(k, position, 'Saved ✓');
      notify(`${acsSlotLabel(k, position)} saved.`, 'success');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not save.';
      setMessage(k, position, text, true);
      notify(text, 'error');
    } finally {
      busy.delete(id);
      refreshItem(k, position);
      footerNote.textContent = anyDirty() ? 'You have unsaved changes' : '';
    }
  };

  const startUpload = (position: number, file: File): void => {
    const id = key('listening', position);
    if (busy.has(id)) return;
    const check = checkAudioFile(file);
    if (!check.ok) {
      setMessage('listening', position, check.error ?? 'That file cannot be uploaded.', true);
      refreshItem('listening', position);
      notify(check.error ?? 'That file cannot be uploaded.', 'error');
      return;
    }
    busy.set(id, 'uploading');
    progress.set(id, 0);
    setMessage('listening', position, '');
    refreshItem('listening', position);
    const upload = uploadAcsAudio(position, file, (fraction) => {
      progress.set(id, fraction);
      const el = content.querySelector<HTMLElement>(`[data-acs-item="${id}"]`);
      if (!el) return;
      const percent = Math.round(fraction * 100);
      const label = el.querySelector<HTMLElement>('[data-acs-percent]');
      const bar = el.querySelector<HTMLElement>('[data-acs-bar]');
      if (label) label.textContent = `${percent}%`;
      if (bar) {
        bar.style.width = `${percent}%`;
        bar.parentElement?.setAttribute('aria-valuenow', String(percent));
      }
    });
    uploads.set(id, upload);
    upload.promise
      .then(() => {
        setMessage('listening', position, 'Uploaded ✓');
        notify(`Audio for ${acsSlotLabel('listening', position)} uploaded.`, 'success');
      })
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : 'Upload failed.';
        if (text !== 'Upload cancelled.') notify(text, 'error');
        setMessage('listening', position, text, text !== 'Upload cancelled.');
      })
      .finally(() => {
        uploads.delete(id);
        busy.delete(id);
        progress.delete(id);
        refreshItem('listening', position);
      });
  };

  const removeAudio = async (position: number): Promise<void> => {
    const id = key('listening', position);
    if (busy.has(id)) return;
    if (!window.confirm(`Remove the recording of ${acsSlotLabel('listening', position)}? Students will see "Coming soon" until you upload another.`)) return;
    busy.set(id, 'removing');
    refreshItem('listening', position);
    try {
      await removeAcsAudio(position);
      setMessage('listening', position, 'Audio removed.');
      notify('Audio removed.', 'info');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not remove the audio.';
      setMessage('listening', position, text, true);
      notify(text, 'error');
    } finally {
      busy.delete(id);
      refreshItem('listening', position);
    }
  };

  const itemOf = (target: Element): { k: AcsKind; position: number } | null => {
    const el = target.closest<HTMLElement>('[data-acs-item]');
    if (!el) return null;
    return { k: el.dataset.kind as AcsKind, position: Number(el.dataset.position) };
  };

  const close = (force = false): void => {
    if (!force) {
      if (uploads.size > 0 && !window.confirm('An upload is still running. Cancel it and close?')) return;
      if (anyDirty() && !window.confirm('You have unsaved changes. Close without saving?')) return;
    }
    for (const upload of uploads.values()) upload.abort();
    document.removeEventListener('keydown', onKeydown, true);
    backdrop.remove();
    window.siteScroll?.start();
    openInstance = null;
    opener?.focus?.();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep keyboard focus inside the dialog.
    const focusable = [...backdrop.querySelectorAll<HTMLElement>('button, input, textarea, select, audio, a[href], [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });

  backdrop.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-acs-close]')) return close();
    if (target.closest('[data-acs-retry]')) return void load();
    const ref = itemOf(target);
    if (!ref) return;
    const { k, position } = ref;
    if (target.closest('[data-acs-save]')) return void save(k, position);
    if (target.closest('[data-acs-remove-audio]')) return void removeAudio(position);
    if (target.closest('[data-acs-cancel-upload]')) {
      uploads.get(key(k, position))?.abort();
      return;
    }
    const draft = draftFor(k, position);
    if (target.closest('[data-acs-arg-add]')) {
      if (draft.arguments.length < ACS_ARGUMENTS_MAX) draft.arguments.push('');
      refreshItem(k, position);
      content.querySelector<HTMLTextAreaElement>(`[data-acs-item="${key(k, position)}"] [data-acs-arg="${draft.arguments.length - 1}"]`)?.focus();
      return;
    }
    const remove = target.closest<HTMLElement>('[data-acs-arg-remove]');
    const up = target.closest<HTMLElement>('[data-acs-arg-up]');
    const down = target.closest<HTMLElement>('[data-acs-arg-down]');
    if (remove || up || down) {
      const index = Number(remove?.dataset.acsArgRemove ?? up?.dataset.acsArgUp ?? down?.dataset.acsArgDown);
      if (remove) draft.arguments.splice(index, 1);
      else {
        const to = up ? index - 1 : index + 1;
        if (to >= 0 && to < draft.arguments.length) [draft.arguments[index], draft.arguments[to]] = [draft.arguments[to], draft.arguments[index]];
      }
      refreshItem(k, position);
    }
  });

  backdrop.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    const ref = itemOf(target);
    if (!ref) return;
    const draft = draftFor(ref.k, ref.position);
    if (target instanceof HTMLInputElement && target.matches('[data-acs-name]')) draft.title = target.value;
    else if (target instanceof HTMLTextAreaElement && target.dataset.acsArg !== undefined) draft.arguments[Number(target.dataset.acsArg)] = target.value;
    else return;
    if (messages.has(key(ref.k, ref.position))) {
      messages.delete(key(ref.k, ref.position));
      const msg = content.querySelector<HTMLElement>(`[data-acs-item="${key(ref.k, ref.position)}"] [data-acs-msg]`);
      if (msg) msg.textContent = '';
    }
    patchDirty(ref.k, ref.position);
  });

  backdrop.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || !target.matches('[data-acs-file]')) return;
    const ref = itemOf(target);
    const file = target.files?.[0];
    target.value = '';
    if (ref && file) startUpload(ref.position, file);
  });

  // Drag a recording onto the drop area.
  backdrop.addEventListener('dragover', (event) => {
    if ((event.target as HTMLElement).closest('[data-acs-drop]')) {
      event.preventDefault();
      (event.target as HTMLElement).closest('[data-acs-drop]')?.classList.add('is-over');
    }
  });
  backdrop.addEventListener('dragleave', (event) => {
    (event.target as HTMLElement).closest('[data-acs-drop]')?.classList.remove('is-over');
  });
  backdrop.addEventListener('drop', (event) => {
    const zone = (event.target as HTMLElement).closest('[data-acs-drop]');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('is-over');
    const ref = itemOf(zone);
    const file = event.dataTransfer?.files?.[0];
    if (ref && file) startUpload(ref.position, file);
  });

  document.addEventListener('keydown', onKeydown, true);
  openInstance = { close: () => close(true) };
  render();
  backdrop.querySelector<HTMLElement>('[data-acs-close]')?.focus();
  void load();
}
