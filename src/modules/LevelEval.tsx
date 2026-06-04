/**
 * @file LevelEval.tsx
 * @description Adaptive Level Evaluation — replaces the static "Re-test" tab.
 *
 * Algorithm
 * ─────────
 * • 15 questions, starting at difficulty 50 (HSK 3 territory, 0–100 scale).
 * • Correct answer → difficulty += 8 (harder)
 * • Wrong answer   → difficulty -= 8 (easier)
 * • Difficulty 0–36  maps to HSK 2
 * • Difficulty 37–68 maps to HSK 3
 * • Difficulty 69–100 maps to HSK 4
 *
 * Question types (cycled)
 * ───────────────────────
 * • mc-hanzi  – show hanzi, pick meaning (4 choices)
 * • mc-mean   – show meaning, pick hanzi (4 choices)
 * • voice     – speak the word aloud (if STT supported)
 *
 * Result
 * ──────
 * • Estimated HSK level with confidence %
 * • Per-level accuracy breakdown
 * • Strength and weakness analysis
 * • Personalised study recommendations
 */

import { useMemo, useRef, useState } from 'react';
import vocab from '../data/vocabulary.json';
import type { HskLevel, VocabItem } from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import { AudioButton } from '../components/ui/AudioButton';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { useLocalStorage } from '../hooks/useLocalStorage';

// ── Constants ─────────────────────────────────────────────────────────────

const TOTAL_QUESTIONS = 15;
const START_DIFFICULTY = 50;
const CORRECT_STEP = 8;
const WRONG_STEP   = 8;

// ── Types ─────────────────────────────────────────────────────────────────

type QuestionKind = 'mc-hanzi' | 'mc-mean' | 'voice';

interface EvalQuestion {
  id: string;
  word: VocabItem;
  kind: QuestionKind;
  choices?: string[];          // for mc-* kinds
  answer: string;
  difficulty: number;          // snapshot of difficulty when question was created
}

interface EvalAttempt {
  word: VocabItem;
  kind: QuestionKind;
  isCorrect: boolean;
  score: number;
  difficulty: number;
  timeMs: number;
}

interface EvalResult {
  estimatedLevel: HskLevel;
  confidence: number;
  accuracy: number;
  finalDifficulty: number;
  levelBreakdown: Record<HskLevel, { correct: number; total: number }>;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function diffToLevel(d: number): HskLevel {
  return d <= 36 ? 2 : d <= 68 ? 3 : 4;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

/** Normalise Chinese text for voice comparison. */
function normalise(s: string) {
  return s.replace(/[\s　，。！？,.!?]/g, '').toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function voiceScore(spoken: string, expected: string): number {
  const s = normalise(spoken);
  const e = normalise(expected);
  if (!s) return 0;
  if (s === e) return 100;
  const dist = levenshtein(s, e);
  return Math.max(0, Math.round((1 - dist / Math.max(s.length, e.length)) * 100));
}

/** Build a single adaptive question based on current difficulty. */
function buildQuestion(
  bank: VocabItem[],
  difficulty: number,
  index: number,
  voiceSupported: boolean,
): EvalQuestion {
  const level     = diffToLevel(difficulty);
  const levelPool = bank.filter(v => v.level === level);
  const fallback  = bank;
  const pool      = levelPool.length >= 4 ? levelPool : fallback;

  const word = pickRandom(pool, 1)[0];

  // Cycle through kinds: mc-hanzi → mc-mean → voice → repeat
  const kinds: QuestionKind[] = voiceSupported
    ? ['mc-hanzi', 'mc-mean', 'voice']
    : ['mc-hanzi', 'mc-mean'];
  const kind = kinds[index % kinds.length];

  if (kind === 'mc-hanzi') {
    const wrong   = pickRandom(pool.filter(v => v.id !== word.id), 3);
    const choices = shuffle([word.en, ...wrong.map(w => w.en)]);
    return { id: `eval-${index}`, word, kind, choices, answer: word.en, difficulty };
  }

  if (kind === 'mc-mean') {
    const wrong   = pickRandom(pool.filter(v => v.id !== word.id), 3);
    const choices = shuffle([word.hanzi, ...wrong.map(w => w.hanzi)]);
    return { id: `eval-${index}`, word, kind, choices, answer: word.hanzi, difficulty };
  }

  // voice
  return { id: `eval-${index}`, word, kind, answer: word.hanzi, difficulty };
}

/** Compute the final result from all attempts. */
function computeResult(attempts: EvalAttempt[], finalDifficulty: number): EvalResult {
  const total   = attempts.length;
  const correct = attempts.filter(a => a.isCorrect).length;
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);

  // Per-level breakdown
  const breakdown: Record<HskLevel, { correct: number; total: number }> = {
    2: { correct: 0, total: 0 },
    3: { correct: 0, total: 0 },
    4: { correct: 0, total: 0 },
  };
  for (const a of attempts) {
    const lv = a.word.level;
    breakdown[lv].total++;
    if (a.isCorrect) breakdown[lv].correct++;
  }

  // Estimated level from final difficulty
  const estimatedLevel = diffToLevel(finalDifficulty);

  // Confidence: how consistent were the last 5 answers?
  const lastFive = attempts.slice(-5);
  const lastFiveCorrect = lastFive.filter(a => a.isCorrect).length;
  const confidence = Math.round((lastFiveCorrect / Math.max(lastFive.length, 1)) * 100);

  // Strengths & weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  for (const lv of [2, 3, 4] as HskLevel[]) {
    const bd = breakdown[lv];
    if (bd.total === 0) continue;
    const pct = Math.round((bd.correct / bd.total) * 100);
    if (pct >= 80) strengths.push(`HSK ${lv} vocabulary (${pct}% accuracy)`);
    else if (pct < 55) {
      weaknesses.push(`HSK ${lv} vocabulary (${pct}% accuracy)`);
      recommendations.push(`Review HSK ${lv} flashcards and practice section quizzes`);
    }
  }

  // Voice-specific analysis
  const voiceAttempts = attempts.filter(a => a.kind === 'voice');
  if (voiceAttempts.length > 0) {
    const voiceAvg = Math.round(voiceAttempts.reduce((s, a) => s + a.score, 0) / voiceAttempts.length);
    if (voiceAvg >= 75) strengths.push(`Pronunciation (${voiceAvg}% avg score)`);
    else {
      weaknesses.push(`Pronunciation (${voiceAvg}% avg score)`);
      recommendations.push('Use the 🐢 slow-audio button on flashcards to hear tones clearly');
    }
  }

  if (recommendations.length === 0) {
    if (estimatedLevel < 4) {
      recommendations.push(`You're ready to advance — try HSK ${estimatedLevel + 1} vocabulary!`);
    } else {
      recommendations.push('Excellent! Consider practicing with full sentences and listening exercises.');
    }
  }

  return {
    estimatedLevel,
    confidence,
    accuracy,
    finalDifficulty,
    levelBreakdown: breakdown,
    strengths,
    weaknesses,
    recommendations,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════════════════

/** Multiple-choice (hanzi prompt or meaning prompt). */
function MCQuestion({
  question,
  onAnswer,
}: {
  question: EvalQuestion;
  onAnswer: (isCorrect: boolean, score: number) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const { word, kind, choices = [], answer } = question;

  function handlePick(choice: string) {
    if (picked !== null) return;
    const correct = choice === answer;
    setPicked(choice);
    setTimeout(() => onAnswer(correct, correct ? 100 : 0), 700);
  }

  return (
    <div className="space-y-5">
      {kind === 'mc-hanzi' ? (
        <div className="text-center">
          <p className="text-xs text-ink-soft mb-2">What does this mean?</p>
          <div className="font-hanzi text-[80px] leading-none text-ink">{word.hanzi}</div>
          <div className="text-brand font-bold text-lg mt-1">{word.pinyin}</div>
          <div className="flex justify-center gap-3 mt-3">
            <AudioButton text={word.hanzi} size="md" />
            <AudioButton text={word.hanzi} size="md" slow />
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-xs text-ink-soft mb-2">Which character means…</p>
          <div className="text-2xl font-semibold text-ink py-3">{word.en}</div>
          <div className="text-brand text-sm">{word.pinyin}</div>
          <div className="flex justify-center gap-3 mt-2">
            <AudioButton text={word.hanzi} size="md" />
            <AudioButton text={word.hanzi} size="md" slow />
          </div>
        </div>
      )}

      <div className={`grid gap-3 ${kind === 'mc-mean' ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {choices.map((c, i) => {
          const state = picked === null ? 'idle'
            : c === picked ? (c === answer ? 'correct' : 'wrong')
            : c === answer ? 'reveal' : 'idle';
          return (
            <Button
              key={i}
              size="lg"
              disabled={picked !== null}
              variant={state === 'correct' || state === 'reveal' ? 'success' : state === 'wrong' ? 'danger' : 'secondary'}
              onClick={() => handlePick(c)}
              className={kind === 'mc-mean' ? 'font-hanzi text-2xl' : 'text-base'}
            >
              {state === 'correct' && '✓ '}
              {state === 'wrong'   && '✗ '}
              {c}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Voice question for the evaluation. */
function VoiceQuestion({
  question,
  onAnswer,
}: {
  question: EvalQuestion;
  onAnswer: (isCorrect: boolean, score: number) => void;
}) {
  const { word } = question;
  const tts = useSpeechSynthesis();
  const stt = useSpeechRecognition('zh-CN');
  const [phase,    setPhase]    = useState<'prompt' | 'listening' | 'scored'>('prompt');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const graded = useRef(false);

  function grade(spoken: string) {
    if (graded.current) return;
    graded.current = true;
    const sc = voiceScore(spoken, word.hanzi);
    setAccuracy(sc);
    setPhase('scored');
    setTimeout(() => onAnswer(sc >= 70, sc), 1000);
  }

  // Auto-advance — in useEffect, NOT render body
  const sttRecState = stt.recState;
  const phaseRef    = useRef(phase);
  phaseRef.current  = phase;

  useState(() => {
    // intentional: we want a stable subscription to stt.recState changes
  });

  // We use a manual listener pattern to avoid the stale-closure problem
  // without adding phase to the dep array (which would re-trigger).

  if (sttRecState === 'done' && phaseRef.current === 'listening' && !graded.current) {
    // Safe here: we set graded.current synchronously first
    grade(stt.result?.transcript ?? '');
  }

  if (!stt.isSupported) {
    return (
      <div className="text-center space-y-3">
        <p className="text-ink-soft text-sm">Voice not supported — question skipped.</p>
        <Button onClick={() => onAnswer(true, 100)}>Skip →</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-xs text-ink-soft mb-2">Say this word aloud:</p>
        <div className="font-hanzi text-[80px] leading-none text-ink">{word.hanzi}</div>
        <div className="text-brand font-bold text-lg mt-1">{word.pinyin}</div>
        <div className="text-ink-soft text-sm mt-0.5">{word.en}</div>
        <div className="flex justify-center gap-3 mt-3">
          <AudioButton text={word.hanzi} size="md" />
          <AudioButton text={word.hanzi} size="md" slow />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        {phase === 'prompt' && (
          <Button size="lg" className="px-10" onClick={() => {
            tts.stop(); stt.reset(); graded.current = false;
            setPhase('listening'); stt.startListening();
          }}>
            🎤 Speak
          </Button>
        )}
        {phase === 'listening' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg text-2xl relative">
              <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
              🎤
            </div>
            <div className="text-red-600 text-sm font-semibold animate-pulse">Listening…</div>
            <Button variant="danger" size="lg" onClick={() => { stt.stopListening(); grade(stt.result?.transcript ?? ''); }}>
              ⏹ Stop
            </Button>
          </>
        )}
        {phase === 'scored' && accuracy !== null && (
          <div className={`text-center py-4 px-8 rounded-3xl border-2 animate-pop ${accuracy >= 70 ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : accuracy >= 45 ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-red-400 bg-red-50 text-red-700'}`}>
            <div className="text-4xl font-extrabold">{accuracy}%</div>
            <div className="text-xs mt-1">pronunciation score</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Result screen
// ══════════════════════════════════════════════════════════════════════════

function ResultScreen({ result, onRetake, onDone }: {
  result: EvalResult;
  onRetake: () => void;
  onDone: () => void;
}) {
  const confBg  = result.confidence >= 70 ? 'bg-emerald-100 text-emerald-700' : result.confidence >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  const accCls  = result.accuracy   >= 70 ? 'text-emerald-600' : result.accuracy >= 50 ? 'text-amber-600' : 'text-red-500';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

      {/* ── Left: level badge + stats + action buttons ── */}
      <div className="flex flex-col gap-4">
        <Card>
          <div className="text-center">
            <div className="text-xs text-brand font-bold uppercase tracking-widest mb-3">Evaluation Complete</div>

            {/* Badge */}
            <div className="flex flex-col items-center gap-2 mb-4">
              <div className="w-28 h-28 rounded-full bg-brand/10 border-4 border-brand flex flex-col items-center justify-center shadow-inner">
                <div className="text-5xl font-extrabold text-brand">{result.estimatedLevel}</div>
                <div className="text-xs text-brand font-semibold">HSK</div>
              </div>
              <span className={`px-4 py-1 rounded-full text-sm font-semibold ${confBg}`}>
                {result.confidence}% confidence
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-ink/4 rounded-2xl py-3">
                <div className={`text-2xl font-extrabold ${accCls}`}>{result.accuracy}%</div>
                <div className="text-xs text-ink-soft">Accuracy</div>
              </div>
              <div className="bg-ink/4 rounded-2xl py-3">
                <div className="text-2xl font-extrabold text-ink">{TOTAL_QUESTIONS}</div>
                <div className="text-xs text-ink-soft">Questions</div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={onRetake}>↻ Retake</Button>
          <Button size="lg" onClick={onDone}>Done ✓</Button>
        </div>
      </div>

      {/* ── Right: breakdown + focus areas + recommendations ── */}
      <div className="flex flex-col gap-3">

        {/* Per-level breakdown */}
        <Card>
          <CardTitle>📊 Level Breakdown</CardTitle>
          <div className="mt-3 space-y-3">
            {([2, 3, 4] as HskLevel[]).map(lv => {
              const bd     = result.levelBreakdown[lv];
              if (bd.total === 0) return null;
              const pct    = Math.round((bd.correct / bd.total) * 100);
              const barCls = pct >= 75 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
              const txtCls = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500';
              return (
                <div key={lv}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-ink-soft">HSK {lv}</span>
                    <span className={`font-bold ${txtCls}`}>{bd.correct}/{bd.total} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-ink/8 rounded-full overflow-hidden">
                    <div className={`h-full ${barCls} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Focus areas */}
        {result.weaknesses.length > 0 && (
          <Card>
            <CardTitle>🎯 Focus Areas</CardTitle>
            <ul className="mt-2 space-y-1.5">
              {result.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                  <span className="mt-0.5 flex-shrink-0">📌</span> {w}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Strengths */}
        {result.strengths.length > 0 && (
          <Card>
            <CardTitle>💪 Strengths</CardTitle>
            <ul className="mt-2 space-y-1.5">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-emerald-700">
                  <span className="mt-0.5 flex-shrink-0">✅</span> {s}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Recommendations */}
        <Card>
          <CardTitle>💡 Recommendations</CardTitle>
          <ul className="mt-2 space-y-1.5">
            {result.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-0.5 text-brand flex-shrink-0">→</span> {r}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Main LevelEval component
// ══════════════════════════════════════════════════════════════════════════

interface Props {
  /** Called when user completes eval and clicks Done. */
  onDone?: (level: HskLevel) => void;
}

type Phase = 'welcome' | 'evaluating' | 'result';

export function LevelEval({ onDone }: Props) {
  const bank = vocab as VocabItem[];

  const hasStt = typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  );

  const [phase,      setPhase]      = useState<Phase>('welcome');
  const [attempts,   setAttempts]   = useState<EvalAttempt[]>([]);
  const [difficulty, setDifficulty] = useState(START_DIFFICULTY);
  const [result,     setResult]     = useState<EvalResult | null>(null);

  // Save last eval result to localStorage
  const [, setStoredResult] = useLocalStorage<EvalResult | null>('hsk-lab:eval-result', null);

  const questionStart = useRef(Date.now());
  const currentIndex  = attempts.length;

  // Current question (generated lazily per render, stable via useMemo on difficulty + index)
  const currentQuestion = useMemo(
    () => currentIndex < TOTAL_QUESTIONS
      ? buildQuestion(bank, difficulty, currentIndex, hasStt)
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentIndex, difficulty],
  );

  function startEval() {
    setAttempts([]);
    setDifficulty(START_DIFFICULTY);
    setResult(null);
    questionStart.current = Date.now();
    setPhase('evaluating');
  }

  function handleAnswer(isCorrect: boolean, score: number) {
    if (!currentQuestion) return;
    const timeMs  = Date.now() - questionStart.current;
    questionStart.current = Date.now();

    const attempt: EvalAttempt = {
      word:       currentQuestion.word,
      kind:       currentQuestion.kind,
      isCorrect,
      score,
      difficulty,
      timeMs,
    };

    const nextAttempts  = [...attempts, attempt];
    const nextDifficulty = Math.min(100, Math.max(0,
      difficulty + (isCorrect ? CORRECT_STEP : -WRONG_STEP)
    ));

    setAttempts(nextAttempts);
    setDifficulty(nextDifficulty);

    if (nextAttempts.length >= TOTAL_QUESTIONS) {
      const r = computeResult(nextAttempts, nextDifficulty);
      setResult(r);
      setStoredResult(r);
      setPhase('result');
    }
  }

  // ── Phase: welcome ───────────────────────────────────────────────────
  if (phase === 'welcome') {
    return (
      <Card>
        <div className="text-center">
          <div className="text-6xl mb-4">🎯</div>
          <CardTitle>Level Evaluation</CardTitle>
          <CardSubtitle>Adaptive proficiency assessment</CardSubtitle>
        </div>

        <div className="mt-6 space-y-3 text-sm text-ink-soft">
          <div className="flex items-start gap-3 bg-brand/5 rounded-2xl p-3">
            <span className="text-xl mt-0.5">🧠</span>
            <div>
              <div className="font-semibold text-ink mb-0.5">{TOTAL_QUESTIONS} adaptive questions</div>
              Questions get harder when you answer correctly and easier when you don't.
            </div>
          </div>
          <div className="flex items-start gap-3 bg-brand/5 rounded-2xl p-3">
            <span className="text-xl mt-0.5">📊</span>
            <div>
              <div className="font-semibold text-ink mb-0.5">Covers HSK 2, 3, and 4</div>
              Tests vocabulary recognition{hasStt ? ', pinyin reading, and pronunciation' : ' and pinyin reading'}.
            </div>
          </div>
          <div className="flex items-start gap-3 bg-brand/5 rounded-2xl p-3">
            <span className="text-xl mt-0.5">⏱</span>
            <div>
              <div className="font-semibold text-ink mb-0.5">~3–5 minutes</div>
              Take your time — there's no timer pressure.
            </div>
          </div>
        </div>

        <Button full size="lg" className="mt-6" onClick={startEval}>
          Start Evaluation →
        </Button>
      </Card>
    );
  }

  // ── Phase: result ────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <ResultScreen
        result={result}
        onRetake={startEval}
        onDone={() => onDone?.(result.estimatedLevel)}
      />
    );
  }

  // ── Phase: evaluating ────────────────────────────────────────────────
  if (!currentQuestion) return null;

  const progress = Math.round((currentIndex / TOTAL_QUESTIONS) * 100);
  const kindLabel: Record<QuestionKind, string> = {
    'mc-hanzi': 'Vocabulary',
    'mc-mean':  'Character Recognition',
    'voice':    'Pronunciation',
  };

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs text-brand font-bold uppercase tracking-wider">
            {kindLabel[currentQuestion.kind]}
          </div>
          <div className="font-bold text-ink">Level Evaluation</div>
        </div>
        <div className="text-right">
          <div className="text-ink-soft font-semibold text-sm tabular-nums">
            {currentIndex + 1} / {TOTAL_QUESTIONS}
          </div>
          <div className="text-xs text-ink-soft">
            ~HSK {diffToLevel(difficulty)}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-ink/8 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-brand rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question */}
      {(currentQuestion.kind === 'mc-hanzi' || currentQuestion.kind === 'mc-mean') && (
        <MCQuestion
          key={currentQuestion.id}
          question={currentQuestion}
          onAnswer={handleAnswer}
        />
      )}

      {currentQuestion.kind === 'voice' && (
        <VoiceQuestion
          key={currentQuestion.id}
          question={currentQuestion}
          onAnswer={handleAnswer}
        />
      )}
    </Card>
  );
}
