// Pure mock exam helpers. No runtime imports, so they can be unit tested straight from Node.

export const MOCK_EXAM_TITLE_MAX = 80;
export const MOCK_EXAM_MIN_QUESTIONS = 5;
export const MOCK_EXAM_MAX_QUESTIONS = 100;
export const MOCK_EXAM_DEFAULT_QUESTIONS = 25;

export interface MockExamInput {
  title: string;
  after_theme: number;
  source_themes: string[];
  question_count: number;
}

export type MockExamValidation =
  | { ok: true; value: MockExamInput }
  | { ok: false; error: string };

/**
 * Validates and cleans raw form values. `validThemes` is the ordered theme list
 * (so the stored source themes come out in syllabus order, without duplicates).
 */
export function normalizeMockExamInput(
  raw: { title: unknown; after_theme: unknown; source_themes: unknown; question_count: unknown },
  validThemes: readonly string[],
): MockExamValidation {
  const title = typeof raw.title === 'string' ? raw.title.trim().replace(/\s+/g, ' ') : '';
  if (!title) {
    return { ok: false, error: 'Give the mock exam a title.' };
  }
  if ([...title].length > MOCK_EXAM_TITLE_MAX) {
    return { ok: false, error: `Title must be ${MOCK_EXAM_TITLE_MAX} characters or fewer.` };
  }

  const afterTheme = Number(raw.after_theme);
  if (!Number.isInteger(afterTheme) || afterTheme < 0 || afterTheme > validThemes.length) {
    return { ok: false, error: 'Choose where the mock exam goes in the theme list.' };
  }

  const picked = new Set(Array.isArray(raw.source_themes) ? raw.source_themes.map(String) : []);
  const sourceThemes = validThemes.filter((theme) => picked.has(theme));
  if (sourceThemes.length === 0) {
    return { ok: false, error: 'Pick at least one theme for the mock exam to draw questions from.' };
  }

  const questionCount = Number(raw.question_count);
  if (
    !Number.isInteger(questionCount) ||
    questionCount < MOCK_EXAM_MIN_QUESTIONS ||
    questionCount > MOCK_EXAM_MAX_QUESTIONS
  ) {
    return {
      ok: false,
      error: `Number of questions must be a whole number from ${MOCK_EXAM_MIN_QUESTIONS} to ${MOCK_EXAM_MAX_QUESTIONS}.`,
    };
  }

  return {
    ok: true,
    value: {
      title,
      after_theme: afterTheme,
      source_themes: sourceThemes,
      question_count: questionCount,
    },
  };
}

/**
 * Picks `count` questions, spreading them as evenly as the pools allow across themes
 * (round-robin over shuffled per-theme pools), then shuffles the final order.
 * Returns fewer than `count` only when the combined pool is smaller than `count`.
 */
export function pickBalancedQuestions<T extends { theme: string }>(
  questions: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const shuffled = <U>(items: readonly U[]): U[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const byTheme = new Map<string, T[]>();
  for (const question of questions) {
    const bucket = byTheme.get(question.theme);
    if (bucket) bucket.push(question);
    else byTheme.set(question.theme, [question]);
  }

  // Randomise which themes get the "extra" question when count isn't divisible by theme count.
  const buckets = shuffled([...byTheme.values()]).map((bucket) => shuffled(bucket));
  const picked: T[] = [];
  let round = 0;
  while (picked.length < count) {
    let tookAny = false;
    for (const bucket of buckets) {
      if (picked.length >= count) break;
      if (round < bucket.length) {
        picked.push(bucket[round]);
        tookAny = true;
      }
    }
    if (!tookAny) break;
    round += 1;
  }
  return shuffled(picked);
}

function themeNumber(theme: string): number | null {
  const match = /^Theme (\d+)$/.exec(theme);
  return match ? Number(match[1]) : null;
}

/** "Themes 1–4", "Themes 1, 3, 5", "Theme 2" — compact label for the themes an exam covers. */
export function describeCoverage(sourceThemes: readonly string[]): string {
  const numbers = sourceThemes
    .map(themeNumber)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  const unique = [...new Set(numbers)];
  if (unique.length === 0) return '';
  if (unique.length === 1) return `Theme ${unique[0]}`;

  const ranges: string[] = [];
  let start = unique[0];
  let prev = unique[0];
  for (let i = 1; i <= unique.length; i += 1) {
    const current = unique[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    ranges.push(start === prev ? `${start}` : prev === start + 1 ? `${start}, ${prev}` : `${start}–${prev}`);
    start = current;
    prev = current;
  }
  return `Themes ${ranges.join(', ')}`;
}
