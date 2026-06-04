/**
 * @file translation.ts
 * @description Single source of truth for turning a VocabItem + UI language
 * setting into the translation line(s) to display.
 *
 * Why this exists
 * ───────────────
 * Translation rendering used to be copy-pasted inline in Flashcards, VoiceMode,
 * AnswerReview, SentenceAnalyzer and quizGenerator — each with subtly different
 * (and sometimes broken) fallback rules. That caused the "translation modes
 * don't work / show blank" bug. Everything now flows through these helpers.
 *
 * Rules (per product spec)
 * ────────────────────────
 *   English mode    →  English   (fallback to Thai if English missing)
 *   Thai mode       →  Thai      (fallback to English if Thai missing)
 *   English + Thai  →  English / Thai  (both lines; one line if the other is
 *                                       missing — never a blank or duplicate)
 *
 * A translation is NEVER blank: if a field is empty we fall back to the other
 * language, and if both are empty we render an em dash placeholder.
 */

import type { VocabItem } from '../types';
import type { UiLang } from '../components/ui/LanguageToggle';

export const TRANSLATION_PLACEHOLDER = '—';

export interface TranslationLine {
  /** Display text (already trimmed, never empty). */
  text: string;
  /** Which language this line is — used to apply the Thai font class. */
  lang: 'en' | 'th';
}

/** True when a string has real, non-whitespace content. */
function hasText(s?: string | null): s is string {
  return !!(s && s.trim().length > 0);
}

/** Resolved English text with Thai fallback (never blank). */
export function resolveEn(word: Pick<VocabItem, 'en' | 'th'>): string {
  if (hasText(word.en)) return word.en.trim();
  if (hasText(word.th)) return word.th.trim();
  return TRANSLATION_PLACEHOLDER;
}

/** Resolved Thai text with English fallback (never blank). */
export function resolveTh(word: Pick<VocabItem, 'en' | 'th'>): string {
  if (hasText(word.th)) return word.th.trim();
  if (hasText(word.en)) return word.en.trim();
  return TRANSLATION_PLACEHOLDER;
}

/**
 * The single string to show for a word in a given language — used where only
 * one piece of text fits (quiz choices, matching meanings, compact labels).
 * English and "both" resolve to English; Thai resolves to Thai. Always falls
 * back so the result is never blank.
 */
export function meaningText(word: Pick<VocabItem, 'en' | 'th'>, lang: UiLang): string {
  return lang === 'th' ? resolveTh(word) : resolveEn(word);
}

/**
 * The full set of lines to render for a word. One line for 'en'/'th', up to
 * two lines for 'both'. Guaranteed non-empty.
 */
export function translationLines(
  word: Pick<VocabItem, 'en' | 'th'>,
  lang: UiLang,
): TranslationLine[] {
  const en = hasText(word.en) ? word.en.trim() : '';
  const th = hasText(word.th) ? word.th.trim() : '';

  if (lang === 'en') {
    if (en) return [{ text: en, lang: 'en' }];
    if (th) return [{ text: th, lang: 'th' }]; // fallback
    return [{ text: TRANSLATION_PLACEHOLDER, lang: 'en' }];
  }

  if (lang === 'th') {
    if (th) return [{ text: th, lang: 'th' }];
    if (en) return [{ text: en, lang: 'en' }]; // fallback
    return [{ text: TRANSLATION_PLACEHOLDER, lang: 'th' }];
  }

  // 'both' — show whichever exist; avoid a duplicate when they're identical.
  const lines: TranslationLine[] = [];
  if (en) lines.push({ text: en, lang: 'en' });
  if (th && th !== en) lines.push({ text: th, lang: 'th' });
  if (lines.length === 0) lines.push({ text: TRANSLATION_PLACEHOLDER, lang: 'en' });
  return lines;
}
