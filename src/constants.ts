import type { Difficulty, Subject } from './types';

export const subjects: Subject[] = [
  'Quantitative Methods',
  'Academic Communication Skills',
  'Professional Skills & Employability',
  'Critical Thinking & Citizenship',
  'Foundations of Economics',
  'Understanding Finance',
];

export const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard'];

export const quizLength = 20;
export const quizDurationSeconds = 20 * 60;
export const passPercent = 60;

export function subjectSlug(subject: Subject): string {
  return subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
