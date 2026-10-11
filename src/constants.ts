import type { MockExam, Subject, Theme } from './types';

export const cifsSubjects: Subject[] = [
  'Quantitative Methods',
  'Academic Communication Skills',
  'Professional Skills & Employability',
  'Critical Thinking & Citizenship',
  'Introduction to Business and Economics',
  'Understanding Finance',
];

export const level4Subjects: Subject[] = [
  'Math for Eco',
  'Exploring Economics',
  'Contemporary Issues in Global Economy',
  'Financial Accounting',
  'Fundamentals of Statistics',
  'Essentials of Economics',
];

export const subjects: Subject[] = [...cifsSubjects, ...level4Subjects];

export const themes: Theme[] = [
  'Theme 1',
  'Theme 2',
  'Theme 3',
  'Theme 4',
  'Theme 5',
  'Theme 6',
  'Theme 7',
  'Theme 8',
  'Theme 9',
  'Theme 10',
  'Theme 11',
  'Theme 12',
];

export const quizLength = 25;
export const quizDurationSeconds = 20 * 60;
export const passPercent = 60;

export function subjectSlug(subject: Subject): string {
  return subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function subjectShortName(subject: Subject): string {
  switch (subject) {
    case 'Quantitative Methods':
      return 'QM';
    case 'Academic Communication Skills':
      return 'ACS';
    case 'Professional Skills & Employability':
      return 'PSE';
    case 'Critical Thinking & Citizenship':
      return 'CTC';
    case 'Introduction to Business and Economics':
    case 'Foundations of Economics':
      return 'IBE';
    case 'Understanding Finance':
      return 'UF';
    case 'Math for Eco':
      return 'ME';
    case 'Exploring Economics':
      return 'EE';
    case 'Contemporary Issues in Global Economy':
      return 'CIGE';
    case 'Financial Accounting':
      return 'FA';
    case 'Fundamentals of Statistics':
      return 'FoS';
    case 'Essentials of Economics':
      return 'EoE';
  }
}

export interface SubjectThemeOption {
  theme: Theme;
  title: string;
  themeNumber: number;
  hasCustomTitle: boolean;
}

type ThemeTitlesMap = Record<string, Record<string, string>>;

// Filled by initThemeTitles() in themeTitles.ts, which reads the app's prefixed storage key.
let customTitlesCache: ThemeTitlesMap = {};

export function updateCustomThemeTitlesCache(titlesMap: ThemeTitlesMap): void {
  customTitlesCache = { ...titlesMap };
}

export function getCustomThemeTitle(subject?: Subject, theme?: Theme): string {
  if (!subject || !theme) return '';
  return customTitlesCache[subject]?.[theme]?.trim() ?? '';
}

export function getSubjectThemes(subject?: Subject): SubjectThemeOption[] {
  return themes.map((theme, index) => {
    const themeNumber = index + 1;
    const customTitle = getCustomThemeTitle(subject, theme);
    return {
      theme,
      themeNumber,
      title: customTitle || theme,
      hasCustomTitle: Boolean(customTitle),
    };
  });
}

// Mock exams, filled by initMockExams() / loadMockExams() in mockExams.ts.
let mockExamsCache: MockExam[] = [];

export function updateMockExamsCache(exams: MockExam[]): void {
  mockExamsCache = exams.slice();
}

function compareMockExams(a: MockExam, b: MockExam): number {
  return (
    a.after_theme - b.after_theme ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

/** Mock exams for one subject in display order (by position, then creation time). */
export function getMockExams(subject?: Subject): MockExam[] {
  if (!subject) return [];
  return mockExamsCache.filter((exam) => exam.subject === subject).sort(compareMockExams);
}

export function getMockExam(id?: string | null): MockExam | undefined {
  if (!id) return undefined;
  return mockExamsCache.find((exam) => exam.id === id);
}

export type SubjectOutlineItem =
  | ({ kind: 'theme' } & SubjectThemeOption)
  | { kind: 'mock'; exam: MockExam };

/**
 * The subject's quiz list: the 12 themes with its mock exams slotted in.
 * A mock exam with after_theme N appears directly after Theme N (0 = first).
 */
export function getSubjectOutline(subject?: Subject): SubjectOutlineItem[] {
  const exams = getMockExams(subject);
  const outline: SubjectOutlineItem[] = [];

  const pushExamsAfter = (position: number): void => {
    for (const exam of exams) {
      if (exam.after_theme === position) outline.push({ kind: 'mock', exam });
    }
  };

  pushExamsAfter(0);
  getSubjectThemes(subject).forEach((option, index) => {
    outline.push({ kind: 'theme', ...option });
    pushExamsAfter(index + 1);
  });

  // Anything with an out-of-range position still shows, at the end, rather than vanishing.
  for (const exam of exams) {
    if (exam.after_theme < 0 || exam.after_theme > themes.length) {
      outline.push({ kind: 'mock', exam });
    }
  }
  return outline;
}

/** Subject names whose questions belong to this subject (IBE still has rows under its legacy name). */
export function getSubjectAliases(subject: Subject): Subject[] {
  return subject === 'Introduction to Business and Economics'
    ? ['Introduction to Business and Economics', 'Foundations of Economics']
    : [subject];
}

export function getQuizThemeTitle(subject?: Subject, theme?: Theme): string {
  const custom = getCustomThemeTitle(subject, theme);
  if (custom) {
    return custom;
  }
  return theme ?? 'Theme 1';
}

export function resolveTheme(subject: Subject | undefined, input: string): Theme | null {
  const trimmed = input.trim();
  if ((themes as readonly string[]).includes(trimmed)) {
    return trimmed as Theme;
  }
  if (subject) {
    for (const t of themes) {
      const custom = getCustomThemeTitle(subject, t);
      if (custom && custom.toLowerCase() === trimmed.toLowerCase()) {
        return t;
      }
      const stripped = trimmed.replace(/^\d+[\.\)]\s*/, '');
      if (custom && custom.toLowerCase() === stripped.toLowerCase()) {
        return t;
      }
    }
  }
  const numMatch = trimmed.match(/^(?:theme\s*)?(\d+)$/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1 && num <= themes.length) {
      return `Theme ${num}` as Theme;
    }
  }
  return null;
}
