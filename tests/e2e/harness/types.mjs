/**
 * Opaque-box constants and type schemas derived from ORIGINAL_REQUEST.md and PROJECT.md
 */

export const EVENT_TYPES = {
  PAGE_VISIT: 'page_visit',
  QUIZ_START: 'quiz_start',
  QUIZ_COMPLETE: 'quiz_complete',
};

export const CIFS_SUBJECTS = [
  'Quantitative Methods',
  'Academic Communication Skills',
  'Professional Skills & Employability',
  'Critical Thinking & Citizenship',
  'Introduction to Business and Economics',
  'Understanding Finance',
];

export const LEVEL4_SUBJECTS = [
  'Math for Eco',
  'Exploring Economics',
  'Contemporary Issues in Global Economy',
  'Financial Accounting',
  'Fundamentals of Statistics',
  'Essentials of Economics',
];

export const ALL_SUBJECTS = [...CIFS_SUBJECTS, ...LEVEL4_SUBJECTS];

export const ALL_THEMES = Array.from({ length: 12 }, (_, i) => `Theme ${i + 1}`);

export const TIME_RANGES = {
  ALL: 'all',
  LAST_7_DAYS: '7d',
  TODAY: 'today',
};

export const TOTAL_QUESTIONS_PER_QUIZ = 25;
