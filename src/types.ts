export type Subject =
  | 'Quantitative Methods'
  | 'Academic Communication Skills'
  | 'Professional Skills & Employability'
  | 'Critical Thinking & Citizenship'
  | 'Foundations of Economics'
  | 'Understanding Finance';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Question {
  id: string;
  subject: Subject;
  difficulty: Difficulty;
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
  difficulty: Difficulty;
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
