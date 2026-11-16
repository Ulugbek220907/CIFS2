import { escapeHtml } from './dom';
import { acsAudioUrl, getAcsItem, getAcsItems } from './acs';
import {
  ACS_SECTIONS,
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

// The Academic Communication Skills screens a student sees: the 8 numbered Listening buttons, and one listening
// (its recording, its arguments if the admin wrote any, and a note-taking area underneath).

/** The 8 numbered buttons of Listening Preparation. */
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
      <button class="back-link" type="button" data-action="back-subjects">← Choose Another Subject</button>
      <div class="selected-subject-header" id="active-subject-title"><span class="acs-kicker">${escapeHtml(ACS_SUBJECT)}</span>${escapeHtml(section.label)}</div>
      <div class="acs-item-grid">${buttons}</div>
    </section>
  `;
}

function renderRecording(item: AcsItem): string {
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

/** The arguments sit under the recording. A listening without any shows no card at all. */
function renderArguments(item: AcsItem): string {
  if (item.arguments.length === 0) return '';
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

/** One listening: the recording on top, its arguments, then the student's notepad. */
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
      ${renderRecording(item)}
      ${renderArguments(item)}
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
