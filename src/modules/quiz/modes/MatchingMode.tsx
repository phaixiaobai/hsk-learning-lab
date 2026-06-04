/**
 * @file MatchingMode.tsx
 * @description Matching quiz — two-column tap-to-pair interaction.
 *
 * Flow
 * ────
 * 1. Tap a hanzi card → selected (blue)
 * 2. Tap a meaning → evaluate:
 *    • Match   → flash green, locked
 *    • No match → flash red, reset after 500 ms
 * 3. All pairs matched → "review" phase (no auto-advance)
 * 4. Review panel shows each pair with audio, pinyin, translations
 * 5. User presses "Continue →" → onAnswer called
 *
 * Scoring: perfect = 100; each wrong attempt −15 (min 0).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuizQuestion, VocabItem } from '../../../types';
import type { UiLang } from '../../../components/ui/LanguageToggle';
import { AudioButton } from '../../../components/ui/AudioButton';
import { translationLines } from '../../../utils/translation';

type MatchQuestion = Extract<QuizQuestion, { kind: 'matching' }>;

interface Props {
  question: MatchQuestion;
  lang?: UiLang;
  onAnswer: (isCorrect: boolean, score: number, words: VocabItem[]) => void;
  /** Hide the 📌 review-pin buttons in the result panel. Default: true. */
  showReviewPins?: boolean;
}

type CardAnim = 'idle' | 'selected' | 'matched' | 'wrong';

// ── Review panel ────────────────────────────────────────────────────────────

function MatchReview({
  pairs,
  words,
  wrongWords,
  score,
  lang,
  showPins = true,
  onContinue,
}: {
  pairs: { hanzi: string; meaning: string }[];
  words: VocabItem[];
  wrongWords: VocabItem[];
  score: number;
  lang: UiLang;
  showPins?: boolean;
  onContinue: () => void;
}) {
  const isCorrect = wrongWords.length === 0;

  function handleAddReview(wordId: string) {
    try {
      const key  = 'hsk-master:review';
      const prev: string[] = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (!prev.includes(wordId)) {
        localStorage.setItem(key, JSON.stringify([...prev, wordId]));
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4 animate-pop">
      {/* Score banner */}
      <div className={[
        'rounded-3xl border-2 overflow-hidden',
        isCorrect ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50',
      ].join(' ')}>
        <div className={[
          'flex items-center justify-between px-5 py-3 font-bold text-sm',
          isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
        ].join(' ')}>
          <span className="text-xl">{isCorrect ? '🏆' : '⚡'}</span>
          <span className="text-3xl font-extrabold tabular-nums">{score}%</span>
          <span>{isCorrect ? 'Perfect match!' : `${wrongWords.length} mistake${wrongWords.length !== 1 ? 's' : ''}`}</span>
        </div>

        {/* Pair list */}
        <div className="divide-y divide-ink/6">
          {pairs.map(pair => {
            const word    = words.find(w => w.hanzi === pair.hanzi);
            const isWrong = wrongWords.some(w => w.hanzi === pair.hanzi);

            return (
              <div key={pair.hanzi}
                className={['px-5 py-3 flex items-center gap-4', isWrong ? 'bg-red-50/60' : ''].join(' ')}>
                {/* Status dot */}
                <span className={['text-lg flex-shrink-0', isWrong ? 'text-red-500' : 'text-emerald-500'].join(' ')}>
                  {isWrong ? '✗' : '✓'}
                </span>

                {/* Hanzi + audio */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-hanzi text-2xl text-ink leading-none">{pair.hanzi}</span>
                  {word && (
                    <div className="flex gap-1">
                      <AudioButton text={pair.hanzi} size="sm" />
                      <AudioButton text={pair.hanzi} size="sm" slow />
                    </div>
                  )}
                </div>

                {/* Pinyin + translations */}
                <div className="flex-1 min-w-0">
                  {word && (
                    <div className="text-xs text-brand font-bold truncate">{word.pinyin}</div>
                  )}
                  {word && translationLines(word, lang).map((line, li) => (
                    <div
                      key={li}
                      className={[
                        'text-sm truncate',
                        li === 0 ? 'text-ink' : 'text-ink-soft',
                        line.lang === 'th' ? 'font-thai' : '',
                      ].join(' ')}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>

                {/* Add to review — only in full quiz mode */}
                {word && showPins && (
                  <button
                    onClick={() => handleAddReview(word.id)}
                    className="text-xs text-ink-soft hover:text-amber-600 transition-colors flex-shrink-0"
                    title="Add to review list"
                  >
                    📌
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        className={[
          'w-full py-3 rounded-2xl text-white font-bold text-sm transition-all active:scale-95',
          isCorrect ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-brand hover:bg-brand/90',
        ].join(' ')}
      >
        Continue →
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function MatchingMode({ question, lang = 'both', onAnswer, showReviewPins = true }: Props) {
  const { pairs, words } = question;

  const shuffledMeanings = useMemo(
    () => [...pairs.map(p => p.meaning)].sort(() => Math.random() - 0.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [selectedHanzi, setSelectedHanzi] = useState<string | null>(null);
  const [hanziAnim,     setHanziAnim]     = useState<Record<string, CardAnim>>({});
  const [meaningAnim,   setMeaningAnim]   = useState<Record<string, CardAnim>>({});
  const [matched,       setMatched]       = useState<Set<string>>(new Set());
  const [phase,         setPhase]         = useState<'matching' | 'review'>('matching');

  const wrongAttempts = useRef(0);
  const wrongWords    = useRef<VocabItem[]>([]);
  const locked        = useRef(false);

  // Transition to review when all pairs matched
  useEffect(() => {
    if (matched.size === pairs.length && pairs.length > 0 && phase === 'matching') {
      // Short pause so user sees the last match flash green before review slides in
      setTimeout(() => setPhase('review'), 400);
    }
  }, [matched.size, pairs.length, phase]);

  function handleHanziTap(hanzi: string) {
    if (locked.current || matched.has(hanzi)) return;
    if (selectedHanzi === hanzi) {
      setSelectedHanzi(null);
      setHanziAnim(prev => ({ ...prev, [hanzi]: 'idle' }));
    } else {
      if (selectedHanzi) {
        setHanziAnim(prev => ({ ...prev, [selectedHanzi]: 'idle' }));
      }
      setSelectedHanzi(hanzi);
      setHanziAnim(prev => ({ ...prev, [hanzi]: 'selected' }));
    }
  }

  function handleMeaningTap(meaning: string) {
    if (locked.current || !selectedHanzi) return;
    const alreadyMatched = pairs.find(p => matched.has(p.hanzi) && p.meaning === meaning);
    if (alreadyMatched) return;

    const correctMeaning = pairs.find(p => p.hanzi === selectedHanzi)?.meaning;
    const isMatch = meaning === correctMeaning;

    if (isMatch) {
      locked.current = true;
      setHanziAnim(prev  => ({ ...prev, [selectedHanzi]: 'matched' }));
      setMeaningAnim(prev => ({ ...prev, [meaning]:       'matched' }));
      setSelectedHanzi(null);
      setMatched(prev => new Set([...prev, selectedHanzi]));
      setTimeout(() => { locked.current = false; }, 350);
    } else {
      locked.current = true;
      wrongAttempts.current++;
      const missedWord = words.find(w => w.hanzi === selectedHanzi);
      if (missedWord && !wrongWords.current.find(w => w.id === missedWord.id)) {
        wrongWords.current.push(missedWord);
      }
      setHanziAnim(prev  => ({ ...prev, [selectedHanzi]: 'wrong' }));
      setMeaningAnim(prev => ({ ...prev, [meaning]:       'wrong' }));
      setTimeout(() => {
        setHanziAnim(prev  => ({ ...prev, [selectedHanzi]: 'idle' }));
        setMeaningAnim(prev => ({ ...prev, [meaning]:       'idle' }));
        setSelectedHanzi(null);
        locked.current = false;
      }, 550);
    }
  }

  function handleContinue() {
    const score     = Math.max(0, 100 - wrongAttempts.current * 15);
    const isCorrect = wrongAttempts.current === 0;
    onAnswer(isCorrect, score, wrongWords.current);
  }

  // ── Card style helpers ───────────────────────────────────────────────────

  function hanziCardClass(hanzi: string): string {
    const anim = hanziAnim[hanzi] ?? 'idle';
    const base = 'relative w-full rounded-2xl border-2 p-4 text-center font-hanzi text-2xl leading-none transition-all duration-200 cursor-pointer select-none ';
    if (matched.has(hanzi))  return base + 'border-emerald-300 bg-emerald-50 text-emerald-600 cursor-default opacity-60 animate-pop';
    if (anim === 'selected') return base + 'border-brand bg-brand/8 text-brand scale-[1.03] shadow-md';
    if (anim === 'wrong')    return base + 'border-red-400 bg-red-50 text-red-600 animate-shake';
    return base + 'border-ink/15 bg-white text-ink hover:border-brand/50 hover:shadow-sm active:scale-95';
  }

  function meaningCardClass(meaning: string): string {
    const anim      = meaningAnim[meaning] ?? 'idle';
    const isMatched = pairs.some(p => matched.has(p.hanzi) && p.meaning === meaning);
    const canTap    = !!selectedHanzi && !isMatched && !locked.current;
    const base = 'w-full rounded-2xl border-2 p-3 text-left text-sm font-medium transition-all duration-200 select-none ';
    if (isMatched)        return base + 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default opacity-60 animate-pop';
    if (anim === 'wrong') return base + 'border-red-400 bg-red-50 text-red-600 animate-shake cursor-pointer';
    if (canTap)           return base + 'border-brand/50 bg-brand/5 text-ink cursor-pointer hover:bg-brand/10 active:scale-95';
    return base + 'border-ink/10 bg-white text-ink-soft cursor-default';
  }

  // ── Review phase ─────────────────────────────────────────────────────────

  if (phase === 'review') {
    const score = Math.max(0, 100 - wrongAttempts.current * 15);
    return (
      <MatchReview
        pairs={pairs}
        words={words}
        wrongWords={wrongWords.current}
        score={score}
        lang={lang}
        showPins={showReviewPins}
        onContinue={handleContinue}
      />
    );
  }

  // ── Matching phase ───────────────────────────────────────────────────────

  const matchedCount = matched.size;
  const totalPairs   = pairs.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <p className="text-ink-soft">
          {selectedHanzi
            ? 'Now tap the matching meaning →'
            : 'Tap a Chinese character to start'}
        </p>
        <span className="font-semibold text-ink-soft tabular-nums">
          {matchedCount}/{totalPairs} matched
        </span>
      </div>

      <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${(matchedCount / totalPairs) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {pairs.map(p => (
            <button
              key={p.hanzi}
              onClick={() => handleHanziTap(p.hanzi)}
              disabled={matched.has(p.hanzi)}
              className={hanziCardClass(p.hanzi)}
            >
              {p.hanzi}
              {matched.has(p.hanzi) && (
                <span className="absolute top-1 right-1 text-emerald-500 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {shuffledMeanings.map(m => {
            const isMatched = pairs.some(p => matched.has(p.hanzi) && p.meaning === m);
            return (
              <button
                key={m}
                onClick={() => handleMeaningTap(m)}
                disabled={isMatched}
                className={meaningCardClass(m)}
              >
                {isMatched && <span className="mr-1 text-emerald-500">✓ </span>}
                {m}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
