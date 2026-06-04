import type { HskLevel, VocabItem } from '../types';

/**
 * @file sections.ts
 * @description Groups a level's vocabulary into human-readable study
 * subsections named by the first letter of the pinyin.
 *
 * Instead of opaque "Section 1 / Section 2 / Section 3" labels, words are
 * sorted alphabetically by pinyin and bucketed by initial letter, then split
 * into numbered chunks within each letter:
 *
 *   A1 (Pinyin A–An)   20 words
 *   A2 (Pinyin Ao–Ay)  20 words
 *   B1 (Pinyin Ba–Bi)  20 words
 *   …
 *
 * Each section keeps a stable index so navigation, progress keys and quiz
 * scores continue to work exactly as before.
 */

export const SECTION_SIZE = 20;

export interface Section {
  /** Stable position in the ordered list (used for navigation + storage keys). */
  index: number;
  /** Short label, e.g. "A1", "B2". */
  label: string;
  /** Pinyin-range descriptor, e.g. "Pinyin A–An". */
  range: string;
  /** Uppercase initial letter this section belongs to, e.g. "A". */
  letter: string;
  /** The words in this section. */
  words: VocabItem[];
}

/** Strip tone diacritics and lowercase a pinyin string. */
function barePinyin(pinyin: string): string {
  return (pinyin || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining tone marks
    .replace(/ü/g, 'v')
    .toLowerCase()
    .replace(/[^a-z]/g, ''); // keep letters only (drops spaces, middots, etc.)
}

/** Uppercase initial letter of a word's pinyin, or '#' if none. */
export function pinyinInitial(word: VocabItem): string {
  const bare = barePinyin(word.pinyin);
  const ch = bare[0];
  return ch ? ch.toUpperCase() : '#';
}

/** Title-cased 2-letter prefix used in the range label, e.g. "an" → "An". */
function rangePrefix(word: VocabItem): string {
  const bare = barePinyin(word.pinyin);
  if (!bare) return '#';
  const head = bare.slice(0, 2);
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/**
 * Build the ordered list of pinyin-initial sections for a level.
 * Words are sorted by bare pinyin (then hanzi) for a stable, predictable order.
 */
export function getSections(level: HskLevel, vocab: VocabItem[]): Section[] {
  const words = vocab
    .filter(v => v.level === level)
    .sort((a, b) => {
      const pa = barePinyin(a.pinyin);
      const pb = barePinyin(b.pinyin);
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.hanzi.localeCompare(b.hanzi, 'zh');
    });

  // Bucket by initial letter, preserving sorted order.
  const buckets = new Map<string, VocabItem[]>();
  for (const w of words) {
    const letter = pinyinInitial(w);
    if (!buckets.has(letter)) buckets.set(letter, []);
    buckets.get(letter)!.push(w);
  }

  const sections: Section[] = [];
  let index = 0;
  for (const [letter, bucket] of buckets) {
    let part = 0;
    for (let i = 0; i < bucket.length; i += SECTION_SIZE) {
      const slice = bucket.slice(i, i + SECTION_SIZE);
      part++;
      const first = rangePrefix(slice[0]);
      const last = rangePrefix(slice[slice.length - 1]);
      const range = first === last ? `Pinyin ${first}` : `Pinyin ${first}–${last}`;
      sections.push({
        index,
        label: `${letter}${part}`,
        range,
        letter,
        words: slice,
      });
      index++;
    }
  }

  return sections;
}

/** Stable localStorage key for a section, e.g. "3-5" for HSK3 section index 5. */
export function makeSectionKey(level: HskLevel, sectionIndex: number): string {
  return `${level}-${sectionIndex}`;
}
