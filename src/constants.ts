import type { Subject, Theme } from './types';

export const subjects: Subject[] = [
  'Quantitative Methods',
  'Academic Communication Skills',
  'Professional Skills & Employability',
  'Critical Thinking & Citizenship',
  'Foundations of Economics',
  'Understanding Finance',
];

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
