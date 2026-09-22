import { supabase } from '../supabase';
import { clearNode, escapeHtml } from '../dom';
import { subjects, themes } from '../constants';
import type { Question, Subject, Theme } from '../types';
import '../admin.css';

type AdminPhase = 'loading' | 'login' | 'dashboard';

interface AdminState {
  phase: AdminPhase;
  userEmail: string | null;
  error: string | null;
  busy: boolean;
  questions: Question[];
  filterSubject: Subject | 'All';
  filterTheme: Theme | 'All';
  searchTerm: string;
  editingId: string | null;
  sidebarTab: 'single' | 'bulk';
}

interface QuestionFormValues {
  subject: Subject;
  theme: Theme;
  question_text: string;
  option_0: string;
  option_1: string;
  option_2: string;
  option_3: string;
  correct_index: string;
  explanation: string;
}

interface BulkImportQuestion {
  subject: Subject;
  theme: Theme;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

interface BulkImportPayload {
  questions: BulkImportQuestion[];
}

const defaultQuestionForm: QuestionFormValues = {
  subject: subjects[0],
  theme: themes[0],
  question_text: '',
  option_0: '',
  option_1: '',
  option_2: '',
  option_3: '',
  correct_index: '0',
  explanation: '',
};

function isSubject(value: unknown): value is Subject {
  return (
    typeof value === 'string' &&
    ((subjects as readonly string[]).includes(value) || value === 'Foundations of Economics')
  );
}

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (themes as readonly string[]).includes(value);
}

function normalizeBulkImportPayload(parsed: unknown): BulkImportQuestion[] {
  const rawQuestions = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as BulkImportPayload).questions)
      ? (parsed as BulkImportPayload).questions
      : null;

  if (!rawQuestions) {
    throw new Error('JSON must be an array of questions or an object with a questions array.');
  }

  return rawQuestions.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Question ${index + 1} must be an object.`);
    }

    const source = item as Record<string, unknown>;
    const subject = source.subject;
    const theme = source.theme;
    const questionText = source.question_text;
    const options = source.options;
    const correctIndex = source.correct_index;
    const explanation = source.explanation;

    if (!isSubject(subject)) {
      throw new Error(`Question ${index + 1} has an invalid subject.`);
    }

    if (!isTheme(theme)) {
      throw new Error(`Question ${index + 1} has an invalid theme.`);
    }

    if (typeof questionText !== 'string' || !questionText.trim()) {
      throw new Error(`Question ${index + 1} is missing question_text.`);
    }

    if (!Array.isArray(options) || options.length !== 4 || options.some((option) => typeof option !== 'string' || !option.trim())) {
      throw new Error(`Question ${index + 1} must include 4 non-empty options.`);
    }

    if (typeof correctIndex !== 'number' || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new Error(`Question ${index + 1} has an invalid correct_index.`);
    }

    if (typeof explanation !== 'string' || !explanation.trim()) {
      throw new Error(`Question ${index + 1} is missing explanation.`);
    }

    return {
      subject,
      theme,
      question_text: questionText.trim(),
      options: options.map((option) => option.trim()),
      correct_index: correctIndex,
      explanation: explanation.trim(),
    };
  });
}

async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}

function isAdminUserEmail(email: string | null | undefined): boolean {
  return Boolean(email);
}

function questionToForm(question: Question): QuestionFormValues {
  return {
    subject: question.subject,
    theme: question.theme,
    question_text: question.question_text,
    option_0: question.options[0] ?? '',
    option_1: question.options[1] ?? '',
    option_2: question.options[2] ?? '',
    option_3: question.options[3] ?? '',
    correct_index: String(question.correct_index),
    explanation: question.explanation,
  };
}

function fillQuestionForm(form: HTMLFormElement, values: QuestionFormValues): void {
  const subject = form.elements.namedItem('subject') as HTMLSelectElement | null;
  const theme = form.elements.namedItem('theme') as HTMLSelectElement | null;
  const questionText = form.elements.namedItem('question_text') as HTMLTextAreaElement | HTMLInputElement | null;
  const explanation = form.elements.namedItem('explanation') as HTMLTextAreaElement | HTMLInputElement | null;

  if (subject) subject.value = values.subject;
  if (theme) theme.value = values.theme;
  if (questionText) questionText.value = values.question_text;
  if (explanation) explanation.value = values.explanation;

  const correctRadios = form.elements.namedItem('correct_index');
  if (correctRadios instanceof RadioNodeList) {
    correctRadios.value = values.correct_index;
  } else if (correctRadios instanceof HTMLInputElement) {
    correctRadios.checked = correctRadios.value === values.correct_index;
  }

  (['option_0', 'option_1', 'option_2', 'option_3'] as const).forEach((field) => {
    const element = form.elements.namedItem(field) as HTMLInputElement | null;
    if (element) {
      element.value = values[field];
    }
  });
}

function showToast(
  message: string,
  type: 'success' | 'error' | 'info' = 'success',
  action?: { label: string; onClick: () => void }
): void {
  let container = document.querySelector('.admin-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'admin-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `admin-toast admin-toast-${type}`;

  const iconSvg =
    type === 'success'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      : type === 'error'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  let actionHtml = '';
  if (action) {
    actionHtml = `<button type="button" class="admin-toast-action">${escapeHtml(action.label)}</button>`;
  }

  toast.innerHTML = `
    <span class="admin-toast-icon">${iconSvg}</span>
    <span class="admin-toast-message">${escapeHtml(message)}</span>
    ${actionHtml}
    <button type="button" class="admin-toast-close" aria-label="Dismiss">&times;</button>
  `;

  const dismiss = (): void => {
    toast.classList.add('hiding');
    window.setTimeout(() => {
      toast.remove();
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 250);
  };

  const timer = window.setTimeout(dismiss, 4500);

  toast.querySelector('.admin-toast-close')?.addEventListener('click', () => {
    window.clearTimeout(timer);
    dismiss();
  });

  if (action) {
    toast.querySelector('.admin-toast-action')?.addEventListener('click', () => {
      window.clearTimeout(timer);
      dismiss();
      action.onClick();
    });
  }

  container.appendChild(toast);
}

function renderQuestionRow(question: Question, isEditing: boolean): string {
  const letters = ['A', 'B', 'C', 'D'];
  return `
    <article class="question-card-item ${isEditing ? 'editing' : ''}" data-card-id="${question.id}">
      <div class="question-meta-row">
        <div class="question-tags">
          <span class="tag-subject">${escapeHtml(question.subject)}</span>
          <span class="tag-theme">${escapeHtml(question.theme)}</span>
        </div>
        <div class="question-card-actions">
          <button class="action-btn-sm" type="button" data-action="edit-question" data-id="${question.id}">Edit</button>
          <button class="action-btn-sm danger" type="button" data-action="delete-question" data-id="${question.id}">Delete</button>
        </div>
      </div>
      <div class="question-prompt">${escapeHtml(question.question_text)}</div>
      <div class="question-options-list">
        ${question.options
          .map((option, index) => {
            const isCorrect = index === question.correct_index;
            const letter = letters[index] ?? '';
            return `
              <div class="question-option-item ${isCorrect ? 'correct' : ''}">
                <span><strong>${letter}.</strong> ${escapeHtml(option)}</span>
                ${isCorrect ? '<span class="correct-badge">Correct</span>' : ''}
              </div>
            `;
          })
          .join('')}
      </div>
      <div class="question-explanation-box">
        <strong>Explanation:</strong> ${escapeHtml(question.explanation)}
      </div>
    </article>
  `;
}

function updateFeedView(state: AdminState, root: HTMLElement): void {
  const search = state.searchTerm.trim().toLowerCase();
  const visibleQuestions = state.questions.filter((question) => {
    const subjectMatch = state.filterSubject === 'All' || question.subject === state.filterSubject;
    const themeMatch = state.filterTheme === 'All' || question.theme === state.filterTheme;
    const searchMatch =
      !search ||
      question.question_text.toLowerCase().includes(search) ||
      question.explanation.toLowerCase().includes(search) ||
      question.options.some((opt) => opt.toLowerCase().includes(search));
    return subjectMatch && themeMatch && searchMatch;
  });

  const feed = root.querySelector<HTMLElement>('#question-feed-container');
  const countDisplay = root.querySelector<HTMLElement>('#library-count-display');
  const totalCountEl = root.querySelector<HTMLElement>('#stat-total-questions');
  const visibleCountEl = root.querySelector<HTMLElement>('#stat-visible-questions');
  const activeFilterEl = root.querySelector<HTMLElement>('#stat-active-filter');

  if (feed) {
    feed.innerHTML =
      visibleQuestions.length > 0
        ? visibleQuestions.map((q) => renderQuestionRow(q, state.editingId === q.id)).join('')
        : `
          <div class="empty-state-box">
            <h3>No matching questions</h3>
            <p>Try modifying your search or filters, or add a new question using the form on the left.</p>
          </div>
        `;
  }
  if (countDisplay) {
    countDisplay.innerHTML = `Showing <strong>${visibleQuestions.length}</strong> of ${state.questions.length}`;
  }
  if (totalCountEl) {
    totalCountEl.textContent = String(state.questions.length);
  }
  if (visibleCountEl) {
    visibleCountEl.textContent = String(visibleQuestions.length);
  }
  if (activeFilterEl) {
    activeFilterEl.textContent = `${state.filterSubject} · ${state.filterTheme}`;
  }
}

export function bootAdmin(root: HTMLElement): void {
  const state: AdminState = {
    phase: 'loading',
    userEmail: null,
    error: null,
    busy: false,
    questions: [],
    filterSubject: 'All',
    filterTheme: 'All',
    searchTerm: '',
    editingId: null,
    sidebarTab: 'single',
  };

  const render = (): void => {
    clearNode(root);

    if (state.phase === 'loading') {
      root.innerHTML = `
        <section class="admin-shell centered-shell">
          <div class="spinner" aria-hidden="true"></div>
          <p class="subtle">Loading admin access...</p>
        </section>
      `;
      return;
    }

    if (state.phase === 'login') {
      root.innerHTML = `
        <section class="admin-shell login-shell">
          <article class="panel admin-login-panel">
            <div class="eyebrow">Private access</div>
            <h1>Admin sign-in</h1>
            <p class="subtle">Only pre-created Supabase accounts can log in. Public visitors stay on this form.</p>
            <form id="admin-login" class="admin-form">
              <label>
                <span>Email</span>
                <input name="email" type="email" autocomplete="email" required />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" autocomplete="current-password" required />
              </label>
              <button class="button primary" type="submit">Sign in</button>
              ${state.error ? `<p class="feedback bad"><strong>Error</strong><span>${escapeHtml(state.error)}</span></p>` : ''}
            </form>
          </article>
        </section>
      `;
      return;
    }

    const search = state.searchTerm.trim().toLowerCase();
    const visibleQuestions = state.questions.filter((question) => {
      const subjectMatch = state.filterSubject === 'All' || question.subject === state.filterSubject;
      const themeMatch = state.filterTheme === 'All' || question.theme === state.filterTheme;
      const searchMatch =
        !search ||
        question.question_text.toLowerCase().includes(search) ||
        question.explanation.toLowerCase().includes(search) ||
        question.options.some((opt) => opt.toLowerCase().includes(search));
      return subjectMatch && themeMatch && searchMatch;
    });
    const totalQuestions = state.questions.length;
    const visibleCount = visibleQuestions.length;

    root.innerHTML = `
      <section class="admin-shell">
        <header class="admin-header">
          <div class="admin-brand">
            <div class="admin-badge-icon" aria-hidden="true">C</div>
            <div>
              <h1>CIFS Admin Console <span class="admin-pill-tag">Operate</span></h1>
              <p>Manage curriculum questions, verify options, and bulk import syllabus content.</p>
            </div>
          </div>
          <div class="admin-session">
            <span class="admin-user-pill">${escapeHtml(state.userEmail ?? '')}</span>
            <button class="button ghost" type="button" data-action="sign-out">Sign out</button>
          </div>
        </header>

        <section class="admin-stats">
          <article class="admin-stat-card">
            <div class="stat-content">
              <span class="stat-label">Total Questions</span>
              <span class="stat-value" id="stat-total-questions">${totalQuestions}</span>
            </div>
            <div class="stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
            </div>
          </article>
          <article class="admin-stat-card">
            <div class="stat-content">
              <span class="stat-label">Visible Questions</span>
              <span class="stat-value" id="stat-visible-questions">${visibleCount}</span>
            </div>
            <div class="stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
          </article>
          <article class="admin-stat-card">
            <div class="stat-content">
              <span class="stat-label">Active Filter</span>
              <span class="stat-filter-value" id="stat-active-filter">${escapeHtml(state.filterSubject)} · ${escapeHtml(state.filterTheme)}</span>
            </div>
            <div class="stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            </div>
          </article>
        </section>

        <section class="admin-workspace">
          <!-- Left Column: Question Creator (Single Question / Bulk Import) -->
          <aside class="admin-sidebar">
            <article class="admin-panel sidebar-creator-panel">
              <nav class="sidebar-tab-switcher" role="tablist" aria-label="Question creation mode">
                <button
                  type="button"
                  class="sidebar-tab-btn ${state.sidebarTab === 'single' ? 'active' : ''}"
                  role="tab"
                  aria-selected="${state.sidebarTab === 'single'}"
                  data-action="switch-sidebar-tab"
                  data-tab="single"
                  id="tab-single-btn"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  <span>Single Question</span>
                </button>
                <button
                  type="button"
                  class="sidebar-tab-btn ${state.sidebarTab === 'bulk' ? 'active' : ''}"
                  role="tab"
                  aria-selected="${state.sidebarTab === 'bulk'}"
                  data-action="switch-sidebar-tab"
                  data-tab="bulk"
                  id="tab-bulk-btn"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span>Bulk Import</span>
                </button>
              </nav>

              <!-- Single Question Tab -->
              <div id="sidebar-tab-single" class="sidebar-tab-panel ${state.sidebarTab === 'single' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-single-btn">
                <form id="question-form" class="admin-form" data-mode="${state.editingId ? 'edit' : 'add'}">
                  <div class="panel-form-scrollable">
                    <div class="admin-panel-head">
                      <div>
                        <h2 id="form-title">${state.editingId ? 'Edit Question <span class="edit-mode-badge">Editing</span>' : 'Add Question'}</h2>
                        <p id="form-subtitle">${state.editingId ? 'Updating existing syllabus item' : 'Create a single question manually with options'}</p>
                      </div>
                    </div>

                    <div class="admin-panel-fields">
                      <div class="form-grid-2">
                        <label>
                          <span>Subject</span>
                          <select name="subject" required>
                            ${subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('')}
                          </select>
                        </label>
                        <label>
                          <span>Theme</span>
                          <select name="theme" required>
                            ${themes.map((theme) => `<option value="${theme}">${theme}</option>`).join('')}
                          </select>
                        </label>
                      </div>

                      <label>
                        <span>Question Prompt</span>
                        <textarea name="question_text" rows="2" placeholder="Enter clear, concise question..." required></textarea>
                      </label>

                      <div class="field-group">
                        <div class="field-group-title">Options &amp; Correct Answer</div>
                        <div class="field-hint">Type the 4 options and mark the radio button of the correct answer.</div>
                        <div class="options-composer">
                          <div class="option-composer-item">
                            <span class="option-letter">A</span>
                            <input name="option_0" type="text" placeholder="Option A" required />
                            <label class="option-radio-wrap" title="Mark Option A as correct">
                              <input type="radio" name="correct_index" value="0" checked />
                            </label>
                          </div>
                          <div class="option-composer-item">
                            <span class="option-letter">B</span>
                            <input name="option_1" type="text" placeholder="Option B" required />
                            <label class="option-radio-wrap" title="Mark Option B as correct">
                              <input type="radio" name="correct_index" value="1" />
                            </label>
                          </div>
                          <div class="option-composer-item">
                            <span class="option-letter">C</span>
                            <input name="option_2" type="text" placeholder="Option C" required />
                            <label class="option-radio-wrap" title="Mark Option C as correct">
                              <input type="radio" name="correct_index" value="2" />
                            </label>
                          </div>
                          <div class="option-composer-item">
                            <span class="option-letter">D</span>
                            <input name="option_3" type="text" placeholder="Option D" required />
                            <label class="option-radio-wrap" title="Mark Option D as correct">
                              <input type="radio" name="correct_index" value="3" />
                            </label>
                          </div>
                        </div>
                      </div>

                      <label>
                        <span>Explanation</span>
                        <textarea name="explanation" rows="2" placeholder="Explain why this answer is correct..." required></textarea>
                      </label>

                      ${state.error ? `<p class="feedback bad"><strong>Error</strong><span>${escapeHtml(state.error)}</span></p>` : ''}
                    </div>
                  </div>

                  <div class="form-actions sticky-actions">
                    <button class="button primary" type="submit" id="btn-submit-question">${state.editingId ? 'Save changes' : 'Add question'}</button>
                    <button class="button ghost" type="button" id="btn-cancel-edit" data-action="cancel-edit" style="${state.editingId ? '' : 'display: none;'}">Cancel</button>
                  </div>
                </form>
              </div>

              <!-- Bulk Import Tab -->
              <div id="sidebar-tab-bulk" class="sidebar-tab-panel ${state.sidebarTab === 'bulk' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-bulk-btn">
                <div class="bulk-import-container">
                  <div class="admin-panel-head">
                    <div>
                      <h2 class="bulk-import-title">Bulk JSON Import</h2>
                      <p class="bulk-import-sub">Import multiple syllabus questions in one go via JSON.</p>
                    </div>
                    <button class="bulk-template-btn" type="button" data-action="bulk-import-template">
                      Download template
                    </button>
                  </div>
                  <div class="bulk-panel-body">
                    <div class="bulk-info-banner">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <span>Upload a JSON file containing a <code>questions</code> array or list of question objects with 4 options each.</span>
                    </div>

                    <label class="bulk-dropzone" title="Click to select a JSON file">
                      <input id="bulk-import-file" class="bulk-import-input" type="file" accept="application/json,.json" />
                      <svg class="bulk-upload-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <div class="bulk-dropzone-text">
                        <span class="bulk-dropzone-primary">Click to select JSON file</span>
                        <span class="bulk-dropzone-secondary">Standard questions array format (.json)</span>
                      </div>
                    </label>

                    <div class="bulk-hint-row">
                      <span>Need to add just one question?</span>
                      <button type="button" class="bulk-switch-link" data-action="switch-sidebar-tab" data-tab="single">
                        Add single question manually &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </aside>

          <!-- Right Column: Library Feed -->
          <main class="admin-main">
            <div class="library-toolbar">
              <div class="library-filters">
                <div class="search-input-wrap">
                  <input id="filter-search" type="search" placeholder="Search questions, options, explanation..." value="${escapeHtml(state.searchTerm)}" />
                </div>
                <select id="filter-subject" class="toolbar-select" aria-label="Filter by subject">
                  <option value="All">All subjects</option>
                  ${subjects.map((subject) => `<option value="${escapeHtml(subject)}" ${state.filterSubject === subject ? 'selected' : ''}>${escapeHtml(subject)}</option>`).join('')}
                </select>
                <select id="filter-theme" class="toolbar-select" aria-label="Filter by theme">
                  <option value="All">All themes</option>
                  ${themes.map((theme) => `<option value="${theme}" ${state.filterTheme === theme ? 'selected' : ''}>${theme}</option>`).join('')}
                </select>
              </div>
              <div class="library-count" id="library-count-display">
                Showing <strong>${visibleCount}</strong> of ${totalQuestions}
              </div>
            </div>

            <div class="question-feed" id="question-feed-container">
              ${visibleQuestions.length > 0
                ? visibleQuestions.map((question) => renderQuestionRow(question, state.editingId === question.id)).join('')
                : `
                  <div class="empty-state-box">
                    <h3>No matching questions</h3>
                    <p>Try modifying your search or filters, or add a new question using the form on the left.</p>
                  </div>
                `}
            </div>
          </main>
        </section>
      </section>
    `;

    if (state.editingId) {
      const active = state.questions.find((question) => question.id === state.editingId);
      if (active) {
        const form = root.querySelector<HTMLFormElement>('#question-form');
        if (form) {
          fillQuestionForm(form, questionToForm(active));
        }
      }
    }
  };

  const loadQuestions = async (): Promise<void> => {
    const { data, error } = await supabase
      .from('questions')
      .select('id, subject, theme, question_text, options, correct_index, explanation, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    state.questions = (data ?? []) as Question[];
  };

  const refresh = async (): Promise<void> => {
    state.busy = true;
    render();
    try {
      await loadQuestions();
      state.busy = false;
      state.error = null;
      render();
    } catch (error) {
      state.busy = false;
      state.error = error instanceof Error ? error.message : 'Failed to load questions.';
      render();
    }
  };

  const syncSession = async (): Promise<void> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session || !isAdminUserEmail(session.user.email)) {
      state.phase = 'login';
      state.userEmail = null;
      state.error = null;
      render();
      return;
    }

    state.phase = 'dashboard';
    state.userEmail = session.user.email ?? null;
    await refresh();
  };

  void syncSession();

  root.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement | null;
    if (!form) {
      return;
    }

    if (form.id === 'admin-login') {
      event.preventDefault();
      const data = new FormData(form);
      const email = String(data.get('email') ?? '');
      const password = String(data.get('password') ?? '');

      form.classList.add('is-submitting');
      const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>Signing in...`;
      }
      const existingError = form.querySelector('.feedback.bad');
      if (existingError) {
        existingError.remove();
      }

      void supabase.auth
        .signInWithPassword({ email, password })
        .then(({ data, error }) => {
          if (error) {
            form.classList.remove('is-submitting');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Sign in';
            }
            state.phase = 'login';
            state.error = error.message;
            const errP = document.createElement('p');
            errP.className = 'feedback bad';
            errP.innerHTML = `<strong>Error</strong><span>${escapeHtml(error.message)}</span>`;
            form.appendChild(errP);
            return;
          }

          state.phase = 'dashboard';
          state.userEmail = data.user?.email ?? email;
          state.error = null;
          void refresh();
        })
        .catch((error: unknown) => {
          form.classList.remove('is-submitting');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign in';
          }
          const msg = error instanceof Error ? error.message : 'Sign in failed.';
          state.error = msg;
          const errP = document.createElement('p');
          errP.className = 'feedback bad';
          errP.innerHTML = `<strong>Error</strong><span>${escapeHtml(msg)}</span>`;
          form.appendChild(errP);
        });
      return;
    }

    if (form.id === 'question-form') {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        subject: String(data.get('subject') ?? '') as Subject,
        theme: String(data.get('theme') ?? '') as Theme,
        question_text: String(data.get('question_text') ?? '').trim(),
        options: [
          String(data.get('option_0') ?? '').trim(),
          String(data.get('option_1') ?? '').trim(),
          String(data.get('option_2') ?? '').trim(),
          String(data.get('option_3') ?? '').trim(),
        ],
        correct_index: Number(data.get('correct_index') ?? 0),
        explanation: String(data.get('explanation') ?? '').trim(),
      };

      if (payload.options.some((option) => !option) || !payload.question_text || !payload.explanation) {
        showToast('Please fill out every field before saving.', 'error');
        return;
      }

      form.classList.add('is-submitting');
      const submitBtn = form.querySelector<HTMLButtonElement>('#btn-submit-question');
      const originalText = submitBtn ? submitBtn.textContent || '' : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>Saving...`;
      }

      const editingId = state.editingId;

      if (editingId) {
        const targetIndex = state.questions.findIndex((q) => q.id === editingId);
        const previousQuestion = targetIndex !== -1 ? state.questions[targetIndex] : undefined;

        if (targetIndex !== -1 && previousQuestion) {
          state.questions[targetIndex] = {
            ...previousQuestion,
            ...payload,
          };
        }

        state.editingId = null;
        form.reset();
        fillQuestionForm(form, defaultQuestionForm);
        form.classList.remove('is-submitting');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add question';
        }
        const cancelBtn = root.querySelector<HTMLElement>('#btn-cancel-edit');
        if (cancelBtn) cancelBtn.style.display = 'none';
        const formTitle = root.querySelector<HTMLElement>('#form-title');
        if (formTitle) formTitle.textContent = 'Add Question';
        const formSubtitle = root.querySelector<HTMLElement>('#form-subtitle');
        if (formSubtitle) formSubtitle.textContent = 'Create a single question manually with options';
        const scrollable = form.querySelector<HTMLElement>('.panel-form-scrollable');
        if (scrollable) scrollable.scrollTop = 0;

        updateFeedView(state, root);
        const updatedCard = root.querySelector<HTMLElement>(`[data-card-id="${editingId}"]`);
        if (updatedCard) {
          updatedCard.classList.add('just-updated');
        }

        showToast('Question updated successfully!', 'success');

        void supabase
          .from('questions')
          .update({
            subject: payload.subject,
            theme: payload.theme,
            question_text: payload.question_text,
            options: payload.options,
            correct_index: payload.correct_index,
            explanation: payload.explanation,
          })
          .eq('id', editingId)
          .then(({ error }) => {
            if (error) {
              if (previousQuestion && targetIndex !== -1) {
                state.questions[targetIndex] = previousQuestion;
                updateFeedView(state, root);
              }
              showToast(`Update failed: ${error.message}`, 'error');
            }
          });
      } else {
        void (async () => {
          try {
            const { data, error } = await supabase
              .from('questions')
              .insert({
                subject: payload.subject,
                theme: payload.theme,
                question_text: payload.question_text,
                options: payload.options,
                correct_index: payload.correct_index,
                explanation: payload.explanation,
              })
              .select();

            form.classList.remove('is-submitting');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText || 'Add question';
            }

            if (error) {
              showToast(`Failed to add question: ${error.message}`, 'error');
              return;
            }

            const created = (data && data[0]) as Question | undefined;
            if (created) {
              state.questions.unshift(created);
            } else {
              state.questions.unshift({
                id: 'temp-' + Date.now(),
                ...payload,
                created_at: new Date().toISOString(),
              });
            }

            form.reset();
            fillQuestionForm(form, defaultQuestionForm);
            const scrollable = form.querySelector<HTMLElement>('.panel-form-scrollable');
            if (scrollable) scrollable.scrollTop = 0;
            updateFeedView(state, root);
            const firstCard = root.querySelector<HTMLElement>('.question-card-item');
            if (firstCard) {
              firstCard.classList.add('just-added');
            }
            showToast('New question created successfully!', 'success');
          } catch (error: unknown) {
            form.classList.remove('is-submitting');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText || 'Add question';
            }
            showToast(error instanceof Error ? error.message : 'Failed to add question.', 'error');
          }
        })();
      }
      return;
    }
  });

  root.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement | null;
    if (input && input.id === 'bulk-import-file' && input.files?.length) {
      const file = input.files[0];
      const dropzone = root.querySelector<HTMLElement>('.bulk-dropzone');
      dropzone?.classList.add('is-importing');
      showToast('Reading and importing JSON...', 'info');

      void readJsonFile(file)
        .then(async (parsed) => {
          const questions = normalizeBulkImportPayload(parsed);
          if (!questions.length) {
            throw new Error('The JSON file does not contain any questions.');
          }

          const { error } = await supabase.from('questions').insert(questions);
          if (error) {
            throw error;
          }

          await loadQuestions();
          updateFeedView(state, root);
          dropzone?.classList.remove('is-importing');
          input.value = '';
          showToast(`Successfully imported ${questions.length} questions!`, 'success');
        })
        .catch((error: unknown) => {
          dropzone?.classList.remove('is-importing');
          input.value = '';
          showToast(error instanceof Error ? error.message : 'Bulk import failed.', 'error');
        });
      return;
    }

    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }

    if (select.id === 'filter-subject') {
      state.filterSubject = select.value as AdminState['filterSubject'];
      updateFeedView(state, root);
      return;
    }

    if (select.id === 'filter-theme') {
      state.filterTheme = select.value as AdminState['filterTheme'];
      updateFeedView(state, root);
    }
  });

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const action = target.closest<HTMLElement>('[data-action]');
    if (!action) {
      return;
    }

    if (action.dataset.action === 'switch-sidebar-tab') {
      const targetTab = action.dataset.tab as 'single' | 'bulk' | undefined;
      if (!targetTab) {
        return;
      }

      state.sidebarTab = targetTab;
      root.querySelectorAll<HTMLElement>('.sidebar-tab-btn').forEach((btn) => {
        const isTarget = btn.dataset.tab === targetTab;
        btn.classList.toggle('active', isTarget);
        btn.setAttribute('aria-selected', String(isTarget));
      });

      const singlePanel = root.querySelector<HTMLElement>('#sidebar-tab-single');
      const bulkPanel = root.querySelector<HTMLElement>('#sidebar-tab-bulk');
      if (singlePanel) singlePanel.classList.toggle('active', targetTab === 'single');
      if (bulkPanel) bulkPanel.classList.toggle('active', targetTab === 'bulk');
      return;
    }

    if (action.dataset.action === 'bulk-import-template') {
      const sample = `{
  "questions": [
    {
      "subject": "Quantitative Methods",
      "theme": "Theme 1",
      "question_text": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "correct_index": 1,
      "explanation": "2 + 2 equals 4."
    },
    {
      "subject": "Academic Communication Skills",
      "theme": "Theme 2",
      "question_text": "Which sentence is formal?",
      "options": ["Hey, what up?", "Please find the report attached.", "Gonna send it later.", "See ya."],
      "correct_index": 1,
      "explanation": "Formal communication uses polite and professional wording."
    },
    {
      "subject": "Professional Skills & Employability",
      "theme": "Theme 3",
      "question_text": "Which is a strong teamwork skill?",
      "options": ["Interrupting others", "Ignoring deadlines", "Active listening", "Avoiding responsibility"],
      "correct_index": 2,
      "explanation": "Active listening helps teams understand each other clearly."
    },
    {
      "subject": "Critical Thinking & Citizenship",
      "theme": "Theme 4",
      "question_text": "What is the best first step when evaluating a claim?",
      "options": ["Accept it immediately", "Check the evidence", "Ignore it", "Repeat it"],
      "correct_index": 1,
      "explanation": "Critical thinking starts by checking the evidence behind the claim."
    },
    {
      "subject": "Introduction to Business and Economics",
      "theme": "Theme 5",
      "question_text": "What does supply usually describe?",
      "options": ["How much consumers want", "How much producers offer", "Only the price", "Only the market size"],
      "correct_index": 1,
      "explanation": "Supply refers to the amount producers are willing to offer at a given price."
    },
    {
      "subject": "Math for Eco",
      "theme": "Theme 1",
      "question_text": "What is the derivative of f(x) = x^2 with respect to x?",
      "options": ["x", "2x", "x^2", "2"],
      "correct_index": 1,
      "explanation": "Using the power rule, the derivative of x^2 is 2x."
    },
    {
      "subject": "Exploring Economics",
      "theme": "Theme 1",
      "question_text": "What does GDP stand for in macroeconomics?",
      "options": ["Gross Domestic Product", "General Demand Process", "Global Development Plan", "Gross Deposit Profit"],
      "correct_index": 0,
      "explanation": "GDP stands for Gross Domestic Product."
    },
    {
      "subject": "Contemporary Issues in Global Economy",
      "theme": "Theme 1",
      "question_text": "What is globalization primarily characterized by?",
      "options": ["Isolationist policies", "Increased international integration and trade", "Fixed currency standards only", "Reduction in digital communication"],
      "correct_index": 1,
      "explanation": "Globalization involves increased international flow of trade, capital, information, and people."
    }
  ]
}`;
      const blob = new Blob([sample], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sample-questions.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return;
    }

    if (action.dataset.action === 'sign-out') {
      const btn = action as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = 'Signing out...';
      void supabase.auth.signOut().then(() => {
        state.phase = 'login';
        state.userEmail = null;
        state.editingId = null;
        state.sidebarTab = 'single';
        state.error = null;
        render();
      });
      return;
    }

    if (action.dataset.action === 'delete-question') {
      const id = action.dataset.id;
      if (!id) {
        return;
      }

      const questionIndex = state.questions.findIndex((q) => q.id === id);
      if (questionIndex === -1) {
        return;
      }
      const deletedQuestion = state.questions[questionIndex];

      const card = root.querySelector<HTMLElement>(`[data-card-id="${id}"]`) || action.closest<HTMLElement>('.question-card-item');
      if (card) {
        card.classList.add('is-deleting');
      }

      state.questions.splice(questionIndex, 1);

      if (state.editingId === id) {
        state.editingId = null;
        const form = root.querySelector<HTMLFormElement>('#question-form');
        if (form) {
          form.reset();
          fillQuestionForm(form, defaultQuestionForm);
        }
        const formTitle = root.querySelector<HTMLElement>('#form-title');
        if (formTitle) formTitle.textContent = 'Add Question';
        const formSubtitle = root.querySelector<HTMLElement>('#form-subtitle');
        if (formSubtitle) formSubtitle.textContent = 'Create a single question with options';
        const submitBtn = form?.querySelector<HTMLButtonElement>('#btn-submit-question');
        if (submitBtn) submitBtn.textContent = 'Add question';
        const cancelBtn = root.querySelector<HTMLElement>('#btn-cancel-edit');
        if (cancelBtn) cancelBtn.style.display = 'none';
      }

      const countDisplay = root.querySelector<HTMLElement>('#library-count-display');
      const totalCountEl = root.querySelector<HTMLElement>('#stat-total-questions');
      const visibleCountEl = root.querySelector<HTMLElement>('#stat-visible-questions');
      const visibleCount = state.questions.filter((q) => {
        const sub = state.filterSubject === 'All' || q.subject === state.filterSubject;
        const th = state.filterTheme === 'All' || q.theme === state.filterTheme;
        return sub && th;
      }).length;
      if (countDisplay) countDisplay.innerHTML = `Showing <strong>${visibleCount}</strong> of ${state.questions.length}`;
      if (totalCountEl) totalCountEl.textContent = String(state.questions.length);
      if (visibleCountEl) visibleCountEl.textContent = String(visibleCount);

      let isUndone = false;
      showToast('Question removed from bank', 'info', {
        label: 'Undo',
        onClick: () => {
          isUndone = true;
          state.questions.splice(questionIndex, 0, deletedQuestion);
          updateFeedView(state, root);
          const restored = root.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
          if (restored) restored.classList.add('just-restored');
          showToast('Question restored', 'success');
        },
      });

      void supabase
        .from('questions')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error && !isUndone) {
            state.questions.splice(questionIndex, 0, deletedQuestion);
            updateFeedView(state, root);
            showToast(`Delete failed: ${error.message}`, 'error');
          }
        });
      return;
    }

    if (action.dataset.action === 'edit-question') {
      const id = action.dataset.id;
      if (!id) {
        return;
      }

      const question = state.questions.find((item) => item.id === id);
      if (!question) {
        return;
      }

      state.editingId = id;
      state.sidebarTab = 'single';

      root.querySelectorAll<HTMLElement>('.sidebar-tab-btn').forEach((btn) => {
        const isTarget = btn.dataset.tab === 'single';
        btn.classList.toggle('active', isTarget);
        btn.setAttribute('aria-selected', String(isTarget));
      });

      const singlePanel = root.querySelector<HTMLElement>('#sidebar-tab-single');
      const bulkPanel = root.querySelector<HTMLElement>('#sidebar-tab-bulk');
      if (singlePanel) singlePanel.classList.add('active');
      if (bulkPanel) bulkPanel.classList.remove('active');

      root.querySelectorAll('.question-card-item').forEach((item) => item.classList.remove('editing'));
      const card = root.querySelector<HTMLElement>(`[data-card-id="${id}"]`) || action.closest<HTMLElement>('.question-card-item');
      if (card) {
        card.classList.add('editing');
      }

      const form = root.querySelector<HTMLFormElement>('#question-form');
      const formPanel = form?.closest<HTMLElement>('.admin-panel');
      const formTitle = root.querySelector<HTMLElement>('#form-title');
      const formSubtitle = root.querySelector<HTMLElement>('#form-subtitle');
      const submitBtn = form?.querySelector<HTMLButtonElement>('#btn-submit-question');
      const cancelBtn = root.querySelector<HTMLElement>('#btn-cancel-edit');

      if (form) {
        fillQuestionForm(form, questionToForm(question));
        const scrollable = form.querySelector<HTMLElement>('.panel-form-scrollable');
        if (scrollable) {
          scrollable.scrollTop = 0;
        }
      }
      if (formTitle) {
        formTitle.innerHTML = `Edit Question <span class="edit-mode-badge">Editing</span>`;
      }
      if (formSubtitle) {
        formSubtitle.textContent = 'Updating existing syllabus item';
      }
      if (submitBtn) {
        submitBtn.textContent = 'Save changes';
      }
      if (cancelBtn) {
        cancelBtn.style.display = 'inline-flex';
      }
      if (formPanel) {
        formPanel.classList.remove('editing-focus');
        void formPanel.offsetWidth;
        formPanel.classList.add('editing-focus');
        formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      form?.querySelector<HTMLTextAreaElement>('textarea[name="question_text"]')?.focus();
      return;
    }

    if (action.dataset.action === 'cancel-edit') {
      state.editingId = null;

      root.querySelectorAll('.question-card-item').forEach((item) => item.classList.remove('editing'));

      const form = root.querySelector<HTMLFormElement>('#question-form');
      const formTitle = root.querySelector<HTMLElement>('#form-title');
      const formSubtitle = root.querySelector<HTMLElement>('#form-subtitle');
      const submitBtn = form?.querySelector<HTMLButtonElement>('#btn-submit-question');
      const cancelBtn = root.querySelector<HTMLElement>('#btn-cancel-edit');

      if (form) {
        form.reset();
        fillQuestionForm(form, defaultQuestionForm);
        const scrollable = form.querySelector<HTMLElement>('.panel-form-scrollable');
        if (scrollable) {
          scrollable.scrollTop = 0;
        }
      }
      if (formTitle) {
        formTitle.textContent = 'Add Question';
      }
      if (formSubtitle) {
        formSubtitle.textContent = 'Create a single question manually with options';
      }
      if (submitBtn) {
        submitBtn.textContent = 'Add question';
      }
      if (cancelBtn) {
        cancelBtn.style.display = 'none';
      }
      return;
    }
  });

  root.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.id !== 'filter-search') {
      return;
    }

    state.searchTerm = input.value;
    updateFeedView(state, root);
  });

  root.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.closest('#question-form')) {
        event.preventDefault();
        const form = root.querySelector<HTMLFormElement>('#question-form');
        if (form) {
          form.requestSubmit();
        }
      }
    }
  });
}
