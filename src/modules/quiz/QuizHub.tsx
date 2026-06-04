/**
 * @file QuizHub.tsx
 * @description Unified quiz entry point. Manages three phases:
 *   1. "selection" – pick a quiz mode and question count
 *   2. "running"   – QuizRunner orchestrates the session
 *   3. "result"    – QuizResult shows score, weak words, and feedback form
 *
 * Replaces the previous standalone Quiz and VoiceQuiz tabs.
 */

import { useState } from 'react';
import type { HskLevel, VocabItem } from '../../types';
import type { QuizConfig, QuizSessionResult } from '../../engine/quizEngine';
import type { QuizMode } from '../../engine/quizEngine';
import { saveQuizSession } from '../../engine/quizEngine';
import type { UiLang } from '../../components/ui/LanguageToggle';
import { Card, CardTitle } from '../../components/ui/Card';
import { QuizRunner } from './QuizRunner';
import { QuizResult } from './QuizResult';

// ── Mode catalogue ─────────────────────────────────────────────────────────

interface ModeCard {
  mode: QuizMode;
  icon: string;
  label: string;
  desc: string;
  gradient: string;
  border: string;
  badge?: string;
}

const MODES: ModeCard[] = [
  {
    mode:     'multiple-choice',
    icon:     '🧠',
    label:    'Multiple Choice',
    desc:     'Pick the correct meaning, pinyin, or translation.',
    gradient: 'from-brand/10 to-brand/5',
    border:   'border-brand/30',
  },
  {
    mode:     'matching',
    icon:     '🔗',
    label:    'Matching',
    desc:     'Pair hanzi characters with their English meanings.',
    gradient: 'from-emerald-100 to-emerald-50',
    border:   'border-emerald-300',
  },
  {
    mode:     'fill-blank',
    icon:     '✏️',
    label:    'Fill in the Blank',
    desc:     'Complete sentences with the missing character.',
    gradient: 'from-amber-100 to-amber-50',
    border:   'border-amber-300',
  },
  {
    mode:     'voice',
    icon:     '🎤',
    label:    'Voice Quiz',
    desc:     'Speak Mandarin aloud and get pronunciation feedback.',
    gradient: 'from-violet-100 to-violet-50',
    border:   'border-violet-300',
    badge:    'Chrome / Edge',
  },
  {
    mode:     'writing',
    icon:     '✍️',
    label:    'Writing Test',
    desc:     'See the meaning + pinyin and write the hanzi — guided or free.',
    gradient: 'from-sky-100 to-sky-50',
    border:   'border-sky-300',
  },
  {
    mode:     'mix',
    icon:     '🎲',
    label:    'Mix Quiz',
    desc:     'Random rotation of all types for maximum practice.',
    gradient: 'from-rose-100 to-rose-50',
    border:   'border-rose-300',
    badge:    'Recommended',
  },
];

const COUNT_OPTIONS = [5, 10, 20] as const;
type CountOption = typeof COUNT_OPTIONS[number];

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  level: HskLevel;
  lang?: UiLang;
  /** Custom word pool from VocabBrowser selection (category / section). */
  pool?: VocabItem[];
  /** Human label for the pool, e.g. "🍜 Food · Part 1". */
  poolLabel?: string;
}

type Phase = 'selection' | 'running' | 'result';

/**
 * Top-level quiz hub. Drives the full quiz lifecycle:
 *   selection → running → result → (retry | new quiz → selection)
 */
export function QuizHub({ level, lang = 'both', pool, poolLabel }: Props) {
  const [phase,     setPhase]     = useState<Phase>('selection');
  const [config,    setConfig]    = useState<QuizConfig | null>(null);
  const [result,    setResult]    = useState<QuizSessionResult | null>(null);
  const [count,     setCount]     = useState<CountOption>(10);
  const [hovered,   setHovered]   = useState<QuizMode | null>(null);

  function startQuiz(mode: QuizMode) {
    // Pass the custom pool when set — otherwise QuizRunner uses level filtering
    setConfig({ mode, level, count, pool });
    setResult(null);
    setPhase('running');
  }

  function handleComplete(r: QuizSessionResult) {
    saveQuizSession(r); // persist for Analytics (date, type, score, weak words)
    setResult(r);
    setPhase('result');
  }

  function handleRetry() {
    if (!config) return;
    setResult(null);
    setPhase('running');
  }

  function handleNewQuiz() {
    setPhase('selection');
    setConfig(null);
    setResult(null);
  }

  // ── Phase: running ──────────────────────────────────────────────────
  if (phase === 'running' && config) {
    return (
      <QuizRunner
        config={config}
        lang={lang}
        onComplete={handleComplete}
        onAbort={handleNewQuiz}
      />
    );
  }

  // ── Phase: result ───────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <QuizResult
        result={result}
        lang={lang}
        onRetry={handleRetry}
        onNewQuiz={handleNewQuiz}
      />
    );
  }

  // ── Phase: selection ────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <CardTitle>🧩 Quiz Hub</CardTitle>
        <p className="text-ink-soft text-sm mt-1">
          {pool && pool.length > 0
            ? <>Quizzing on <strong>{poolLabel ?? `${pool.length} words`}</strong> · {pool.length} words</>
            : <>Choose a quiz mode and get started. HSK {level} · vocabulary practice.</>
          }
        </p>

        {/* Question count selector */}
        <div className="mt-4">
          <div className="text-xs text-ink-soft uppercase tracking-wide font-semibold mb-2">
            Questions per session
          </div>
          <div className="inline-flex rounded-2xl border border-ink/10 bg-ink/3 p-1 gap-1">
            {COUNT_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={[
                  'rounded-xl px-5 py-2 text-sm font-semibold transition-all',
                  count === n
                    ? 'bg-white text-brand shadow-sm border border-brand/20'
                    : 'text-ink-soft hover:text-ink',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MODES.map(m => (
          <button
            key={m.mode}
            onMouseEnter={() => setHovered(m.mode)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => startQuiz(m.mode)}
            className={[
              'group relative text-left rounded-3xl border-2 p-5 transition-all duration-200',
              `bg-gradient-to-br ${m.gradient} ${m.border}`,
              hovered === m.mode
                ? 'shadow-lg scale-[1.02] border-opacity-80'
                : 'hover:shadow-md',
            ].join(' ')}
          >
            {/* Badge */}
            {m.badge && (
              <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide bg-white/80 rounded-full px-2 py-0.5 text-ink-soft border border-ink/10">
                {m.badge}
              </span>
            )}

            <div className="flex items-start gap-4">
              <div className="text-4xl leading-none mt-0.5">{m.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-ink text-lg leading-tight">{m.label}</div>
                <div className="text-ink-soft text-sm mt-1 leading-snug">{m.desc}</div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <div className="flex-1 text-xs text-ink-soft">{count} questions</div>
              <div className="text-xs font-semibold text-brand group-hover:underline">
                Start →
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Quick tip */}
      <div className="text-center text-xs text-ink-soft py-2">
        💡 Tip: Mix Quiz combines all types for the most effective practice session.
      </div>
    </div>
  );
}
