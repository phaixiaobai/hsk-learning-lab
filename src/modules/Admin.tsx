/**
 * @file Admin.tsx
 * @description In-app admin dashboard — reads all feedback tables from Supabase
 * and displays aggregated reports to help improve future app versions.
 *
 * Access: append ?admin=1 to any URL (e.g. localhost:5173/?admin=1)
 * Requires: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env
 *
 * Sections:
 *   1. Overview stats
 *   2. Voice score accuracy — which words are scored unfairly
 *   3. Flagged sentences — fill-blank sentences to replace
 *   4. Difficult words — words users find too hard
 *   5. Quiz session ratings — star ratings and comments
 */

import { useEffect, useState } from 'react';
import { db, isSupabaseConfigured } from '../lib/supabase';
import type {
  AdminVoiceFeedbackRow,
  AdminSentenceReportRow,
  AdminWordDifficultyRow,
  AdminQuizFeedbackRow,
} from '../lib/supabase';
import { Card, CardTitle } from '../components/ui/Card';

// ── Helpers ───────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

// ── Stat pill ─────────────────────────────────────────────────────────────

function StatPill({ label, value, color = 'ink' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-ink/5 rounded-2xl px-4 py-3 text-center">
      <div className={`text-2xl font-extrabold text-${color}-600`}>{value}</div>
      <div className="text-xs text-ink-soft mt-0.5">{label}</div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────

function SectionHeader({ emoji, title, count }: { emoji: string; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-2xl">{emoji}</span>
      <h3 className="font-extrabold text-ink text-lg">{title}</h3>
      {count !== undefined && (
        <span className="ml-auto text-xs font-bold text-ink-soft bg-ink/8 rounded-full px-2.5 py-1">
          {count} entries
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function Admin() {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [voiceFb,    setVoiceFb]    = useState<AdminVoiceFeedbackRow[]>([]);
  const [sentenceFb, setSentenceFb] = useState<AdminSentenceReportRow[]>([]);
  const [wordFb,     setWordFb]     = useState<AdminWordDifficultyRow[]>([]);
  const [quizFb,     setQuizFb]     = useState<AdminQuizFeedbackRow[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    Promise.all([
      db.getAdminVoiceFeedback(),
      db.getAdminSentenceReports(),
      db.getAdminWordDifficultyReports(),
      db.getAdminQuizFeedback(),
    ])
      .then(([v, s, w, q]) => {
        setVoiceFb(v);
        setSentenceFb(s);
        setWordFb(w);
        setQuizFb(q);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <Card>
        <CardTitle>🔒 Admin Dashboard</CardTitle>
        <p className="text-ink-soft mt-2 text-sm">
          Supabase not configured. Add <code className="bg-ink/8 px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
          <code className="bg-ink/8 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <div className="text-center py-8 text-ink-soft">Loading feedback data…</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardTitle>⚠️ Error</CardTitle>
        <p className="text-red-600 text-sm mt-2 font-mono">{error}</p>
        <p className="text-ink-soft text-xs mt-2">
          Make sure feedback-schema.sql has been run in Supabase and RLS read policies are set.
        </p>
      </Card>
    );
  }

  // ── Aggregations ────────────────────────────────────────────────

  // Voice: group by word, count verdicts
  const voiceByWord = groupBy(voiceFb, r => r.word_id);
  const voiceSummary = [...voiceByWord.entries()]
    .map(([, rows]) => {
      const accurate  = rows.filter(r => r.verdict === 'accurate').length;
      const too_high  = rows.filter(r => r.verdict === 'too_high').length;
      const too_low   = rows.filter(r => r.verdict === 'too_low').length;
      const total     = rows.length;
      const unfair    = too_high + too_low;
      return { hanzi: rows[0].hanzi, pinyin: rows[0].pinyin, total, accurate, too_high, too_low, unfair };
    })
    .sort((a, b) => b.unfair - a.unfair)
    .slice(0, 20);

  // Sentences: group by sentence, count reports
  const sentByKey   = groupBy(sentenceFb, r => r.word_id + r.sentence.slice(0, 20));
  const sentSummary = [...sentByKey.entries()]
    .map(([, rows]) => ({
      hanzi:    rows[0].hanzi,
      sentence: rows[0].sentence,
      count:    rows.length,
      issues:   [...new Set(rows.map(r => r.issue))],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Words: group by word, count reports
  const wordByKey   = groupBy(wordFb, r => r.word_id);
  const wordSummary = [...wordByKey.entries()]
    .map(([, rows]) => ({
      hanzi:  rows[0].hanzi,
      pinyin: rows[0].pinyin,
      level:  rows[0].level,
      count:  rows.length,
      issues: [...new Set(rows.map(r => r.issue))],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Quiz ratings
  const avgRating = quizFb.length
    ? (quizFb.reduce((s, r) => s + r.rating, 0) / quizFb.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-ink">🛠 Admin Dashboard</h2>
        <p className="text-sm text-ink-soft mt-0.5">User feedback for improving future versions</p>
      </div>

      {/* ── Overview stats ── */}
      <Card>
        <SectionHeader emoji="📊" title="Overview" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill label="Voice feedback"    value={voiceFb.length}    />
          <StatPill label="Flagged sentences" value={sentenceFb.length} color="amber" />
          <StatPill label="Hard words"        value={wordFb.length}     color="red"   />
          <StatPill label="Quiz ratings"      value={quizFb.length}     color="emerald" />
        </div>
      </Card>

      {/* ── Voice score accuracy ── */}
      <Card>
        <SectionHeader emoji="🎤" title="Voice Score Accuracy" count={voiceFb.length} />
        {voiceSummary.length === 0 ? (
          <p className="text-ink-soft text-sm">No voice feedback yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-soft border-b border-ink/8">
                  <th className="pb-2 font-semibold">Word</th>
                  <th className="pb-2 font-semibold text-center">Total</th>
                  <th className="pb-2 font-semibold text-center text-emerald-600">Fair</th>
                  <th className="pb-2 font-semibold text-center text-red-500">Too High</th>
                  <th className="pb-2 font-semibold text-center text-amber-600">Too Low</th>
                </tr>
              </thead>
              <tbody>
                {voiceSummary.map((r, i) => (
                  <tr key={i} className="border-b border-ink/5 last:border-0">
                    <td className="py-2">
                      <span className="font-hanzi text-xl mr-2">{r.hanzi}</span>
                      <span className="text-xs text-brand">{r.pinyin}</span>
                    </td>
                    <td className="py-2 text-center font-bold">{r.total}</td>
                    <td className="py-2 text-center text-emerald-600 font-semibold">{r.accurate}</td>
                    <td className="py-2 text-center text-red-500 font-semibold">{r.too_high}</td>
                    <td className="py-2 text-center text-amber-600 font-semibold">{r.too_low}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Flagged sentences ── */}
      <Card>
        <SectionHeader emoji="🚩" title="Flagged Fill-Blank Sentences" count={sentenceFb.length} />
        {sentSummary.length === 0 ? (
          <p className="text-ink-soft text-sm">No sentence reports yet.</p>
        ) : (
          <div className="space-y-3">
            {sentSummary.map((r, i) => (
              <div key={i} className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-hanzi text-lg text-ink">{r.hanzi}</span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                    {r.count}× flagged
                  </span>
                </div>
                <p className="font-hanzi text-sm text-ink leading-relaxed">{r.sentence}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {r.issues.map(issue => (
                    <span key={issue} className="text-[10px] bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-semibold">
                      {issue.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Difficult words ── */}
      <Card>
        <SectionHeader emoji="😰" title="Words Users Find Difficult" count={wordFb.length} />
        {wordSummary.length === 0 ? (
          <p className="text-ink-soft text-sm">No difficulty reports yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {wordSummary.map((r, i) => (
              <div key={i} className="rounded-2xl border border-red-200 bg-red-50 p-3 flex items-center gap-3">
                <div className="text-center shrink-0">
                  <div className="font-hanzi text-2xl text-ink">{r.hanzi}</div>
                  <div className="text-[10px] text-brand font-bold">{r.pinyin}</div>
                  <div className="text-[9px] text-ink-soft">HSK{r.level}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-red-600 mb-1">{r.count}× reported</div>
                  <div className="flex flex-wrap gap-1">
                    {r.issues.map(issue => (
                      <span key={issue} className="text-[10px] bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 font-semibold">
                        {issue.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Quiz ratings ── */}
      <Card>
        <SectionHeader emoji="⭐" title="Post-Quiz Ratings" count={quizFb.length} />
        <div className="flex items-center gap-4 mb-4">
          <div className="text-4xl font-extrabold text-amber-500">{avgRating}</div>
          <div className="text-sm text-ink-soft">average rating<br />across all sessions</div>
        </div>
        {quizFb.length === 0 ? (
          <p className="text-ink-soft text-sm">No quiz ratings yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {quizFb.slice(0, 30).map((r, i) => (
              <div key={i} className="rounded-xl border border-ink/8 bg-white p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-ink-soft">
                    {r.quiz_mode} · {r.accuracy}% accuracy
                  </span>
                  <span className="text-xs text-ink-soft">{relativeTime(r.created_at)}</span>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                  <span className="text-xs text-ink-soft ml-1">{r.rating}/5</span>
                </div>
                {r.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {r.tags.map(t => (
                      <span key={t} className="text-[10px] bg-ink/8 rounded-full px-2 py-0.5">{t}</span>
                    ))}
                  </div>
                )}
                {r.comment && (
                  <p className="text-xs text-ink-soft italic">"{r.comment}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
