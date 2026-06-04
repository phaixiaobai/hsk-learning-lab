/**
 * @file QuizRunner.tsx
 * @description Orchestrates a live quiz session. Receives a QuizConfig,
 * generates questions, cycles through them one-by-one collecting QuizAttempts,
 * and hands the completed session result off to the onComplete callback.
 *
 * Each mode component calls onAnswer → QuizRunner records the attempt and
 * advances to the next question. No global state or context needed.
 */

import { useMemo, useRef, useState } from 'react';
import vocab from '../../data/vocabulary.json';
import type { VocabItem } from '../../types';
import type { QuizConfig, QuizAttempt } from '../../engine/quizEngine';
import type { UiLang } from '../../components/ui/LanguageToggle';
import { buildSessionResult } from '../../engine/quizEngine';
import { generateQuiz } from '../../utils/quizGenerator';
import { Card, CardTitle } from '../../components/ui/Card';
import { MultipleChoice } from './modes/MultipleChoice';
import { MatchingMode } from './modes/MatchingMode';
import { FillBlank } from './modes/FillBlank';
import { VoiceMode } from './modes/VoiceMode';
import { WritingMode } from './modes/WritingMode';

// ── STT support detection (for mix mode voice question fallback) ───────────
const hasSpeechRecognition =
  typeof window !== 'undefined' &&
  !!(
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );

// ── Mode label map ────────────────────────────────────────────────────────
const MODE_LABELS: Record<string, string> = {
  'multiple-choice': 'Multiple Choice',
  'fill-blank':      'Fill in the Blank',
  'matching':        'Matching',
  'voice':           'Voice Quiz',
  'writing':         'Writing Test',
  'mix':             'Mix Quiz',
};

interface Props {
  config: QuizConfig;
  lang?: UiLang;
  onComplete: (result: ReturnType<typeof buildSessionResult>) => void;
  onAbort: () => void;
}

/**
 * Stateful quiz session runner. Generates questions from config, cycles through
 * them, collects attempts with timing, then calls onComplete with the full
 * session result.
 */
export function QuizRunner({ config, lang = 'both', onComplete, onAbort }: Props) {
  const bank = vocab as VocabItem[];

  // Determine which question kinds to include based on mode.
  // NOTE: lang is intentionally NOT a dep — questions are generated once when
  // the quiz starts. Changing the display language mid-quiz only affects how
  // review panels render, not the underlying question/answer data.
  const questions = useMemo(() => {
    const base = {
      level:          config.level,
      totalQuestions: config.count,
      pool:           config.pool,
      lang,           // used for initial answer text generation only
    };

    const voiceOk = hasSpeechRecognition;

    switch (config.mode) {
      case 'multiple-choice':
        return generateQuiz(bank, { ...base, includeMultipleChoice: true,  includeFillBlank: false, includeMatching: false });
      case 'fill-blank':
        return generateQuiz(bank, { ...base, includeMultipleChoice: false, includeFillBlank: true,  includeMatching: false });
      case 'matching':
        return generateQuiz(bank, { ...base, includeMultipleChoice: false, includeFillBlank: false, includeMatching: true  });
      case 'voice':
        return generateQuiz(bank, { ...base, includeMultipleChoice: false, includeFillBlank: false, includeMatching: false, includeVoice: true });
      case 'writing':
        return generateQuiz(bank, { ...base, includeMultipleChoice: false, includeFillBlank: false, includeMatching: false, includeWriting: true });
      case 'mix':
      default:
        return generateQuiz(bank, {
          ...base,
          includeMultipleChoice: true,
          includeFillBlank:      true,
          includeMatching:       true,
          includeVoice:          voiceOk,
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]); // lang excluded: question data must not change mid-session

  const [index,    setIndex]    = useState(0);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  const startTime        = useRef(Date.now());
  const questionStart    = useRef(Date.now());

  if (questions.length === 0) {
    return (
      <Card>
        <CardTitle>Not enough vocabulary at this level.</CardTitle>
        <button className="mt-4 text-brand underline text-sm" onClick={onAbort}>
          ← Back to quiz selection
        </button>
      </Card>
    );
  }

  const q        = questions[index];
  const progress = Math.round((index / questions.length) * 100);
  const modeLabel = MODE_LABELS[q.kind] ?? q.kind;

  /**
   * Called by every mode component when the user answers.
   * Records the attempt and advances to the next question (or finishes).
   */
  function handleAnswer(
    isCorrect: boolean,
    score: number,
    wordOrWords?: VocabItem | VocabItem[],
    transcript?: string,
  ) {
    const timeMs = Date.now() - questionStart.current;
    questionStart.current = Date.now();

    const word: QuizAttempt['word'] =
      wordOrWords === undefined ? null
      : Array.isArray(wordOrWords) ? wordOrWords
      : wordOrWords;

    const attempt: QuizAttempt = {
      questionId:       q.id,
      kind:             q.kind as QuizAttempt['kind'],
      word,
      isCorrect,
      score,
      timeMs,
      spokenTranscript: transcript,
    };

    const next = [...attempts, attempt];
    setAttempts(next);

    if (index + 1 >= questions.length) {
      onComplete(buildSessionResult(config, next, startTime.current));
    } else {
      setIndex(i => i + 1);
    }
  }

  return (
    <Card>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs text-brand font-bold uppercase tracking-wider">{modeLabel}</div>
          <div className="font-bold text-ink text-lg leading-tight">
            {MODE_LABELS[config.mode]} · HSK {config.level}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink-soft font-semibold text-sm">
            Q {index + 1}/{questions.length}
          </span>
          <button
            onClick={onAbort}
            className="w-8 h-8 rounded-full bg-ink/5 hover:bg-ink/10 text-ink-soft flex items-center justify-center text-lg transition-colors"
            title="Quit quiz"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-ink/8 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-brand rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Mode renderer
          ─────────────────────────────────────────────────────────────────
          key={q.id} is CRITICAL: it forces React to unmount → remount the
          mode component on every new question, resetting all internal state
          (picked, phase, selections …). Without this, internal state from the
          previous question persists and the quiz appears frozen.
          ──────────────────────────────────────────────────────────────── */}
      {q.kind === 'multiple-choice' && (
        <MultipleChoice
          key={q.id}
          question={q}
          lang={lang}
          onAnswer={(correct, score, word) => handleAnswer(correct, score, word)}
        />
      )}

      {q.kind === 'fill-blank' && (
        <FillBlank
          key={q.id}
          question={q}
          lang={lang}
          onAnswer={(correct, score, word) => handleAnswer(correct, score, word)}
        />
      )}

      {q.kind === 'matching' && (
        <MatchingMode
          key={q.id}
          question={q}
          lang={lang}
          onAnswer={(correct, score, words) => handleAnswer(correct, score, words)}
        />
      )}

      {q.kind === 'voice' && (
        <VoiceMode
          key={q.id}
          question={q}
          lang={lang}
          onAnswer={(correct, score, word, transcript) =>
            handleAnswer(correct, score, word, transcript)
          }
        />
      )}

      {q.kind === 'writing' && (
        <WritingMode
          key={q.id}
          question={q}
          lang={lang}
          onAnswer={(correct, score, word) => handleAnswer(correct, score, word)}
        />
      )}
    </Card>
  );
}
