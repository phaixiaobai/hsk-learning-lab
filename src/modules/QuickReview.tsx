/**
 * @file QuickReview.tsx
 * @description Quick Review — a vocabulary review panel positioned between
 * Writing and Quiz in the learning flow.
 *
 * Shows each word from the current study context as a flash card:
 *   Front: Hanzi (large) + POS badge + Audio
 *   Back:  Pinyin · Translation · Part of Speech · Example sentence
 *
 * User taps "Show" to flip the card, then "Next →" to advance.
 * After the last word, shows a summary and "Go to Quiz →" CTA.
 *
 * Props:
 *   level        – current HSK level (used when no customDeck)
 *   section      – flashcard section index (used when no customDeck)
 *   customDeck   – specific word set from VocabBrowser / category study
 *   customDeckLabel – human label for the current deck
 *   lang         – display language ('en' | 'th' | 'both')
 *   onGoToQuiz   – callback to navigate to Quiz tab
 */

import { useMemo, useState } from 'react';
import vocab from '../data/vocabulary.json';
import type { HskLevel, VocabItem } from '../types';
import type { UiLang } from '../components/ui/LanguageToggle';
import { Button } from '../components/ui/Button';
import { AudioButton } from '../components/ui/AudioButton';
import { Card } from '../components/ui/Card';
import { posLabel } from '../utils/pos';
import { translationLines } from '../utils/translation';
import { getSections } from '../utils/sections';

interface Props {
  level: HskLevel;
  section: number;
  customDeck?: VocabItem[];
  customDeckLabel?: string;
  lang?: UiLang;
  onGoToQuiz?: () => void;
}

export function QuickReview({
  level,
  section,
  customDeck,
  customDeckLabel,
  lang = 'both',
  onGoToQuiz,
}: Props) {
  const allVocab = vocab as VocabItem[];

  // Resolve the word pool from custom deck or the current section
  const words = useMemo(() => {
    if (customDeck && customDeck.length > 0) return customDeck;
    const sections = getSections(level, allVocab);
    return sections[section]?.words ?? sections[0]?.words ?? [];
  }, [customDeck, level, section]);

  const deckLabel = customDeckLabel ?? `HSK ${level}`;

  const [index,   setIndex]   = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done,    setDone]    = useState(false);

  const word = words[index];

  function handleNext() {
    if (index + 1 >= words.length) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
      setFlipped(false);
    }
  }

  function restart() {
    setIndex(0);
    setFlipped(false);
    setDone(false);
  }

  if (words.length === 0) {
    return (
      <Card>
        <p className="text-ink-soft text-center py-4">
          No words to review. Go to Vocab tab and select a section or category to study.
        </p>
      </Card>
    );
  }

  // ── Done screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="space-y-5">
        <Card>
          <div className="text-center space-y-4 py-4">
            <div className="text-5xl">🎉</div>
            <div>
              <h2 className="text-2xl font-extrabold text-ink">Review Complete!</h2>
              <p className="text-ink-soft mt-1 text-sm">
                Reviewed {words.length} words from {deckLabel}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button variant="secondary" onClick={restart}>
                🔄 Review again
              </Button>
              {onGoToQuiz && (
                <Button size="lg" onClick={onGoToQuiz}>
                  🧩 Go to Quiz →
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ── Progress bar ───────────────────────────────────────────────────────
  const progress = Math.round((index / words.length) * 100);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-ink">👁 Quick Review</h2>
          <p className="text-xs text-ink-soft mt-0.5">{deckLabel}</p>
        </div>
        <span className="text-sm font-semibold text-ink-soft">
          {index + 1} / {words.length}
        </span>
      </div>

      {/* Progress */}
      <div className="h-2 bg-ink/8 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card */}
      <Card>
        <div className="space-y-5">
          {/* Front: Hanzi + POS + Audio */}
          <div className="text-center">
            {word.pos && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-ink/5 border border-ink/10 rounded-full px-2 py-0.5 text-ink-soft mb-2">
                {posLabel(word.pos)}
              </span>
            )}
            <div className="font-hanzi text-[96px] sm:text-[112px] leading-none text-ink select-none">
              {word.hanzi}
            </div>
            <div className="flex justify-center mt-3 gap-2">
              <AudioButton text={word.hanzi} size="md" />
              <AudioButton text={word.hanzi} size="md" slow />
            </div>
          </div>

          {/* Back: revealed after tap */}
          {flipped ? (
            <div className="space-y-3 pt-3 border-t border-ink/8">
              {/* Pinyin */}
              <div className="text-center">
                <div className="text-brand font-bold text-2xl">{word.pinyin}</div>
              </div>

              {/* Translations */}
              <div className="text-center space-y-0.5">
                {translationLines(word, lang).map((line, i) => (
                  <div
                    key={i}
                    className={[
                      'text-base leading-snug',
                      i === 0 ? 'text-ink font-semibold' : 'text-ink-soft',
                      line.lang === 'th' ? 'font-thai' : '',
                    ].join(' ')}
                  >
                    {line.text}
                  </div>
                ))}
              </div>

              {/* Example sentence */}
              {word.exampleZh && (
                <div className="bg-ink/4 rounded-2xl p-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Example</p>
                  <p className="font-hanzi text-sm text-ink leading-relaxed">{word.exampleZh}</p>
                  {word.examplePinyin && (
                    <p className="text-xs text-brand">{word.examplePinyin}</p>
                  )}
                  {(word.exampleEn || word.exampleTh) && (
                    <div>
                      {translationLines(
                        { en: word.exampleEn ?? '', th: word.exampleTh ?? '' },
                        lang,
                      ).map((line, i) => (
                        <p key={i} className={['text-xs text-ink-soft', line.lang === 'th' ? 'font-thai' : ''].join(' ')}>
                          {line.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Next button */}
              <div className="flex justify-center pt-1">
                <Button size="lg" onClick={handleNext} className="min-w-[160px]">
                  {index + 1 >= words.length ? '✓ Finish Review' : 'Next →'}
                </Button>
              </div>
            </div>
          ) : (
            /* Show button */
            <div className="text-center pt-2">
              <Button size="lg" onClick={() => setFlipped(true)} className="min-w-[200px]">
                Show Translation
              </Button>
              <p className="text-xs text-ink-soft mt-2">Tap to reveal pinyin, meaning & example</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
