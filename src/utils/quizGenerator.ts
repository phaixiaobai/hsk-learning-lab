/**
 * @file quizGenerator.ts
 * @description Pure functions that build randomised quiz question banks from
 * the vocabulary pool. Supports multiple-choice, fill-blank, matching, voice,
 * and mix modes. Every question includes its source VocabItem(s) so that the
 * unified quiz engine can track weak words with no extra look-ups.
 */

import type { HskLevel, QuizQuestion, VocabItem } from '../types';
import { meaningText } from './translation';

// ── Utilities ─────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

// ── Sentence templates for fill-blank (fallback only) ─────────────────────
// Used only when a word has no exampleZh or its example doesn't contain hanzi.

const TEMPLATES: Array<(w: VocabItem) => string> = [
  w => `我觉得___很重要。(I think ${w.en} is very important.)`,
  w => `他很___。(He is very ${w.en}.)`,
  w => `我们需要___。(We need ${w.en}.)`,
  w => `她有很多___。(She has a lot of ${w.en}.)`,
  w => `这个___很有用。(This ${w.en} is very useful.)`,
  w => `你喜欢___吗？(Do you like ${w.en}?)`,
];

/**
 * Build a fill-blank sentence for a word.
 * Priority: use the word's real example sentence (more natural).
 * Falls back to a generic template if example unavailable or doesn't contain the word.
 */
function makeFillBlankSentence(word: VocabItem): string {
  if (word.exampleZh && word.exampleZh.includes(word.hanzi)) {
    const blank = word.exampleZh.replace(word.hanzi, '___');
    const hint  = word.exampleEn ? ` (${word.exampleEn})` : '';
    return blank + hint;
  }
  const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  return tpl(word);
}

// ── Generator options ─────────────────────────────────────────────────────

export interface QuizOptions {
  /** HSK level – used to filter the bank when pool is not provided. */
  level: HskLevel;
  /** Target question count (default 10). */
  totalQuestions?: number;
  includeMultipleChoice?: boolean;   // default true
  includeFillBlank?: boolean;        // default true
  includeMatching?: boolean;         // default true
  /** Include voice questions (requires SpeechRecognition support). */
  includeVoice?: boolean;            // default false
  /** Include writing questions (meaning + pinyin → write hanzi). */
  includeWriting?: boolean;          // default false
  /** Override: use this pool instead of filtering by level. */
  pool?: VocabItem[];
  /** Display language — determines choice & meaning text. Defaults to 'en'. */
  lang?: 'en' | 'th' | 'both';
}

// ── Main generator ────────────────────────────────────────────────────────

/**
 * Build a randomised array of QuizQuestions for the given options.
 * Returns an empty array if the vocab pool has fewer than 4 words.
 */
export function generateQuiz(bank: VocabItem[], opts: QuizOptions): QuizQuestion[] {
  const {
    level,
    totalQuestions   = 10,
    includeMultipleChoice = true,
    includeFillBlank      = true,
    includeMatching       = true,
    includeVoice          = false,
    includeWriting        = false,
    pool: poolOverride,
    lang = 'en',
  } = opts;

  /** Get display text for a word based on the current lang setting. */
  const displayText = (w: VocabItem): string => meaningText(w, lang);

  const pool = poolOverride ?? bank.filter(v => v.level === level);

  // Supplement small pools with other same-level words so quiz is always possible.
  // This fixes sections with < 4 words (e.g. HSK2 F1, HSK3 E1, HSK4 O1).
  const levelBank = bank.filter(v => v.level === level);
  const effectivePool =
    pool.length >= 4
      ? pool
      : [
          ...pool,
          ...shuffle(levelBank.filter(v => !pool.some(p => p.id === v.id))).slice(
            0,
            4 - pool.length,
          ),
        ];
  if (effectivePool.length < 4) return []; // level itself has < 4 words

  // Build the rotation of kinds to cycle through
  const kinds: QuizQuestion['kind'][] = [];
  if (includeMultipleChoice) kinds.push('multiple-choice');
  if (includeFillBlank)      kinds.push('fill-blank');
  if (includeMatching)       kinds.push('matching');
  if (includeVoice)          kinds.push('voice');
  if (includeWriting)        kinds.push('writing');
  if (kinds.length === 0)    kinds.push('multiple-choice'); // safety fallback

  const questions: QuizQuestion[] = [];
  let rotation = 0;

  while (questions.length < totalQuestions) {
    const kind = kinds[rotation % kinds.length];
    rotation++;

    // ── Multiple choice ────────────────────────────────────────────────
    if (kind === 'multiple-choice') {
      const answer = pickRandom(pool, 1)[0];
      const wrong  = pickRandom(effectivePool.filter(v => v.id !== answer.id), 3);
      const choices = shuffle([
        { text: displayText(answer), correct: true  },
        ...wrong.map(w => ({ text: displayText(w),  correct: false })),
      ]);
      questions.push({
        kind:    'multiple-choice',
        id:      `mc-${answer.id}-${questions.length}`,
        prompt:  `What does "${answer.hanzi}" (${answer.pinyin}) mean?`,
        hanzi:   answer.hanzi,
        word:    answer,
        choices,
      });
      continue;
    }

    // ── Fill in the blank ─────────────────────────────────────────────
    if (kind === 'fill-blank') {
      const answer   = pickRandom(pool, 1)[0];
      // Pull distractors from the effective pool (handles small sections)
      const wrong    = pickRandom(effectivePool.filter(v => v.id !== answer.id), 3);
      const sentence = makeFillBlankSentence(answer);
      const choices  = shuffle([
        { text: answer.hanzi, correct: true  },
        ...wrong.map(w => ({ text: w.hanzi,  correct: false })),
      ]);
      questions.push({
        kind:     'fill-blank',
        id:       `fb-${answer.id}-${questions.length}`,
        sentence,
        hanzi:    answer.hanzi,
        word:     answer,
        choices,
      });
      continue;
    }

    // ── Matching ───────────────────────────────────────────────────────
    if (kind === 'matching') {
      const picks = pickRandom(pool, 4);
      questions.push({
        kind:  'matching',
        id:    `match-${questions.length}`,
        words: picks,
        pairs: picks.map(p => ({ hanzi: p.hanzi, meaning: displayText(p) })),
      });
      continue;
    }

    // ── Voice ──────────────────────────────────────────────────────────
    if (kind === 'voice') {
      const word = pickRandom(pool, 1)[0];
      questions.push({
        kind: 'voice',
        id:   `voice-${word.id}-${questions.length}`,
        word,
      });
      continue;
    }

    // ── Writing ────────────────────────────────────────────────────────
    if (kind === 'writing') {
      const word = pickRandom(pool, 1)[0];
      questions.push({
        kind: 'writing',
        id:   `writing-${word.id}-${questions.length}`,
        word,
      });
      continue;
    }
  }

  return questions.slice(0, totalQuestions);
}
