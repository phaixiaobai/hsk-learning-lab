/**
 * @file QuizResult.tsx
 * @description Post-quiz results screen. Shows score ring, XP gained, per-kind
 * accuracy breakdown, weak words, and an inline feedback form. Persists XP and
 * feedback to localStorage.
 */

import { useState } from 'react';
import type { QuizSessionResult } from '../../engine/quizEngine';
import { addXP, saveFeedback } from '../../engine/quizEngine';
import { db, isSupabaseConfigured } from '../../lib/supabase';
import type { QuizMode } from '../../engine/quizEngine';
import { AudioButton } from '../../components/ui/AudioButton';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle, CardSubtitle } from '../../components/ui/Card';
import type { UiLang } from '../../components/ui/LanguageToggle';
import { translationLines } from '../../utils/translation';

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(sec: number): string {
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function colourForAcc(acc: number) {
  return acc >= 80 ? 'emerald' : acc >= 55 ? 'amber' : 'red';
}

const MODE_LABELS: Record<QuizMode, string> = {
  'multiple-choice': 'Multiple Choice',
  'fill-blank':      'Fill in the Blank',
  matching:          'Matching',
  voice:             'Voice Quiz',
  writing:           'Writing Test',
  mix:               'Mix Quiz',
};

const QUICK_TAGS = [
  { id: 'too-hard',     label: '😰 Too hard'   },
  { id: 'too-easy',     label: '😌 Too easy'   },
  { id: 'fun',          label: '😄 Fun!'        },
  { id: 'voice-issue',  label: '🎤 Voice issue' },
  { id: 'good-feedback',label: '👍 Good feedback' },
  { id: 'slow',         label: '🐌 Slow'        },
];

// ── Score ring (SVG) ──────────────────────────────────────────────────────

function ScoreRing({ accuracy }: { accuracy: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - accuracy / 100);
  const colour = colourForAcc(accuracy);
  const colMap = { emerald: '#10b981', amber: '#f59e0b', red: '#ef4444' };
  const bgMap  = { emerald: '#ecfdf5', amber: '#fffbeb', red: '#fef2f2' };

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill={bgMap[colour]} stroke="#e5e7eb" strokeWidth={8} />
        <circle
          cx={50} cy={50} r={r}
          fill="none"
          stroke={colMap[colour]}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-extrabold text-${colour}-600`}>{accuracy}%</span>
      </div>
    </div>
  );
}

// ── Star rating ───────────────────────────────────────────────────────────

function StarRating({
  value, onChange, label,
}: { value: number; onChange: (n: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <div className="text-xs text-ink-soft mb-1">{label}</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            className={`text-2xl transition-transform hover:scale-110 ${
              n <= (hover || value) ? 'text-amber-400' : 'text-ink/20'
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  result: QuizSessionResult;
  lang?: UiLang;
  onRetry: () => void;   // rerun same mode
  onNewQuiz: () => void; // back to QuizHub
}

/**
 * Comprehensive results screen with XP award, weak word review, per-mode
 * breakdown, and an inline feedback form that writes to localStorage.
 */
export function QuizResult({ result, lang = 'both', onRetry, onNewQuiz }: Props) {
  // Award XP once on mount
  const [xpTotal] = useState(() => addXP(result.xpGained));

  // Feedback form state
  const [difficulty, setDifficulty]   = useState(0);
  const [enjoyment,  setEnjoyment]    = useState(0);
  const [tags,       setTags]         = useState<string[]>([]);
  const [comment,    setComment]       = useState('');
  const [submitted,  setSubmitted]     = useState(false);

  function toggleTag(id: string) {
    setTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  function handleSubmitFeedback() {
    const fb = {
      sessionId: `${result.mode}-${result.startTime}`,
      mode:      result.mode,
      level:     result.level,
      date:      new Date().toISOString(),
      difficulty,
      enjoyment,
      tags,
      comment,
    };
    // Save to localStorage (offline fallback)
    saveFeedback(fb);
    // Also save to Supabase when configured
    if (isSupabaseConfigured) {
      db.insertQuizFeedback({
        quiz_mode: result.mode,
        rating:    Math.round((difficulty + enjoyment) / 2) || 3,
        tags,
        comment,
        accuracy:  result.accuracy,
      }).catch(() => {/* silent */});
    }
    setSubmitted(true);
  }

  // Per-kind accuracy breakdown
  const kindStats: Record<string, { correct: number; total: number }> = {};
  for (const a of result.attempts) {
    if (!kindStats[a.kind]) kindStats[a.kind] = { correct: 0, total: 0 };
    kindStats[a.kind].total++;
    if (a.isCorrect) kindStats[a.kind].correct++;
  }

  const colour = colourForAcc(result.accuracy);

  return (
    <div className="space-y-5">
      {/* ── Main score card ── */}
      <Card>
        <div className="text-center mb-4">
          <CardTitle>Quiz Complete!</CardTitle>
          <CardSubtitle>{MODE_LABELS[result.mode]} · HSK {result.level}</CardSubtitle>
        </div>

        <ScoreRing accuracy={result.accuracy} />

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3 mt-6 text-center">
          <div className="bg-ink/4 rounded-2xl py-3">
            <div className="text-xl font-extrabold text-ink">{result.attempts.length}</div>
            <div className="text-xs text-ink-soft">Questions</div>
          </div>
          <div className="bg-ink/4 rounded-2xl py-3">
            <div className="text-xl font-extrabold text-ink">{fmt(result.durationSec)}</div>
            <div className="text-xs text-ink-soft">Duration</div>
          </div>
          <div className="bg-amber-50 rounded-2xl py-3 border border-amber-200">
            <div className="text-xl font-extrabold text-amber-600">+{result.xpGained} XP</div>
            <div className="text-xs text-amber-700">Total: {xpTotal}</div>
          </div>
        </div>

        {/* Performance message */}
        <div className={`mt-4 rounded-2xl p-4 text-sm font-medium text-center
          ${colour === 'emerald' ? 'bg-emerald-50 text-emerald-800'
          : colour === 'amber'   ? 'bg-amber-50  text-amber-800'
          : 'bg-red-50 text-red-800'}`}>
          {result.accuracy >= 85 && '🏆 Excellent! You\'re mastering this level.'}
          {result.accuracy >= 70 && result.accuracy < 85 && '👏 Great work! A bit more practice and you\'ve got it.'}
          {result.accuracy >= 50 && result.accuracy < 70 && '💪 Good effort. Review the weak words below.'}
          {result.accuracy <  50 && '🌱 Keep going – repetition is the key to fluency.'}
        </div>

        {/* Per-kind breakdown (only shown for mix) */}
        {result.mode === 'mix' && Object.keys(kindStats).length > 1 && (
          <div className="mt-5">
            <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">
              By question type
            </div>
            <div className="space-y-1.5">
              {Object.entries(kindStats).map(([kind, stat]) => {
                const pct = Math.round((stat.correct / stat.total) * 100);
                const kc  = colourForAcc(pct);
                return (
                  <div key={kind} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-ink-soft capitalize">{kind.replace('-', ' ')}</span>
                    <div className="flex-1 h-2 bg-ink/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-${kc}-400`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-semibold">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button variant="secondary" size="lg" onClick={onRetry}>↻ Retry</Button>
          <Button size="lg" onClick={onNewQuiz}>New Quiz</Button>
        </div>
      </Card>

      {/* ── Weak words ── */}
      {result.weakWords.length > 0 && (
        <Card>
          <CardTitle>📌 Review These Words</CardTitle>
          <CardSubtitle>{result.weakWords.length} word{result.weakWords.length !== 1 ? 's' : ''} to revisit</CardSubtitle>
          <div className="mt-4 space-y-2">
            {result.weakWords.map(w => (
              <div
                key={w.id}
                className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3"
              >
                <span className="font-hanzi text-2xl text-ink leading-none">{w.hanzi}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-brand font-medium text-sm">{w.pinyin}</div>
                  {translationLines(w, lang).map((line, li) => (
                    <div
                      key={li}
                      className={['text-xs truncate text-ink-soft', line.lang === 'th' ? 'font-thai' : ''].join(' ')}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
                <AudioButton text={w.hanzi} size="sm" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Feedback form ── */}
      <Card>
        <CardTitle>💬 Quick Feedback</CardTitle>
        <CardSubtitle>Help us improve HSK Lab</CardSubtitle>

        {submitted ? (
          <div className="mt-4 text-center py-4">
            <div className="text-3xl mb-2">🙏</div>
            <p className="text-ink font-semibold">Thanks for the feedback!</p>
            <p className="text-ink-soft text-sm mt-1">It helps make HSK Lab better.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StarRating value={difficulty} onChange={setDifficulty} label="Difficulty" />
              <StarRating value={enjoyment}  onChange={setEnjoyment}  label="Enjoyment"  />
            </div>

            <div>
              <div className="text-xs text-ink-soft mb-2">Quick tags</div>
              <div className="flex flex-wrap gap-2">
                {QUICK_TAGS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    className={[
                      'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                      tags.includes(t.id)
                        ? 'border-brand bg-brand text-white'
                        : 'border-ink/15 bg-white text-ink-soft hover:border-brand/40',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Any other thoughts? (optional)"
                rows={2}
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand resize-none"
              />
            </div>

            <Button
              full
              disabled={difficulty === 0 && enjoyment === 0 && tags.length === 0 && !comment}
              onClick={handleSubmitFeedback}
            >
              Submit Feedback
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
