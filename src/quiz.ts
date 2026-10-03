import { isSupabaseConfigured, supabase } from './supabase';
import { clearNode, escapeHtml, formatDuration, formatPercent, shuffle, uid } from './dom';
import { renderMathText } from './math';
import {
  cifsSubjects,
  getQuizThemeTitle,
  getSubjectThemes,
  level4Subjects,
  passPercent,
  quizLength,
  subjectShortName,
  subjects,
  themes,
} from './constants';
import { readLocal, readSession, writeLocal, writeSession } from './storage';
import type { AnswerReview, Question, ResultRow, Subject, Theme } from './types';

export type QuizLevel = 'CIFS' | 'Level 4';

interface QuizConfig {
  subject: Subject;
  theme: Theme;
}

type QuizPhase = 'setup' | 'loading' | 'question' | 'review' | 'results' | 'error';

export class InsufficientQuestionsError extends Error {
  readonly subject: Subject;
  readonly theme: Theme;
  readonly availableCount: number;
  readonly requiredCount: number;

  constructor(subject: Subject, theme: Theme, availableCount: number, requiredCount: number) {
    super(`Questions for ${subject} (${theme}) are currently being prepared.`);
    this.name = 'InsufficientQuestionsError';
    this.subject = subject;
    this.theme = theme;
    this.availableCount = availableCount;
    this.requiredCount = requiredCount;
  }
}

interface QuizState {
  phase: QuizPhase;
  config: QuizConfig | null;
  selectedLevel: QuizLevel;
  selectedSubject: Subject | null;
  userId: string | null;
  questions: Question[];
  currentIndex: number;
  selectedIndex: number | null;
  review: AnswerReview | null;
  score: number;
  startedAt: number | null;
  error: string | null;
  errorKind?: 'insufficient' | 'connection' | 'generic';
  errorSubject?: Subject;
  errorTheme?: Theme;
  result: ResultRow | null;
  history: ResultRow[];
  busy: boolean;
}

const activeConfigKey = 'last-config';
const questionCachePrefix = 'question-pool:';
const poolCacheTtlMs = 1000 * 60 * 60 * 8;
const historyStorageKey = 'history';

function loadHistory(): ResultRow[] {
  return readLocal<ResultRow[]>(historyStorageKey) ?? [];
}

function saveHistoryResult(result: ResultRow): ResultRow[] {
  const existing = loadHistory();
  const updated = [result, ...existing.filter((item) => item.id !== result.id)].slice(0, 10);
  writeLocal(historyStorageKey, updated);
  return updated;
}

function defaultConfig(): QuizConfig {
  return {
    subject: subjects[0],
    theme: themes[0],
  };
}

function getQuestionCacheKey(subject: Subject, theme: Theme): string {
  return `${questionCachePrefix}${subject}::${theme}`;
}

function loadConfig(): QuizConfig {
  const saved = readSession<QuizConfig>(activeConfigKey);
  if (!saved) {
    return defaultConfig();
  }

  if (saved.subject === ('Foundations of Economics' as Subject)) {
    saved.subject = 'Introduction to Business and Economics';
  }

  if (!subjects.includes(saved.subject) || !themes.includes(saved.theme)) {
    return defaultConfig();
  }

  return saved;
}

function saveConfig(config: QuizConfig): void {
  writeSession(activeConfigKey, config);
}

function getAnonymousSessionUserId(): string {
  const sessionKey = 'pulse-quiz:user-id';
  let id = readSession<string>(sessionKey);
  if (!id) {
    id = uid();
    writeSession(sessionKey, id);
  }
  return id;
}

async function loadQuestionPool(subject: Subject, theme: Theme): Promise<Question[]> {
  const cacheKey = getQuestionCacheKey(subject, theme);
  const cached = readSession<{ createdAt: number; pool: Question[] }>(cacheKey);
  if (cached && Date.now() - cached.createdAt < poolCacheTtlMs && cached.pool.length >= quizLength) {
    return cached.pool;
  }

  const subjectFilter =
    subject === 'Introduction to Business and Economics'
      ? ['Introduction to Business and Economics', 'Foundations of Economics']
      : [subject];

  const { data, error } = await supabase
    .from('questions')
    .select('id, subject, theme, question_text, options, correct_index, explanation, created_at')
    .in('subject', subjectFilter)
    .eq('theme', theme)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const pool = (data ?? []) as Question[];
  if (pool.length < quizLength) {
    throw new InsufficientQuestionsError(subject, theme, pool.length, quizLength);
  }

  writeSession(cacheKey, { createdAt: Date.now(), pool });
  return pool;
}

function pickQuizQuestions(pool: Question[]): Question[] {
  return shuffle(pool).slice(0, quizLength);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export class QuizApp {
  private readonly root: HTMLElement;
  private state: QuizState;
  private readonly handleClick = (event: MouseEvent) => this.onClick(event);
  private readonly handleSubmit = (event: SubmitEvent) => this.onSubmit(event);

  constructor(root: HTMLElement) {
    this.root = root;
    const initialConfig = loadConfig();
    const initialLevel: QuizLevel = level4Subjects.includes(initialConfig.subject) ? 'Level 4' : 'CIFS';
    this.state = {
      phase: 'setup',
      config: initialConfig,
      selectedLevel: initialLevel,
      selectedSubject: null,
      userId: null,
      questions: [],
      currentIndex: 0,
      selectedIndex: null,
      review: null,
      score: 0,
      startedAt: null,
      error: null,
      result: null,
      history: loadHistory(),
      busy: false,
    };
  }

  mount(): void {
    document.body.classList.remove('quiz-fullscreen');
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('submit', this.handleSubmit);
    this.render();
  }

  destroy(): void {
    document.body.classList.remove('quiz-fullscreen');
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('submit', this.handleSubmit);
  }

  private setState(next: Partial<QuizState>): void {
    this.state = { ...this.state, ...next };
    this.render();
  }

  private render(): void {
    clearNode(this.root);

    if (this.state.phase === 'setup') {
      this.root.innerHTML = this.renderSetup();
      return;
    }

    if (this.state.phase === 'loading') {
      this.root.innerHTML = this.renderLoading();
      return;
    }

    if (this.state.phase === 'error') {
      this.root.innerHTML = this.renderError();
      return;
    }

    if (this.state.phase === 'results') {
      this.root.innerHTML = this.renderResults();
      return;
    }

    this.root.innerHTML = this.renderQuiz();
  }

  private renderSetup(): string {
    const config = this.state.config ?? defaultConfig();
    const activeSubject = this.state.selectedSubject;
    const currentLevel = this.state.selectedLevel;
    const currentSubjects = currentLevel === 'Level 4' ? level4Subjects : cifsSubjects;

    return `
      <section class="quiz-flow">
        <section id="subject-selection-step" class="subject-step ${activeSubject ? 'is-hidden' : ''}">
          <nav class="level-nav" aria-label="Quiz levels">
            <button class="level-tab ${currentLevel === 'CIFS' ? 'active' : ''}" type="button" data-action="level-select" data-level="CIFS">CIFS</button>
            <button class="level-tab ${currentLevel === 'Level 4' ? 'active' : ''}" type="button" data-action="level-select" data-level="Level 4">Level 4</button>
            <button class="level-tab locked" type="button" disabled>Level 5 (Locked)</button>
            <button class="level-tab locked" type="button" disabled>Level 6 (Locked)</button>
          </nav>
          <div class="subjects-grid">
            ${currentSubjects
              .map(
                (subject) => `
                  <button class="subject-card" type="button" data-action="subject-select" data-subject="${escapeHtml(subject)}" title="${escapeHtml(subject)}">
                    ${escapeHtml(subjectShortName(subject))}
                  </button>
                `,
              )
              .join('')}
          </div>
        </section>

        <section id="theme-step" class="theme-step ${activeSubject ? 'is-active' : ''}">
          <button class="back-link" type="button" data-action="back-subjects">← Choose Another Subject</button>
          <div class="selected-subject-header" id="active-subject-title">${escapeHtml(activeSubject ?? config.subject)}</div>
          <div class="theme-options">
            ${getSubjectThemes(activeSubject ?? config.subject)
              .map((item) => {
                const hasCustomTitle = item.title !== item.theme;
                return `
                  <button class="theme-btn" type="button" data-action="theme-select" data-theme="${item.theme}">
                    <div class="theme-btn-content">
                      ${hasCustomTitle ? `<span class="theme-btn-tag">${item.theme}</span>` : ''}
                      <span class="theme-btn-title">${escapeHtml(hasCustomTitle ? `${item.themeNumber}. ${item.title}` : item.theme)}</span>
                    </div>
                    <span class="theme-btn-arrow" aria-hidden="true">→</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </section>
      </section>
    `;
  }

  private renderLoading(): string {
    const subject = this.state.config?.subject;
    const theme = this.state.config?.theme;
    const themeTitle = subject && theme ? getQuizThemeTitle(subject, theme) : theme;
    const topicLabel =
      subject && theme
        ? `${subject} · ${themeTitle && themeTitle !== theme ? `${theme}: ${themeTitle}` : theme}`
        : 'your quiz';
    return `
      <section class="panel centered-shell">
        <div class="spinner" aria-hidden="true"></div>
        <h2>Loading ${escapeHtml(topicLabel)}...</h2>
        <p class="subtle">Preparing questions for your session. Good luck with your practice!</p>
      </section>
    `;
  }

  private renderError(): string {
    if (this.state.errorKind === 'insufficient') {
      const subject = this.state.errorSubject ?? this.state.config?.subject ?? 'This topic';
      const theme = this.state.errorTheme ?? this.state.config?.theme ?? '';
      const themeTitle =
        subject && theme ? getQuizThemeTitle(subject as Subject, theme as Theme) : theme;
      const themePillLabel =
        themeTitle && themeTitle !== theme ? `${theme} (${themeTitle})` : theme;

      return `
        <section class="panel centered-shell topic-unavailable-panel">
          <div class="empty-topic-icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
              <path d="M8 7h8"></path>
              <path d="M8 11h5"></path>
              <circle cx="16" cy="18" r="3"></circle>
              <path d="M16 17v1l1 .5"></path>
            </svg>
          </div>
          <div class="eyebrow eyebrow-coming-soon">Topic In Preparation</div>
          <h2 class="unavailable-title">Questions are on the way!</h2>
          <div class="unavailable-topic-pill">
            <span class="topic-pill-subject">${escapeHtml(subject)}</span>
            ${theme ? `<span class="topic-pill-divider">·</span><span class="topic-pill-theme">${escapeHtml(themePillLabel)}</span>` : ''}
          </div>
          <p class="lede unavailable-lede">
            The question bank for this module is currently being finalized and reviewed. Practice questions will be published here soon.
          </p>
          <p class="subtle unavailable-subtle">
            In the meantime, choose another theme or subject to keep practicing!
          </p>
          <div class="button-row unavailable-actions">
            <button class="button primary" type="button" data-action="back-themes">Choose another theme</button>
            <button class="button ghost" type="button" data-action="reset-setup">All subjects</button>
          </div>
        </section>
      `;
    }

    return `
      <section class="panel centered-shell topic-unavailable-panel">
        <div class="empty-topic-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="eyebrow eyebrow-coming-soon">Service Notice</div>
        <h2 class="unavailable-title">Unable to load questions</h2>
        <p class="lede unavailable-lede">
          We could not reach the question server at this moment. Please check your internet connection or try again shortly.
        </p>
        <div class="button-row unavailable-actions">
          <button class="button primary" type="button" data-action="retake">Try again</button>
          <button class="button ghost" type="button" data-action="reset-setup">Back to subjects</button>
        </div>
      </section>
    `;
  }

  private renderQuiz(): string {
    const question = this.state.questions[this.state.currentIndex];
    const quizTitle = getQuizThemeTitle(this.state.config?.subject, this.state.config?.theme);
    return `
      <section class="panel quiz-shell">
        <div class="quiz-topbar-centered">
          <h2 class="quiz-title-centered">${escapeHtml(quizTitle)}</h2>
          <div class="quiz-progress-centered">
            <div class="progress-copy">Question ${this.state.currentIndex + 1} of ${this.state.questions.length}</div>
            <div class="progress-bar" aria-hidden="true"><span style="width: ${(this.state.currentIndex / this.state.questions.length) * 100}%"></span></div>
          </div>
        </div>
        <article class="question-card">
          <div class="question-text">${renderMathText(question.question_text)}</div>
          <div class="options-grid">
            ${question.options
              .map((option, index) => {
                const isSelected = this.state.selectedIndex === index;
                const isCorrect = this.state.review ? index === question.correct_index : false;
                const isWrong = this.state.review ? isSelected && !this.state.review.isCorrect : false;
                const className = [
                  'option',
                  isSelected ? 'selected' : '',
                  isCorrect ? 'correct' : '',
                  isWrong ? 'wrong' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return `<button class="${className}" type="button" data-option-index="${index}" ${this.state.review ? 'disabled' : ''}>${renderMathText(option)}</button>`;
              })
              .join('')}
          </div>
          <div class="quiz-actions">
            ${
              this.state.review
                ? `<button class="button primary" type="button" data-action="next-question">${this.state.currentIndex === this.state.questions.length - 1 ? 'Finish quiz' : 'Next question'}</button>`
                : `<button class="button primary" type="button" data-action="submit-answer" ${this.state.selectedIndex === null ? 'disabled' : ''}>Submit answer</button>`
            }
            <button class="button ghost" type="button" data-action="abort-quiz">Exit quiz</button>
          </div>
          ${
            this.state.review
              ? `<div class="feedback ${this.state.review.isCorrect ? 'good' : 'bad'}"><strong>${this.state.review.isCorrect ? 'Correct' : 'Incorrect'}</strong><p>${renderMathText(this.state.review.explanation)}</p></div>`
              : '<p class="subtle">Select one option, then submit to reveal the correct answer immediately.</p>'
          }
        </article>
      </section>
    `;
  }

  private renderResults(): string {
    const result = this.state.result;
    if (!result) {
      return `<section class="panel centered-shell"><h2>No results available.</h2></section>`;
    }

    const verdictClass = result.percent >= passPercent ? 'good' : 'bad';
    const verdict = result.percent >= passPercent ? 'Pass' : 'Needs more work';
    const history = this.state.history && this.state.history.length > 0 ? this.state.history : loadHistory();
    const resultThemeTitle = getQuizThemeTitle(result.subject, result.theme);
    const resultThemeDisplay =
      resultThemeTitle && resultThemeTitle !== result.theme
        ? `${result.theme} (${resultThemeTitle})`
        : result.theme;

    return `
      <section class="results-stack">
        <article class="panel results-banner ${verdictClass}">
          <div class="eyebrow">Quiz completed</div>
          <h2>${verdict}</h2>
          <p class="lede">Your attempt for <strong>${escapeHtml(result.subject)}</strong> / <strong>${escapeHtml(resultThemeDisplay)}</strong> is complete.</p>
        </article>

        <section class="results-grid ${history.length <= 1 ? 'single-column' : ''}">
          <article class="panel result-hero ${verdictClass}">
            <div class="result-card-heading">
              <span class="result-badge-label">Current Attempt</span>
              <h3>Performance Summary</h3>
            </div>
            <div class="results-summary">
              <div class="summary-card">
                <span>Score</span>
                <strong>${result.score}/${result.total}</strong>
              </div>
              <div class="summary-card">
                <span>Percent</span>
                <strong>${formatPercent(result.percent)}</strong>
              </div>
              <div class="summary-card">
                <span>Time used</span>
                <strong>${formatDuration(result.time_used_seconds)}</strong>
              </div>
            </div>
            <p class="result-summary-copy">${
              result.percent >= passPercent
                ? 'Great job! You passed this theme with flying colors.'
                : 'Keep practicing! You can retake this theme or try another one.'
            }</p>
            <div class="result-actions">
              <button class="button primary" type="button" data-action="retake">Retake quiz</button>
              <div class="result-actions-secondary">
                <button class="button ghost" type="button" data-action="back-themes">Choose another theme</button>
                <button class="button ghost" type="button" data-action="change-subject">All subjects</button>
              </div>
            </div>
          </article>

          ${
            history.length > 1
              ? `
                <article class="panel history-panel">
                  <div class="history-header">
                    <div class="history-title-wrap">
                      <span class="result-badge-label">Your Track Record</span>
                      <h3>Recent Attempts</h3>
                    </div>
                    <span class="history-count-badge">${history.length} attempts</span>
                  </div>
                  <div class="history-list">
                    ${history
                      .map((item) => {
                        const isCurrent = item.id === result.id;
                        const itemVerdict = item.percent >= passPercent ? 'good' : 'bad';
                        const itemThemeTitle = getQuizThemeTitle(item.subject, item.theme);
                        const itemThemeDisplay =
                          itemThemeTitle && itemThemeTitle !== item.theme
                            ? `${item.theme}: ${itemThemeTitle}`
                            : item.theme;
                        return `
                          <div class="history-item ${isCurrent ? 'current-attempt' : ''}">
                            <div class="history-item-details">
                              <div class="history-item-title">
                                <strong>${escapeHtml(item.subject)}</strong>
                                ${isCurrent ? '<span class="history-current-pill">Latest</span>' : ''}
                              </div>
                              <div class="subtle history-item-meta">
                                ${escapeHtml(itemThemeDisplay)} · ${formatDateTime(item.created_at)} · ${formatDuration(item.time_used_seconds)}
                              </div>
                            </div>
                            <div class="history-score ${itemVerdict}">
                              ${item.score}/${item.total} · ${formatPercent(item.percent)}
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>
                </article>
              `
              : ''
          }
        </section>
      </section>
    `;
  }


  private onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const optionButton = target.closest<HTMLElement>('[data-option-index]');
    if (optionButton && this.state.phase === 'question' && !this.state.review) {
      this.setState({ selectedIndex: Number(optionButton.dataset.optionIndex) });
      return;
    }

    const actionButton = target.closest<HTMLElement>('[data-action]');
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;

    if (action === 'level-select') {
      const level = actionButton.dataset.level as QuizLevel | undefined;
      if (level && level !== this.state.selectedLevel) {
        this.setState({
          selectedLevel: level,
          selectedSubject: null,
        });
      }
      return;
    }

    if (action === 'subject-select') {
      const subject = actionButton.dataset.subject as Subject | undefined;
      if (!subject) {
        return;
      }

      this.setState({
        selectedSubject: subject,
        config: {
          subject,
          theme: this.state.config?.theme ?? themes[0],
        },
      });
      return;
    }

    if (action === 'back-subjects') {
      this.setState({ selectedSubject: null });
      return;
    }

    if (action === 'theme-select') {
      const theme = actionButton.dataset.theme as Theme | undefined;
      if (!theme) {
        return;
      }

      const subject = this.state.selectedSubject ?? this.state.config?.subject ?? defaultConfig().subject;
      void this.startQuiz({ subject, theme });
      return;
    }

    if (action === 'submit-answer') {
      void this.submitAnswer();
      return;
    }

    if (action === 'next-question') {
      void this.nextQuestion();
      return;
    }

    if (action === 'abort-quiz') {
      this.abortQuiz();
      return;
    }

    if (action === 'retake') {
      void this.startQuiz(this.state.config ?? defaultConfig());
      return;
    }

    if (action === 'back-themes') {
      document.body.classList.remove('quiz-fullscreen');
      const subject = this.state.errorSubject ?? this.state.config?.subject ?? this.state.selectedSubject;
      this.setState({
        phase: 'setup',
        selectedSubject: subject,
        questions: [],
        currentIndex: 0,
        selectedIndex: null,
        review: null,
        score: 0,
        startedAt: null,
        error: null,
        errorKind: undefined,
        errorSubject: undefined,
        errorTheme: undefined,
        result: null,
        busy: false,
      });
      return;
    }

    if (action === 'change-subject' || action === 'reset-setup') {
      document.body.classList.remove('quiz-fullscreen');
      this.setState({
        phase: 'setup',
        selectedSubject: null,
        questions: [],
        currentIndex: 0,
        selectedIndex: null,
        review: null,
        score: 0,
        startedAt: null,
        error: null,
        errorKind: undefined,
        errorSubject: undefined,
        errorTheme: undefined,
        result: null,
        busy: false,
      });
      return;
    }
  }

  private onSubmit(event: SubmitEvent): void {
    const form = event.target as HTMLFormElement | null;
    if (!form || form.id !== 'quiz-setup') {
      return;
    }

    event.preventDefault();
    const formData = new FormData(form);
    const subject = formData.get('subject');
    const theme = formData.get('theme');

    if (typeof subject !== 'string' || typeof theme !== 'string') {
      return;
    }

    void this.startQuiz({ subject: subject as Subject, theme: theme as Theme });
  }

  private async startQuiz(config: QuizConfig): Promise<void> {
    document.body.classList.add('quiz-fullscreen');
    this.setState({
      phase: 'loading',
      config,
      selectedSubject: config.subject,
      selectedLevel: level4Subjects.includes(config.subject) ? 'Level 4' : 'CIFS',
      error: null,
      errorKind: undefined,
      errorSubject: undefined,
      errorTheme: undefined,
      busy: true,
      result: null,
      questions: [],
      currentIndex: 0,
      selectedIndex: null,
      review: null,
      score: 0,
      startedAt: null,
    });

    saveConfig(config);

    if (!isSupabaseConfigured) {
      document.body.classList.remove('quiz-fullscreen');
      this.setState({
        phase: 'error',
        busy: false,
        errorKind: 'connection',
        error:
          'We could not connect to the question bank at this moment. Please check your connection or try again shortly.',
      });
      return;
    }


    try {
      const userId = getAnonymousSessionUserId();
      const pool = await loadQuestionPool(config.subject, config.theme);
      const questions = pickQuizQuestions(pool);
      this.state = {
        ...this.state,
        phase: 'question',
        userId,
        questions,
        currentIndex: 0,
        selectedIndex: null,
        review: null,
        score: 0,
        startedAt: Date.now(),
        error: null,
        errorKind: undefined,
        errorSubject: undefined,
        errorTheme: undefined,
        result: null,
        busy: false,
      };
      this.render();
    } catch (error) {
      document.body.classList.remove('quiz-fullscreen');
      if (error instanceof InsufficientQuestionsError) {
        this.setState({
          phase: 'error',
          busy: false,
          error: error.message,
          errorKind: 'insufficient',
          errorSubject: error.subject,
          errorTheme: error.theme,
        });
      } else {
        this.setState({
          phase: 'error',
          busy: false,
          error: error instanceof Error ? error.message : 'Unable to start quiz.',
          errorKind: 'generic',
        });
      }
    }
  }

  private abortQuiz(): void {
    document.body.classList.remove('quiz-fullscreen');
    this.setState({
      phase: 'setup',
      selectedSubject: null,
      questions: [],
      currentIndex: 0,
      selectedIndex: null,
      review: null,
      score: 0,
      startedAt: null,
      error: null,
      errorKind: undefined,
      errorSubject: undefined,
      errorTheme: undefined,
      result: null,
      busy: false,
    });
  }

  private async submitAnswer(): Promise<void> {
    if (this.state.selectedIndex === null || this.state.phase !== 'question') {
      return;
    }

    const question = this.state.questions[this.state.currentIndex];
    const isCorrect = this.state.selectedIndex === question.correct_index;
    const review: AnswerReview = {
      selectedIndex: this.state.selectedIndex,
      correctIndex: question.correct_index,
      isCorrect,
      explanation: question.explanation,
    };

    this.setState({
      phase: 'review',
      review,
      score: this.state.score + (isCorrect ? 1 : 0),
    });
  }

  private async nextQuestion(): Promise<void> {
    if (this.state.phase !== 'review') {
      return;
    }

    if (this.state.currentIndex >= this.state.questions.length - 1) {
      await this.finishQuiz('completed');
      return;
    }

    this.setState({
      phase: 'question',
      currentIndex: this.state.currentIndex + 1,
      selectedIndex: null,
      review: null,
    });
  }

  private async finishQuiz(_reason: 'timeout' | 'completed'): Promise<void> {
    if (!this.state.startedAt || !this.state.userId) {
      return;
    }

    const result: ResultRow = {
      id: uid(),
      user_id: this.state.userId,
      subject: this.state.config?.subject ?? subjects[0],
      theme: this.state.config?.theme ?? themes[0],
      score: this.state.score,
      total: this.state.questions.length,
      percent: Math.round((this.state.score / this.state.questions.length) * 100),
      time_used_seconds: Math.max(0, Math.round((Date.now() - this.state.startedAt) / 1000)),
      created_at: new Date().toISOString(),
    };

    const history = saveHistoryResult(result);

    this.state = {
      ...this.state,
      phase: 'results',
      busy: false,
      result,
      history,
    };
    this.render();

    // Result display is local-only; nothing is written to Supabase.
  }
}

