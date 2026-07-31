import { supabase } from '../supabase';
import { clearNode, escapeHtml } from '../dom';
import { difficulties, subjects } from '../constants';
import type { Difficulty, Question, Subject } from '../types';
import '../admin.css';

type AdminPhase = 'loading' | 'login' | 'dashboard';

interface AdminState {
  phase: AdminPhase;
  userEmail: string | null;
  error: string | null;
  busy: boolean;
  questions: Question[];
  filterSubject: Subject | 'All';
  filterDifficulty: Difficulty | 'All';
  editingId: string | null;
}

interface QuestionFormValues {
  subject: Subject;
  difficulty: Difficulty;
  question_text: string;
  option_0: string;
  option_1: string;
  option_2: string;
  option_3: string;
  correct_index: string;
  explanation: string;
}

const defaultQuestionForm: QuestionFormValues = {
  subject: subjects[0],
  difficulty: difficulties[0],
  question_text: '',
  option_0: '',
  option_1: '',
  option_2: '',
  option_3: '',
  correct_index: '0',
  explanation: '',
};

function isAdminUserEmail(email: string | null | undefined): boolean {
  return Boolean(email);
}

function questionToForm(question: Question): QuestionFormValues {
  return {
    subject: question.subject,
    difficulty: question.difficulty,
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
  const difficulty = form.elements.namedItem('difficulty') as HTMLSelectElement | null;
  const questionText = form.elements.namedItem('question_text') as HTMLTextAreaElement | HTMLInputElement | null;
  const explanation = form.elements.namedItem('explanation') as HTMLTextAreaElement | HTMLInputElement | null;
  const correctIndex = form.elements.namedItem('correct_index') as HTMLSelectElement | null;

  if (subject) subject.value = values.subject;
  if (difficulty) difficulty.value = values.difficulty;
  if (questionText) questionText.value = values.question_text;
  if (explanation) explanation.value = values.explanation;
  if (correctIndex) correctIndex.value = values.correct_index;

  (['option_0', 'option_1', 'option_2', 'option_3'] as const).forEach((field) => {
    const element = form.elements.namedItem(field) as HTMLInputElement | null;
    if (element) {
      element.value = values[field];
    }
  });
}

function renderQuestionRow(question: Question, isEditing: boolean): string {
  return `
    <article class="question-row ${isEditing ? 'editing' : ''}">
      <div class="question-row-head">
        <div>
          <strong>${escapeHtml(question.subject)}</strong>
          <div class="subtle">${escapeHtml(question.difficulty)}</div>
        </div>
        <div class="row-actions">
          <button class="button ghost" type="button" data-action="edit-question" data-id="${question.id}">Edit</button>
          <button class="button ghost danger" type="button" data-action="delete-question" data-id="${question.id}">Delete</button>
        </div>
      </div>
      <p>${escapeHtml(question.question_text)}</p>
      <div class="option-preview">
        ${question.options
          .map((option, index) => `<span class="option-chip ${index === question.correct_index ? 'correct' : ''}">${escapeHtml(option)}</span>`)
          .join('')}
      </div>
      <p class="subtle">${escapeHtml(question.explanation)}</p>
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
    filterDifficulty: 'All',
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
            <p class="subtle">Only pre-created Supabase accounts can log in. Anonymous sessions and public visitors stay on the login form.</p>
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

    const visibleQuestions = state.questions.filter((question) => {
      const subjectMatch = state.filterSubject === 'All' || question.subject === state.filterSubject;
      const difficultyMatch = state.filterDifficulty === 'All' || question.difficulty === state.filterDifficulty;
      return subjectMatch && difficultyMatch;
    });

    root.innerHTML = `
      <section class="admin-shell">
        <header class="admin-header panel">
          <div>
            <div class="eyebrow">Admin</div>
            <h1>Question bank</h1>
          </div>
          <div class="admin-session">
            <span>${escapeHtml(state.userEmail ?? '')}</span>
            <button class="button ghost" type="button" data-action="sign-out">Sign out</button>
          </div>
        </header>

        <section class="grid two-up admin-grid">
          <article class="panel">
            <h2>${state.editingId ? 'Edit question' : 'Add question'}</h2>
            <form id="question-form" class="admin-form compact" data-mode="${state.editingId ? 'edit' : 'add'}">
              <div class="field-grid">
                <label>
                  <span>Subject</span>
                  <select name="subject" required>
                    ${subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('')}
                  </select>
                </label>
                <label>
                  <span>Difficulty</span>
                  <select name="difficulty" required>
                    ${difficulties.map((difficulty) => `<option value="${difficulty}">${difficulty}</option>`).join('')}
                  </select>
                </label>
              </div>
              <label>
                <span>Question</span>
                <textarea name="question_text" rows="4" required></textarea>
              </label>
              <div class="field-grid four-up">
                <label><span>Option 1</span><input name="option_0" type="text" required /></label>
                <label><span>Option 2</span><input name="option_1" type="text" required /></label>
                <label><span>Option 3</span><input name="option_2" type="text" required /></label>
                <label><span>Option 4</span><input name="option_3" type="text" required /></label>
              </div>
              <div class="field-grid">
                <label>
                  <span>Correct answer</span>
                  <select name="correct_index" required>
                    <option value="0">Option 1</option>
                    <option value="1">Option 2</option>
                    <option value="2">Option 3</option>
                    <option value="3">Option 4</option>
                  </select>
                </label>
                <label>
                  <span>Explanation</span>
                  <textarea name="explanation" rows="4" required></textarea>
                </label>
              </div>
              <div class="button-row">
                <button class="button primary" type="submit">${state.editingId ? 'Save changes' : 'Add question'}</button>
                ${state.editingId ? '<button class="button ghost" type="button" data-action="cancel-edit">Cancel</button>' : ''}
              </div>
              ${state.error ? `<p class="feedback bad"><strong>Error</strong><span>${escapeHtml(state.error)}</span></p>` : ''}
            </form>
          </article>

          <article class="panel">
            <div class="list-toolbar">
              <h2>Questions</h2>
              <div class="filter-row">
                <select id="filter-subject" aria-label="Filter by subject">
                  <option value="All">All subjects</option>
                  ${subjects.map((subject) => `<option value="${escapeHtml(subject)}" ${state.filterSubject === subject ? 'selected' : ''}>${escapeHtml(subject)}</option>`).join('')}
                </select>
                <select id="filter-difficulty" aria-label="Filter by difficulty">
                  <option value="All">All difficulties</option>
                  ${difficulties.map((difficulty) => `<option value="${difficulty}" ${state.filterDifficulty === difficulty ? 'selected' : ''}>${difficulty}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="question-list">
              ${visibleQuestions.length ? visibleQuestions.map((question) => renderQuestionRow(question, state.editingId === question.id)).join('') : '<p class="subtle">No questions match the current filters.</p>'}
            </div>
          </article>
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
      .select('id, subject, difficulty, question_text, options, correct_index, explanation, created_at')
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
        difficulty: String(data.get('difficulty') ?? '') as Difficulty,
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
            difficulty: payload.difficulty,
            question_text: payload.question_text,
            options: payload.options,
            correct_index: payload.correct_index,
            explanation: payload.explanation,
          }).eq('id', state.editingId)
        : supabase.from('questions').insert({
            subject: payload.subject,
            difficulty: payload.difficulty,
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

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const action = target.closest<HTMLElement>('[data-action]');
    if (!action) {
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

    if (select.id === 'filter-difficulty') {
      state.filterDifficulty = select.value as AdminState['filterDifficulty'];
      render();
    }
  });
}
