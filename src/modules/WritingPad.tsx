import { useEffect, useMemo, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import vocab from '../data/vocabulary.json';
import type { HskLevel, VocabItem } from '../types';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import { useLocalStorage } from '../hooks/useLocalStorage';

/**
 * Module E – Interactive Writing Pad
 *
 * Layout: writing pad on the left, scrollable vocabulary list on the right.
 * Every vocabulary word is broken into individual characters — tapping any
 * character (or sub-character of a compound word like 时间 → 时 / 间) loads
 * it into the hanzi-writer canvas.
 */

interface Props {
  level: HskLevel;
}

export function WritingPad({ level }: Props) {
  const deck = useMemo(
    () => (vocab as VocabItem[]).filter(v => v.level === level),
    [level],
  );

  // Which word + which char-index within that word is selected
  const [selectedWord, setSelectedWord] = useState<VocabItem>(() => deck[0]);
  const [charIdx,      setCharIdx]      = useState(0);
  const [mode,  setMode]  = useState<'animate' | 'quiz'>('animate');
  const [ghost, setGhost] = useState(true);

  // Track words the user has completed in quiz mode.
  // ProgressSection reads this via 'hsk-master:written-words' to show Writing progress.
  // Only the setter is needed here; the read side is consumed by ProgressSection.
  const [, setWrittenWords] = useLocalStorage<string[]>(
    'hsk-master:written-words', [],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const writerRef    = useRef<HanziWriter | null>(null);

  // The single character currently being drawn
  const targetChar = (selectedWord?.hanzi ?? '')[charIdx] ?? '';

  // Reset when level changes
  useEffect(() => {
    if (deck.length > 0) {
      setSelectedWord(deck[0]);
      setCharIdx(0);
      setMode('animate');
    }
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp charIdx if word changes
  useEffect(() => {
    if (charIdx >= (selectedWord?.hanzi.length ?? 1)) {
      setCharIdx(0);
    }
  }, [selectedWord]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild hanzi-writer whenever the target character, mode, or ghost changes
  useEffect(() => {
    if (!containerRef.current || !targetChar) return;
    containerRef.current.innerHTML = '';

    const writer = HanziWriter.create(containerRef.current, targetChar, {
      width: 300,
      height: 300,
      padding: 5,
      strokeColor: '#c1272d',
      radicalColor: '#8d1b20',
      drawingColor: '#1a1a1a',
      drawingWidth: 30,
      delayBetweenStrokes: 150,
      showOutline: ghost,
      showCharacter: mode === 'animate',
    });

    writerRef.current = writer;
    if (mode === 'animate') writer.animateCharacter();
    if (mode === 'quiz') {
      writer.quiz({
        showHintAfterMisses: 2,
        onComplete: () => {
          // Mark the word as written so ProgressSection can show Writing progress.
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
  }, [targetChar, mode, ghost]);

  function selectChar(word: VocabItem, ci: number) {
    setSelectedWord(word);
    setCharIdx(ci);
    setMode('animate');   // reset to animate so user sees stroke order first
  }

  function nextWord() {
    const idx  = deck.findIndex(w => w.id === selectedWord?.id);
    const next = deck[(idx + 1) % deck.length];
    setSelectedWord(next);
    setCharIdx(0);
  }

  if (!selectedWord || !targetChar) {
    return <Card><CardTitle>No characters at HSK {level}.</CardTitle></Card>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* ══════════════════════════════
          Writing pad — left / main
         ══════════════════════════════ */}
      <Card className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <CardTitle>Writing Pad · HSK {level}</CardTitle>
        </div>

        <CardSubtitle>
          <span className="font-hanzi text-brand text-lg">{selectedWord.hanzi}</span>
          &nbsp;· {selectedWord.pinyin} · {selectedWord.en}
        </CardSubtitle>

        {/* Per-character selector (only shown for compound words) */}
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
          Tap any character in the list on the right to load it here.
          For compound words (e.g. 时间), each character is selectable individually.
          "Animate" shows stroke order; "Quiz" makes you draw from memory.
        </p>
      </Card>

      {/* ══════════════════════════════
          Vocabulary sidebar — right
         ══════════════════════════════ */}
      <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
        <div className="sticky top-28">
          <Card padded={false} className="overflow-hidden">
            {/* Sidebar header */}
            <div className="p-4 border-b border-ink/5 bg-ink/2">
              <h3 className="font-bold text-ink text-base">HSK {level} Vocabulary</h3>
              <p className="text-xs text-ink-soft mt-0.5">
                {deck.length} words · tap a character to practice
              </p>
            </div>

            {/* Scrollable list */}
            <div
              className="overflow-y-auto"
              style={{ maxHeight: 'min(60vh, calc(100vh - 240px))' }}
            >
              {deck.map(word => {
                const isActiveWord = word.id === selectedWord.id;
                return (
                  <div
                    key={word.id}
                    className={
                      'px-3 py-2.5 border-b border-ink/5 last:border-0 transition ' +
                      (isActiveWord ? 'bg-brand/8' : 'hover:bg-ink/3')
                    }
                  >
                    {/* Pinyin + meaning */}
                    <div className="text-[11px] text-ink-soft mb-1 leading-tight truncate">
                      {word.pinyin} · {word.en}
                    </div>

                    {/* Character chips — one per hanzi character */}
                    <div className="flex gap-1.5 flex-wrap">
                      {word.hanzi.split('').map((ch, ci) => {
                        const isActive = isActiveWord && ci === charIdx;
                        return (
                          <button
                            key={ci}
                            onClick={() => selectChar(word, ci)}
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
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
