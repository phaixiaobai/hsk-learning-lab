import { useEffect, useMemo, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import vocab from '../data/vocabulary.json';
import type { HskLevel, VocabItem } from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getSections } from '../utils/sections';

/**
 * Module E – Interactive Writing Pad
 *
 * Left:  HanziWriter canvas (stroke-order animate + quiz modes).
 * Right: Section-grouped vocabulary sidebar.
 *
 * Sidebar behaviour:
 * - Current section (from Flashcards) → shown at top, highlighted, expanded by default.
 * - Other sections → collapsed, expandable on tap.
 * - Auto-scrolls to current section marker on mount / section change.
 *
 * Writing canvas shows ALL HSK-level words (user can tap any section's words);
 * "Next Word" cycles within the current section only.
 */

interface Props {
  level: HskLevel;
  /** Flashcard section index — mirrors the section selected in the Flashcards tab. */
  section?: number;
}

export function WritingPad({ level, section = 0 }: Props) {
  const allVocab = vocab as VocabItem[];

  // All words for this level (used for HanziWriter deck navigation)
  const deck = useMemo(
    () => allVocab.filter(v => v.level === level),
    [level],
  );

  // All sections for this level
  const sections = useMemo(
    () => getSections(level, allVocab),
    [level],
  );

  // Clamp section index to valid range
  const sectionIdx = Math.min(Math.max(0, section), Math.max(0, sections.length - 1));
  const currentSection = sections[sectionIdx];

  // ── Writing canvas state ──────────────────────────────────────────────────

  // Default to first word of the current section
  const [selectedWord, setSelectedWord] = useState<VocabItem>(
    () => currentSection?.words[0] ?? deck[0],
  );
  const [charIdx, setCharIdx] = useState(0);
  const [mode,    setMode]    = useState<'animate' | 'quiz'>('animate');
  const [ghost,   setGhost]   = useState(true);

  const [, setWrittenWords] = useLocalStorage<string[]>(
    'hsk-master:written-words', [],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const writerRef    = useRef<HanziWriter | null>(null);

  // Ref to current section element — used for auto-scroll
  const currentSectionRef = useRef<HTMLDivElement | null>(null);

  const targetChar = (selectedWord?.hanzi ?? '')[charIdx] ?? '';

  // ── Reset on level change ─────────────────────────────────────────────────
  useEffect(() => {
    const sec = sections[Math.min(section, sections.length - 1)];
    const word = sec?.words[0] ?? deck[0];
    if (word) {
      setSelectedWord(word);
      setCharIdx(0);
      setMode('animate');
    }
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Jump to current section's first word when section changes ─────────────
  useEffect(() => {
    const sec = sections[Math.min(section, sections.length - 1)];
    const word = sec?.words[0];
    if (word) {
      setSelectedWord(word);
      setCharIdx(0);
      setMode('animate');
    }
    // Auto-scroll sidebar to current section
    setTimeout(() => {
      currentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clamp charIdx if word changes ─────────────────────────────────────────
  useEffect(() => {
    if (charIdx >= (selectedWord?.hanzi.length ?? 1)) {
      setCharIdx(0);
    }
  }, [selectedWord]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build HanziWriter ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !targetChar) return;
    containerRef.current.innerHTML = '';

    const writer = HanziWriter.create(containerRef.current, targetChar, {
      width:              300,
      height:             300,
      padding:            5,
      strokeColor:        '#c1272d',
      radicalColor:       '#8d1b20',
      drawingColor:       '#1a1a1a',
      drawingWidth:       30,
      delayBetweenStrokes: 150,
      showOutline:        ghost,
      showCharacter:      mode === 'animate',
    });

    writerRef.current = writer;
    if (mode === 'animate') writer.animateCharacter();
    if (mode === 'quiz') {
      writer.quiz({
        showHintAfterMisses: 2,
        onComplete: () => {
          setWrittenWords(prev =>
            prev.includes(selectedWord.id) ? prev : [...prev, selectedWord.id],
          );
        },
      });
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      writerRef.current = null;
    };
  }, [targetChar, mode, ghost]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectChar(word: VocabItem, ci: number) {
    setSelectedWord(word);
    setCharIdx(ci);
    setMode('animate');
  }

  /** Next word cycles within the current section. */
  function nextWord() {
    const sectionWords = currentSection?.words ?? deck;
    const idx = sectionWords.findIndex(w => w.id === selectedWord?.id);
    if (idx !== -1) {
      // Move to next within current section (wraps around)
      const next = sectionWords[(idx + 1) % sectionWords.length];
      setSelectedWord(next);
      setCharIdx(0);
    } else {
      // Current word is from another section — return to current section start
      const first = currentSection?.words[0] ?? deck[0];
      setSelectedWord(first);
      setCharIdx(0);
    }
  }

  if (!selectedWord || !targetChar) {
    return <Card><CardTitle>No characters at HSK {level}.</CardTitle></Card>;
  }

  // ── Sidebar: sections ─────────────────────────────────────────────────────
  // Other sections sorted in natural order (current section pinned to top)
  const otherSections = sections.filter((_, i) => i !== sectionIdx);

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">

      {/* ══ Writing pad — left ══════════════════════════════════════════════ */}
      <Card className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <CardTitle>Writing Pad · HSK {level}</CardTitle>
        </div>

        <CardSubtitle>
          <span className="font-hanzi text-brand text-lg">{selectedWord.hanzi}</span>
          &nbsp;· {selectedWord.pinyin} · {selectedWord.en}
        </CardSubtitle>

        {/* Per-character selector */}
        {selectedWord.hanzi.length > 1 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <span className="text-ink-soft text-sm self-center mr-1">Practice:</span>
            {selectedWord.hanzi.split('').map((ch, ci) => (
              <button
                key={ci}
                onClick={() => setCharIdx(ci)}
                className={
                  'font-hanzi text-3xl px-4 py-1.5 rounded-2xl border-2 transition ' +
                  (ci === charIdx
                    ? 'border-brand bg-brand/10 text-brand font-bold shadow-sm'
                    : 'border-ink/10 bg-white hover:border-brand/40 hover:text-brand')
                }
              >
                {ch}
              </button>
            ))}
            <span className="text-xs text-ink-soft self-center ml-1">
              (char {charIdx + 1} of {selectedWord.hanzi.length})
            </span>
          </div>
        )}

        {/* Canvas */}
        <div className="grid place-items-center my-6">
          <div
            ref={containerRef}
            className="bg-white border-4 border-brand/30 rounded-3xl shadow-inner touch-none select-none"
            style={{ width: 300, height: 300 }}
          />
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button size="lg" variant={mode === 'animate' ? 'primary' : 'secondary'}
            onClick={() => setMode('animate')}>
            ▶ Animate
          </Button>
          <Button size="lg" variant={mode === 'quiz' ? 'primary' : 'secondary'}
            onClick={() => setMode('quiz')}>
            ✏️ Quiz
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setGhost(g => !g)}>
            {ghost ? 'Hide Outline' : '👁 Show Outline'}
          </Button>
          <Button size="lg" variant="secondary" onClick={nextWord}>
            Next Word →
          </Button>
        </div>

        <p className="text-xs text-ink-soft mt-4">
          Tap any character in the section list to practice it.
          "Next Word" cycles through the current section.
          Switch sections by tapping their headers.
        </p>
      </Card>

      {/* ══ Vocabulary sidebar — right ══════════════════════════════════════ */}
      <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
        <div className="sticky top-28">
          <Card padded={false} className="overflow-hidden">

            {/* Sidebar header */}
            <div className="p-4 border-b border-ink/5 bg-ink/2">
              <h3 className="font-bold text-ink text-base">HSK {level} Vocabulary</h3>
              <p className="text-xs text-ink-soft mt-0.5">
                {deck.length} words · {sections.length} sections · tap to practice
              </p>
            </div>

            {/* Scrollable section list */}
            <div
              className="overflow-y-auto"
              style={{ maxHeight: 'min(70vh, calc(100vh - 220px))' }}
            >
              {/* ── Current section (pinned to top, highlighted) ── */}
              {currentSection && (
                <CurrentSectionGroup
                  ref={currentSectionRef}
                  section={currentSection}
                  selectedWord={selectedWord}
                  charIdx={charIdx}
                  onSelect={selectChar}
                />
              )}

              {/* ── Other sections (collapsed by default) ── */}
              {otherSections.map(sec => (
                <OtherSectionGroup
                  key={sec.index}
                  section={sec}
                  selectedWord={selectedWord}
                  charIdx={charIdx}
                  onSelect={selectChar}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Section types ──────────────────────────────────────────────────────────

import { forwardRef } from 'react';
import type { Section } from '../utils/sections';

interface SectionGroupProps {
  section: Section;
  selectedWord: VocabItem;
  charIdx: number;
  onSelect: (word: VocabItem, charIdx: number) => void;
}

/** Current section — always expanded, visually highlighted, pinned at top. */
const CurrentSectionGroup = forwardRef<HTMLDivElement, SectionGroupProps>(
  function CurrentSectionGroup({ section, selectedWord, charIdx, onSelect }, ref) {
    return (
      <div ref={ref}>
        {/* Section header */}
        <div className="px-4 py-2.5 bg-brand/8 border-b border-brand/15 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="text-base">⭐</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-brand text-sm">
                Current Section: {section.label}
              </div>
              <div className="text-[11px] text-brand/70">{section.range} · {section.words.length} words</div>
            </div>
          </div>
        </div>

        {/* Words */}
        <div className="bg-brand/3 border-b-2 border-brand/10">
          {section.words.map(word => (
            <WordRow
              key={word.id}
              word={word}
              selectedWord={selectedWord}
              charIdx={charIdx}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  },
);

/** Other sections — collapsed by default, expandable. */
function OtherSectionGroup({ section, selectedWord, charIdx, onSelect }: SectionGroupProps) {
  // Auto-expand if selected word is in this section
  const containsSelected = section.words.some(w => w.id === selectedWord.id);
  const [expanded, setExpanded] = useState(containsSelected);

  // Re-expand if user navigates to a word in this section
  useEffect(() => {
    if (containsSelected) setExpanded(true);
  }, [containsSelected]);

  return (
    <div className="border-b border-ink/5 last:border-0">
      {/* Section header — tap to expand/collapse */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-ink/4 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink text-sm">{section.label}</div>
          <div className="text-[11px] text-ink-soft">{section.range} · {section.words.length} words</div>
        </div>
        <span className={['text-ink-soft text-xs transition-transform', expanded ? 'rotate-180' : ''].join(' ')}>
          ▾
        </span>
      </button>

      {/* Words — only when expanded */}
      {expanded && (
        <div className="border-t border-ink/5">
          {section.words.map(word => (
            <WordRow
              key={word.id}
              word={word}
              selectedWord={selectedWord}
              charIdx={charIdx}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Shared word row with character chips. */
function WordRow({
  word, selectedWord, charIdx, onSelect,
}: {
  word: VocabItem;
  selectedWord: VocabItem;
  charIdx: number;
  onSelect: (word: VocabItem, charIdx: number) => void;
}) {
  const isActiveWord = word.id === selectedWord.id;
  return (
    <div
      className={
        'px-3 py-2.5 border-b border-ink/5 last:border-0 transition ' +
        (isActiveWord ? 'bg-brand/8' : 'hover:bg-ink/3')
      }
    >
      <div className="text-[11px] text-ink-soft mb-1 leading-tight truncate">
        {word.pinyin} · {word.en}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {word.hanzi.split('').map((ch, ci) => {
          const isActive = isActiveWord && ci === charIdx;
          return (
            <button
              key={ci}
              onClick={() => onSelect(word, ci)}
              title={`Practice "${ch}" from ${word.hanzi}`}
              className={
                'font-hanzi text-2xl w-10 h-10 rounded-xl border-2 transition flex items-center justify-center ' +
                (isActive
                  ? 'border-brand bg-brand text-white shadow-md'
                  : 'border-ink/10 bg-white hover:border-brand/50 hover:text-brand hover:shadow-sm')
              }
            >
              {ch}
            </button>
          );
        })}
      </div>
    </div>
  );
}
