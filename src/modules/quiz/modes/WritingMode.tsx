/**
 * @file WritingMode.tsx
 * @description Writing Test quiz mode.
 *
 * Prompt: the learner is shown the MEANING + PINYIN and must write the hanzi
 * from memory. Two sub-modes:
 *
 *   Guided  – hanzi-writer quiz with the character outline visible to trace.
 *             Stroke order is validated; mistakes lower the score.
 *   Free    – blank canvas (no outline). The learner draws freely, then reveals
 *             the answer and self-grades ("I wrote it" / "Not quite").
 *
 * Multi-character words are practised one character at a time; the final score
 * is the average across characters.
 *
 * After the last character is graded, a result review panel is shown with the
 * correct answer and a "Next →" button — the quiz does NOT auto-advance.
 *
 * Canvas fix: both canvases are always mounted in the DOM so useEffect can
 * attach touch/mouse listeners before the user switches modes. CSS display
 * toggles visibility, not conditional rendering.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import type { QuizQuestion, VocabItem } from '../../../types';
import type { UiLang } from '../../../components/ui/LanguageToggle';
import { Button } from '../../../components/ui/Button';
import { AudioButton } from '../../../components/ui/AudioButton';
import { translationLines } from '../../../utils/translation';

type WritingQuestion = Extract<QuizQuestion, { kind: 'writing' }>;

interface Props {
  question: WritingQuestion;
  lang?: UiLang;
  onAnswer: (isCorrect: boolean, score: number, word: VocabItem) => void;
}

type WriteSubMode = 'guided' | 'free';

/** Per-character score 0–100 from guided mistakes. */
function scoreFromMistakes(mistakes: number): number {
  return Math.max(0, 100 - mistakes * 20);
}

// ── Free-drawing canvas hook ───────────────────────────────────────────────
// IMPORTANT: This hook must be used even when the canvas is not visible so
// that event listeners are attached on mount (before mode switching).

function useFreeCanvas(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: MouseEvent | Touch, rect: DOMRect) => ({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    const rect = canvas.getBoundingClientRect();
    const pos = getPos('touches' in e ? e.touches[0] : e as MouseEvent, rect);
    lastPos.current = pos;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
  }, [canvasRef]);

  const moveDraw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!drawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const pos = getPos('touches' in e ? e.touches[0] : e as MouseEvent, rect);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }, [canvasRef]);

  const endDraw = useCallback(() => {
    drawing.current = false;
    lastPos.current = null;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('mousedown',  startDraw as EventListener);
    canvas.addEventListener('mousemove',  moveDraw  as EventListener);
    canvas.addEventListener('mouseup',    endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw as EventListener, { passive: false });
    canvas.addEventListener('touchmove',  moveDraw  as EventListener, { passive: false });
    canvas.addEventListener('touchend',   endDraw);
    return () => {
      canvas.removeEventListener('mousedown',  startDraw as EventListener);
      canvas.removeEventListener('mousemove',  moveDraw  as EventListener);
      canvas.removeEventListener('mouseup',    endDraw);
      canvas.removeEventListener('mouseleave', endDraw);
      canvas.removeEventListener('touchstart', startDraw as EventListener);
      canvas.removeEventListener('touchmove',  moveDraw  as EventListener);
      canvas.removeEventListener('touchend',   endDraw);
    };
  }, [canvasRef, startDraw, moveDraw, endDraw]);

  return { clearCanvas };
}

// ── Main component ─────────────────────────────────────────────────────────

export function WritingMode({ question, lang = 'both', onAnswer }: Props) {
  const { word } = question;
  const chars = [...word.hanzi];

  const [subMode,      setSubMode]      = useState<WriteSubMode>('guided');
  const [charIdx,      setCharIdx]      = useState(0);
  const [perChar,      setPerChar]      = useState<number[]>([]);
  const [freeRevealed, setFreeRevealed] = useState(false);

  /** Set when all characters are done — shows result panel instead of auto-advancing. */
  const [finalResult, setFinalResult]  = useState<{ score: number; isCorrect: boolean } | null>(null);

  // Guided mode: HanziWriter container
  const containerRef = useRef<HTMLDivElement | null>(null);
  const writerRef    = useRef<HanziWriter | null>(null);
  const charMistakes = useRef(0);

  // Free mode: real HTML5 canvas — always mounted so listeners attach at mount
  const freeCanvasRef = useRef<HTMLCanvasElement>(null);
  const { clearCanvas } = useFreeCanvas(freeCanvasRef);

  const targetChar = chars[charIdx] ?? '';
  const isLastChar = charIdx >= chars.length - 1;

  // Build the HanziWriter instance (guided mode only)
  useEffect(() => {
    if (subMode !== 'guided') return;
    if (!containerRef.current || !targetChar) return;
    containerRef.current.innerHTML = '';
    charMistakes.current = 0;
    setFreeRevealed(false);

    const writer = HanziWriter.create(containerRef.current, targetChar, {
      width:             280,
      height:            280,
      padding:           5,
      strokeColor:       '#1a1a1a',
      drawingColor:      '#c1272d',
      drawingWidth:      28,
      showCharacter:     false,
      showOutline:       true,
      showHintAfterMisses: 3,
    });
    writerRef.current = writer;
    writer.quiz({
      onMistake: () => { charMistakes.current += 1; },
      onComplete: () => { recordChar(scoreFromMistakes(charMistakes.current)); },
    });

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      writerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetChar, subMode]);

  // Clear free canvas whenever we switch to it or change character
  useEffect(() => {
    if (subMode === 'free') {
      setFreeRevealed(false);
      clearCanvas();
    }
  }, [targetChar, subMode, clearCanvas]);

  /**
   * Record a character's score and either advance to the next character
   * or show the final result panel (does NOT auto-call onAnswer).
   */
  function recordChar(score: number) {
    const next = [...perChar, score];
    setPerChar(next);
    if (isLastChar) {
      const avg = Math.round(next.reduce((a, b) => a + b, 0) / next.length);
      // Show result panel — user presses Next to actually advance the quiz
      setFinalResult({ score: avg, isCorrect: avg >= 60 });
    } else {
      setCharIdx(i => i + 1);
    }
  }

  function revealFree() { setFreeRevealed(true); }
  function selfGrade(correct: boolean) { recordChar(correct ? 100 : 0); }

  // ── Result panel (shown after last character is graded) ─────────────────
  if (finalResult !== null) {
    return (
      <div className="space-y-5 text-center">
        {/* Result badge */}
        <div className={[
          'inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-base font-bold',
          finalResult.isCorrect
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-600 border border-red-200',
        ].join(' ')}>
          {finalResult.isCorrect ? '✓ Well done!' : '✗ Keep practicing'}
          <span className="text-sm font-semibold opacity-75">{finalResult.score}%</span>
        </div>

        {/* Correct answer */}
        <div>
          <p className="text-xs text-ink-soft uppercase tracking-wider mb-2">Correct answer</p>
          <div className="font-hanzi text-[80px] leading-none text-ink">{word.hanzi}</div>
          <div className="text-brand font-bold text-xl mt-2">{word.pinyin}</div>
          <div className="flex justify-center mt-2">
            <AudioButton text={word.hanzi} size="md" />
          </div>
          <div className="mt-3 space-y-0.5">
            {translationLines(word, lang).map((line, i) => (
              <div key={i} className={['text-base', line.lang === 'th' ? 'font-thai text-ink-soft' : 'text-ink'].join(' ')}>
                {line.text}
              </div>
            ))}
          </div>
        </div>

        {/* Example sentence */}
        {word.exampleZh && (
          <div className="bg-ink/4 rounded-2xl p-4 text-left max-w-sm mx-auto">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft mb-1">Example</p>
            <p className="font-hanzi text-sm text-ink">{word.exampleZh}</p>
            {word.exampleEn && (
              <p className="text-xs text-ink-soft mt-1">{word.exampleEn}</p>
            )}
          </div>
        )}

        {/* Next button */}
        <Button
          size="lg"
          onClick={() => onAnswer(finalResult.isCorrect, finalResult.score, word)}
          className="min-w-[160px]"
        >
          Next →
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Prompt */}
      <div className="text-center">
        <p className="text-ink-soft text-sm mb-1">Write the character for:</p>
        <div className="text-brand font-bold text-3xl">{word.pinyin}</div>
        <div className="mt-1 flex flex-col items-center">
          {translationLines(word, lang).map((line, i) => (
            <div key={i} className={['text-ink text-lg', line.lang === 'th' ? 'font-thai' : ''].join(' ')}>
              {line.text}
            </div>
          ))}
        </div>
        {chars.length > 1 && (
          <div className="text-xs text-ink-soft mt-2">
            Character {charIdx + 1} of {chars.length}
          </div>
        )}
      </div>

      {/* Sub-mode toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1">
          {([
            { id: 'guided', label: '🖊 Guided' },
            { id: 'free',   label: '✍️ Free Write' },
          ] as const).map(m => (
            <button
              key={m.id}
              onClick={() => { if (m.id !== subMode) setSubMode(m.id); }}
              className={[
                'min-h-[40px] px-4 rounded-xl text-sm font-semibold transition',
                subMode === m.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-ink/5',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas area — both canvases always mounted; CSS switches visibility.
          This ensures useFreeCanvas's useEffect can attach listeners at mount
          regardless of which mode is initially active. */}
      <div className="grid place-items-center">

        {/* Guided: HanziWriter container */}
        <div style={{ display: subMode === 'guided' ? 'block' : 'none' }}>
          <div
            ref={containerRef}
            className="bg-white border-4 border-brand/30 rounded-3xl shadow-inner touch-none select-none"
            style={{ width: 280, height: 280 }}
          />
        </div>

        {/* Free: HTML5 canvas — always in DOM so ref is set at mount */}
        <div style={{ display: subMode === 'free' ? 'block' : 'none' }}>
          <div className="relative">
            {/* Grid lines for writing guidance */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width="280" height="280"
              style={{ borderRadius: '1.5rem' }}
            >
              <line x1="140" y1="0"   x2="140" y2="280" stroke="#e0e0e0" strokeWidth="1" strokeDasharray="4,4" />
              <line x1="0"   y1="140" x2="280" y2="140" stroke="#e0e0e0" strokeWidth="1" strokeDasharray="4,4" />
              <rect x="70"  y="70"  width="140" height="140" fill="none" stroke="#f0f0f0" strokeWidth="1" strokeDasharray="4,4" />
            </svg>
            <canvas
              ref={freeCanvasRef}
              width={280}
              height={280}
              className="bg-white border-4 border-brand/30 rounded-3xl shadow-inner touch-none select-none cursor-crosshair"
              style={{ display: 'block' }}
            />
            {/* Reveal overlay */}
            {freeRevealed && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-3xl bg-white/60 backdrop-blur-sm">
                <span className="font-hanzi text-[120px] leading-none text-ink/80">{targetChar}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {subMode === 'guided' ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-ink-soft text-center max-w-xs">
            Trace each stroke in order. Completes automatically — scored by accuracy.
          </p>
          <Button variant="secondary" onClick={() => recordChar(scoreFromMistakes(charMistakes.current + 3))}>
            Skip character
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {!freeRevealed ? (
            <>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={clearCanvas}>🗑 Clear</Button>
                <Button size="lg" onClick={revealFree}>👁 Reveal Answer</Button>
              </div>
              <p className="text-xs text-ink-soft text-center max-w-xs">
                Draw the character from memory, then reveal to check yourself.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-ink-soft text-sm">Answer:</span>
                <span className="font-hanzi text-3xl text-ink">{targetChar}</span>
                <AudioButton text={targetChar} size="sm" />
              </div>
              <p className="text-sm text-ink-soft">Did you write it correctly?</p>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => { setFreeRevealed(false); clearCanvas(); }}>
                  🔄 Try again
                </Button>
                <Button variant="danger"  onClick={() => selfGrade(false)}>✗ Not quite</Button>
                <Button variant="success" onClick={() => selfGrade(true)}>✓ Got it</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
