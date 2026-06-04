/**
 * @file VocabBrowser.tsx
 * @description Vocabulary Browser — three view modes:
 *
 *   By Category  — semantic groups (Food, Travel, …) with mastery bars
 *   By Level     — HSK 2 / 3 / 4 accordions
 *   Favorites    — words flagged for review (from existing review queue)
 *
 * Each category card shows word count + mastery % (from category analytics).
 * Clicking a card expands an inline word list with search, audio buttons,
 * and a "Study this category" CTA that opens QuizHub with that filter.
 *
 * No backend required — all data is from vocabulary.json + localStorage.
 */

import { useEffect, useMemo, useState } from 'react';
import vocab from '../data/vocabulary.json';
import { CATEGORIES, CATEGORY_MAP } from '../data/categories';
import {
  getWordsByCategory,
  getCategoryCounts,
  getCategoryAccuracy,
} from '../utils/categoryUtils';
import type { HskLevel, SectionScore, VocabItem } from '../types';
import { AudioButton } from '../components/ui/AudioButton';
import { VocabBar } from '../components/ui/VocabBar';
import { splitIntoChunks, useVocabProgress } from '../hooks/useVocabProgress';
import { useFavoriteCategories } from '../hooks/useFavoriteCategories';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getSections, makeSectionKey } from '../utils/sections';
import { Button } from '../components/ui/Button';
import type { UiLang } from '../components/ui/LanguageToggle';
import { translationLines } from '../utils/translation';
import { posLabel } from '../utils/pos';

// ── Types ──────────────────────────────────────────────────────────────────

type ViewMode  = 'category' | 'level';
type SortKey   = 'hanzi' | 'pinyin' | 'english';
type ChunkSize = 10 | 15 | 20;

interface Props {
  level: HskLevel;
  /** UI language for translations in previews. */
  lang?: UiLang;
  /**
   * Called when user taps "Study" on a category chunk.
   * Passes: word IDs, human label, categoryId, chunkIndex, chunkSize
   * so the Flashcard window can offer "next part" auto-advance.
   */
  onStudy?: (
    wordIds: string[],
    label: string,
    categoryId?: string,
    chunkIndex?: number,
    chunkSize?: number,
  ) => void;
  /** Jump to a specific HSK level + section in the Flashcards tab. */
  onNavigate?: (level: HskLevel, sectionIndex: number) => void;
  /**
   * Called when the user changes HSK level inside VocabBrowser.
   * The parent (App) should update its level state — all other modules
   * (Flashcards, Writing, Quiz, QuickReview) follow this selection.
   * The top-right indicator becomes display-only as a result.
   */
  onLevelChange?: (level: HskLevel) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sortWords(words: VocabItem[], key: SortKey): VocabItem[] {
  return [...words].sort((a, b) => {
    if (key === 'hanzi')   return a.hanzi.localeCompare(b.hanzi, 'zh');
    if (key === 'pinyin')  return a.pinyin.localeCompare(b.pinyin);
    return a.en.localeCompare(b.en);
  });
}

function filterWords(words: VocabItem[], q: string): VocabItem[] {
  const lq = q.toLowerCase();
  return words.filter(
    w =>
      w.hanzi.includes(lq) ||
      w.pinyin.toLowerCase().includes(lq) ||
      w.en.toLowerCase().includes(lq),
  );
}

// ── Mastery bar colour helper ──────────────────────────────────────────────

function masteryColor(pct: number | null): string {
  if (pct === null) return 'bg-ink/10';
  if (pct >= 80)   return 'bg-emerald-400';
  if (pct >= 50)   return 'bg-amber-400';
  return 'bg-red-400';
}

// ── Word card ──────────────────────────────────────────────────────────────

function WordCard({ word }: { word: VocabItem }) {
  const cat = CATEGORY_MAP.get(
    (() => {
      const cache = (window as any).__catCache;
      return cache ? cache.get(word.id) : 'general';
    })(),
  );
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-ink/5 last:border-0 group">
      <div className="font-hanzi text-2xl leading-none text-ink min-w-[2.5rem] text-center">
        {word.hanzi}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-brand font-bold truncate">{word.pinyin}</div>
        <div className="text-sm text-ink truncate">{word.en}</div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <AudioButton text={word.hanzi} size="sm" />
        <AudioButton text={word.hanzi} size="sm" slow />
      </div>
      <span className={[
        'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
        cat ? cat.color.badge : 'bg-gray-100 text-gray-500',
      ].join(' ')}>
        HSK{word.level}
      </span>
    </div>
  );
}

// ── Category card (with VocabBar + favorites) ─────────────────────────────

function CategoryCard({
  categoryId,
  count,
  chunkSize,
  isFav,
  onToggleFav,
  onStudy,
}: {
  categoryId: string;
  count: number;
  chunkSize: ChunkSize;
  isFav: boolean;
  onToggleFav: () => void;
  onStudy?: (wordIds: string[], label: string, catId: string, chunkIdx: number, size: number) => void;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [activeChunk, setActiveChunk] = useState(0);
  const [search,      setSearch]      = useState('');
  const [sort,        setSort]        = useState<SortKey>('hanzi');

  const cat = CATEGORY_MAP.get(categoryId);
  if (!cat) return null;

  const accuracy = getCategoryAccuracy(categoryId);
  const allWords  = useMemo(() => getWordsByCategory(categoryId), [categoryId]);
  const chunks    = useMemo(() => splitIntoChunks(allWords, chunkSize), [allWords, chunkSize]);

  const { getChunkRatio, getChunkProgress, markChunkComplete } = useVocabProgress();

  const ratios    = chunks.map((_, i) => getChunkRatio(categoryId, i, chunks[i]));
  const completed = chunks.map((_, i) => getChunkProgress(categoryId, i).completed);

  const chunkWords    = chunks[activeChunk] ?? [];
  const displayWords  = useMemo(
    () => sortWords(filterWords(search ? allWords : chunkWords, search), sort),
    [allWords, chunkWords, search, sort],
  );

  return (
    <div className={['rounded-2xl border-2 overflow-hidden transition-all', expanded ? cat.color.border : 'border-ink/8'].join(' ')}>

      {/* ── Card header ── */}
      <div className={['flex items-center gap-3 px-4 py-3 transition-colors', expanded ? cat.color.bg : 'bg-white'].join(' ')}>
        <button
          onClick={e => { e.stopPropagation(); onToggleFav(); }}
          className="text-lg leading-none transition-transform active:scale-90"
        >
          {isFav ? '⭐' : '☆'}
        </button>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <div className="text-3xl leading-none select-none">{cat.icon}</div>
          <div className="flex-1 min-w-0">
            <div className={['font-bold text-sm', cat.color.text].join(' ')}>{cat.name}</div>
            <div className="text-xs text-ink-soft mt-0.5">{cat.nameZh} · {count} words · {chunks.length} parts</div>
            <div className="mt-1.5 h-1.5 bg-ink/8 rounded-full overflow-hidden w-full">
              <div
                className={['h-full rounded-full transition-all', masteryColor(accuracy)].join(' ')}
                style={{ width: accuracy !== null ? `${accuracy}%` : '0%' }}
              />
            </div>
          </div>
          <div className="text-right shrink-0 ml-2">
            <div className={['text-xs font-bold', cat.color.text].join(' ')}>{accuracy !== null ? `${accuracy}%` : '—'}</div>
            <div className="text-[10px] text-ink-soft">mastery</div>
            <div className={['text-xs mt-1 transition-transform', expanded ? 'rotate-180' : ''].join(' ')}>▾</div>
          </div>
        </button>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div className="border-t border-ink/8">
          <div className="px-4 pt-4 pb-2">
            <VocabBar
              chunks={chunks}
              chunkSize={chunkSize}
              activeIndex={activeChunk}
              ratios={ratios}
              completed={completed}
              onSelect={setActiveChunk}
              categoryIcon={cat.icon}
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-ink/2">
            <input
              type="search"
              placeholder={search ? 'Search all words…' : `Search Part ${activeChunk + 1}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm rounded-xl border border-ink/10 px-3 py-1.5 focus:outline-none focus:border-brand min-w-0"
            />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="text-xs rounded-xl border border-ink/10 px-2 py-1.5 focus:outline-none bg-white"
            >
              <option value="hanzi">汉字</option>
              <option value="pinyin">Pinyin</option>
              <option value="english">English</option>
            </select>
          </div>
          <div className="px-4 max-h-60 overflow-y-auto">
            {displayWords.length === 0
              ? <p className="py-4 text-center text-sm text-ink-soft">No words match.</p>
              : displayWords.map(w => <WordCard key={w.id} word={w} />)
            }
          </div>
          <div className="px-4 py-3 border-t border-ink/8 flex gap-2 flex-wrap">
            {!completed[activeChunk] && (
              <button
                onClick={() => markChunkComplete(categoryId, activeChunk)}
                className="text-xs font-semibold border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 hover:bg-emerald-100 transition-colors active:scale-95"
              >
                ✓ Mark Part {activeChunk + 1} Done
              </button>
            )}
            {onStudy && (
              <button
                onClick={() => onStudy(
                  (search ? allWords : chunkWords).map(w => w.id),
                  search
                    ? `${cat.icon} ${cat.name} – All`
                    : `${cat.icon} ${cat.name} · Part ${activeChunk + 1}`,
                  categoryId,
                  search ? 0 : activeChunk,
                  chunkSize,
                )}
                className={[
                  'flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95',
                  cat.color.bg, cat.color.text, 'border', cat.color.border, 'hover:shadow-sm',
                ].join(' ')}
              >
                📚 Study {search ? 'All' : `Part ${activeChunk + 1}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Level accordion ────────────────────────────────────────────────────────

function LevelAccordion({
  level,
  onStudy,
}: {
  level: HskLevel;
  onStudy?: (wordIds: string[], label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('hanzi');

  const allWords = useMemo(
    () => (vocab as VocabItem[]).filter(w => w.level === level),
    [level],
  );
  const displayWords = useMemo(
    () => sortWords(filterWords(allWords, search), sort),
    [allWords, search, sort],
  );

  const colors: Record<HskLevel, { bg: string; text: string; border: string }> = {
    2: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    3: { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
    4: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200'  },
  };
  const c = colors[level];

  return (
    <div className={['rounded-2xl border-2 overflow-hidden', open ? c.border : 'border-ink/8'].join(' ')}>
      <button
        onClick={() => setOpen(v => !v)}
        className={['w-full flex items-center gap-3 px-4 py-3 text-left', open ? c.bg : 'bg-white hover:' + c.bg].join(' ')}
      >
        <div className="text-2xl">📗</div>
        <div className="flex-1">
          <div className={['font-bold text-sm', c.text].join(' ')}>HSK {level}</div>
          <div className="text-xs text-ink-soft">{allWords.length} words</div>
        </div>
        <div className={['text-xs transition-transform', open ? 'rotate-180' : ''].join(' ')}>▾</div>
      </button>

      {open && (
        <div className="border-t border-ink/8">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-ink/2">
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm rounded-xl border border-ink/10 px-3 py-1.5 focus:outline-none focus:border-brand min-w-0"
            />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="text-xs rounded-xl border border-ink/10 px-2 py-1.5 focus:outline-none bg-white"
            >
              <option value="hanzi">汉字</option>
              <option value="pinyin">Pinyin</option>
              <option value="english">English</option>
            </select>
          </div>
          <div className="px-4 max-h-72 overflow-y-auto">
            {displayWords.map(w => <WordCard key={w.id} word={w} />)}
          </div>
          {onStudy && (
            <div className="px-4 py-3 border-t border-ink/8">
              <button
                onClick={() => onStudy(allWords.map(w => w.id), `HSK ${level}`)}
                className={['w-full py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95 hover:shadow-sm', c.bg, c.text, c.border].join(' ')}
              >
                📚 Study HSK {level}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Progress tracker (embedded) ────────────────────────────────────────────

const LEVEL_COLORS: Record<HskLevel, string> = {
  2: 'from-sky-500   to-blue-600',
  3: 'from-violet-500 to-purple-600',
  4: 'from-rose-500   to-red-600',
};

// ── Progress pill ──────────────────────────────────────────────────────────

function ProgressPill({
  label,
  done,
  subtitle,
  highlight = false,
}: {
  label: string;
  done: boolean;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <div className={[
      'flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs',
      done
        ? highlight
          ? 'bg-brand/10 border border-brand/20'
          : 'bg-emerald-50 border border-emerald-100'
        : 'bg-ink/5 border border-transparent',
    ].join(' ')}>
      <span className={[
        'text-base leading-none flex-shrink-0',
        done ? (highlight ? 'text-brand' : 'text-emerald-500') : 'opacity-25',
      ].join(' ')}>
        {done ? '●' : '○'}
      </span>
      <div className="min-w-0">
        <div className={[
          'font-semibold truncate',
          done ? (highlight ? 'text-brand' : 'text-emerald-700') : 'text-ink-soft',
        ].join(' ')}>
          {label}
        </div>
        {subtitle && (
          <div className="text-[10px] text-ink-soft leading-none mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

// ── Review Vocab panel ─────────────────────────────────────────────────────

function ReviewVocabPanel({ words, lang }: { words: VocabItem[]; lang: UiLang }) {
  return (
    <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-soft mb-1">
        All {words.length} words
      </div>
      {words.map(w => (
        <div key={w.id} className="rounded-xl border border-ink/8 bg-white p-3">
          {/* Hanzi + POS badge */}
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-hanzi text-2xl text-ink leading-tight">{w.hanzi}</span>
            {w.pos && (
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-ink/5 border border-ink/10 rounded-full px-1.5 py-0.5 text-ink-soft flex-shrink-0">
                {posLabel(w.pos)}
              </span>
            )}
          </div>
          {/* Pinyin */}
          <div className="text-sm text-brand font-semibold mb-0.5">{w.pinyin}</div>
          {/* Translations */}
          {translationLines(w, lang).map((line, li) => (
            <div
              key={li}
              className={[
                'text-sm leading-snug',
                li === 0 ? 'text-ink' : 'text-ink-soft',
                line.lang === 'th' ? 'font-thai' : '',
              ].join(' ')}
            >
              {line.text}
            </div>
          ))}
          {/* Example sentence */}
          {w.exampleZh && (
            <div className="mt-2 pt-2 border-t border-ink/8">
              <div className="text-[9px] font-bold uppercase tracking-wider text-ink-soft mb-1">Example</div>
              <div className="font-hanzi text-sm text-ink leading-snug">{w.exampleZh}</div>
              {w.examplePinyin && (
                <div className="text-xs text-brand mt-0.5">{w.examplePinyin}</div>
              )}
              {translationLines(
                { en: w.exampleEn ?? '', th: w.exampleTh ?? '' },
                lang,
              ).map((line, li) => (
                <div
                  key={li}
                  className={['text-xs text-ink-soft', line.lang === 'th' ? 'font-thai' : ''].join(' ')}
                >
                  {line.text}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Progress section ───────────────────────────────────────────────────────

function ProgressSection({
  initialLevel,
  onNavigate,
  lang = 'both',
}: {
  initialLevel: HskLevel;
  onNavigate?: (level: HskLevel, sectionIndex: number) => void;
  lang?: UiLang;
}) {
  const allVocab = vocab as VocabItem[];
  const [activeLevel, setActiveLevel] = useState<HskLevel>(initialLevel);
  /** Sync when parent level changes (e.g. user picks HSK 3 in the level selector). */
  useEffect(() => { setActiveLevel(initialLevel); setReviewKey(null); }, [initialLevel]);
  /** Key of the section whose Review Vocab panel is open (null = all closed). */
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const sections = useMemo(() => getSections(activeLevel, allVocab), [activeLevel]);

  const [sectionScores] = useLocalStorage<Record<string, SectionScore[]>>(
    'hsk-master:section-scores', {},
  );
  // Sections where user flipped through all flashcards (written by Flashcards module).
  const [studiedSections] = useLocalStorage<string[]>(
    'hsk-master:studied-sections', [],
  );
  // Word IDs where user completed HanziWriter quiz mode (written by WritingPad).
  const [writtenWords] = useLocalStorage<string[]>(
    'hsk-master:written-words', [],
  );

  /** Best quiz % for a section, or null if never quizzed. */
  const bestOf = (i: number): number | null => {
    const scores = sectionScores[makeSectionKey(activeLevel, i)] ?? [];
    return scores.length > 0
      ? Math.round(Math.max(...scores.map(s => s.score / s.total)) * 100)
      : null;
  };

  // Summary stats
  const studiedCount = sections.filter((_, i) =>
    studiedSections.includes(makeSectionKey(activeLevel, i)),
  ).length;
  const quizzedCount = sections.filter((_, i) =>
    (sectionScores[makeSectionKey(activeLevel, i)]?.length ?? 0) > 0,
  ).length;
  const attemptedBests = sections
    .map((_, i) => bestOf(i))
    .filter((b): b is number => b !== null);
  const avgScore = attemptedBests.length > 0
    ? Math.round(attemptedBests.reduce((a, b) => a + b, 0) / attemptedBests.length)
    : null;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-extrabold text-ink text-base">Progress Tracker</h3>
          <p className="text-xs text-ink-soft">Section-by-section progress for HSK {activeLevel}</p>
        </div>
        <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1">
          {([2, 3, 4] as const).map(l => (
            <button
              key={l}
              onClick={() => { setActiveLevel(l); setReviewKey(null); }}
              className={[
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                activeLevel === l ? 'bg-brand text-white shadow-sm' : 'text-ink-soft hover:text-ink',
              ].join(' ')}
            >
              HSK {l}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Sections', value: `${sections.length}` },
          { label: 'Studied',  value: `${studiedCount}` },
          { label: 'Quizzed',  value: `${quizzedCount}` },
          { label: 'Avg Score', value: avgScore !== null ? `${avgScore}%` : '—' },
        ].map(s => (
          <div key={s.label} className="bg-ink/5 rounded-2xl p-2">
            <div className="text-lg font-extrabold text-ink">{s.value}</div>
            <div className="text-[10px] text-ink-soft mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Section cards — responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sections.map((section, i) => {
          const sectionWords = section.words;
          const key    = makeSectionKey(activeLevel, i);
          const scores = sectionScores[key] ?? [];
          const best   = scores.length > 0
            ? Math.round(Math.max(...scores.map(s => s.score / s.total)) * 100)
            : null;

          // ── 4 progress metrics ──
          // 1. Flashcards Studied: user flipped through all cards in this section
          const isStudied = studiedSections.includes(key);
          // 2. Writing Completed: >= 50% of section words practiced in quiz mode
          const writtenCount = sectionWords.filter(w => writtenWords.includes(w.id)).length;
          const isWritingDone = sectionWords.length > 0 && writtenCount / sectionWords.length >= 0.5;
          const writingSubtitle = writtenCount > 0 ? `${writtenCount}/${sectionWords.length}` : undefined;
          // 3. Quiz Score: best score across all quiz attempts
          const quizDone = best !== null;
          const quizSubtitle = quizDone ? `Best: ${best}%` : undefined;
          // 4. Overall Completion: only complete after quiz is done
          const isComplete = quizDone;

          // Skill level label derived from quiz score
          const skillLevel = !quizDone
            ? isStudied ? 'Studying' : 'Not started'
            : best >= 90 ? 'Mastered'
            : best >= 70 ? 'Proficient'
            : best >= 50 ? 'Learning'
            : 'Needs Work';

          const skillBadgeClass = !quizDone
            ? isStudied ? 'bg-amber-100/80 text-amber-700' : 'bg-white/20 text-white/80'
            : best >= 90 ? 'bg-emerald-100/90 text-emerald-700'
            : best >= 70 ? 'bg-sky-100/90 text-sky-700'
            : best >= 50 ? 'bg-amber-100/90 text-amber-700'
            : 'bg-red-100/90 text-red-700';

          return (
            <div key={key} className="rounded-2xl overflow-hidden border border-ink/8 shadow-sm bg-white">
              {/* ── Header: label + word count / range + skill level ── */}
              <div className={`bg-gradient-to-r ${LEVEL_COLORS[activeLevel]} px-4 py-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-white font-extrabold text-base">{section.label}</span>
                    <span className="text-white/75 text-sm">{sectionWords.length} Words</span>
                  </div>
                  {isComplete && <span className="text-white text-sm">✅</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-white/80 text-xs">{section.range}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${skillBadgeClass}`}>
                    {skillLevel}
                  </span>
                </div>
              </div>

              <div className="p-3 space-y-3">
                {/* ── 4 progress indicators ── */}
                <div className="grid grid-cols-2 gap-1.5">
                  <ProgressPill label="🎴 Flashcards" done={isStudied} />
                  <ProgressPill
                    label="✍️ Writing"
                    done={isWritingDone}
                    subtitle={writingSubtitle}
                  />
                  <ProgressPill
                    label="🧩 Quiz"
                    done={quizDone}
                    subtitle={quizSubtitle}
                  />
                  <ProgressPill
                    label="✅ Complete"
                    done={isComplete}
                    highlight
                  />
                </div>

                {/* ── Action buttons ── */}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 text-xs py-2"
                    onClick={() => onNavigate?.(activeLevel, i)}
                  >
                    Study
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 text-xs py-2"
                    onClick={() => setReviewKey(prev => (prev === key ? null : key))}
                  >
                    {reviewKey === key ? 'Close ✕' : 'Review Vocab'}
                  </Button>
                </div>

                {/* ── Review Vocab panel (all words, full detail) ── */}
                {reviewKey === key && (
                  <ReviewVocabPanel words={sectionWords} lang={lang} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sections.length === 0 && (
        <p className="text-ink-soft text-sm text-center py-6">
          No sections found for HSK {activeLevel}.
        </p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function VocabBrowser({ level, lang = 'both', onStudy, onNavigate }: Props) {
  const [view,        setView]        = useState<ViewMode>('category');
  const [globalSearch, setGlobalSearch] = useState('');
  const [chunkSize,   setChunkSize]   = useState<ChunkSize>(10);

  const counts = useMemo(() => getCategoryCounts(), []);
  const { favorites: favCatIds, isFavorite, toggle: toggleFav } = useFavoriteCategories();

  // Sort categories: favorites first, then rest
  const sortedCategories = useMemo(() => {
    const favs = CATEGORIES.filter(c => favCatIds.includes(c.id));
    const rest  = CATEGORIES.filter(c => !favCatIds.includes(c.id));
    return [...favs, ...rest];
  }, [favCatIds]);

  // Global search across all words
  const searchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    return filterWords(vocab as VocabItem[], globalSearch).slice(0, 50);
  }, [globalSearch]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-ink">Vocabulary</h2>
        <p className="text-sm text-ink-soft mt-0.5">Browse, search and study {(vocab as VocabItem[]).length} words</p>
      </div>

      {/* ── Progress tracker ── */}
      <ProgressSection initialLevel={level} onNavigate={onNavigate} lang={lang} />

      {/* Divider */}
      <div className="border-t border-ink/8" />

      {/* Global search */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft text-sm">🔍</span>
        <input
          type="search"
          placeholder="Search all vocabulary (hanzi, pinyin, english)…"
          value={globalSearch}
          onChange={e => setGlobalSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-ink/15 text-sm focus:outline-none focus:border-brand"
        />
      </div>

      {/* Global search results */}
      {globalSearch.trim() && (
        <div className="rounded-2xl border border-ink/10 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-ink/8 text-xs font-semibold text-ink-soft">
            {searchResults.length} results
          </div>
          <div className="px-4 max-h-80 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-soft">No matches found.</p>
            ) : (
              searchResults.map(w => <WordCard key={w.id} word={w} />)
            )}
          </div>
        </div>
      )}

      {/* View tabs */}
      {!globalSearch.trim() && (
        <>
          <div className="flex gap-1 p-1 bg-ink/5 rounded-2xl">
            {(
              [
                { id: 'category', label: '🗂️ By Category' },
                { id: 'level',    label: '📗 By HSK Level' },
              ] as { id: ViewMode; label: string }[]
            ).map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={[
                  'flex-1 py-2 rounded-xl text-xs font-semibold transition-all',
                  view === v.id
                    ? 'bg-white text-brand shadow-sm'
                    : 'text-ink-soft hover:text-ink',
                ].join(' ')}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* ── Category view ── */}
          {view === 'category' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-ink-soft">
                  {CATEGORIES.length} categories · ⭐ favorites shown first
                </p>
                {/* Chunk size selector */}
                <div className="inline-flex items-center gap-1 bg-ink/5 rounded-xl p-0.5">
                  <span className="text-[10px] text-ink-soft px-1.5">Words/part</span>
                  {([10, 15, 20] as ChunkSize[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setChunkSize(s)}
                      className={[
                        'text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all',
                        chunkSize === s ? 'bg-white text-brand shadow-sm' : 'text-ink-soft hover:text-ink',
                      ].join(' ')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {sortedCategories.map(cat => (
                <CategoryCard
                  key={cat.id}
                  categoryId={cat.id}
                  count={counts.get(cat.id) ?? 0}
                  chunkSize={chunkSize}
                  isFav={isFavorite(cat.id)}
                  onToggleFav={() => toggleFav(cat.id)}
                  onStudy={onStudy
                    ? (ids, label, catId, idx, size) =>
                        onStudy(ids, label, catId, idx, size)
                    : undefined}
                />
              ))}
            </div>
          )}

          {/* ── Level view ── */}
          {view === 'level' && (
            <div className="space-y-3">
              {([2, 3, 4] as HskLevel[]).map(l => (
                <LevelAccordion key={l} level={l} onStudy={onStudy} />
              ))}
            </div>
          )}

          {/* Favorites view removed — pinned categories are shown first above */}
        </>
      )}
    </div>
  );
}
