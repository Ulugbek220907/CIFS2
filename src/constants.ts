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
  }
}

export function getQuizThemeTitle(subject?: Subject, theme?: Theme): string {
  if (subject === 'Quantitative Methods' && theme === 'Theme 1') {
    return 'Data and data representations';
  }
  if (theme === 'Theme 1' && (!subject || subject === 'Quantitative Methods')) {
    return 'Data and data representations';
  }
  return theme ?? 'Data and data representations';
}
