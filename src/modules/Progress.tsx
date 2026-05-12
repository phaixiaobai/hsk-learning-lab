import { useMemo, useState } from 'react';
import vocab from '../data/vocabulary.json';
import type { HskLevel, SectionScore, VocabItem } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import { getSections, makeSectionKey } from '../utils/sections';

/* ================================================================
 * Progress page
 * Displays per-section performance for every HSK level.
 * "Study" navigates back to the Flashcards tab at the chosen section.
 * ================================================================ */

interface Props {
  level: HskLevel;
  onNavigate: (level: HskLevel, sectionIndex: number) => void;
}

const LEVEL_COLORS: Record<HskLevel, string> = {
  2: 'from-sky-500   to-blue-600',
  3: 'from-violet-500 to-purple-600',
  4: 'from-rose-500   to-red-600',
};

export function Progress({ level, onNavigate }: Props) {
  const allVocab = vocab as VocabItem[];
  const [activeLevel, setActiveLevel] = useState<HskLevel>(level);

  const sections = useMemo(
    () => getSections(activeLevel, allVocab),
    [activeLevel],
  );

  const [sectionScores] = useLocalStorage<Record<string, SectionScore[]>>(
    'hsk-master:section-scores', {},
  );

  const totalAttempts = sections.reduce((sum, _, i) => {
    const key = makeSectionKey(activeLevel, i);
    return sum + (sectionScores[key]?.length ?? 0);
  }, 0);

  const completedSections = sections.filter((_, i) => {
    const key = makeSectionKey(activeLevel, i);
    return (sectionScores[key]?.length ?? 0) > 0;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <CardTitle>Progress Tracker</CardTitle>
        <CardSubtitle>Your quiz performance across all sections</CardSubtitle>

        {/* Level tabs */}
        <div className="flex gap-2 mt-4">
          {([2, 3, 4] as const).map(l => (
            <button
              key={l}
              onClick={() => setActiveLevel(l)}
              className={
                'min-h-[44px] px-5 rounded-2xl font-semibold text-base transition ' +
                (activeLevel === l
                  ? 'bg-brand text-white shadow-md'
                  : 'bg-white text-ink border border-ink/10 hover:border-brand/40')
              }
            >
              HSK {l}
            </button>
          ))}
        </div>

        {/* Summary row */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <StatBadge label="Sections" value={`${sections.length}`} />
          <StatBadge label="Studied" value={`${completedSections}`} />
          <StatBadge label="Total Quizzes" value={`${totalAttempts}`} />
        </div>
      </Card>

      {/* Section grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((sectionWords, i) => {
          const key    = makeSectionKey(activeLevel, i);
          const scores = sectionScores[key] ?? [];
          const best   = scores.length > 0
            ? Math.round(Math.max(...scores.map(s => s.score / s.total)) * 100)
            : null;
          const lastDate = scores[0]
            ? new Date(scores[0].date).toLocaleDateString()
            : null;

          return (
            <SectionCard
              key={key}
              sectionNum={i + 1}
              wordStart={i * 15 + 1}
              wordEnd={i * 15 + sectionWords.length}
              preview={sectionWords.slice(0, 4).map(w => w.hanzi)}
              bestPct={best}
              attempts={scores.length}
              lastDate={lastDate}
              gradientClass={LEVEL_COLORS[activeLevel]}
              onStudy={() => onNavigate(activeLevel, i)}
            />
          );
        })}
      </div>

      {sections.length === 0 && (
        <Card>
          <p className="text-ink-soft text-center py-8">
            No sections found for HSK {activeLevel}.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ─── Stat badge ─── */
function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink/5 rounded-2xl p-3">
      <div className="text-2xl font-extrabold text-ink">{value}</div>
      <div className="text-xs text-ink-soft mt-0.5">{label}</div>
    </div>
  );
}

/* ─── Section card ─── */
function SectionCard({
  sectionNum, wordStart, wordEnd, preview,
  bestPct, attempts, lastDate, gradientClass, onStudy,
}: {
  sectionNum: number;
  wordStart: number;
  wordEnd: number;
  preview: string[];
  bestPct: number | null;
  attempts: number;
  lastDate: string | null;
  gradientClass: string;
  onStudy: () => void;
}) {
  const notStarted = bestPct === null;
  const color = notStarted ? 'gray'
    : bestPct >= 80 ? 'emerald'
    : bestPct >= 50 ? 'amber'
    : 'red';

  const scoreRingClass = {
    gray:    'border-ink/15 text-ink-soft',
    emerald: 'border-emerald-400 text-emerald-600',
    amber:   'border-amber-400  text-amber-600',
    red:     'border-red-400    text-red-600',
  }[color];

  const scoreBgClass = {
    gray:    'bg-ink/5',
    emerald: 'bg-emerald-50',
    amber:   'bg-amber-50',
    red:     'bg-red-50',
  }[color];

  return (
    <div className={`rounded-3xl overflow-hidden border border-ink/5 shadow-sm bg-white`}>
      {/* Colored top bar */}
      <div className={`bg-gradient-to-r ${gradientClass} px-5 py-3 flex items-center justify-between`}>
        <span className="text-white font-bold text-sm">Section {sectionNum}</span>
        <span className="text-white/80 text-xs">Words {wordStart}–{wordEnd}</span>
      </div>

      <div className="p-4">
        {/* Hanzi preview */}
        <div className="font-hanzi text-3xl tracking-widest text-ink mb-3">
          {preview.join('  ')}
          {preview.length < 4 && <span className="text-ink-soft text-lg"> …</span>}
        </div>

        {/* Score ring */}
        <div className={`flex items-center gap-3 rounded-2xl p-3 mb-3 ${scoreBgClass}`}>
          <div
            className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-extrabold text-lg flex-shrink-0 ${scoreRingClass}`}
          >
            {notStarted ? '—' : `${bestPct}%`}
          </div>
          <div className="min-w-0">
            {notStarted ? (
              <p className="text-ink-soft text-sm">Not started yet</p>
            ) : (
              <>
                <p className="font-semibold text-ink text-sm">
                  Best: {bestPct}%
                </p>
                <p className="text-ink-soft text-xs">
                  {attempts} attempt{attempts !== 1 ? 's' : ''}
                  {lastDate && ` · Last: ${lastDate}`}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Score history mini-bars */}
        {attempts > 0 && (
          <ScoreHistory attempts={attempts} bestPct={bestPct!} />
        )}

        <Button full variant="secondary" onClick={onStudy} className="mt-3">
          📖 Study Section
        </Button>
      </div>
    </div>
  );
}

/* ─── Tiny bar showing score quality ─── */
function ScoreHistory({ attempts, bestPct }: { attempts: number; bestPct: number }) {
  const barColor = bestPct >= 80 ? 'bg-emerald-500' : bestPct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="flex-1 h-2 bg-ink/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${bestPct}%` }}
        />
      </div>
      <span className="text-xs text-ink-soft whitespace-nowrap">{attempts}×</span>
    </div>
  );
}
