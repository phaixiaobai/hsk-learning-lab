import type { HskLevel, QuizQuestion, VocabItem } from '../types';

/* ================================================================
 * DYNAMIC QUIZ GENERATOR (Module D)
 * Pure functions – given a filtered vocab bank + options, produce
 * a brand-new, randomized array of QuizQuestions every time.
 * ================================================================ */

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

const miniSentenceTemplates: Array<(w: VocabItem) => string> = [
  w => `我 ___ 很 重要。 (I think ___ is very important.)  ← use: ${w.pinyin}`,
  w => `他 很 ___ 。 (He is very ___ .) ← use: ${w.pinyin}`,
  w => `这 是 一 个 好 ___ 。 (This is a good ___ .) ← use: ${w.pinyin}`,
  w => `我们 需要 ___ 。 (We need ___ .) ← use: ${w.pinyin}`,
];

export interface QuizOptions {
  level: HskLevel;
  totalQuestions?: number;          // default 10
  includeMultipleChoice?: boolean;  // default true
  includeFillBlank?: boolean;       // default true
  includeMatching?: boolean;        // default true
  /** If provided, use these words as the pool instead of filtering by level. */
  pool?: VocabItem[];
}

export function generateQuiz(bank: VocabItem[], opts: QuizOptions): QuizQuestion[] {
  const {
    level,
    totalQuestions = 10,
    includeMultipleChoice = true,
    includeFillBlank = true,
    includeMatching = true,
    pool: poolOverride,
  } = opts;

  const pool = poolOverride ?? bank.filter(v => v.level === level);
  if (pool.length < 4) return [];

  const kinds: QuizQuestion['kind'][] = [];
  if (includeMultipleChoice) kinds.push('multiple-choice');
  if (includeFillBlank)      kinds.push('fill-blank');
  if (includeMatching)       kinds.push('matching');

  const questions: QuizQuestion[] = [];
  let i = 0;

  while (questions.length < totalQuestions) {
    const kind = kinds[i % kinds.length]; i++;

    if (kind === 'multiple-choice') {
      const answer  = pickRandom(pool, 1)[0];
      const wrong   = pickRandom(pool.filter(v => v.id !== answer.id), 3);
      const choices = shuffle([
        { text: answer.en,  correct: true  },
        ...wrong.map(w => ({ text: w.en,   correct: false })),
      ]);
      questions.push({
        kind: 'multiple-choice',
        id: `mc-${answer.id}-${questions.length}`,
        prompt: `What does "${answer.hanzi}" mean?`,
        hanzi: answer.hanzi,
        choices,
      });
      continue;
    }

    if (kind === 'fill-blank') {
      const answer = pickRandom(pool, 1)[0];
      const wrong  = pickRandom(pool.filter(v => v.id !== answer.id), 3);
      const tpl    = miniSentenceTemplates[Math.floor(Math.random() * miniSentenceTemplates.length)];
      const choices = shuffle([
        { text: answer.hanzi, correct: true  },
        ...wrong.map(w => ({ text: w.hanzi,  correct: false })),
      ]);
      questions.push({
        kind: 'fill-blank',
        id: `fb-${answer.id}-${questions.length}`,
        sentence: tpl(answer).replace(`← use: ${answer.pinyin}`, '').trim(),
        hanzi: answer.hanzi,
        choices,
      });
      continue;
    }

    if (kind === 'matching') {
      const picks = pickRandom(pool, 4);
      questions.push({
        kind: 'matching',
        id: `match-${questions.length}`,
        pairs: picks.map(p => ({ hanzi: p.hanzi, meaning: p.en })),
      });
      continue;
    }
  }

  return questions.slice(0, totalQuestions);
}
