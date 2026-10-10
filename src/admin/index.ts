import { supabase } from '../supabase';
import { clearNode, escapeHtml } from '../dom';
import { renderMathText } from '../math';
import {
  getCustomThemeTitle,
  getMockExam,
  getMockExams,
  getQuizThemeTitle,
  getSubjectOutline,
  getSubjectThemes,
  resolveTheme,
  subjects,
  themes,
} from '../constants';
import { initThemeTitles, loadThemeTitlesForAdmin, setAllCustomThemeTitles } from '../themeTitles';
import { deleteMockExam, initMockExams, loadMockExams, saveMockExam } from '../mockExams';
import {
  describeCoverage,
  MOCK_EXAM_DEFAULT_QUESTIONS,
  MOCK_EXAM_MAX_QUESTIONS,
  MOCK_EXAM_MIN_QUESTIONS,
  MOCK_EXAM_TITLE_MAX,
  normalizeMockExamInput,
} from '../mockExam';
import type { MockExam, Question, Subject, Theme } from '../types';
import 'katex/dist/katex.min.css';
import '../admin.css';

type AdminPhase = 'loading' | 'login' | 'dashboard';

export type AnalyticsTimeRange = 'all' | '7d' | 'today';

export interface AnalyticsEvent {
  id: string;
  event_type: 'page_visit' | 'quiz_start' | 'quiz_complete';
  session_id: string;
  subject?: Subject | null;
  theme?: Theme | null;
  score?: number | null;
  total_questions?: number | null;
  time_taken_seconds?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AnalyticsKpis {
  totalVisitors: number;
  totalVisits: number;
  quizzesStarted: number;
  quizzesCompleted: number;
  completionRate: number;
  avgScore: number | null;
  avgTimeSeconds: number | null;
}

export interface FunnelStage {
  stage: string;
  count: number;
  rate: number;
  dropOff: number;
}

export interface SubjectBreakdownItem {
  subject: string;
  starts: number;
  completions: number;
  completionRate: number;
  themes: {
    theme: string;
    starts: number;
    completions: number;
    completionRate: number;
  }[];
}

interface MockDraft {
  title: string;
  after_theme: number;
  source_themes: Theme[];
  question_count: number;
}

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
  themeManagerOpen: boolean;
  themeManagerSubject: Subject;
  mockManagerOpen: boolean;
  mockManagerSubject: Subject;
  mockEditingId: string | null;
  mockDraft: MockDraft;
  mockSaving: boolean;
  analyticsEvents: AnalyticsEvent[];
  analyticsLoading: boolean;
  analyticsError: string | null;
  analyticsTimeRange: AnalyticsTimeRange;
  showSubjectBreakdown: boolean;
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

function renderThemeSelectOptions(subject: Subject, selectedTheme?: string): string {
  const options = getSubjectThemes(subject);
  return options
    .map((item) => {
      const isSelected = selectedTheme === item.theme;
      const label = item.title !== item.theme ? `${item.theme}: ${item.title}` : item.theme;
      return `<option value="${item.theme}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function getFilterThemeOptions(filterSubject: Subject | 'All', selectedTheme: Theme | 'All'): string {
  if (filterSubject === 'All') {
    return themes
      .map((theme) => `<option value="${theme}" ${selectedTheme === theme ? 'selected' : ''}>${theme}</option>`)
      .join('');
  }
  const subjectThemes = getSubjectThemes(filterSubject);
  return subjectThemes
    .map((item) => {
      const isSelected = selectedTheme === item.theme;
      const label = item.title !== item.theme ? `${item.theme}: ${item.title}` : item.theme;
      return `<option value="${item.theme}" ${selectedTheme === item.theme ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function getThemeBadgeLabel(subject: Subject, theme: Theme): string {
  const title = getQuizThemeTitle(subject, theme);
  return title !== theme ? `${theme}: ${title}` : theme;
}

export function computeAnalyticsKpis(events: AnalyticsEvent[]): AnalyticsKpis {
  const pageVisits = events.filter((e) => e.event_type === 'page_visit');
  const quizStarts = events.filter((e) => e.event_type === 'quiz_start');
  const quizCompletes = events.filter((e) => e.event_type === 'quiz_complete');

  const totalVisitors = new Set(pageVisits.map((e) => e.session_id)).size;
  const totalVisits = pageVisits.length;
  const quizzesStarted = quizStarts.length;
  const quizzesCompleted = quizCompletes.length;

  const completionRate = quizzesStarted > 0 ? (quizzesCompleted / quizzesStarted) * 100 : 0;

  let avgScore: number | null = null;
  let avgTimeSeconds: number | null = null;

  if (quizCompletes.length > 0) {
    const scored = quizCompletes.filter((e) => typeof e.score === 'number' && e.score !== null);
    if (scored.length > 0) {
      const sumScore = scored.reduce((sum, e) => sum + (e.score ?? 0), 0);
      avgScore = Number((sumScore / scored.length).toFixed(1));
    }
    const timed = quizCompletes.filter((e) => typeof e.time_taken_seconds === 'number' && e.time_taken_seconds !== null);
    if (timed.length > 0) {
      const sumTime = timed.reduce((sum, e) => sum + (e.time_taken_seconds ?? 0), 0);
      avgTimeSeconds = Math.round(sumTime / timed.length);
    }
  }

  return {
    totalVisitors,
    totalVisits,
    quizzesStarted,
    quizzesCompleted,
    completionRate: Number(completionRate.toFixed(1)),
    avgScore,
    avgTimeSeconds,
  };
}

export function computeAnalyticsFunnel(events: AnalyticsEvent[], kpis: AnalyticsKpis): FunnelStage[] {
  const visitors = kpis.totalVisitors;
  const starts = kpis.quizzesStarted;
  const completions = kpis.quizzesCompleted;

  const stage1: FunnelStage = {
    stage: 'Entered Webpage',
    count: visitors,
    rate: 100,
    dropOff: 0,
  };

  const startRate = visitors > 0 ? (starts / visitors) * 100 : 0;
  const startDropOff = visitors > 0 ? Math.max(0, 100 - startRate) : 0;
  const stage2: FunnelStage = {
    stage: 'Started Quiz',
    count: starts,
    rate: Number(startRate.toFixed(1)),
    dropOff: Number(startDropOff.toFixed(1)),
  };

  const completionRate = starts > 0 ? (completions / starts) * 100 : 0;
  const completionDropOff = starts > 0 ? Math.max(0, 100 - completionRate) : 0;
  const stage3: FunnelStage = {
    stage: 'Ended Quiz',
    count: completions,
    rate: Number(completionRate.toFixed(1)),
    dropOff: Number(completionDropOff.toFixed(1)),
  };

  return [stage1, stage2, stage3];
}

export function computeSubjectBreakdown(events: AnalyticsEvent[]): SubjectBreakdownItem[] {
  const subjectMap = new Map<string, {
    subject: string;
    starts: number;
    completions: number;
    themes: Map<string, { theme: string; starts: number; completions: number }>;
  }>();

  for (const event of events) {
    if (!event.subject) continue;
    const sub = event.subject;

    if (!subjectMap.has(sub)) {
      subjectMap.set(sub, {
        subject: sub,
        starts: 0,
        completions: 0,
        themes: new Map(),
      });
    }

    const item = subjectMap.get(sub)!;
    // Mock exams have no theme of their own, so they get a row per exam title.
    const mockTitle =
      typeof event.metadata?.mock_exam_title === 'string' ? event.metadata.mock_exam_title.trim() : '';
    const themeKey = mockTitle ? `Mock Exam: ${mockTitle}` : event.theme || 'Theme 1';

    if (!item.themes.has(themeKey)) {
      item.themes.set(themeKey, { theme: themeKey, starts: 0, completions: 0 });
    }
    const themeItem = item.themes.get(themeKey)!;

    if (event.event_type === 'quiz_start') {
      item.starts++;
      themeItem.starts++;
    } else if (event.event_type === 'quiz_complete') {
      item.completions++;
      themeItem.completions++;
    }
  }

  const breakdown: SubjectBreakdownItem[] = Array.from(subjectMap.values()).map((sub) => {
    const compRate = sub.starts > 0 ? (sub.completions / sub.starts) * 100 : 0;
    const themesArray = Array.from(sub.themes.values()).map((t) => ({
      theme: t.theme,
      starts: t.starts,
      completions: t.completions,
      completionRate: t.starts > 0 ? Number(((t.completions / t.starts) * 100).toFixed(1)) : 0,
    }));
    themesArray.sort((a, b) => b.starts - a.starts);

    return {
      subject: sub.subject,
      starts: sub.starts,
      completions: sub.completions,
      completionRate: Number(compRate.toFixed(1)),
      themes: themesArray,
    };
  });

  breakdown.sort((a, b) => b.starts - a.starts);
  return breakdown;
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

    const resolvedTheme = typeof theme === 'string' ? resolveTheme(subject, theme) : null;
    if (!resolvedTheme || !isTheme(resolvedTheme)) {
      throw new Error(`Question ${index + 1} has an invalid theme: "${String(theme)}".`);
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
      theme: resolvedTheme,
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

const DEFAULT_ADMIN_EMAILS: readonly string[] = ['ulugbekisoqov22@gmail.com'];

export function isAuthorizedAdmin(
  user: { email?: string | null; app_metadata?: Record<string, unknown> } | null | undefined,
): boolean {
  if (!user) return false;
  const appMeta = user.app_metadata;
  if (appMeta && (appMeta.role === 'admin' || appMeta.is_admin === true)) {
    return true;
  }
  const email = user.email?.toLowerCase().trim();
  return Boolean(email && DEFAULT_ADMIN_EMAILS.includes(email));
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

  if (subject) {
    subject.value = values.subject;
    if (theme) {
      theme.innerHTML = renderThemeSelectOptions(values.subject, values.theme);
    }
  }
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
          <span class="tag-theme">${escapeHtml(getThemeBadgeLabel(question.subject, question.theme))}</span>
        </div>
        <div class="question-card-actions">
          <button class="action-btn-sm" type="button" data-action="edit-question" data-id="${question.id}">Edit</button>
          <button class="action-btn-sm danger" type="button" data-action="delete-question" data-id="${question.id}">Delete</button>
        </div>
      </div>
      <div class="question-prompt">${renderMathText(question.question_text)}</div>
      <div class="question-options-list">
        ${question.options
          .map((option, index) => {
            const isCorrect = index === question.correct_index;
            const letter = letters[index] ?? '';
            return `
              <div class="question-option-item ${isCorrect ? 'correct' : ''}">
                <span><strong>${letter}.</strong> ${renderMathText(option)}</span>
                ${isCorrect ? '<span class="correct-badge">Correct</span>' : ''}
              </div>
            `;
          })
          .join('')}
      </div>
      <div class="question-explanation-box">
        <strong>Explanation:</strong> ${renderMathText(question.explanation)}
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
  const filterThemeSelect = root.querySelector<HTMLSelectElement>('#filter-theme');
  if (filterThemeSelect) {
    filterThemeSelect.innerHTML = `<option value="All">All themes</option>${getFilterThemeOptions(state.filterSubject, state.filterTheme)}`;
  }
}

const MOCK_DEFAULT_AFTER_THEME = 4;

function defaultMockDraft(): MockDraft {
  return {
    title: '',
    after_theme: MOCK_DEFAULT_AFTER_THEME,
    source_themes: themes.slice(0, MOCK_DEFAULT_AFTER_THEME),
    question_count: MOCK_EXAM_DEFAULT_QUESTIONS,
  };
}

function mockDraftFromExam(exam: MockExam): MockDraft {
  return {
    title: exam.title,
    after_theme: exam.after_theme,
    source_themes: exam.source_themes.slice(),
    question_count: exam.question_count,
  };
}

function countThemeQuestions(questions: Question[], subject: Subject, theme: string): number {
  return questions.filter((question) => question.subject === subject && question.theme === theme).length;
}

function countAvailableQuestions(questions: Question[], subject: Subject, sourceThemes: readonly string[]): number {
  return questions.filter((question) => question.subject === subject && sourceThemes.includes(question.theme)).length;
}

function describeMockPosition(subject: Subject, afterTheme: number): string {
  if (afterTheme <= 0) return 'Before Theme 1';
  const theme = themes[afterTheme - 1];
  if (!theme) return 'At the end of the list';
  const custom = getCustomThemeTitle(subject, theme);
  return custom ? `After ${theme}: ${custom}` : `After ${theme}`;
}

function describeMockAvailability(available: number, needed: number): { text: string; short: boolean } {
  if (available < needed) {
    return {
      text: `Only ${available} of ${needed} questions available. Students will see "in preparation".`,
      short: true,
    };
  }
  return { text: `${available} questions available`, short: false };
}

/** The live hint under the question count: how many questions the chosen themes can supply. */
function getMockDraftHint(state: AdminState): { text: string; warning: boolean } {
  const { source_themes: sourceThemes, question_count: questionCount } = state.mockDraft;
  if (sourceThemes.length === 0) {
    return { text: 'Pick at least one theme to draw questions from.', warning: true };
  }
  const available = countAvailableQuestions(state.questions, state.mockManagerSubject, sourceThemes);
  if (Number.isFinite(questionCount) && available < questionCount) {
    return {
      text: `Only ${available} of ${questionCount} questions available in the selected themes. Students will see "in preparation" until more are added.`,
      warning: true,
    };
  }
  return { text: `${available} ${available === 1 ? 'question' : 'questions'} available in the selected themes`, warning: false };
}

function renderMockExamRow(state: AdminState, exam: MockExam): string {
  const available = countAvailableQuestions(state.questions, exam.subject, exam.source_themes);
  const availability = describeMockAvailability(available, exam.question_count);
  const isEditing = state.mockEditingId === exam.id;
  const id = escapeHtml(exam.id);
  return `
    <li class="mock-row ${isEditing ? 'is-editing' : ''}">
      <div class="mock-row-main">
        <h4 class="mock-row-title">${escapeHtml(exam.title)}</h4>
        <p class="mock-row-meta">${escapeHtml(describeMockPosition(exam.subject, exam.after_theme))}</p>
        <p class="mock-row-meta">${escapeHtml(describeCoverage(exam.source_themes))} &middot; ${exam.question_count} questions</p>
        <p class="mock-row-availability ${availability.short ? 'is-warning' : ''}">${escapeHtml(availability.text)}</p>
      </div>
      <div class="mock-row-actions">
        <button class="action-btn-sm" type="button" data-action="edit-mock" data-id="${id}">Edit</button>
        <button class="action-btn-sm danger" type="button" data-action="delete-mock" data-id="${id}">Delete</button>
      </div>
    </li>
  `;
}

/** Read-only strip showing the subject's theme order with its mock exams slotted in. */
function renderMockOutline(subject: Subject): string {
  const items = getSubjectOutline(subject).map((item) => {
    if (item.kind === 'mock') {
      const label = escapeHtml(item.exam.title);
      return `<li class="mock-outline-item is-mock" title="${label}"><span class="mock-outline-tag">Mock</span><span class="mock-outline-label">${label}</span></li>`;
    }
    const label = escapeHtml(item.title);
    return `<li class="mock-outline-item" title="${escapeHtml(item.theme)}: ${label}"><span class="mock-outline-tag">${item.themeNumber}</span><span class="mock-outline-label">${label}</span></li>`;
  });
  return `<ol class="mock-outline" aria-label="Quiz list order for this subject">${items.join('')}</ol>`;
}

function renderMockManagerModal(state: AdminState): string {
  const subject = state.mockManagerSubject;
  const exams = getMockExams(subject);
  const draft = state.mockDraft;
  const editing = state.mockEditingId !== null;
  const hint = getMockDraftHint(state);
  const countValue = Number.isFinite(draft.question_count) ? String(draft.question_count) : '';

  const positionOptions = [0, ...themes.map((_, index) => index + 1)]
    .map((position) => `<option value="${position}" ${draft.after_theme === position ? 'selected' : ''}>${escapeHtml(describeMockPosition(subject, position))}</option>`)
    .join('');

  const themeBoxes = themes
    .map((theme) => {
      const custom = getCustomThemeTitle(subject, theme);
      const count = countThemeQuestions(state.questions, subject, theme);
      return `
        <label class="mock-theme-option">
          <input type="checkbox" name="source_themes" value="${escapeHtml(theme)}" ${draft.source_themes.includes(theme) ? 'checked' : ''} />
          <span class="mock-theme-text">
            <span class="mock-theme-number">${escapeHtml(theme)}</span>
            ${custom ? `<span class="mock-theme-name">${escapeHtml(custom)}</span>` : ''}
          </span>
          <span class="mock-theme-count">${count} q</span>
        </label>
      `;
    })
    .join('');

  return `
    <div class="theme-modal-backdrop mock-modal-backdrop" id="mock-manager-modal" role="dialog" aria-modal="true" aria-labelledby="mock-modal-title">
      <div class="theme-modal-card mock-modal-card">
        <div class="theme-modal-header">
          <div>
            <h2 id="mock-modal-title">Manage Mock Exams</h2>
            <p>Slot a mock exam between themes. It samples questions evenly from the themes you choose.</p>
          </div>
          <button class="theme-modal-close" type="button" data-action="close-mock-manager" aria-label="Close modal">&times;</button>
        </div>
        <div class="theme-modal-body mock-modal-body">
          <div class="theme-manager-subject-select">
            <label for="mock-mgr-subject">Select Subject</label>
            <select id="mock-mgr-subject">
              ${subjects.map((s) => `<option value="${escapeHtml(s)}" ${subject === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
          </div>

          <div class="mock-layout">
            <section class="mock-section" aria-labelledby="mock-list-title">
              <h3 class="mock-section-title" id="mock-list-title">Mock exams <span class="mock-count-pill">${exams.length}</span></h3>
              ${exams.length > 0
                ? `<ul class="mock-list">${exams.map((exam) => renderMockExamRow(state, exam)).join('')}</ul>`
                : `<div class="mock-empty"><strong>No mock exams yet</strong><span>Use the form to add the first one for this subject.</span></div>`}
              <h3 class="mock-section-title mock-preview-title" id="mock-preview-title">Quiz list order</h3>
              ${renderMockOutline(subject)}
            </section>

            <section class="mock-section mock-form-card" aria-labelledby="mock-form-title">
              <div class="mock-form-head">
                <h3 class="mock-section-title" id="mock-form-title">
                  ${editing ? 'Edit mock exam <span class="edit-mode-badge">Editing</span>' : 'Add a mock exam'}
                </h3>
                ${editing ? '<button class="action-btn-sm" type="button" data-action="cancel-edit-mock">Cancel edit</button>' : ''}
              </div>
              <form id="mock-exam-form" class="mock-form" autocomplete="off">
                <div class="mock-field">
                  <label for="mock-title">Title</label>
                  <input id="mock-title" type="text" name="title" maxlength="${MOCK_EXAM_TITLE_MAX}" placeholder="Mock Exam 1" value="${escapeHtml(draft.title)}" required />
                </div>
                <div class="mock-field">
                  <label for="mock-after">Position in the theme list</label>
                  <select id="mock-after" name="after_theme">${positionOptions}</select>
                </div>
                <fieldset class="mock-field mock-fieldset">
                  <legend>Questions come from</legend>
                  <div class="mock-helper-row">
                    <button class="action-btn-sm" type="button" data-action="mock-themes-upto">Themes up to this position</button>
                    <button class="action-btn-sm" type="button" data-action="mock-themes-all">All themes</button>
                    <button class="action-btn-sm" type="button" data-action="mock-themes-clear">Clear</button>
                  </div>
                  <div class="mock-theme-grid">${themeBoxes}</div>
                </fieldset>
                <div class="mock-field">
                  <label for="mock-count">Number of questions</label>
                  <input id="mock-count" type="number" name="question_count" min="${MOCK_EXAM_MIN_QUESTIONS}" max="${MOCK_EXAM_MAX_QUESTIONS}" step="1" inputmode="numeric" value="${countValue}" required />
                  <p class="mock-hint ${hint.warning ? 'is-warning' : ''}" id="mock-form-hint" role="status" aria-live="polite">${escapeHtml(hint.text)}</p>
                </div>
              </form>
            </section>
          </div>
        </div>
        <div class="theme-modal-footer">
          <button class="button ghost" type="button" data-action="close-mock-manager">Close</button>
          <button class="button primary" type="submit" form="mock-exam-form" id="btn-save-mock" ${state.mockSaving ? 'disabled' : ''}>${state.mockSaving ? 'Saving...' : editing ? 'Save changes' : 'Add mock exam'}</button>
        </div>
      </div>
    </div>
  `;
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
    themeManagerOpen: false,
    themeManagerSubject: subjects[0],
    mockManagerOpen: false,
    mockManagerSubject: subjects[0],
    mockEditingId: null,
    mockDraft: defaultMockDraft(),
    mockSaving: false,
    analyticsEvents: [],
    analyticsLoading: false,
    analyticsError: null,
    analyticsTimeRange: 'all',
    showSubjectBreakdown: false,
  };

  /** Focus and scroll inside the mock modal, so a background render does not interrupt typing. */
  const captureMockView = (): { key: string; start: number | null; end: number | null; scroll: number } | null => {
    const modal = root.querySelector<HTMLElement>('#mock-manager-modal');
    if (!modal) return null;
    const active = document.activeElement;
    let key = '';
    let start: number | null = null;
    let end: number | null = null;
    if (active instanceof HTMLElement && modal.contains(active)) {
      const name = active.getAttribute('name');
      const value = active.getAttribute('value');
      key = active.id ? `#${active.id}` : name ? `[name="${name}"]${value ? `[value="${value}"]` : ''}` : '';
      if (active instanceof HTMLInputElement && active.type === 'text') {
        start = active.selectionStart;
        end = active.selectionEnd;
      }
    }
    return { key, start, end, scroll: modal.querySelector<HTMLElement>('.mock-modal-body')?.scrollTop ?? 0 };
  };

  const restoreMockView = (view: ReturnType<typeof captureMockView>): void => {
    if (!view) return;
    const modal = root.querySelector<HTMLElement>('#mock-manager-modal');
    if (!modal) return;
    const body = modal.querySelector<HTMLElement>('.mock-modal-body');
    if (body) body.scrollTop = view.scroll;
    if (!view.key) return;
    const next = modal.querySelector<HTMLElement>(view.key);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement && next.type === 'text' && view.start !== null && view.end !== null) {
      next.setSelectionRange(view.start, view.end);
    }
  };

  const render = (): void => {
    const mockView = captureMockView();
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
            <form id="admin-login" class="admin-form" autocomplete="off">
              <label>
                <span>Email</span>
                <input name="email" type="email" autocomplete="off" required />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" autocomplete="new-password" required />
              </label>
              <button class="button primary" type="submit">Sign in</button>
              ${state.error ? `<p class="feedback bad"><strong>Error</strong><span>${escapeHtml(state.error)}</span></p>` : ''}
            </form>
          </article>
        </section>
      `;
      return;
    }

    // The exam being edited may have been deleted elsewhere; fall back to add mode but keep the typed draft.
    if (state.mockEditingId && getMockExam(state.mockEditingId)?.subject !== state.mockManagerSubject) {
      state.mockEditingId = null;
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

    const kpis = computeAnalyticsKpis(state.analyticsEvents);
    const funnel = computeAnalyticsFunnel(state.analyticsEvents, kpis);
    const subjectBreakdown = computeSubjectBreakdown(state.analyticsEvents);

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
            <button class="button secondary theme-mgr-btn" type="button" data-action="open-mock-manager" title="Add and edit mock exams between themes">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:0.35rem;"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Manage Mock Exams
            </button>
            <button class="button secondary theme-mgr-btn" type="button" data-action="open-theme-manager" title="Manage custom names for themes">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:0.35rem;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Manage Theme Names
            </button>
            <span class="admin-user-pill">${escapeHtml(state.userEmail ?? '')}</span>
            <button class="button ghost" type="button" data-action="sign-out">Sign out</button>
          </div>
        </header>

        <!-- Student Telemetry & Conversion Funnel Command Center -->
        <section class="admin-telemetry-panel" aria-label="Student Telemetry and Conversion Funnel">
          <div class="telemetry-panel-header">
            <div class="telemetry-title-block">
              <div class="telemetry-live-badge">
                <span class="live-dot" aria-hidden="true"></span>
                <span>Telemetry Command Center</span>
              </div>
              <h2>Student Traffic &amp; Quiz Conversion Funnel</h2>
              <p>Real-time analytics on visitors, quiz attempts, and completions.</p>
            </div>
            <div class="telemetry-controls">
              <div class="telemetry-time-range-group" role="group" aria-label="Time range filter">
                <button
                  type="button"
                  class="telemetry-range-btn ${state.analyticsTimeRange === 'all' ? 'active' : ''}"
                  data-action="switch-analytics-range"
                  data-range="all"
                  aria-pressed="${state.analyticsTimeRange === 'all'}"
                >
                  All Time
                </button>
                <button
                  type="button"
                  class="telemetry-range-btn ${state.analyticsTimeRange === '7d' ? 'active' : ''}"
                  data-action="switch-analytics-range"
                  data-range="7d"
                  aria-pressed="${state.analyticsTimeRange === '7d'}"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  class="telemetry-range-btn ${state.analyticsTimeRange === 'today' ? 'active' : ''}"
                  data-action="switch-analytics-range"
                  data-range="today"
                  aria-pressed="${state.analyticsTimeRange === 'today'}"
                >
                  Today
                </button>
              </div>
              <button
                type="button"
                class="telemetry-refresh-btn ${state.analyticsLoading ? 'is-loading' : ''}"
                data-action="refresh-analytics"
                title="Refresh analytics data"
                ${state.analyticsLoading ? 'disabled' : ''}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                <span>${state.analyticsLoading ? 'Syncing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          ${state.analyticsError ? `
            <div class="telemetry-notice-box">
              <div class="telemetry-notice-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div class="telemetry-notice-content">
                <strong>Telemetry database setup pending</strong>
                <p>Telemetry table was not reachable: <code>${escapeHtml(state.analyticsError)}</code>.</p>
                <p class="telemetry-notice-help">To activate real-time telemetry, run migration file <code>supabase/migrations/0007_site_analytics.sql</code> in your Supabase SQL Editor.</p>
              </div>
            </div>
          ` : `
            <!-- 4 Executive KPI Cards -->
            <div class="telemetry-kpi-grid">
              <!-- KPI 1: Entered Webpage -->
              <article class="telemetry-kpi-card" id="kpi-visitors">
                <div class="kpi-card-header">
                  <span class="kpi-title">Entered Webpage</span>
                  <span class="kpi-icon-badge kpi-visitors" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </span>
                </div>
                <div class="kpi-main-metric">
                  <span class="kpi-number" id="stat-telemetry-visitors">${kpis.totalVisitors}</span>
                  <span class="kpi-unit">visitors</span>
                </div>
                <div class="kpi-subtext">
                  <span>${kpis.totalVisits} page visits logged</span>
                  <span class="kpi-tag">Deduplicated</span>
                </div>
              </article>

              <!-- KPI 2: Started Quiz -->
              <article class="telemetry-kpi-card" id="kpi-starts">
                <div class="kpi-card-header">
                  <span class="kpi-title">Started Quiz</span>
                  <span class="kpi-icon-badge kpi-starts" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </span>
                </div>
                <div class="kpi-main-metric">
                  <span class="kpi-number" id="stat-telemetry-starts">${kpis.quizzesStarted}</span>
                  <span class="kpi-unit">attempts</span>
                </div>
                <div class="kpi-subtext">
                  <span class="kpi-accent-text">${funnel[1].rate}%</span>
                  <span>of visitors started a quiz</span>
                </div>
              </article>

              <!-- KPI 3: Ended Quiz -->
              <article class="telemetry-kpi-card" id="kpi-completions">
                <div class="kpi-card-header">
                  <span class="kpi-title">Ended Quiz</span>
                  <span class="kpi-icon-badge kpi-completions" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </span>
                </div>
                <div class="kpi-main-metric">
                  <span class="kpi-number" id="stat-telemetry-completions">${kpis.quizzesCompleted}</span>
                  <span class="kpi-unit">completed</span>
                </div>
                <div class="kpi-subtext">
                  <span class="kpi-accent-text ${kpis.completionRate >= 70 ? 'positive' : ''}">${kpis.completionRate}%</span>
                  <span>completion rate</span>
                </div>
              </article>

              <!-- KPI 4: Quality & Performance -->
              <article class="telemetry-kpi-card" id="kpi-performance">
                <div class="kpi-card-header">
                  <span class="kpi-title">Avg Performance</span>
                  <span class="kpi-icon-badge kpi-performance" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </span>
                </div>
                <div class="kpi-main-metric">
                  <span class="kpi-number">${kpis.avgScore !== null ? `${kpis.avgScore}` : '--'}</span>
                  <span class="kpi-unit">${kpis.avgScore !== null ? '/ 25 avg' : 'no data'}</span>
                </div>
                <div class="kpi-subtext">
                  <span>${kpis.avgTimeSeconds !== null ? `${Math.floor(kpis.avgTimeSeconds / 60)}m ${kpis.avgTimeSeconds % 60}s avg duration` : 'Awaiting completed quizzes'}</span>
                </div>
              </article>
            </div>

            <!-- Visual 3-Stage Conversion Funnel -->
            <div class="telemetry-funnel-card">
              <div class="funnel-card-header">
                <div>
                  <h3 class="funnel-title">User Journey &amp; Conversion Funnel</h3>
                  <p class="funnel-subtitle">Drop-off progression from site landing to quiz completion</p>
                </div>
                <span class="funnel-summary-badge">
                  Overall Conversion: <strong>${kpis.totalVisitors > 0 ? ((kpis.quizzesCompleted / kpis.totalVisitors) * 100).toFixed(1) : '0.0'}%</strong>
                </span>
              </div>

              <div class="telemetry-funnel-stages">
                <!-- Stage 1 -->
                <div class="funnel-stage-item stage-visitors">
                  <div class="funnel-stage-head">
                    <span class="funnel-step-num">Stage 1</span>
                    <span class="funnel-stage-name">Entered Webpage</span>
                    <span class="funnel-stage-count">${funnel[0].count}</span>
                  </div>
                  <div class="funnel-bar-track">
                    <div class="funnel-bar-fill stage-1-fill" style="width: 100%;"></div>
                  </div>
                  <div class="funnel-stage-metrics">
                    <span class="funnel-rate-tag">100% of traffic</span>
                    <span class="funnel-dropoff-tag zero">Baseline</span>
                  </div>
                </div>

                <div class="funnel-stage-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>

                <!-- Stage 2 -->
                <div class="funnel-stage-item stage-starts">
                  <div class="funnel-stage-head">
                    <span class="funnel-step-num">Stage 2</span>
                    <span class="funnel-stage-name">Started Quiz</span>
                    <span class="funnel-stage-count">${funnel[1].count}</span>
                  </div>
                  <div class="funnel-bar-track">
                    <div class="funnel-bar-fill stage-2-fill" style="width: ${Math.min(100, Math.max(funnel[1].count > 0 ? 8 : 0, funnel[1].rate))}%;"></div>
                  </div>
                  <div class="funnel-stage-metrics">
                    <span class="funnel-rate-tag">${funnel[1].rate}% started</span>
                    <span class="funnel-dropoff-tag ${funnel[1].dropOff > 50 ? 'high' : ''}">${funnel[1].dropOff}% drop-off</span>
                  </div>
                </div>

                <div class="funnel-stage-arrow" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>

                <!-- Stage 3 -->
                <div class="funnel-stage-item stage-completions">
                  <div class="funnel-stage-head">
                    <span class="funnel-step-num">Stage 3</span>
                    <span class="funnel-stage-name">Ended Quiz</span>
                    <span class="funnel-stage-count">${funnel[2].count}</span>
                  </div>
                  <div class="funnel-bar-track">
                    <div class="funnel-bar-fill stage-3-fill" style="width: ${Math.min(100, Math.max(funnel[2].count > 0 ? 8 : 0, funnel[2].rate))}%;"></div>
                  </div>
                  <div class="funnel-stage-metrics">
                    <span class="funnel-rate-tag">${funnel[2].rate}% finished</span>
                    <span class="funnel-dropoff-tag ${funnel[2].dropOff > 50 ? 'high' : ''}">${funnel[2].dropOff}% drop-off</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Subject Breakdown Toggle & Table -->
            <div class="telemetry-breakdown-card">
              <div class="telemetry-breakdown-header">
                <div>
                  <h4 class="breakdown-title">Subject &amp; Curriculum Engagement</h4>
                  <p class="breakdown-subtitle">Breakdown of quiz starts and completions per academic subject</p>
                </div>
                <button
                  type="button"
                  class="button secondary telemetry-breakdown-toggle"
                  data-action="toggle-subject-breakdown"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  <span>${state.showSubjectBreakdown ? 'Hide Breakdown' : `View Subject Breakdown (${subjectBreakdown.length})`}</span>
                </button>
              </div>

              ${state.showSubjectBreakdown ? `
                <div class="telemetry-breakdown-body">
                  ${subjectBreakdown.length > 0 ? `
                    <div class="telemetry-table-wrapper">
                      <table class="telemetry-table">
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th class="num-col">Started</th>
                            <th class="num-col">Completed</th>
                            <th class="num-col">Completion Rate</th>
                            <th>Top Theme</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${subjectBreakdown.map((row) => `
                            <tr>
                              <td class="subject-col">
                                <span class="subject-name-cell">${escapeHtml(row.subject)}</span>
                              </td>
                              <td class="num-col"><strong>${row.starts}</strong></td>
                              <td class="num-col"><strong>${row.completions}</strong></td>
                              <td class="num-col">
                                <span class="badge ${row.completionRate >= 70 ? 'badge-success' : 'badge-neutral'}">
                                  ${row.completionRate}%
                                </span>
                              </td>
                              <td class="theme-col">
                                ${row.themes.length > 0 ? `
                                  <span class="theme-pill">${escapeHtml(row.themes[0].theme)} (${row.themes[0].starts} starts)</span>
                                ` : '<span class="subtle">None</span>'}
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  ` : `
                    <div class="telemetry-empty-breakdown">
                      <p>No subject activity recorded yet in this time frame.</p>
                    </div>
                  `}
                </div>
              ` : ''}
            </div>
          `}
        </section>

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
                          <select name="subject" id="question-subject" required>
                            ${subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('')}
                          </select>
                        </label>
                        <label>
                          <span>Theme</span>
                          <select name="theme" id="question-theme" required>
                            ${renderThemeSelectOptions(subjects[0])}
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
                  ${getFilterThemeOptions(state.filterSubject, state.filterTheme)}
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
      ${state.themeManagerOpen ? `
        <div class="theme-modal-backdrop" id="theme-manager-modal" role="dialog" aria-modal="true" aria-labelledby="theme-modal-title">
          <div class="theme-modal-card">
            <div class="theme-modal-header">
              <div>
                <h2 id="theme-modal-title">Manage Theme Names</h2>
                <p>Assign custom names to themes for the selected subject. Leave blank to show the standard name.</p>
              </div>
              <button class="theme-modal-close" type="button" data-action="close-theme-manager" aria-label="Close modal">&times;</button>
            </div>
            <form id="theme-manager-form">
              <div class="theme-modal-body">
                <div class="theme-manager-subject-select">
                  <label for="theme-mgr-subject">Select Subject</label>
                  <select id="theme-mgr-subject" name="manager_subject">
                    ${subjects.map((s) => `<option value="${escapeHtml(s)}" ${state.themeManagerSubject === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                  </select>
                </div>

                <div class="theme-grid-inputs">
                  ${themes.map((t) => {
                    const currentTitle = getCustomThemeTitle(state.themeManagerSubject, t);
                    return `
                      <div class="theme-input-item">
                        <label for="theme-input-${t.replace(/\s+/g, '-')}">
                          <span>${t}</span>
                          <span class="theme-badge">${currentTitle ? 'Custom' : 'Default'}</span>
                        </label>
                        <input
                          id="theme-input-${t.replace(/\s+/g, '-')}"
                          type="text"
                          name="${t}"
                          value="${escapeHtml(currentTitle)}"
                          placeholder="e.g. Intro to Accounting (or leave blank)"
                        />
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
              <div class="theme-modal-footer">
                <button class="button ghost" type="button" data-action="close-theme-manager">Cancel</button>
                <button class="button primary" type="submit" id="btn-save-themes">Save Theme Names</button>
              </div>
            </form>
          </div>
        </div>
      ` : ''}
      ${state.mockManagerOpen ? renderMockManagerModal(state) : ''}
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

    restoreMockView(mockView);
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

  const loadAnalytics = async (): Promise<void> => {
    state.analyticsLoading = true;
    state.analyticsError = null;
    try {
      let query = supabase
        .from('site_analytics')
        .select('id, event_type, session_id, subject, theme, score, total_questions, time_taken_seconds, metadata, created_at')
        .order('created_at', { ascending: false });

      const now = new Date();
      if (state.analyticsTimeRange === 'today') {
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        query = query.gte('created_at', todayStart.toISOString());
      } else if (state.analyticsTimeRange === '7d') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', sevenDaysAgo.toISOString());
      }

      const { data, error } = await query;
      if (error) {
        state.analyticsError = error.message;
        state.analyticsEvents = [];
      } else {
        state.analyticsEvents = (data ?? []) as AnalyticsEvent[];
        state.analyticsError = null;
      }
    } catch (err) {
      state.analyticsError = err instanceof Error ? err.message : 'Telemetry request failed';
      state.analyticsEvents = [];
    } finally {
      state.analyticsLoading = false;
    }
  };

  const refresh = async (): Promise<void> => {
    state.busy = true;
    // Both the stored-session boot and the login form land here, so names load on either path.
    initThemeTitles();
    initMockExams();
    render();
    try {
      const [, , themeUploadError] = await Promise.all([
        loadQuestions(),
        loadAnalytics(),
        loadThemeTitlesForAdmin(),
        loadMockExams(),
      ]);
      state.busy = false;
      state.error = null;
      render();
      if (themeUploadError) {
        showToast(themeUploadError, 'error');
      }
    } catch (error) {
      state.busy = false;
      state.error = error instanceof Error ? error.message : 'Failed to load dashboard data.';
      render();
    }
  };

  const syncSession = async (): Promise<void> => {
    // When non-persistent, wipe any legacy localStorage tokens from older sessions
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase.auth'))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore if localStorage is unavailable
    }

    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || !isAuthorizedAdmin(user)) {
      state.phase = 'login';
      state.userEmail = null;
      state.error = null;
      render();
      return;
    }

    state.phase = 'dashboard';
    state.userEmail = user.email ?? null;
    await refresh();
  };

  void syncSession();

  const resetMockForm = (): void => {
    state.mockEditingId = null;
    state.mockDraft = defaultMockDraft();
  };

  const focusMockTitle = (): void => {
    root.querySelector<HTMLInputElement>('#mock-title')?.focus();
  };

  /** Copies the form into state.mockDraft. Never re-renders, so typing is not interrupted. */
  const syncMockDraft = (form: HTMLFormElement): void => {
    const data = new FormData(form);
    const rawCount = String(data.get('question_count') ?? '').trim();
    state.mockDraft = {
      title: String(data.get('title') ?? ''),
      after_theme: Number(data.get('after_theme')),
      source_themes: data.getAll('source_themes').map(String).filter(isTheme),
      question_count: rawCount === '' ? Number.NaN : Number(rawCount),
    };
  };

  const refreshMockHint = (): void => {
    const hintEl = root.querySelector<HTMLElement>('#mock-form-hint');
    if (!hintEl) return;
    const hint = getMockDraftHint(state);
    hintEl.textContent = hint.text;
    hintEl.classList.toggle('is-warning', hint.warning);
  };

  const setMockSourceThemes = (selected: readonly string[]): void => {
    const form = root.querySelector<HTMLFormElement>('#mock-exam-form');
    if (!form) return;
    form.querySelectorAll<HTMLInputElement>('input[name="source_themes"]').forEach((box) => {
      box.checked = selected.includes(box.value);
    });
    syncMockDraft(form);
    refreshMockHint();
  };

  const syncMockSaveButton = (): void => {
    const saveBtn = root.querySelector<HTMLButtonElement>('#btn-save-mock');
    if (!saveBtn) return;
    saveBtn.disabled = state.mockSaving;
    saveBtn.textContent = state.mockSaving ? 'Saving...' : state.mockEditingId ? 'Save changes' : 'Add mock exam';
  };

  document.addEventListener('keydown', function onMockEscape(event) {
    if (!root.isConnected) {
      document.removeEventListener('keydown', onMockEscape);
      return;
    }
    if (event.key === 'Escape' && state.mockManagerOpen) {
      state.mockManagerOpen = false;
      render();
    }
  });

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
        .then(async ({ data, error }) => {
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

          if (!isAuthorizedAdmin(data.user)) {
            await supabase.auth.signOut();
            form.classList.remove('is-submitting');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Sign in';
            }
            state.phase = 'login';
            state.error = 'Access denied. This account does not have administrator privileges.';
            const errP = document.createElement('p');
            errP.className = 'feedback bad';
            errP.innerHTML = `<strong>Error</strong><span>Access denied. This account does not have administrator privileges.</span>`;
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

    if (form.id === 'mock-exam-form') {
      event.preventDefault();
      if (state.mockSaving) {
        return;
      }

      syncMockDraft(form);
      const result = normalizeMockExamInput(state.mockDraft, themes);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }

      const subject = state.mockManagerSubject;
      const editingId = state.mockEditingId;
      state.mockSaving = true;
      syncMockSaveButton();

      void saveMockExam(subject, result.value, editingId ?? undefined).then(
        () => {
          state.mockSaving = false;
          showToast(editingId ? 'Mock exam updated' : 'Mock exam added', 'success');
          // Back to add mode so several exams can be added in a row, unless the admin switched subject meanwhile.
          if (state.mockManagerSubject === subject) {
            resetMockForm();
          }
          render();
          if (state.mockManagerOpen && state.mockManagerSubject === subject) {
            focusMockTitle();
          }
        },
        (err: unknown) => {
          // Keep the modal and the typed draft so nothing is lost.
          state.mockSaving = false;
          syncMockSaveButton();
          showToast(err instanceof Error ? err.message : 'Mock exam was not saved.', 'error');
        },
      );
      return;
    }

    if (form.id === 'theme-manager-form') {
      event.preventDefault();
      const data = new FormData(form);
      const titlesMap: Record<string, string> = {};
      for (const t of themes) {
        titlesMap[t] = String(data.get(t) ?? '').trim();
      }

      const saveBtn = form.querySelector<HTMLButtonElement>('#btn-save-themes');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      void setAllCustomThemeTitles(state.themeManagerSubject, titlesMap).then(
        () => {
          state.themeManagerOpen = false;
          showToast(`Theme names saved for ${state.themeManagerSubject}!`, 'success');
          render();
        },
        (err: unknown) => {
          // Keep the modal open with the typed names so nothing is lost.
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Theme Names';
          }
          const msg = err instanceof Error ? err.message : 'Failed to save theme names.';
          showToast(msg, 'error');
        },
      );
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
    const changed = event.target as HTMLElement | null;
    const mockForm = changed?.closest<HTMLFormElement>('#mock-exam-form');
    if (mockForm) {
      syncMockDraft(mockForm);
      refreshMockHint();
      return;
    }

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
    if (!select || !(select instanceof HTMLSelectElement)) {
      return;
    }

    if (select.name === 'subject' && select.closest('#question-form')) {
      const subject = select.value as Subject;
      const themeSelect = root.querySelector<HTMLSelectElement>('#question-theme');
      if (themeSelect) {
        themeSelect.innerHTML = renderThemeSelectOptions(subject);
      }
      return;
    }

    if (select.id === 'filter-subject') {
      state.filterSubject = select.value as AdminState['filterSubject'];
      if (state.filterSubject !== 'All') {
        const validThemes = getSubjectThemes(state.filterSubject).map((t) => t.theme);
        if (state.filterTheme !== 'All' && !validThemes.includes(state.filterTheme)) {
          state.filterTheme = 'All';
        }
      }
      updateFeedView(state, root);
      return;
    }

    if (select.id === 'filter-theme') {
      state.filterTheme = select.value as AdminState['filterTheme'];
      updateFeedView(state, root);
      return;
    }

    if (select.id === 'mock-mgr-subject') {
      state.mockManagerSubject = select.value as Subject;
      resetMockForm();
      render();
      return;
    }

    if (select.id === 'theme-mgr-subject') {
      state.themeManagerSubject = select.value as Subject;
      render();
      return;
    }
  });

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (target.classList.contains('mock-modal-backdrop')) {
      state.mockManagerOpen = false;
      render();
      return;
    }

    if (target.classList.contains('theme-modal-backdrop')) {
      state.themeManagerOpen = false;
      render();
      return;
    }

    const action = target.closest<HTMLElement>('[data-action]');
    if (!action) {
      return;
    }

    if (action.dataset.action === 'switch-analytics-range') {
      const range = action.dataset.range as AnalyticsTimeRange | undefined;
      if (range && state.analyticsTimeRange !== range) {
        state.analyticsTimeRange = range;
        render();
        void loadAnalytics().then(() => render());
      }
      return;
    }

    if (action.dataset.action === 'refresh-analytics') {
      state.analyticsLoading = true;
      render();
      void loadAnalytics().then(() => render());
      return;
    }

    if (action.dataset.action === 'toggle-subject-breakdown') {
      state.showSubjectBreakdown = !state.showSubjectBreakdown;
      render();
      return;
    }

    if (action.dataset.action === 'open-theme-manager') {
      state.themeManagerOpen = true;
      state.mockManagerOpen = false;
      render();
      return;
    }

    if (action.dataset.action === 'open-mock-manager') {
      state.mockManagerOpen = true;
      state.themeManagerOpen = false;
      resetMockForm();
      render();
      root.querySelector<HTMLElement>('#mock-mgr-subject')?.focus();
      return;
    }

    if (action.dataset.action === 'close-mock-manager') {
      state.mockManagerOpen = false;
      render();
      return;
    }

    if (action.dataset.action === 'edit-mock') {
      const exam = getMockExam(action.dataset.id);
      if (!exam) {
        return;
      }
      state.mockManagerSubject = exam.subject;
      state.mockEditingId = exam.id;
      state.mockDraft = mockDraftFromExam(exam);
      render();
      focusMockTitle();
      root.querySelector<HTMLElement>('#mock-form-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (action.dataset.action === 'cancel-edit-mock') {
      resetMockForm();
      render();
      focusMockTitle();
      return;
    }

    if (action.dataset.action === 'delete-mock') {
      const exam = getMockExam(action.dataset.id);
      if (!exam) {
        return;
      }
      if (!window.confirm(`Delete the mock exam "${exam.title}"? Students will no longer see it.`)) {
        return;
      }
      void deleteMockExam(exam.id).then(
        () => {
          if (state.mockEditingId === exam.id) {
            resetMockForm();
          }
          showToast('Mock exam deleted', 'success');
          render();
        },
        (err: unknown) => {
          showToast(err instanceof Error ? err.message : 'Mock exam was not deleted.', 'error');
        },
      );
      return;
    }

    if (action.dataset.action === 'mock-themes-upto') {
      if (state.mockDraft.after_theme <= 0) {
        showToast('This position is above Theme 1, so there are no earlier themes to select.', 'info');
        return;
      }
      setMockSourceThemes(themes.slice(0, state.mockDraft.after_theme));
      return;
    }

    if (action.dataset.action === 'mock-themes-all') {
      setMockSourceThemes(themes);
      return;
    }

    if (action.dataset.action === 'mock-themes-clear') {
      setMockSourceThemes([]);
      return;
    }

    if (action.dataset.action === 'close-theme-manager') {
      state.themeManagerOpen = false;
      render();
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
    },
    {
      "subject": "Financial Accounting",
      "theme": "Theme 1",
      "question_text": "What is the fundamental accounting equation?",
      "options": ["Assets = Liabilities + Equity", "Assets = Liabilities - Equity", "Revenue = Expenses + Profit", "Net Income = Dividends + Retained Earnings"],
      "correct_index": 0,
      "explanation": "The fundamental accounting equation is Assets = Liabilities + Equity."
    },
    {
      "subject": "Fundamentals of Statistics",
      "theme": "Theme 1",
      "question_text": "What is the measure of the spread or dispersion of a dataset relative to its mean?",
      "options": ["Mean", "Median", "Standard deviation", "Mode"],
      "correct_index": 2,
      "explanation": "Standard deviation measures the spread or dispersion of data values relative to their mean."
    },
    {
      "subject": "Essentials of Economics",
      "theme": "Theme 1",
      "question_text": "What does opportunity cost represent?",
      "options": ["The monetary price paid for a good", "The value of the next best alternative forgone", "The total accounting cost incurred", "The sunk cost of past investments"],
      "correct_index": 1,
      "explanation": "Opportunity cost is the value of the next best alternative forgone when making a decision."
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
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase.auth'))) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // ignore
      }
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
    const mockForm = input?.closest<HTMLFormElement>('#mock-exam-form');
    if (mockForm) {
      syncMockDraft(mockForm);
      refreshMockHint();
      return;
    }

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
