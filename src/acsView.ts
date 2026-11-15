import { escapeHtml } from './dom';
import { acsAudioUrl, getAcsItem, getAcsItems } from './acs';
import {
  ACS_SECTIONS,
  ACS_SLOTS,
  ACS_SUBJECT,
  acsFullLabel,
  acsItemStatus,
  acsSlotLabel,
  formatBytes,
  type AcsItem,
  type AcsKind,
} from './acsModel';
import { mountAudioPlayer, renderAudioPlayer } from './audioPlayer';
import { mountNotes, renderNotesCard } from './acsNotes';

// The Academic Communication Skills screens a student sees: the two sections, the 8 numbered buttons of a section,
// and one item (audio or arguments, with a note-taking area underneath).

const ICONS: Record<AcsKind, string> = {
  listening:
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  argumentation:
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
};

/** The two sections of the subject. Shown where other subjects show their theme list. */
export function renderAcsLanding(): string {
  const cards = (['listening', 'argumentation'] as const)
    .map((kind) => {
      const section = ACS_SECTIONS[kind];
      return `
        <button class="acs-section-card" type="button" data-action="acs-section-select" data-kind="${kind}">
          <span class="acs-section-icon">${ICONS[kind]}</span>
          <span class="acs-section-text">
            <span class="acs-section-title">${escapeHtml(section.label)}</span>
            <span class="acs-section-sub">${escapeHtml(section.blurb)} · ${ACS_SLOTS} listenings</span>
          </span>
          <span class="theme-btn-arrow" aria-hidden="true">→</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="acs-step">
      <button class="back-link" type="button" data-action="back-subjects">← Choose Another Subject</button>
      <div class="selected-subject-header" id="active-subject-title">${escapeHtml(ACS_SUBJECT)}</div>
      <div class="acs-section-list">${cards}</div>
    </section>
  `;
}

/** The 8 numbered buttons of one section. */
export function renderAcsItemList(kind: AcsKind): string {
  const section = ACS_SECTIONS[kind];
  const buttons = getAcsItems(kind)
    .map((item) => {
      const title = item.title.trim();
      const status = acsItemStatus(item);
      const soon = status === 'Coming soon';
      return `
        <button class="acs-item-btn ${soon ? 'is-soon' : ''}" type="button" data-action="acs-item-select" data-position="${item.position}" aria-label="${escapeHtml(acsFullLabel(item))}, ${escapeHtml(status)}">
          <span class="acs-item-num" aria-hidden="true">${item.position}</span>
          <span class="acs-item-text">
            <span class="acs-item-label">${escapeHtml(acsSlotLabel(kind, item.position))}</span>
            ${title ? `<span class="acs-item-title">${escapeHtml(title)}</span>` : ''}
          </span>
          <span class="acs-item-status">${escapeHtml(status)}</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="acs-step">
      <button class="back-link" type="button" data-action="acs-back">← ${escapeHtml(ACS_SUBJECT)}</button>
      <div class="selected-subject-header"><span class="acs-kicker">${escapeHtml(ACS_SUBJECT)}</span>${escapeHtml(section.label)}</div>
      <div class="acs-item-grid">${buttons}</div>
    </section>
  `;
}

function renderListeningBody(item: AcsItem): string {
  const url = acsAudioUrl(item);
  if (!url) {
    return `
      <article class="acs-card">
        <div class="acs-card-head"><h3>Recording</h3></div>
        <div class="acs-empty">
          <strong>The recording is being prepared</strong>
          <span>It has not been uploaded yet. Come back soon. You can still use the notepad below.</span>
        </div>
      </article>
    `;
  }
  const size = item.audio_size ? formatBytes(item.audio_size) : '';
  return `
    <article class="acs-card">
      <div class="acs-card-head">
        <h3>Recording</h3>
        ${size ? `<span class="acs-card-meta">${escapeHtml(size)}</span>` : ''}
      </div>
      ${renderAudioPlayer(url, acsFullLabel(item))}
    </article>
  `;
}

function renderArgumentsBody(item: AcsItem): string {
  if (item.arguments.length === 0) {
    return `
      <article class="acs-card">
        <div class="acs-card-head"><h3>Arguments</h3></div>
        <div class="acs-empty">
          <strong>The arguments are being prepared</strong>
          <span>They have not been added yet. Come back soon. You can still use the notepad below.</span>
        </div>
      </article>
    `;
  }
  return `
    <article class="acs-card">
      <div class="acs-card-head">
        <h3>Arguments</h3>
        <span class="acs-card-meta">${item.arguments.length} ${item.arguments.length === 1 ? 'argument' : 'arguments'}</span>
      </div>
      <ol class="acs-arguments">
        ${item.arguments.map((text) => `<li class="acs-argument"><span class="acs-argument-text">${escapeHtml(text)}</span></li>`).join('')}
      </ol>
    </article>
  `;
}

/** One listening or argumentation item: its content on top, the student's notepad below. */
export function renderAcsDetail(kind: AcsKind, position: number): string {
  const item = getAcsItem(kind, position);
  const section = ACS_SECTIONS[kind];
  const title = item.title.trim();
  return `
    <section class="acs-step acs-detail" data-acs-detail>
      <button class="back-link" type="button" data-action="acs-back">← ${escapeHtml(section.label)}</button>
      <div class="selected-subject-header">
        <span class="acs-kicker">${escapeHtml(section.label)}</span>
        ${escapeHtml(acsSlotLabel(kind, position))}${title ? `<span class="acs-header-title">${escapeHtml(title)}</span>` : ''}
      </div>
      ${kind === 'listening' ? renderListeningBody(item) : renderArgumentsBody(item)}
      ${renderNotesCard(kind, position)}
    </section>
  `;
}

/** Brings the audio player and the notepad on a detail page to life. Returns a function that tears both down. */
export function mountAcsDetail(root: HTMLElement, kind: AcsKind, position: number): () => void {
  const cleanups: Array<() => void> = [];
  const player = root.querySelector<HTMLElement>('[data-player]');
  if (player) cleanups.push(mountAudioPlayer(player));
  const notes = root.querySelector<HTMLElement>('[data-notes-card]');
  if (notes) cleanups.push(mountNotes(notes, kind, position));
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
