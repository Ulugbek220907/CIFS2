import { supabase } from './supabase';
import { clearNode, escapeHtml, formatDuration, formatPercent, shuffle, uid } from './dom';
import { passPercent, quizDurationSeconds, quizLength, subjects, themes } from './constants';
import { readSession, writeSession } from './storage';
import type { AnswerReview, Question, ResultRow, Subject, Theme } from './types';

interface QuizHistoryItem extends ResultRow {}

interface QuizConfig {
  subject: Subject;
  theme: Theme;
}

type QuizPhase = 'setup' | 'loading' | 'question' | 'review' | 'results' | 'error';

interface QuizState {
  phase: QuizPhase;
  config: QuizConfig | null;
  selectedSubject: Subject | null;
  userId: string | null;
  questions: Question[];
  currentIndex: number;
  selectedIndex: number | null;
  review: AnswerReview | null;
  score: number;
  startedAt: number | null;
  deadlineAt: number | null;
  timeLeft: number;
  error: string | null;
  result: ResultRow | null;
  history: QuizHistoryItem[];
  busy: boolean;
}

const activeConfigKey = 'last-config';
const questionCachePrefix = 'question-pool:';
const poolCacheTtlMs = 1000 * 60 * 60 * 8;

function defaultConfig(): QuizConfig {
  return {
    subject: subjects[0],
    theme: themes[0],
  };
}

function subjectShortName(subject: Subject): string {
  switch (subject) {
    case 'Quantitative Methods':
      return 'QM';
    case 'Academic Communication Skills':
      return 'ACS';
    case 'Professional Skills & Employability':
      return 'PSE';
    case 'Critical Thinking & Citizenship':
      return 'CTC';
    case 'Foundations of Economics':
      return 'FoE';
    case 'Understanding Finance':
      return 'UF';
  }
}

function getQuestionCacheKey(subject: Subject, theme: Theme): string {
  return `${questionCachePrefix}${subject}::${theme}`;
}

function loadConfig(): QuizConfig {
  const saved = readSession<QuizConfig>(activeConfigKey);
  if (!saved) {
    return defaultConfig();
  }

  if (!subjects.includes(saved.subject) || !themes.includes(saved.theme)) {
    return defaultConfig();
  }

  return saved;
}

function saveConfig(config: QuizConfig): void {
  writeSession(activeConfigKey, config);
}

async function ensureAnonymousUser(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id) {
    return data.session.user.id;
  }

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(error.message);
  }

  const userId = signInData.user?.id;
  if (!userId) {
    throw new Error('Anonymous session could not be created.');
  }

  return userId;
}

async function loadQuestionPool(subject: Subject, theme: Theme): Promise<Question[]> {
  const cacheKey = getQuestionCacheKey(subject, theme);
  const cached = readSession<{ createdAt: number; pool: Question[] }>(cacheKey);
  if (cached && Date.now() - cached.createdAt < poolCacheTtlMs && cached.pool.length >= quizLength) {
    return cached.pool;
  }

  const { data, error } = await supabase
    .from('questions')
    .select('id, subject, theme, question_text, options, correct_index, explanation, created_at')
    .eq('subject', subject)
    .eq('theme', theme)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const pool = (data ?? []) as Question[];
  if (pool.length < quizLength) {
    throw new Error(`Not enough questions for ${subject} / ${theme}. Add at least ${quizLength} questions.`);
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
  private timerId: number | null = null;
  private readonly handleClick = (event: MouseEvent) => this.onClick(event);
  private readonly handleSubmit = (event: SubmitEvent) => this.onSubmit(event);

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = {
      phase: 'setup',
      config: loadConfig(),
      selectedSubject: null,
      userId: null,
      questions: [],
      currentIndex: 0,
      selectedIndex: null,
      review: null,
      score: 0,
      startedAt: null,
      deadlineAt: null,
      timeLeft: quizDurationSeconds,
      error: null,
      result: null,
      history: [],
      busy: false,
    };
  }

  mount(): void {
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('submit', this.handleSubmit);
    this.render();
  }

  destroy(): void {
    this.stopTimer();
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
    return `
      <section class="quiz-flow">
        <section id="subject-selection-step" class="subject-step ${activeSubject ? 'is-hidden' : ''}">
          <nav class="level-nav" aria-label="Quiz levels">
            <button class="level-tab active" type="button">CIFS</button>
            <button class="level-tab locked" type="button" disabled>Level 4 🔒</button>
            <button class="level-tab locked" type="button" disabled>Level 5 🔒</button>
            <button class="level-tab locked" type="button" disabled>Level 6 🔒</button>
          </nav>
          <div class="subjects-grid">
            ${subjects
              .map(
                (subject) => `
                  <button class="subject-card" type="button" data-action="subject-select" data-subject="${escapeHtml(subject)}">
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
            ${themes
              .map(
                (theme) => `
                  <button class="theme-btn" type="button" data-action="theme-select" data-theme="${theme}">
                    ${theme}
                  </button>
                `,
              )
              .join('')}
          </div>
        </section>
      </section>
    `;
  }

  private renderLoading(): string {
    const label = this.state.busy ? 'Preparing your quiz and signing you in anonymously.' : 'Loading...';
    return `
      <section class="panel centered-shell">
        <div class="spinner" aria-hidden="true"></div>
        <h2>${label}</h2>
        <p class="subtle">This only happens when the selected subject and theme are not already cached for the current session.</p>
      </section>
    `;
  }

  private renderError(): string {
    return `
      <section class="panel centered-shell">
        <div class="eyebrow danger">Quiz unavailable</div>
        <h2>Something blocked the quiz flow.</h2>
        <p class="lede">${escapeHtml(this.state.error ?? 'Unknown error')}</p>
        <button class="button primary" data-action="reset-setup">Back to setup</button>
      </section>
    `;
  }

  private renderQuiz(): string {
    const question = this.state.questions[this.state.currentIndex];
    const timerClass = this.state.timeLeft <= 60 ? 'timer danger' : 'timer';
    return `
      <section class="panel quiz-shell">
        <div class="quiz-topbar">
          <div>
            <div class="eyebrow">${escapeHtml(this.state.config?.subject ?? '')}</div>
            <h2>${escapeHtml(this.state.config?.theme ?? '')}</h2>
          </div>
          <div class="progress-wrap">
            <div class="progress-copy">Question ${this.state.currentIndex + 1} of ${this.state.questions.length}</div>
            <div class="progress-bar" aria-hidden="true"><span style="width: ${(this.state.currentIndex / this.state.questions.length) * 100}%"></span></div>
          </div>
          <div class="${timerClass}" aria-live="polite">${formatDuration(this.state.timeLeft)}</div>
        </div>
        <article class="question-card">
          <div class="question-text">${escapeHtml(question.question_text)}</div>
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

                return `<button class="${className}" type="button" data-option-index="${index}" ${this.state.review ? 'disabled' : ''}>${escapeHtml(option)}</button>`;
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
              ? `<div class="feedback ${this.state.review.isCorrect ? 'good' : 'bad'}"><strong>${this.state.review.isCorrect ? 'Correct' : 'Incorrect'}</strong><p>${escapeHtml(this.state.review.explanation)}</p></div>`
              : '<p class="subtle">Select one option, then submit to reveal the correct answer immediately.</p>'
          }
        </article>
      </section>
    `;
  }

  private renderResults(): string {
    const result = this.state.result;
    const history = this.state.history;
    if (!result) {
      return `<section class="panel centered-shell"><h2>No results available.</h2></section>`;
    }

    const verdictClass = result.percent >= passPercent ? 'good' : 'bad';
    const verdict = result.percent >= passPercent ? 'Pass' : 'Needs more work';

    return `
      <section class="grid two-up results-grid">
        <article class="panel result-hero ${verdictClass}">
          <div class="eyebrow">Results</div>
          <h2>${verdict}</h2>
          <p class="lede">You scored <strong>${result.score}/${result.total}</strong> (${formatPercent(result.percent)}). Time used: <strong>${formatDuration(result.time_used_seconds)}</strong>.</p>
          <div class="result-actions">
            <button class="button primary" type="button" data-action="retake">Retake quiz</button>
            <button class="button ghost" type="button" data-action="change-subject">Pick another subject</button>
          </div>
        </article>
        <article class="panel history-panel">
          <h3>Last 10 attempts</h3>
          <div class="history-list">
            ${
              history.length
                ? history
                    .map(
                      (item) => `
                        <div class="history-item">
                          <div>
                            <strong>${escapeHtml(item.subject)}</strong>
                            <div class="subtle">${escapeHtml(item.theme)} · ${formatDateTime(item.created_at)}</div>
                          </div>
                          <div class="history-score">${item.score}/${item.total} · ${formatPercent(item.percent)}</div>
                        </div>
                      `,
                    )
                    .join('')
                : '<p class="subtle">No saved attempts yet.</p>'
            }
          </div>
        </article>
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

    if (action === 'change-subject' || action === 'reset-setup') {
      this.stopTimer();
      this.setState({
        phase: 'setup',
        selectedSubject: null,
        questions: [],
        currentIndex: 0,
        selectedIndex: null,
        review: null,
        score: 0,
        startedAt: null,
        deadlineAt: null,
        timeLeft: quizDurationSeconds,
        error: null,
        result: null,
        history: [],
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
    this.stopTimer();
    this.setState({
      phase: 'loading',
      config,
      selectedSubject: null,
      error: null,
      busy: true,
      history: [],
      result: null,
      questions: [],
      currentIndex: 0,
      selectedIndex: null,
      review: null,
      score: 0,
      startedAt: null,
      deadlineAt: null,
      timeLeft: quizDurationSeconds,
    });

    saveConfig(config);

    try {
      const userId = await ensureAnonymousUser();
      const pool = await loadQuestionPool(config.subject, config.theme);
      const questions = pickQuizQuestions(pool);
      const now = Date.now();
      this.state = {
        ...this.state,
        phase: 'question',
        userId,
        questions,
        currentIndex: 0,
        selectedIndex: null,
        review: null,
        score: 0,
        startedAt: now,
        deadlineAt: now + quizDurationSeconds * 1000,
        timeLeft: quizDurationSeconds,
        error: null,
        result: null,
        history: [],
        busy: false,
      };
      this.startTimer();
      this.render();
    } catch (error) {
      this.stopTimer();
      this.setState({
        phase: 'error',
        busy: false,
        error: error instanceof Error ? error.message : 'Unable to start quiz.',
      });
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = window.setInterval(() => {
      if (!this.state.deadlineAt) {
        return;
      }

      const timeLeft = Math.max(0, Math.ceil((this.state.deadlineAt - Date.now()) / 1000));
      if (timeLeft !== this.state.timeLeft) {
        this.state = { ...this.state, timeLeft };
        this.render();
      }

      if (timeLeft === 0) {
        void this.finishQuiz('timeout');
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private abortQuiz(): void {
    this.stopTimer();
    this.setState({
      phase: 'setup',
      selectedSubject: null,
      questions: [],
      currentIndex: 0,
      selectedIndex: null,
      review: null,
      score: 0,
      startedAt: null,
      deadlineAt: null,
      timeLeft: quizDurationSeconds,
      error: null,
      result: null,
      history: [],
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

    this.stopTimer();
    const result: ResultRow = {
      id: uid(),
      user_id: this.state.userId,
      subject: this.state.config?.subject ?? subjects[0],
      theme: this.state.config?.theme ?? themes[0],
      score: this.state.score,
      total: this.state.questions.length,
      percent: Math.round((this.state.score / this.state.questions.length) * 100),
      time_used_seconds: Math.min(
        quizDurationSeconds,
        Math.max(0, Math.round((Date.now() - this.state.startedAt) / 1000)),
      ),
      created_at: new Date().toISOString(),
    };

    this.state = {
      ...this.state,
      phase: 'loading',
      busy: true,
      result,
    };
    this.render();

    try {
      const { error } = await supabase.from('results').insert(result);
      if (error) {
        throw error;
      }

      const { data, error: historyError } = await supabase
        .from('results')
        .select('id, user_id, subject, theme, score, total, percent, time_used_seconds, created_at')
        .eq('user_id', this.state.userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (historyError) {
        throw historyError;
      }

      this.state = {
        ...this.state,
        phase: 'results',
        busy: false,
        history: (data ?? []) as QuizHistoryItem[],
      };
      this.render();
    } catch (error) {
      this.state = {
        ...this.state,
        phase: 'results',
        busy: false,
        history: [],
        error: error instanceof Error ? error.message : 'Could not save results.',
      };
      this.render();
    }
  }
}
