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

function renderQuestionRow(question: Question, isEditing: boolean): string {
  const letters = ['A', 'B', 'C', 'D'];
  return `
    <article class="question-card-item ${isEditing ? 'editing' : ''}">
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
              <span class="stat-value">${totalQuestions}</span>
            </div>
            <div class="stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
            </div>
          </article>
          <article class="admin-stat-card">
            <div class="stat-content">
              <span class="stat-label">Visible Questions</span>
              <span class="stat-value">${visibleCount}</span>
            </div>
            <div class="stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
          </article>
          <article class="admin-stat-card">
            <div class="stat-content">
              <span class="stat-label">Active Filter</span>
              <span class="stat-filter-value">${escapeHtml(state.filterSubject)} · ${escapeHtml(state.filterTheme)}</span>
            </div>
            <div class="stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            </div>
          </article>
        </section>

        <section class="admin-workspace">
          <!-- Left Column: Form & Bulk Import -->
          <aside class="admin-sidebar">
            <article class="admin-panel">
              <div class="admin-panel-head">
                <div>
                  <h2>${state.editingId ? 'Edit Question' : 'Add Question'}</h2>
                  <p>${state.editingId ? 'Updating existing syllabus item' : 'Create a single question with options'}</p>
                </div>
              </div>
              <div class="admin-panel-body">
                <form id="question-form" class="admin-form" data-mode="${state.editingId ? 'edit' : 'add'}">
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
                    <textarea name="question_text" rows="3" placeholder="Enter clear, concise question..." required></textarea>
                  </label>

                  <div class="field-group">
                    <div class="field-group-title">Options & Correct Answer</div>
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
                    <textarea name="explanation" rows="3" placeholder="Explain why this answer is correct..." required></textarea>
                  </label>

                  <div class="form-actions">
                    <button class="button primary" type="submit">${state.editingId ? 'Save changes' : 'Add question'}</button>
                    ${state.editingId ? '<button class="button ghost" type="button" data-action="cancel-edit">Cancel</button>' : ''}
                  </div>
                  ${state.error ? `<p class="feedback bad"><strong>Error</strong><span>${escapeHtml(state.error)}</span></p>` : ''}
                </form>
              </div>
            </article>

            <!-- Distinct Bulk Import Card -->
            <article class="bulk-import-card">
              <div class="bulk-import-header">
                <h3>Bulk JSON Import</h3>
              </div>
              <p class="bulk-import-desc">
                Batch upload multiple questions at once using a standardized JSON file.
              </p>
              <div class="bulk-actions-row">
                <label class="bulk-file-btn">
                  <span>Upload JSON</span>
                  <input id="bulk-import-file" class="bulk-import-input" type="file" accept="application/json,.json" />
                </label>
                <button class="bulk-template-link" type="button" data-action="bulk-import-template">Download sample template</button>
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

      state.busy = true;
      state.error = null;
      render();

      void supabase.auth
        .signInWithPassword({ email, password })
        .then(({ data, error }) => {
          state.busy = false;
          if (error) {
            state.phase = 'login';
            state.error = error.message;
            render();
            return;
          }

          state.phase = 'dashboard';
          state.userEmail = data.user?.email ?? email;
          state.error = null;
          void refresh();
        })
        .catch((error: unknown) => {
          state.busy = false;
          state.phase = 'login';
          state.error = error instanceof Error ? error.message : 'Sign in failed.';
          render();
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
        state.error = 'Fill out every field before saving.';
        render();
        return;
      }

      state.busy = true;
      state.error = null;
      render();

      const request = state.editingId
        ? supabase.from('questions').update({
            subject: payload.subject,
            theme: payload.theme,
            question_text: payload.question_text,
            options: payload.options,
            correct_index: payload.correct_index,
            explanation: payload.explanation,
          }).eq('id', state.editingId)
        : supabase.from('questions').insert({
            subject: payload.subject,
            theme: payload.theme,
            question_text: payload.question_text,
            options: payload.options,
            correct_index: payload.correct_index,
            explanation: payload.explanation,
          });

      void request.then(async ({ error }) => {
        state.busy = false;
        if (error) {
          state.error = error.message;
          render();
          return;
        }

        state.editingId = null;
        await refresh();
        const formElement = root.querySelector<HTMLFormElement>('#question-form');
        if (formElement) {
          formElement.reset();
          fillQuestionForm(formElement, defaultQuestionForm);
        }
      });
    }
  });

  root.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }

    if (input.id === 'bulk-import-file' && input.files?.length) {
      const file = input.files[0];
      state.busy = true;
      state.error = null;
      render();

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

          await refresh();
          input.value = '';
        })
        .catch((error: unknown) => {
          state.busy = false;
          state.error = error instanceof Error ? error.message : 'Bulk import failed.';
          render();
          input.value = '';
        });
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
      void supabase.auth.signOut().then(() => {
        state.phase = 'login';
        state.userEmail = null;
        state.editingId = null;
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

      void supabase.from('questions').delete().eq('id', id).then(async ({ error }) => {
        if (error) {
          state.error = error.message;
          render();
          return;
        }

        await refresh();
      });
      return;
    }

    if (action.dataset.action === 'edit-question') {
      const id = action.dataset.id;
      if (!id) {
        return;
      }

      state.editingId = id;
      const question = state.questions.find((item) => item.id === id);
      if (!question) {
        return;
      }

      render();
      const form = root.querySelector<HTMLFormElement>('#question-form');
      if (form) {
        fillQuestionForm(form, questionToForm(question));
      }
      return;
    }

    if (action.dataset.action === 'cancel-edit') {
      state.editingId = null;
      render();
      const form = root.querySelector<HTMLFormElement>('#question-form');
      if (form) {
        form.reset();
        fillQuestionForm(form, defaultQuestionForm);
      }
      return;
    }
  });

  root.addEventListener('change', (event) => {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }

    if (select.id === 'filter-subject') {
      state.filterSubject = select.value as AdminState['filterSubject'];
      render();
      return;
    }

    if (select.id === 'filter-theme') {
      state.filterTheme = select.value as AdminState['filterTheme'];
      render();
    }
  });

  root.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.id !== 'filter-search') {
      return;
    }

    state.searchTerm = input.value;
    const search = state.searchTerm.trim().toLowerCase();
    const filtered = state.questions.filter((question) => {
      const subjectMatch = state.filterSubject === 'All' || question.subject === state.filterSubject;
      const themeMatch = state.filterTheme === 'All' || question.theme === state.filterTheme;
      const searchMatch =
        !search ||
        question.question_text.toLowerCase().includes(search) ||
        question.explanation.toLowerCase().includes(search) ||
        question.options.some((opt) => opt.toLowerCase().includes(search));
      return subjectMatch && themeMatch && searchMatch;
    });

    const feed = root.querySelector('#question-feed-container');
    const countDisplay = root.querySelector('#library-count-display');
    if (feed) {
      feed.innerHTML = filtered.length > 0
        ? filtered.map((q) => renderQuestionRow(q, state.editingId === q.id)).join('')
        : `
          <div class="empty-state-box">
            <h3>No matching questions</h3>
            <p>Try modifying your search or filters, or add a new question using the form on the left.</p>
          </div>
        `;
    }
    if (countDisplay) {
      countDisplay.innerHTML = `Showing <strong>${filtered.length}</strong> of ${state.questions.length}`;
    }
  });
}
