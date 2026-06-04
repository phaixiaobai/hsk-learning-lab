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
  /** Primary Chinese character(s) shown on cards (simplified). */
  hanzi: string;
  /** Simplified Chinese character(s). Mirrors `hanzi` for the current dataset. */
  simplified?: string;
  /** Traditional Chinese character(s), when available. */
  traditional?: string;
  /** Pinyin with tone marks. */
  pinyin: string;
  /** English translation. */
  en: string;
  /** Thai translation. */
  th: string;
  /** HSK level – 2, 3 or 4. */
  level: HskLevel;
  /**
   * Part-of-speech tag, stored verbatim from the source spreadsheet
   * (e.g. "n", "v", "v/n", "prep"). Kept as a free-form string so no
   * source information is lost.
   */
  pos?: string;
  /** Semantic category id. Empty when derived at runtime (see categoryUtils). */
  category?: string;
  /** Example sentence in Chinese, when available. */
  example?: string;
  /** Translation of the example sentence, when available. */
  exampleTranslation?: string;
  /** Example sentence in Chinese (canonical field; `example` mirrors this). */
  exampleZh?: string;
  /** Pinyin of the example sentence (tone-marked). */
  examplePinyin?: string;
  /** English translation of the example sentence. */
  exampleEn?: string;
  /** Thai translation of the example sentence. */
  exampleTh?: string;
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
      word: VocabItem;         // the full vocab item being tested
      choices: { text: string; correct: boolean }[];
    }
  | {
      kind: 'fill-blank';
      id: string;
      sentence: string;        // sentence with "___"
      hanzi: string;           // the missing word (the answer)
      word: VocabItem;         // the full vocab item being tested
      choices: { text: string; correct: boolean }[];
    }
  | {
      kind: 'matching';
      id: string;
      pairs: { hanzi: string; meaning: string }[];
      words: VocabItem[];      // the 4 vocab items forming the pairs
    }
  | {
      kind: 'voice';
      id: string;
      word: VocabItem;         // the word to speak aloud
    }
  | {
      kind: 'writing';
      id: string;
      word: VocabItem;         // prompt with meaning + pinyin, user writes the hanzi
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

// ── Support / feedback ────────────────────────────────────────────────────

/** Support ticket submitted via the floating SupportWidget. */
export interface SupportTicket {
  id?: string;
  category: string;
  message: string;
  page_url: string;
  browser_info: string;
  screenshot_base64?: string;
  anonymous: boolean;
  status?: 'open' | 'reviewing' | 'resolved' | 'closed';
  created_at?: string;
}

// ── Category analytics ────────────────────────────────────────────────────

/** Per-category accuracy stored in localStorage hsk-lab:cat-scores. */
export interface CategoryScore {
  correct: number;
  total: number;
  lastSeen: string;
}
