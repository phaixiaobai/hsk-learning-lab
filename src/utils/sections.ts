import type { HskLevel, VocabItem } from '../types';

export const SECTION_SIZE = 15;

/** Split vocab for a given HSK level into chunks of 15 words. */
export function getSections(level: HskLevel, vocab: VocabItem[]): VocabItem[][] {
  const words = vocab.filter(v => v.level === level);
  const out: VocabItem[][] = [];
  for (let i = 0; i < words.length; i += SECTION_SIZE) {
    out.push(words.slice(i, i + SECTION_SIZE));
  }
  return out;
}

/** Stable localStorage key for a section, e.g. "3-0" for HSK3 section 1. */
export function makeSectionKey(level: HskLevel, sectionIndex: number): string {
  return `${level}-${sectionIndex}`;
}
