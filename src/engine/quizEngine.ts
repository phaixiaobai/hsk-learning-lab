/**
 * @file quizEngine.ts
 * @description Core types, session management, XP calculation, and result
 * building for the unified HSK Lab quiz engine. All quiz modes (multiple-
 * choice, matching, fill-blank, voice, mix) share this contract.
 */

import type { HskLevel, VocabItem } from '../types';

// ── Quiz mode identifiers ──────────────────────────────────────────────────
export type QuizMode =
  | 'multiple-choice'
  | 'matching'
  | 'fill-blank'
  | 'voice'
  | 'writing'
  | 'mix';

// ── Session configuration ──────────────────────────────────────────────────
export interface QuizConfig {
  /** Which quiz mode to run. */
  mode: QuizMode;
  /** HSK level being practiced. */
  level: HskLevel;
  /** Total number of questions (5 / 10 / 20). */
  count: number;
  /** Optional custom word pool – overrides level-based filtering. */
  pool?: VocabItem[];
}

// ── Recorded attempt ───────────────────────────────────────────────────────
export interface QuizAttempt {
  questionId: string;
  kind: 'multiple-choice' | 'fill-blank' | 'matching' | 'voice' | 'writing';
  /**
   * The word being tested. Null for matching (tests multiple words);
   * array for matching when we want to record all incorrectly paired words.
   */
  word: VocabItem | VocabItem[] | null;
  isCorrect: boolean;
  /** Normalised 0–100 score. Fuzzy for voice, binary (0|100) for others. */
  score: number;
  /** Time taken to answer, in milliseconds. */
  timeMs: number;
  /** Voice mode only: what the user actually said. */
  spokenTranscript?: string;
}

// ── Aggregated session result ──────────────────────────────────────────────
export interface QuizSessionResult {
  mode: QuizMode;
  level: HskLevel;
  attempts: QuizAttempt[];
  startTime: number;
  endTime: number;
  durationSec: number;
  /** Sum of all attempt.score values. */
  totalScore: number;
  /** attempts.length × 100 – the theoretical maximum. */
  maxPossible: number;
  /** Percentage accuracy, 0–100. */
  accuracy: number;
  xpGained: number;
  /** Distinct VocabItems answered incorrectly at least once. */
  weakWords: VocabItem[];
}

// ── Post-quiz feedback ─────────────────────────────────────────────────────
export interface QuizFeedback {
  sessionId: string;
  mode: QuizMode;
  level: HskLevel;
  date: string;
  difficulty: number;   // 1–5 stars
  enjoyment: number;    // 1–5 stars
  tags: string[];       // quick selection tags
  comment: string;
}

// ── XP helpers ────────────────────────────────────────────────────────────

/**
 * Calculate experience points earned for a session.
 * Perfect accuracy on 10 questions earns 100 XP.
 */
export function calcXP(accuracy: number, count: number): number {
  return Math.round((accuracy / 100) * count * 10);
}

/** Add XP to the cumulative localStorage total. Returns new total. */
export function addXP(amount: number): number {
  const prev = parseInt(localStorage.getItem('hsk-lab:xp') ?? '0', 10);
  const next = prev + amount;
  localStorage.setItem('hsk-lab:xp', String(next));
  return next;
}

/** Read cumulative XP from localStorage. */
export function getTotalXP(): number {
  return parseInt(localStorage.getItem('hsk-lab:xp') ?? '0', 10);
}

// ── Result builder ────────────────────────────────────────────────────────

/**
 * Aggregate raw attempts into a complete session result.
 *
 * @param config   - The quiz configuration used for this session.
 * @param attempts - All recorded attempts in order.
 * @param startTime - `Date.now()` captured when the session began.
 */
export function buildSessionResult(
  config: QuizConfig,
  attempts: QuizAttempt[],
  startTime: number,
): QuizSessionResult {
  const endTime     = Date.now();
  const totalScore  = attempts.reduce((s, a) => s + a.score, 0);
  const maxPossible = attempts.length * 100;
  const accuracy    = maxPossible === 0 ? 0 : Math.round((totalScore / maxPossible) * 100);
  const xpGained    = calcXP(accuracy, attempts.length);

  // Collect distinct incorrectly-answered vocab items
  const weakWords: VocabItem[] = [];
  const seen = new Set<string>();

  for (const a of attempts) {
    if (a.isCorrect) continue;
    const words = Array.isArray(a.word) ? a.word : a.word ? [a.word] : [];
    for (const w of words) {
      if (!seen.has(w.id)) { seen.add(w.id); weakWords.push(w); }
    }
  }

  return {
    mode:       config.mode,
    level:      config.level,
    attempts,
    startTime,
    endTime,
    durationSec: Math.round((endTime - startTime) / 1000),
    totalScore,
    maxPossible,
    accuracy,
    xpGained,
    weakWords,
  };
}

// ── Quiz history persistence ──────────────────────────────────────────────

/** A compact, persisted record of one completed quiz session. */
export interface QuizHistoryEntry {
  date: string;          // ISO timestamp
  mode: QuizMode;
  level: HskLevel;
  accuracy: number;      // 0–100
  questions: number;
  correct: number;
  /** Up to a dozen words the learner got wrong, for weak-area analysis. */
  weakWords: { id: string; hanzi: string; pinyin: string; en: string }[];
}

export const QUIZ_HISTORY_KEY = 'hsk-lab:quiz-history';

/** Append a completed session to the persisted quiz history (most recent first). */
export function saveQuizSession(result: QuizSessionResult): void {
  try {
    const prev = JSON.parse(localStorage.getItem(QUIZ_HISTORY_KEY) ?? '[]') as QuizHistoryEntry[];
    const correct = result.attempts.filter(a => a.isCorrect).length;
    const entry: QuizHistoryEntry = {
      date:      new Date().toISOString(),
      mode:      result.mode,
      level:     result.level,
      accuracy:  result.accuracy,
      questions: result.attempts.length,
      correct,
      weakWords: result.weakWords.slice(0, 12).map(w => ({
        id: w.id, hanzi: w.hanzi, pinyin: w.pinyin, en: w.en,
      })),
    };
    localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify([entry, ...prev].slice(0, 100)));
  } catch { /* storage quota */ }
}

// ── Feedback persistence ──────────────────────────────────────────────────

/** Append a feedback entry to the localStorage log. */
export function saveFeedback(fb: QuizFeedback): void {
  try {
    const key  = 'hsk-lab:feedback';
    const prev = JSON.parse(localStorage.getItem(key) ?? '[]') as QuizFeedback[];
    localStorage.setItem(key, JSON.stringify([fb, ...prev].slice(0, 100)));
  } catch { /* storage quota */ }
}
