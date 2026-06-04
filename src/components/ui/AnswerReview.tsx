/**
 * @file AnswerReview.tsx
 * @description Shared post-answer review panel shown after the user picks
 * an answer in Multiple Choice, Fill-in-Blank, and future quiz modes.
 *
 * Replaces the old auto-advance pattern (setTimeout → onAnswer).
 * The user must explicitly press "Next →" to proceed — encouraging
 * reflection and slowing down the tap-through-quiz behaviour.
 *
 * Features
 * ────────
 * • Correct / Wrong status banner (green / red)
 * • Always shows the correct answer with audio buttons (normal + slow)
 * • Pinyin with tone colours
 * • English and Thai translations
 * • Optional "Add to review" bookmark button
 * • "Next →" CTA to advance
 *
 * Usage
 * ─────
 * <AnswerReview
 *   word={word}
 *   isCorrect={picked === correctText}
 *   userAnswer={picked}
 *   onNext={() => onAnswer(isCorrect, score, word)}
 *   onAddReview={() => addToReview(word.id)}
 * />
 */

import { useState } from 'react';
import { AudioButton } from './AudioButton';
import type { VocabItem } from '../../types';
import type { UiLang } from './LanguageToggle';
import { translationLines } from '../../utils/translation';

// ── Tone colour helper ─────────────────────────────────────────────────────

const TONE_COLORS = ['text-red-600', 'text-amber-600', 'text-green-600', 'text-blue-600', 'text-gray-500'];

function PinyinColored({ pinyin }: { pinyin: string }) {
  // Split into syllables (space-separated) and colour each by tone mark
  const syllables = pinyin.split(' ');
  return (
    <span className="inline-flex flex-wrap gap-1 justify-center">
      {syllables.map((syl, i) => {
        // Detect tone by diacritic
        const toneIdx =
          /[āēīōūǖ]/.test(syl) ? 0 :
          /[áéíóúǘ]/.test(syl) ? 1 :
          /[ǎěǐǒǔǚ]/.test(syl) ? 2 :
          /[àèìòùǜ]/.test(syl) ? 3 : 4;
        return (
          <span key={i} className={`font-bold ${TONE_COLORS[toneIdx]}`}>
            {syl}
          </span>
        );
      })}
    </span>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  word: VocabItem;
  isCorrect: boolean;
  /** What the user actually selected / said (for display comparison). */
  userAnswer?: string;
  /** Called when user presses Next. This is where onAnswer() should be invoked. */
  onNext: () => void;
  /** Optional: called when user bookmarks the word for review. */
  onAddReview?: () => void;
  /** Whether the word is already in the review list. */
  inReview?: boolean;
  /** Optional: called when user flags word as difficult/confusing. */
  onReportDifficulty?: (issue: string) => void;
  /** Current display language. Defaults to 'both'. */
  lang?: UiLang;
}

// ── Component ──────────────────────────────────────────────────────────────

export function AnswerReview({
  word,
  isCorrect,
  userAnswer,
  onNext,
  onAddReview,
  inReview,
  onReportDifficulty,
  lang = 'both',
}: Props) {
  const [difficultyReported, setDifficultyReported] = useState(false);
  const [showDiffMenu,       setShowDiffMenu]       = useState(false);

  function handleDifficulty(issue: string) {
    setDifficultyReported(true);
    setShowDiffMenu(false);
    onReportDifficulty?.(issue);
  }

  // Centralized translation lines — never blank, consistent fallback.
  const transLines = translationLines(word, lang);
  const showComparison =
    !isCorrect && userAnswer && userAnswer !== word.hanzi && userAnswer.trim() !== '';

  return (
    <div className={[
      'rounded-3xl border-2 overflow-hidden animate-pop',
      isCorrect
        ? 'border-emerald-300 bg-emerald-50'
        : 'border-red-300 bg-red-50',
    ].join(' ')}>

      {/* Status banner */}
      <div className={[
        'flex items-center gap-2 px-5 py-3 font-bold text-sm',
        isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
      ].join(' ')}>
        <span className="text-xl">{isCorrect ? '✓' : '✗'}</span>
        <span>{isCorrect ? 'Correct!' : 'Not quite — here\'s the answer:'}</span>
      </div>

      {/* Word details */}
      <div className="px-5 py-5 flex flex-col items-center gap-4 text-center">

        {/* Hanzi + audio */}
        <div className="flex items-center gap-4">
          <div className="font-hanzi text-5xl sm:text-6xl leading-none text-ink">
            {word.hanzi}
          </div>
          <div className="flex flex-col gap-1.5">
            <AudioButton text={word.hanzi} size="md" />
            <AudioButton text={word.hanzi} size="md" slow />
          </div>
        </div>

        {/* Pinyin */}
        <div className="text-xl sm:text-2xl">
          <PinyinColored pinyin={word.pinyin} />
        </div>

        {/* Translations — centralized: never blank, consistent fallback */}
        <div className="space-y-1 text-center">
          {transLines.map((line, i) => (
            <div
              key={i}
              className={[
                i === 0 ? 'text-base sm:text-lg text-ink font-medium' : 'text-sm text-ink-soft',
                line.lang === 'th' ? 'font-thai' : '',
              ].join(' ')}
            >
              {line.text}
            </div>
          ))}
        </div>

        {/* User comparison (wrong answer only) */}
        {showComparison && (
          <div className="w-full rounded-2xl bg-white/70 border border-red-200 px-4 py-3 text-sm">
            <div className="text-xs text-ink-soft mb-2 font-semibold uppercase tracking-wider">
              Your answer
            </div>
            <div className="font-hanzi text-2xl text-red-700">{userAnswer}</div>
          </div>
        )}
      </div>

      {/* Word difficulty report (inline menu) */}
      {onReportDifficulty && (
        <div className="px-5 pb-2">
          {difficultyReported ? (
            <p className="text-xs text-emerald-600 font-semibold">✓ Reported — thanks!</p>
          ) : showDiffMenu ? (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-ink-soft">Why hard?</span>
              {([
                ['too_hard',               '😰 Too hard'],
                ['confusing_meaning',      '❓ Meaning'],
                ['confusing_pronunciation','🗣️ Pronunciation'],
                ['wrong_level',            '📊 Wrong level'],
              ] as [string, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleDifficulty(key)}
                  className="px-2 py-1 rounded-xl border border-red-300 text-red-600 text-[11px] font-semibold hover:bg-red-50 active:scale-95 transition-all"
                >
                  {label}
                </button>
              ))}
              <button onClick={() => setShowDiffMenu(false)} className="text-xs text-ink-soft">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowDiffMenu(true)}
              className="text-[11px] text-ink-soft hover:text-red-500 transition-colors"
            >
              😰 This word is hard
            </button>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3 px-5 pb-5">
        {onAddReview && (
          <button
            onClick={onAddReview}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border text-sm font-semibold transition-all',
              inReview
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-ink/15 bg-white text-ink-soft hover:border-amber-300 hover:text-amber-700',
            ].join(' ')}
          >
            <span>📌</span>
            <span>{inReview ? 'In review list' : 'Add to review'}</span>
          </button>
        )}
        <button
          onClick={onNext}
          className={[
            'flex-1 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95',
            isCorrect
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-brand hover:bg-brand/90 text-white',
          ].join(' ')}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
