import { useMemo } from 'react';
import { Card, CardTitle, CardSubtitle } from '../components/ui/Card';
import {
  getStreak,
  getTotalStudyMinutes,
  getDailyMinutes,
} from '../hooks/useStudySession';
import vocab from '../data/vocabulary.json';
import type { VocabItem } from '../types';
import { CATEGORIES, CATEGORY_MAP } from '../data/categories';
import { getRankedCategories } from '../utils/categoryUtils';
import { QUIZ_HISTORY_KEY, type QuizHistoryEntry, type QuizMode } from '../engine/quizEngine';

const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  'multiple-choice': 'Multiple Choice',
  'fill-blank':      'Fill in the Blank',
  matching:          'Matching',
  voice:             'Voice Quiz',
  writing:           'Writing Test',
  mix:               'Mix Quiz',
};

/* ================================================================
 * Analytics – personal learning dashboard
 * All data is read straight from localStorage (client-only).
 * ================================================================ */

interface VoiceAttempt {
  vocabId: string;
  hanzi: string;
  transcript: string;
  isCorrect: boolean;
  confidence: number;
  date: string;          // ISO string
}

interface SectionScore {
  score: number;
  total: number;
  date: string;
}

/* ── helpers ──────────────────────────────────────────────────── */

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function pct(n: number, d: number) {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function fmt(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/* ── Stat card ────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub }: {
  icon: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center bg-white rounded-3xl border border-ink/8 shadow-sm p-5 gap-1 text-center">
      <div className="text-3xl">{icon}</div>
      <div className="text-2xl font-extrabold text-ink leading-none mt-1">{value}</div>
      <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
    </div>
  );
}

/* ── Mini bar chart (SVG) ─────────────────────────────────────── */
function ActivityChart({ data }: { data: { date: string; minutes: number }[] }) {
  const max = Math.max(...data.map(d => d.minutes), 1);
  const barW = 18;
  const gap  = 4;
  const h    = 80;
  const total = data.length;
  const svgW  = total * (barW + gap) - gap;

  return (
    <div className="overflow-x-auto">
      <svg width={svgW} height={h + 24} className="block mx-auto">
        {data.map((d, i) => {
          const barH  = Math.max(2, Math.round((d.minutes / max) * h));
          const x     = i * (barW + gap);
          const y     = h - barH;
          const isToday = i === data.length - 1;
          const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'narrow' });
          return (
            <g key={d.date}>
              <rect
                x={x} y={y} width={barW} height={barH}
                rx={4}
                className={isToday ? 'fill-brand' : d.minutes > 0 ? 'fill-brand/40' : 'fill-ink/8'}
              />
              <text
                x={x + barW / 2} y={h + 16}
                textAnchor="middle"
                fontSize={9}
                className="fill-ink-soft"
              >
                {dayLabel}
              </text>
              {d.minutes > 0 && (
                <title>{d.date}: {d.minutes}m</title>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Voice accuracy sparkline ─────────────────────────────────── */
function AccuracySparkline({ attempts }: { attempts: VoiceAttempt[] }) {
  if (attempts.length === 0) return (
    <div className="text-center text-ink-soft text-sm py-4">No voice quiz attempts yet.</div>
  );

  // Group last 20 attempts into buckets of 5
  const recent = attempts.slice(0, 20).reverse();
  const buckets: number[] = [];
  for (let i = 0; i < recent.length; i += 5) {
    const chunk = recent.slice(i, i + 5);
    const avg = pct(chunk.filter(a => a.isCorrect).length, chunk.length);
    buckets.push(avg);
  }

  const svgW = buckets.length * 44;
  const h = 50;

  return (
    <svg width={svgW} height={h + 24} className="block mx-auto">
      {buckets.map((v, i) => {
        const barH = Math.max(2, Math.round((v / 100) * h));
        const x = i * 44;
        const colour = v >= 80 ? '#10b981' : v >= 55 ? '#f59e0b' : '#ef4444';
        return (
          <g key={i}>
            <rect x={x + 6} y={h - barH} width={30} height={barH} rx={4} fill={colour} opacity={0.85} />
            <text x={x + 21} y={h + 16} textAnchor="middle" fontSize={10} fill="#888">{v}%</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Quiz accuracy trend (line, oldest → newest) ──────────────── */
function QuizTrend({ accuracies }: { accuracies: number[] }) {
  if (accuracies.length < 2) {
    return (
      <div className="text-center text-ink-soft text-sm py-3">
        Complete a few quizzes to see your accuracy trend.
      </div>
    );
  }
  const w = 280, h = 70, pad = 6;
  const max = accuracies.length - 1;
  const pts = accuracies.map((a, i) => {
    const x = pad + (i / max) * (w - 2 * pad);
    const y = pad + (1 - a / 100) * (h - 2 * pad);
    return [x, y] as const;
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = accuracies[accuracies.length - 1];
  const lineColor = last >= 80 ? '#10b981' : last >= 55 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={w} height={h} className="block mx-auto">
      <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="#eee" />
      <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="#f3f3f3" />
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#eee" />
      <path d={path} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={lineColor} />
      ))}
    </svg>
  );
}

/* ================================================================
 * Main component
 * ================================================================ */
export function Analytics() {
  const allVocab = vocab as VocabItem[];

  /* ── Study stats ── */
  const streak        = getStreak();
  const totalMinutes  = getTotalStudyMinutes();
  const dailyData     = getDailyMinutes(14);

  /* ── Vocabulary mastery ── */
  const scores = useMemo(() =>
    readJSON<Record<string, number>>('hsk-master:scores', {}), []);

  const reviewIds = useMemo(() =>
    readJSON<string[]>('hsk-master:review', []), []);

  const masteredCount = useMemo(() =>
    Object.values(scores).filter(s => s >= 1).length, [scores]);

  const needReviewCount = reviewIds.length;

  /* ── Section quiz performance ── */
  const sectionScores = useMemo(() =>
    readJSON<Record<string, SectionScore>>('hsk-master:section-scores', {}), []);

  const sectionList = useMemo(() => {
    return Object.entries(sectionScores).map(([key, val]) => ({
      key,
      label: (() => {
        const [lv, si] = key.split('-');
        return `HSK${lv} §${Number(si) + 1}`;
      })(),
      pctScore: pct(val.score, val.total),
      date: val.date,
    })).sort((a, b) => b.pctScore - a.pctScore);
  }, [sectionScores]);

  const avgSectionScore = useMemo(() => {
    if (sectionList.length === 0) return null;
    const sum = sectionList.reduce((s, x) => s + x.pctScore, 0);
    return Math.round(sum / sectionList.length);
  }, [sectionList]);

  /* ── Quiz history (Quiz Hub sessions) ── */
  const quizHistory = useMemo(() =>
    readJSON<QuizHistoryEntry[]>(QUIZ_HISTORY_KEY, []), []);

  const quizAvg = useMemo(() => {
    if (quizHistory.length === 0) return null;
    return Math.round(quizHistory.reduce((s, q) => s + q.accuracy, 0) / quizHistory.length);
  }, [quizHistory]);

  // Oldest → newest accuracy series (last 12) for the trend line.
  const quizTrend = useMemo(
    () => quizHistory.slice(0, 12).map(q => q.accuracy).reverse(),
    [quizHistory],
  );

  // Average accuracy per quiz type → recommended focus = lowest type.
  const byMode = useMemo(() => {
    const m: Record<string, { mode: QuizMode; sum: number; n: number }> = {};
    quizHistory.forEach(q => {
      if (!m[q.mode]) m[q.mode] = { mode: q.mode, sum: 0, n: 0 };
      m[q.mode].sum += q.accuracy;
      m[q.mode].n += 1;
    });
    return Object.values(m)
      .map(x => ({ mode: x.mode, avg: Math.round(x.sum / x.n), n: x.n }))
      .sort((a, b) => a.avg - b.avg);
  }, [quizHistory]);

  // Weak words aggregated across all quiz sessions (most-missed first).
  const quizWeakWords = useMemo(() => {
    const m: Record<string, { hanzi: string; pinyin: string; en: string; count: number }> = {};
    quizHistory.forEach(q => q.weakWords.forEach(w => {
      if (!m[w.id]) m[w.id] = { hanzi: w.hanzi, pinyin: w.pinyin, en: w.en, count: 0 };
      m[w.id].count += 1;
    }));
    return Object.values(m).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [quizHistory]);

  /* ── Voice quiz data ── */
  const voiceAttempts = useMemo(() =>
    readJSON<VoiceAttempt[]>('hsk-lab:voice-attempts', []), []);

  const voiceAccuracy = useMemo(() => {
    if (voiceAttempts.length === 0) return null;
    const recent = voiceAttempts.slice(0, 50);
    return pct(recent.filter(a => a.isCorrect).length, recent.length);
  }, [voiceAttempts]);

  /* ── Weakest sections (bottom 3 attempted) ── */
  const weakSections = useMemo(() =>
    [...sectionList].sort((a, b) => a.pctScore - b.pctScore).slice(0, 3),
  [sectionList]);

  /* ── Category performance ── */
  const rankedCats = useMemo(() => getRankedCategories(), []);
  const strongestCat = rankedCats[0] ?? null;
  const weakestCat   = rankedCats.length > 1 ? rankedCats[rankedCats.length - 1] : null;

  /* ── Most mispronounced words ── */
  const mispronounced = useMemo(() => {
    const map: Record<string, { hanzi: string; wrong: number; total: number }> = {};
    voiceAttempts.forEach(a => {
      if (!map[a.vocabId]) map[a.vocabId] = { hanzi: a.hanzi, wrong: 0, total: 0 };
      map[a.vocabId].total++;
      if (!a.isCorrect) map[a.vocabId].wrong++;
    });
    return Object.values(map)
      .filter(x => x.total >= 2)
      .sort((a, b) => (b.wrong / b.total) - (a.wrong / a.total))
      .slice(0, 6);
  }, [voiceAttempts]);

  /* ── Today's studied minutes ── */
  const todayMinutes = dailyData[dailyData.length - 1]?.minutes ?? 0;

  /* ── Vocab size per level ── */
  const levelCounts = useMemo(() => {
    const c: Record<number, number> = { 2: 0, 3: 0, 4: 0 };
    allVocab.forEach(v => { if (c[v.level] !== undefined) c[v.level]++; });
    return c;
  }, [allVocab]);

  const totalWords = allVocab.length;

  return (
    <div className="space-y-6">
      {/* ── Overview stats ── */}
      <Card>
        <CardTitle>📈 Learning Analytics</CardTitle>
        <CardSubtitle>Your personal progress snapshot</CardSubtitle>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatCard
            icon="🔥"
            label="Day Streak"
            value={streak}
            sub={streak === 1 ? '1 day' : `${streak} days`}
          />
          <StatCard
            icon="⏱"
            label="Total Study"
            value={fmt(totalMinutes)}
            sub={`${fmt(todayMinutes)} today`}
          />
          <StatCard
            icon="✅"
            label="Words Mastered"
            value={masteredCount}
            sub={`of ${totalWords} total`}
          />
          <StatCard
            icon="📌"
            label="For Review"
            value={needReviewCount}
            sub="flagged words"
          />
        </div>
      </Card>

      {/* ── Quiz results / history ── */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>🧩 Quiz Results</CardTitle>
            <CardSubtitle>
              {quizHistory.length === 0
                ? 'No quizzes completed yet'
                : `${quizHistory.length} quiz${quizHistory.length !== 1 ? 'zes' : ''} taken`}
            </CardSubtitle>
          </div>
          {quizAvg !== null && (
            <div className={`text-2xl font-extrabold px-3 py-1 rounded-2xl ${
              quizAvg >= 80 ? 'bg-emerald-50 text-emerald-700'
              : quizAvg >= 55 ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-red-700'
            }`}>
              {quizAvg}% avg
            </div>
          )}
        </div>

        {quizHistory.length === 0 ? (
          <p className="text-sm text-ink-soft mt-4">
            Take a quiz in the Quiz tab — your date, type, score and weak words will appear here.
          </p>
        ) : (
          <>
            {/* Accuracy trend */}
            <div className="mt-4">
              <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1">Accuracy Trend</div>
              <QuizTrend accuracies={quizTrend} />
            </div>

            {/* Recent results table — date · type · score */}
            <div className="mt-4">
              <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">Recent Quizzes</div>
              <div className="space-y-1.5">
                {quizHistory.slice(0, 8).map((q, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-ink-soft w-20 shrink-0 text-xs">
                      {new Date(q.date).toLocaleDateString()}
                    </span>
                    <span className="flex-1 truncate text-ink">
                      {QUIZ_MODE_LABELS[q.mode]} · HSK {q.level}
                    </span>
                    <span className="text-ink-soft text-xs w-12 text-right shrink-0">
                      {q.correct}/{q.questions}
                    </span>
                    <span className={[
                      'text-xs font-bold w-10 text-right shrink-0',
                      q.accuracy >= 80 ? 'text-emerald-600' : q.accuracy >= 55 ? 'text-amber-600' : 'text-red-600',
                    ].join(' ')}>
                      {q.accuracy}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weak areas */}
            {quizWeakWords.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">
                  Weak Areas (most-missed words)
                </div>
                <div className="flex flex-wrap gap-2">
                  {quizWeakWords.map(w => (
                    <div key={w.hanzi} className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-2xl px-3 py-1.5 text-sm">
                      <span className="font-hanzi text-lg text-red-700 leading-none">{w.hanzi}</span>
                      <span className="text-red-500 text-[11px]">{w.pinyin}</span>
                      {w.count > 1 && <span className="text-red-400 text-[10px]">×{w.count}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended focus */}
            {byMode.length > 0 && (
              <div className="mt-5 flex items-start gap-3 p-3 bg-brand/5 rounded-2xl border border-brand/20">
                <span className="text-xl">🎯</span>
                <div>
                  <div className="font-semibold text-ink text-sm">Recommended focus</div>
                  <div className="text-xs text-ink-soft mt-0.5">
                    Your lowest quiz type is <strong>{QUIZ_MODE_LABELS[byMode[0].mode]}</strong> ({byMode[0].avg}% avg).
                    {quizWeakWords.length > 0 && <> Drill the most-missed words above, then retry that mode.</>}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Daily activity ── */}
      <Card>
        <CardTitle>📅 Daily Activity</CardTitle>
        <CardSubtitle>Study minutes over the last 14 days</CardSubtitle>
        <div className="mt-5">
          <ActivityChart data={dailyData} />
          <p className="text-xs text-ink-soft text-center mt-2">
            ■ today &nbsp; ■ past days &nbsp; □ no session
          </p>
        </div>
      </Card>

      {/* ── Section quiz performance ── */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>🧠 Section Quiz Scores</CardTitle>
            <CardSubtitle>
              {sectionList.length === 0
                ? 'No quizzes completed yet'
                : `${sectionList.length} section${sectionList.length !== 1 ? 's' : ''} attempted`}
            </CardSubtitle>
          </div>
          {avgSectionScore !== null && (
            <div className={`text-2xl font-extrabold px-3 py-1 rounded-2xl ${
              avgSectionScore >= 80 ? 'bg-emerald-50 text-emerald-700'
              : avgSectionScore >= 55 ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-red-700'
            }`}>
              {avgSectionScore}% avg
            </div>
          )}
        </div>

        {sectionList.length === 0 ? (
          <p className="text-sm text-ink-soft mt-4">
            Complete a section quiz in Flashcards to see your scores here.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {sectionList.map(s => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="text-xs font-semibold w-16 shrink-0 text-ink-soft">{s.label}</span>
                <div className="flex-1 h-3 bg-ink/8 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      s.pctScore >= 80 ? 'bg-emerald-400'
                      : s.pctScore >= 55 ? 'bg-amber-400'
                      : 'bg-red-400'
                    }`}
                    style={{ width: `${s.pctScore}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-10 text-right ${
                  s.pctScore >= 80 ? 'text-emerald-600'
                  : s.pctScore >= 55 ? 'text-amber-600'
                  : 'text-red-600'
                }`}>
                  {s.pctScore}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Voice quiz ── */}
      <Card>
        <CardTitle>🎤 Voice Quiz Accuracy</CardTitle>
        <CardSubtitle>
          {voiceAttempts.length === 0
            ? 'No attempts yet'
            : `${voiceAttempts.length} attempt${voiceAttempts.length !== 1 ? 's' : ''} · last 50 shown`}
        </CardSubtitle>

        {voiceAccuracy !== null && (
          <div className="flex items-center gap-3 mt-3">
            <div className={`text-2xl font-extrabold px-3 py-1 rounded-2xl ${
              voiceAccuracy >= 80 ? 'bg-emerald-50 text-emerald-700'
              : voiceAccuracy >= 55 ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-red-700'
            }`}>
              {voiceAccuracy}%
            </div>
            <span className="text-sm text-ink-soft">overall accuracy (last 50)</span>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <AccuracySparkline attempts={voiceAttempts} />
        </div>

        {mispronounced.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Needs Pronunciation Work
            </div>
            <div className="flex flex-wrap gap-2">
              {mispronounced.map(w => (
                <div
                  key={w.hanzi}
                  className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-2xl px-3 py-1.5 text-sm"
                >
                  <span className="font-hanzi text-lg text-red-700 leading-none">{w.hanzi}</span>
                  <span className="text-red-500 text-xs">
                    {pct(w.wrong, w.total)}% wrong
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Category performance ── */}
      {rankedCats.length > 0 && (
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>🗂️ Performance by Category</CardTitle>
              <CardSubtitle>{rankedCats.length} categor{rankedCats.length !== 1 ? 'ies' : 'y'} attempted</CardSubtitle>
            </div>
          </div>

          {/* Strongest / Weakest summary */}
          {strongestCat && weakestCat && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              {[
                { label: '🏆 Strongest', cat: strongestCat, colorCls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                { label: '📉 Needs Work', cat: weakestCat,  colorCls: 'bg-red-50 border-red-200 text-red-800' },
              ].map(({ label, cat, colorCls }) => {
                const meta = CATEGORY_MAP.get(cat.id);
                return (
                  <div key={cat.id} className={`rounded-2xl border p-3 ${colorCls}`}>
                    <div className="text-xs font-semibold opacity-70 mb-1">{label}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{meta?.icon ?? '📝'}</span>
                      <div>
                        <div className="text-sm font-bold leading-tight">{meta?.name ?? cat.id}</div>
                        <div className="text-xs opacity-80">{cat.accuracy}% · {cat.total} Qs</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Category bars */}
          <div className="mt-4 space-y-2.5">
            {rankedCats.map(({ id, accuracy, total }) => {
              const meta = CATEGORY_MAP.get(id);
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="text-base w-6 text-center shrink-0">{meta?.icon ?? '📝'}</span>
                  <span className="text-xs font-medium text-ink-soft truncate w-28 shrink-0">
                    {meta?.name ?? id}
                  </span>
                  <div className="flex-1 h-2.5 bg-ink/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        accuracy >= 80 ? 'bg-emerald-400'
                        : accuracy >= 50 ? 'bg-amber-400'
                        : 'bg-red-400'
                      }`}
                      style={{ width: `${accuracy}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-9 text-right shrink-0 ${
                    accuracy >= 80 ? 'text-emerald-600'
                    : accuracy >= 50 ? 'text-amber-600'
                    : 'text-red-600'
                  }`}>
                    {accuracy}%
                  </span>
                  <span className="text-[10px] text-ink-soft w-12 text-right shrink-0">
                    {total}q
                  </span>
                </div>
              );
            })}
          </div>

          {/* Untried categories */}
          {rankedCats.length < CATEGORIES.length && (
            <p className="text-xs text-ink-soft mt-4">
              {CATEGORIES.length - rankedCats.length} categor{CATEGORIES.length - rankedCats.length !== 1 ? 'ies' : 'y'} not yet attempted.
              Try the Quiz Hub to build data across all topics.
            </p>
          )}
        </Card>
      )}

      {/* ── Recommendations ── */}
      {(weakSections.length > 0 || needReviewCount > 0 || weakestCat) && (
        <Card>
          <CardTitle>💡 Recommendations</CardTitle>
          <div className="mt-3 space-y-3">
            {needReviewCount > 0 && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <span className="text-xl">📌</span>
                <div>
                  <div className="font-semibold text-amber-800 text-sm">
                    {needReviewCount} word{needReviewCount !== 1 ? 's' : ''} waiting for review
                  </div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    Open Flashcards → Review mode to clear your queue.
                  </div>
                </div>
              </div>
            )}
            {weakestCat && weakestCat.accuracy < 65 && (() => {
              const meta = CATEGORY_MAP.get(weakestCat.id);
              return (
                <div className="flex items-start gap-3 p-3 bg-red-50 rounded-2xl border border-red-200">
                  <span className="text-xl">{meta?.icon ?? '📝'}</span>
                  <div>
                    <div className="font-semibold text-red-800 text-sm">
                      Drill "{meta?.name}" — only {weakestCat.accuracy}% accuracy
                    </div>
                    <div className="text-xs text-red-700 mt-0.5">
                      Go to Vocab → {meta?.name} and hit "Study this category".
                    </div>
                  </div>
                </div>
              );
            })()}
            {voiceAttempts.length > 5 && voiceAccuracy !== null && voiceAccuracy < 60 && (
              <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-2xl border border-purple-200">
                <span className="text-xl">🎤</span>
                <div>
                  <div className="font-semibold text-purple-800 text-sm">
                    Pronunciation needs work ({voiceAccuracy}%)
                  </div>
                  <div className="text-xs text-purple-700 mt-0.5">
                    Use the slow 🐢 audio button to hear individual tones clearly.
                  </div>
                </div>
              </div>
            )}
            {weakSections.map(s => (
              <div key={s.key} className="flex items-start gap-3 p-3 bg-orange-50 rounded-2xl border border-orange-200">
                <span className="text-xl">📖</span>
                <div>
                  <div className="font-semibold text-orange-800 text-sm">
                    Re-study {s.label} · {s.pctScore}% score
                  </div>
                  <div className="text-xs text-orange-700 mt-0.5">
                    Visit Progress → Study Section to drill this section again.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Vocabulary breakdown ── */}
      <Card>
        <CardTitle>📚 Vocabulary Pool</CardTitle>
        <div className="mt-4 space-y-2">
          {([2, 3, 4] as const).map(lv => {
            const count = levelCounts[lv];
            const levelMastered = allVocab
              .filter(v => v.level === lv && (scores[v.id] ?? 0) >= 1).length;
            const p = pct(levelMastered, count);
            return (
              <div key={lv} className="flex items-center gap-3">
                <span className="text-xs font-semibold w-14 shrink-0 text-ink-soft">HSK {lv}</span>
                <div className="flex-1 h-3 bg-ink/8 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${p}%` }}
                  />
                </div>
                <span className="text-xs text-ink-soft w-24 text-right">
                  {levelMastered} / {count} ({p}%)
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-ink-soft mt-3">
          "Mastered" = answered correctly at least once in a section quiz.
        </p>
      </Card>
    </div>
  );
}
