export type CifsSubject =
  | 'Quantitative Methods'
  | 'Academic Communication Skills'
  | 'Professional Skills & Employability'
  | 'Critical Thinking & Citizenship'
  | 'Introduction to Business and Economics'
  | 'Understanding Finance';

export type Level4Subject =
  | 'Math for Eco'
  | 'Exploring Economics'
  | 'Contemporary Issues in Global Economy'
  | 'Financial Accounting'
  | 'Fundamentals of Statistics'
  | 'Essentials of Economics';

export type LegacySubject = 'Foundations of Economics';

export type Subject = CifsSubject | Level4Subject | LegacySubject;

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

export interface MockExam {
  id: string;
  subject: Subject;
  title: string;
  /** Number of themes listed before this exam: 0 puts it above Theme 1, 4 puts it right after Theme 4. */
  after_theme: number;
  /** Themes whose questions this exam samples from. */
  source_themes: Theme[];
  question_count: number;
  created_at: string;
}

export interface ResultRow {
  id: string;
  user_id: string;
  subject: Subject;
  theme: Theme;
  /** Set when the attempt was a mock exam; `theme` is then only a placeholder. */
  mock_exam_id?: string | null;
  mock_exam_title?: string | null;
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
