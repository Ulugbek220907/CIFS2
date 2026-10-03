import type { Subject, Theme } from './types';

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
}

export const subjectThemeTitles: Partial<Record<Subject, Partial<Record<Theme, string>>>> = {
  'Quantitative Methods': {
    'Theme 1': 'Data and data representations',
  },
  'Financial Accounting': {
    'Theme 1': 'Intro to Accounting',
    'Theme 2': 'Accounting Cycle',
    'Theme 3': 'Accounting Cycle 2',
  },
  'Fundamentals of Statistics': {
    'Theme 1': 'Intro to Statistics',
    'Theme 2': 'Probability topics',
    'Theme 3': 'Discrete Probability Distributions',
    'Theme 4': 'Continuous Probability Distributions',
  },
  'Essentials of Economics': {
    'Theme 1': '10 principles of economics',
    'Theme 2': 'The market forces of supply and demand',
    'Theme 3': 'Elasticity',
    'Theme 4': 'Consumers, Producers, and the efficiency of markets',
    'Theme 5': 'The data on macroeconomics',
    'Theme 6': 'Production and growth',
  },
};

export const subjectThemeCount: Partial<Record<Subject, number>> = {
  'Financial Accounting': 3,
  'Fundamentals of Statistics': 4,
  'Essentials of Economics': 6,
};

export function getSubjectThemes(subject?: Subject): SubjectThemeOption[] {
  const count = subject && subjectThemeCount[subject] ? subjectThemeCount[subject]! : themes.length;
  const list = themes.slice(0, count);
  return list.map((theme, index) => {
    const themeNumber = index + 1;
    const customTitle = subject ? subjectThemeTitles[subject]?.[theme] : undefined;
    return {
      theme,
      themeNumber,
      title: customTitle ?? theme,
    };
  });
}

export function getQuizThemeTitle(subject?: Subject, theme?: Theme): string {
  if (subject && theme && subjectThemeTitles[subject]?.[theme]) {
    return subjectThemeTitles[subject]![theme]!;
  }
  if (subject === 'Quantitative Methods' && theme === 'Theme 1') {
    return 'Data and data representations';
  }
  if (theme === 'Theme 1' && (!subject || subject === 'Quantitative Methods')) {
    return 'Data and data representations';
  }
  return theme ?? 'Data and data representations';
}

export function resolveTheme(subject: Subject | undefined, input: string): Theme | null {
  const trimmed = input.trim();
  if ((themes as readonly string[]).includes(trimmed)) {
    return trimmed as Theme;
  }
  if (subject && subjectThemeTitles[subject]) {
    const titles = subjectThemeTitles[subject]!;
    for (const [t, title] of Object.entries(titles)) {
      if (title.toLowerCase() === trimmed.toLowerCase()) {
        return t as Theme;
      }
      const stripped = trimmed.replace(/^\d+[\.\)]\s*/, '');
      if (title.toLowerCase() === stripped.toLowerCase()) {
        return t as Theme;
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
