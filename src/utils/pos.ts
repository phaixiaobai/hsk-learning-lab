/**
 * @file pos.ts
 * @description Map the terse part-of-speech tags stored in the vocabulary data
 * (e.g. "n", "v", "v/n", "adj", "prep") to readable labels for the UI.
 */

const POS_NAMES: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  prep: 'preposition',
  conj: 'conjunction',
  pron: 'pronoun',
  num: 'number',
  m: 'measure word',
  mw: 'measure word',
  part: 'particle',
  int: 'interjection',
  excl: 'interjection',
  aux: 'auxiliary',
  idiom: 'idiom',
};

/** Human-readable part of speech, e.g. "v/n" → "verb / noun". */
export function posLabel(pos?: string): string {
  if (!pos) return '';
  return pos
    .split('/')
    .map(tag => POS_NAMES[tag.trim().toLowerCase()] ?? tag.trim())
    .join(' / ');
}
