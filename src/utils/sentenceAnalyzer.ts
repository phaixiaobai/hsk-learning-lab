import type { VocabItem } from '../types';

/* ================================================================
 * SENTENCE ANALYZER UTILITY (Module C)
 * ----------------------------------------------------------------
 * A lightweight, dictionary-based segmenter that is good enough
 * for HSK 2-4 sentences. It does NOT use a server or an ML model.
 *
 * Algorithm: reverse maximum-match (a classic Chinese-segmentation
 * technique that is small, deterministic, and fast):
 *   1. Walk the sentence from left-to-right.
 *   2. For each position, try the longest dictionary entry that
 *      starts there (up to MAX_WORD_LEN chars).
 *   3. If nothing matches, take the single character as an
 *      "unknown" token.
 * ================================================================ */

const MAX_WORD_LEN = 4;

export interface AnalyzedToken {
  text: string;
  known: boolean;
  item?: VocabItem;
}

export function analyzeSentence(sentence: string, bank: VocabItem[]): AnalyzedToken[] {
  const dict = new Map<string, VocabItem>();
  for (const v of bank) dict.set(v.hanzi, v);

  // Strip punctuation and whitespace but keep the original order.
  const clean = sentence.replace(/\s+/g, '');
  const tokens: AnalyzedToken[] = [];
  let i = 0;

  while (i < clean.length) {
    let matched = false;
    for (let len = Math.min(MAX_WORD_LEN, clean.length - i); len >= 2; len--) {
      const slice = clean.substring(i, i + len);
      const hit = dict.get(slice);
      if (hit) {
        tokens.push({ text: slice, known: true, item: hit });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const ch = clean[i];
      // Single-character dictionary lookup (some HSK vocab is 1 char).
      const single = dict.get(ch);
      tokens.push(single
        ? { text: ch, known: true, item: single }
        : { text: ch, known: false });
      i += 1;
    }
  }

  return tokens;
}
