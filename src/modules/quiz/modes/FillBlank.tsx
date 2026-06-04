/**
 * @file FillBlank.tsx
 * @description Fill-in-the-blank question renderer.
 *
 * Flow (updated)
 * ──────────────
 * 1. User taps a hanzi choice → blank is filled, choices lock
 * 2. AnswerReview panel slides in (correct answer + audio + translation)
 * 3. User presses "Next →" — no auto-advance
 *
 * The blank highlights green/red depending on the user's choice.
 * The correct answer is always revealed in the AnswerReview panel.
 */

import { useState } from 'react';
import type { QuizQuestion, VocabItem } from '../../../types';
import type { UiLang } from '../../../components/ui/LanguageToggle';
import { AnswerReview } from '../../../components/ui/AnswerReview';
import { db, isSupabaseConfigured } from '../../../lib/supabase';
import { getSessionId } from '../../../lib/session';

type FillQuestion = Extract<QuizQuestion, { kind: 'fill-blank' }>;

interface Props {
  question: FillQuestion;
  lang?: UiLang;
  onAnswer: (isCorrect: boolean, score: number, word: VocabItem) => void;
}

export function FillBlank({ question, lang = 'both', onAnswer }: Props) {
  const [picked,          setPicked]          = useState<string | null>(null);
  const [inReview,        setInReview]        = useState(false);
  const [sentenceFlag,    setSentenceFlag]    = useState<string | null>(null); // issue key or 'sent'
  const [showFlagMenu,    setShowFlagMenu]    = useState(false);

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

  function flagSentence(issue: string) {
    if (sentenceFlag || !isSupabaseConfigured) return;
    setSentenceFlag(issue);
    setShowFlagMenu(false);
    db.insertSentenceQualityReport({
      session_id: getSessionId(),
      word_id:    question.word.id,
      hanzi:      question.word.hanzi,
      sentence:   question.sentence,
      issue,
    }).catch(() => {/* silent */});
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

  const alreadyInReview = inReview || (() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('hsk-master:review') ?? '[]');
      return ids.includes(question.word.id);
    } catch { return false; }
  })();

  const parts = question.sentence.split('___');

  return (
    <div className="space-y-5">
      {/* Sentence with inline blank */}
      <div className="bg-ink/4 rounded-3xl p-5 text-center">
        <div className="font-hanzi text-2xl leading-relaxed text-ink">
          {parts[0]}
          <span className={[
            'inline-block mx-1 px-3 py-0.5 rounded-xl border-b-2 min-w-[2.5rem] transition-all duration-200',
            picked === null
              ? 'border-ink/30 text-ink-soft'
              : isCorrect
              ? 'border-emerald-400 text-emerald-700 bg-emerald-50'
              : 'border-red-400 text-red-700 bg-red-50',
          ].join(' ')}>
            {picked ?? '＿＿'}
          </span>
          {parts[1]}
        </div>
      </div>

      {/* Sentence flag — only shown after answering, only if Supabase configured */}
      {picked !== null && isSupabaseConfigured && (
        <div className="flex justify-end">
          {sentenceFlag ? (
            <span className="text-xs text-emerald-600 font-semibold">✓ Reported, thanks!</span>
          ) : showFlagMenu ? (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-ink-soft">Issue:</span>
              {([
                ['unnatural',    '🌀 Unnatural'],
                ['wrong_word',   '❌ Wrong word'],
                ['grammar_error','⚠️ Grammar'],
                ['confusing',    '❓ Confusing'],
              ] as [string, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => flagSentence(key)}
                  className="px-2 py-1 rounded-xl border border-amber-300 text-amber-700 text-[11px] font-semibold hover:bg-amber-50 active:scale-95 transition-all"
                >
                  {label}
                </button>
              ))}
              <button onClick={() => setShowFlagMenu(false)} className="text-xs text-ink-soft ml-1">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowFlagMenu(true)}
              className="text-[11px] text-ink-soft hover:text-amber-600 transition-colors"
            >
              🚩 Flag sentence
            </button>
          )}
        </div>
      )}

      {picked === null && (
        <p className="text-xs text-ink-soft text-center">Pick the missing character:</p>
      )}

      {/* Choice grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                'py-5 rounded-2xl border-2 font-hanzi text-3xl font-bold',
                'transition-all duration-200 select-none',
                state === 'idle'    && 'border-ink/15 bg-white text-ink hover:border-brand/40 hover:bg-brand/5 active:scale-95',
                state === 'correct' && 'border-emerald-400 bg-emerald-50 text-emerald-700 scale-105',
                state === 'wrong'   && 'border-red-400 bg-red-50 text-red-700 animate-shake',
                state === 'reveal'  && 'border-emerald-300 bg-emerald-50/60 text-emerald-600',
                state === 'dim'     && 'border-ink/8 bg-ink/3 text-ink-soft opacity-40',
              ].filter(Boolean).join(' ')}
            >
              {c.text}
            </button>
          );
        })}
      </div>

      {/* Review panel */}
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
