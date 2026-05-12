// ================================================================
// Shared TypeScript types used across the app.
// Keeping them centralized makes the data contracts explicit and
// lets every module consume the same shape of vocabulary data.
// ================================================================

export type HskLevel = 2 | 3 | 4;

/** A single vocabulary entry – the atomic unit our quiz/flashcards consume. */
export interface VocabItem {
  /** Stable unique id, e.g. "hsk3_1". Used as a key in localStorage "review" lists. */
  id: string;
  /** Simplified Chinese character(s). */
  hanzi: string;
  /** Pinyin with tone marks. */
  pinyin: string;
  /** English translation. */
  en: string;
  /** Thai translation. */
  th: string;
  /** HSK level – 2, 3 or 4. */
  level: HskLevel;
  /** Optional part-of-speech tag for the analyzer. */
  pos?: 'noun' | 'verb' | 'adj' | 'adv' | 'pron' | 'conj' | 'particle' | 'num' | 'measure';
}

/** A pre-test question. Stored separately from main vocab so we can hand-craft it. */
export interface PreTestQuestion {
  id: string;
  level: HskLevel;
  prompt: string;          // The stem shown to the student (English).
  promptTh: string;        // Thai version of the stem.
  hanzi: string;           // The target hanzi (used as the correct answer).
  choices: string[];       // 4 hanzi options.
  answerIndex: number;     // Index of correct choice in `choices`.
}

/** Result object produced by the pre-test grading algorithm. */
export interface PreTestResult {
  totalCorrect: number;
  perLevel: Record<HskLevel, { correct: number; total: number }>;
  recommendedLevel: HskLevel;
  rationale: string;
  takenAt: string;         // ISO timestamp.
}

/** Quiz question generated dynamically from the vocab bank. */
export type QuizQuestion =
  | {
      kind: 'multiple-choice';
      id: string;
      prompt: string;          // e.g., 'What does 努力 mean?'
      hanzi: string;
      choices: { text: string; correct: boolean }[];
    }
  | {
      kind: 'fill-blank';
      id: string;
      sentence: string;        // sentence with "___"
      hanzi: string;           // the missing word (the answer)
      choices: { text: string; correct: boolean }[];
    }
  | {
      kind: 'matching';
      id: string;
      pairs: { hanzi: string; meaning: string }[];
    };

/** Result of one quiz attempt – stored for high-score history. */
export interface QuizResult {
  score: number;
  total: number;
  level: HskLevel;
  date: string;
}

/** Result of one section mini-quiz attempt, stored per section key e.g. "3-0". */
export interface SectionScore {
  score: number;
  total: number;
  date: string;
}
