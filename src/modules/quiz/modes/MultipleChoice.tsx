/**
 * @file MultipleChoice.tsx
 * @description Multiple-choice question renderer.
 *
 * Flow (updated)
 * ──────────────
 * 1. User picks a choice → choices lock, correct/wrong colours show
 * 2. AnswerReview panel slides in below the choices
 * 3. User reads the review (pinyin, audio, translation), then presses "Next →"
 * 4. onAnswer() is called — no auto-advance timer
 *
 * This replaces the old 700 ms setTimeout pattern that caused
 * rapid-fire quiz behaviour and prevented proper review.
 */

import { useState } from 'react';
import type { QuizQuestion, VocabItem } from '../../../types';
import type { UiLang } from '../../../components/ui/LanguageToggle';
import { AudioButton } from '../../../components/ui/AudioButton';
import { AnswerReview } from '../../../components/ui/AnswerReview';
import { db, isSupabaseConfigured } from '../../../lib/supabase';
import { getSessionId } from '../../../lib/session';

type MCQuestion = Extract<QuizQuestion, { kind: 'multiple-choice' }>;

interface Props {
  question: MCQuestion;
  lang?: UiLang;
  onAnswer: (isCorrect: boolean, score: number, word: VocabItem) => void;
}

export function MultipleChoice({ question, lang = 'both', onAnswer }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [inReview, setInReview] = useState(false);

  const isCorrect = picked !== null
    ? (question.choices.find(c => c.text === picked)?.correct ?? false)
    : false;

  function handlePick(text: string) {
    if (picked !== null) return;
    setPicked(text);
  }

  function handleNext() {
    onAnswer(isCorrect, isCorrect ? 100 : 0, question.word);
  }

  function handleReportDifficulty(issue: string) {
    if (!isSupabaseConfigured) return;
    db.insertWordDifficultyReport({
      session_id: getSessionId(),
      word_id:    question.word.id,
      hanzi:      question.word.hanzi,
      pinyin:     question.word.pinyin,
      level:      question.word.level,
      issue,
    }).catch(() => {/* silent */});
  }

  // Persist review-list additions to localStorage (same key as flashcards)
  function handleAddReview() {
    const key = 'hsk-master:review';
    try {
      const prev: string[] = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (!prev.includes(question.word.id)) {
        localStorage.setItem(key, JSON.stringify([...prev, question.word.id]));
      }
      setInReview(true);
    } catch { /* ignore */ }
  }

  // Check if already in review
  const alreadyInReview = inReview || (() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('hsk-master:review') ?? '[]');
      return ids.includes(question.word.id);
    } catch { return false; }
  })();

  return (
    <div className="space-y-5">
      {/* Question prompt */}
      <div className="text-center">
        <div className="text-ink-soft text-sm mb-2">{question.prompt}</div>
        <div className="font-hanzi text-[80px] sm:text-[96px] leading-none text-ink">
          {question.hanzi}
        </div>
        <div className="text-brand font-bold text-lg mt-1">{question.word.pinyin}</div>
        <div className="flex justify-center mt-3">
          <AudioButton text={question.hanzi} size="md" />
        </div>
      </div>

      {/* Choices grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {question.choices.map((c, i) => {
          const state =
            picked === null     ? 'idle'
            : c.text === picked ? (c.correct ? 'correct' : 'wrong')
            : c.correct         ? 'reveal'
            : 'dim';

          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => handlePick(c.text)}
              className={[
                'w-full py-4 px-5 rounded-2xl border-2 text-base font-semibold',
                'transition-all duration-200 select-none',
                state === 'idle'    && 'border-ink/15 bg-white text-ink hover:border-brand/40 hover:bg-brand/5 active:scale-95',
                state === 'correct' && 'border-emerald-400 bg-emerald-50 text-emerald-800 scale-[1.02]',
                state === 'wrong'   && 'border-red-400 bg-red-50 text-red-800 animate-shake',
                state === 'reveal'  && 'border-emerald-300 bg-emerald-50/60 text-emerald-700',
                state === 'dim'     && 'border-ink/8 bg-ink/3 text-ink-soft opacity-50',
              ].filter(Boolean).join(' ')}
            >
              {state === 'correct' && <span className="mr-1.5">✓</span>}
              {state === 'wrong'   && <span className="mr-1.5">✗</span>}
              {state === 'reveal'  && <span className="mr-1.5">✓</span>}
              {c.text}
            </button>
          );
        })}
      </div>

      {/* Review panel — shown after picking */}
      {picked !== null && (
        <AnswerReview
          word={question.word}
          isCorrect={isCorrect}
          userAnswer={picked}
          lang={lang}
          onNext={handleNext}
          onAddReview={handleAddReview}
          inReview={alreadyInReview}
          onReportDifficulty={isSupabaseConfigured ? handleReportDifficulty : undefined}
        />
      )}
    </div>
  );
}
