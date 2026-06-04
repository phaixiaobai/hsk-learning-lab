/**
 * @file VocabBar.tsx
 * @description Segmented vocabulary progress bar — the primary navigation
 * and progress-tracking element for category-based learning.
 *
 * Layout
 * ──────
 *
 *  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
 *  │ Part 1 │ │ Part 2 │ │ Part 3 │ │ Part 4 │ │ Part 5 │
 *  │ ██████ │ │ ████░░ │ │ ░░░░░░ │ │ ░░░░░░ │ │   🔒   │
 *  │ 10/10  │ │  6/10  │ │  0/10  │ │ locked │ │ locked │
 *  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
 *       ✓       current     next     locked     locked
 *
 * States
 * ──────
 *  complete   – all words seen + chunk marked done (green)
 *  active     – currently selected chunk (brand blue)
 *  available  – previous chunk complete, this one not started (white)
 *  started    – partially seen, not complete (amber)
 *  locked     – previous chunk not yet complete (gray, no click)
 *
 * Props
 * ─────
 *  chunks         – the word arrays for each segment
 *  chunkSize      – 10 / 15 / 20 (just used for the label)
 *  activeIndex    – currently open chunk index
 *  ratios         – completion ratio 0–1 for each chunk (from useVocabProgress)
 *  completed      – boolean[] whether each chunk is fully done
 *  onSelect       – called with chunk index when user taps a segment
 *  onChunkSize    – optional: called when user changes chunk size
 */

import type { VocabItem } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────

type ChunkSize = 10 | 15 | 20;

interface Props {
  chunks: VocabItem[][];
  chunkSize: ChunkSize;
  activeIndex: number;
  ratios: number[];         // 0.0 – 1.0 per chunk
  completed: boolean[];     // true if chunk fully done
  onSelect: (index: number) => void;
  onChunkSize?: (size: ChunkSize) => void;
  categoryName?: string;
  categoryIcon?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

type SegmentState = 'complete' | 'active' | 'started' | 'available' | 'locked';

function segmentState(
  index: number,
  activeIndex: number,
  ratios: number[],
  completed: boolean[],
): SegmentState {
  if (completed[index])         return 'complete';
  if (index === activeIndex)    return 'active';
  if (ratios[index] > 0)        return 'started';
  // Unlocked if the previous chunk is complete (or it's the first)
  const prevComplete = index === 0 || completed[index - 1];
  return prevComplete ? 'available' : 'locked';
}

const STATE_STYLES: Record<SegmentState, string> = {
  complete:  'border-emerald-400 bg-emerald-50  text-emerald-700 cursor-pointer hover:shadow-sm active:scale-95',
  active:    'border-brand       bg-brand/10    text-brand       cursor-pointer shadow-md scale-[1.03]',
  started:   'border-amber-400   bg-amber-50    text-amber-700   cursor-pointer hover:shadow-sm active:scale-95',
  available: 'border-ink/20      bg-white       text-ink         cursor-pointer hover:border-brand/40 hover:shadow-sm active:scale-95',
  locked:    'border-ink/10      bg-ink/3       text-ink-soft    cursor-not-allowed opacity-60',
};

const FILL_COLORS: Record<SegmentState, string> = {
  complete:  'bg-emerald-400',
  active:    'bg-brand',
  started:   'bg-amber-400',
  available: 'bg-ink/20',
  locked:    'bg-ink/10',
};

// ── Segment ────────────────────────────────────────────────────────────────

function Segment({
  index,
  chunk,
  state,
  ratio,
  isActive,
  onSelect,
}: {
  index: number;
  chunk: VocabItem[];
  state: SegmentState;
  ratio: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  const seenCount = Math.round(ratio * chunk.length);
  const fillPct   = Math.round(ratio * 100);

  return (
    <button
      onClick={state !== 'locked' ? onSelect : undefined}
      disabled={state === 'locked'}
      aria-current={isActive ? 'true' : undefined}
      className={[
        'relative flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3',
        'transition-all duration-200 select-none min-w-[80px]',
        STATE_STYLES[state],
      ].join(' ')}
    >
      {/* Part label */}
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
        Part {index + 1}
      </span>

      {/* Fill bar */}
      <div className="w-full h-1.5 bg-ink/8 rounded-full overflow-hidden">
        <div
          className={['h-full rounded-full transition-all duration-500', FILL_COLORS[state]].join(' ')}
          style={{ width: `${fillPct}%` }}
        />
      </div>

      {/* Count */}
      <span className="text-[11px] font-semibold tabular-nums">
        {state === 'locked'
          ? '🔒'
          : state === 'complete'
          ? `✓ ${chunk.length}`
          : `${seenCount}/${chunk.length}`}
      </span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function VocabBar({
  chunks,
  chunkSize,
  activeIndex,
  ratios,
  completed,
  onSelect,
  onChunkSize,
  categoryName,
  categoryIcon,
}: Props) {
  const doneCount  = completed.filter(Boolean).length;
  const totalWords = chunks.reduce((s, c) => s + c.length, 0);
  const seenWords  = chunks.reduce(
    (s, c, i) => s + Math.round((ratios[i] ?? 0) * c.length),
    0,
  );

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {categoryIcon && <span className="text-xl">{categoryIcon}</span>}
          <div className="min-w-0">
            {categoryName && (
              <div className="font-bold text-sm text-ink truncate">{categoryName}</div>
            )}
            <div className="text-xs text-ink-soft">
              {doneCount}/{chunks.length} parts done · {seenWords}/{totalWords} words seen
            </div>
          </div>
        </div>

        {/* Chunk size selector */}
        {onChunkSize && (
          <div className="inline-flex items-center gap-1 bg-ink/5 rounded-xl p-0.5 shrink-0">
            <span className="text-[10px] text-ink-soft px-1.5">Size</span>
            {([10, 15, 20] as ChunkSize[]).map(s => (
              <button
                key={s}
                onClick={() => onChunkSize(s)}
                className={[
                  'text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all',
                  chunkSize === s
                    ? 'bg-white text-brand shadow-sm'
                    : 'text-ink-soft hover:text-ink',
                ].join(' ')}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Segments — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide snap-x">
        {chunks.map((chunk, i) => {
          const state = segmentState(i, activeIndex, ratios, completed);
          return (
            <div key={i} className="snap-start shrink-0">
              <Segment
                index={i}
                chunk={chunk}
                state={state}
                ratio={ratios[i] ?? 0}
                isActive={i === activeIndex}
                onSelect={() => onSelect(i)}
              />
            </div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      <div className="h-1 bg-ink/8 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand/60 rounded-full transition-all duration-700"
          style={{ width: `${totalWords > 0 ? Math.round((seenWords / totalWords) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}
