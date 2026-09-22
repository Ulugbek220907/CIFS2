import { isSupabaseConfigured, supabase } from './supabase';
import { clearNode, escapeHtml, formatDuration, formatPercent, shuffle, uid } from './dom';
import {
  cifsSubjects,
  getQuizThemeTitle,
  level4Subjects,
  passPercent,
  quizLength,
  subjectShortName,
  subjects,
  themes,
} from './constants';
import { readSession, writeSession } from './storage';
import type { AnswerReview, Question, ResultRow, Subject, Theme } from './types';

export type QuizLevel = 'CIFS' | 'Level 4';

interface QuizConfig {
  subject: Subject;
  theme: Theme;
}

type QuizPhase = 'setup' | 'loading' | 'question' | 'review' | 'results' | 'error';

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
  result: ResultRow | null;
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
            <button class="level-tab locked" type="button" disabled>Level 5 🔒</button>
            <button class="level-tab locked" type="button" disabled>Level 6 🔒</button>
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
    if (!result) {
      return `<section class="panel centered-shell"><h2>No results available.</h2></section>`;
    }

    const verdictClass = result.percent >= passPercent ? 'good' : 'bad';
    const verdict = result.percent >= passPercent ? 'Pass' : 'Needs more work';

    return `
      <section class="results-stack">
        <article class="panel results-banner ${verdictClass}">
          <div class="eyebrow">Quiz completed</div>
          <h2>${verdict}</h2>
          <p class="lede">Your attempt for <strong>${escapeHtml(result.subject)}</strong> / <strong>${escapeHtml(result.theme)}</strong> is complete.</p>
        </article>

        <section class="grid two-up results-grid">
          <article class="panel result-hero ${verdictClass}">
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
            <p class="result-summary-copy">${result.percent >= passPercent ? 'You passed this theme.' : 'You can retake this theme to improve your score.'}</p>
            <div class="result-actions">
              <button class="button primary" type="button" data-action="retake">Retake quiz</button>
              <button class="button ghost" type="button" data-action="change-subject">Pick another subject</button>
            </div>
          </article>
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
      selectedSubject: null,
      selectedLevel: level4Subjects.includes(config.subject) ? 'Level 4' : 'CIFS',
      error: null,
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
        error:
          'Supabase API kalitlari (VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY) Netlify parametrlariga kiritilmagan. Iltimos, Netlify Environment Variables bo\'limiga kalitlarni kiriting va qayta deploy qiling.',
      });
      return;
    }

    try {
      const userId = await ensureAnonymousUser();
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
        result: null,
        busy: false,
      };
      this.render();
    } catch (error) {
      document.body.classList.remove('quiz-fullscreen');
      this.setState({
        phase: 'error',
        busy: false,
        error: error instanceof Error ? error.message : 'Unable to start quiz.',
      });
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

    this.state = {
      ...this.state,
      phase: 'results',
      busy: false,
      result,
    };
    this.render();

    // Result display is local-only; nothing is written to Supabase.
  }
}
