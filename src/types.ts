export type Subject =
  | 'Quantitative Methods'
  | 'Academic Communication Skills'
  | 'Professional Skills & Employability'
  | 'Critical Thinking & Citizenship'
  | 'Foundations of Economics'
  | 'Understanding Finance';

export type Theme =
  | 'Theme 1'
  | 'Theme 2'
  | 'Theme 3'
  | 'Theme 4'
  | 'Theme 5'
  | 'Theme 6'
  | 'Theme 7'
  | 'Theme 8'
  | 'Theme 9'
  | 'Theme 10'
  | 'Theme 11'
  | 'Theme 12';

export interface Question {
  id: string;
  subject: Subject;
  theme: Theme;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  created_at: string;
}

export interface ResultRow {
  id: string;
  user_id: string;
  subject: Subject;
  theme: Theme;
  score: number;
  total: number;
  percent: number;
  time_used_seconds: number;
  created_at: string;
}

export interface AnswerReview {
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
}
