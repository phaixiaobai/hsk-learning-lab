import { useMemo, useState } from 'react';
import vocab from '../data/vocabulary.json';
import type { HskLevel, VocabItem } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import { AudioButton } from '../components/ui/AudioButton';

/* ================================================================
 * Voice Quiz – Speak the Chinese word you hear / see
 * Uses Web Speech API SpeechRecognition (Chrome / Edge / Android).
 * Shows a clear "not supported" banner on iOS Safari.
 * ================================================================ */

interface Props { level: HskLevel }

interface VoiceAttempt {
  vocabId: string;
  hanzi: string;
  transcript: string;
  isCorrect: boolean;
  confidence: number;
  date: string;
}

/** Normalise Chinese text for comparison: remove spaces + punctuation. */
function normalise(s: string) {
  return s.replace(/[\s　，。！？]/g, '').toLowerCase();
}

/** Levenshtein distance – for fuzzy matching when chars differ slightly. */
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

function scoreAnswer(spoken: string, expected: string): number {
  const s = normalise(spoken);
  const e = normalise(expected);
  if (s === e) return 100;
  const dist = levenshtein(s, e);
  const maxLen = Math.max(s.length, e.length);
  return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function VoiceQuiz({ level }: Props) {
  const allVocab = vocab as VocabItem[];
  const pool = useMemo(
    () => shuffle(allVocab.filter(v => v.level === level)).slice(0, 10),
    [level],
  );

  const [qIdx,    setQIdx]    = useState(0);
  const [phase,   setPhase]   = useState<'prompt' | 'listening' | 'result' | 'done'>('prompt');
  const [lastScore, setLastScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);

  const [, setAttempts] = useLocalStorage<VoiceAttempt[]>('hsk-lab:voice-attempts', []);

  const tts = useSpeechSynthesis();
  const stt = useSpeechRecognition('zh-CN');

  const q = pool[qIdx];

  /* ── Not supported banner ── */
  if (!stt.isSupported) {
    return (
      <Card>
        <div className="text-center py-10">
          <div className="text-5xl mb-4">🎤</div>
          <CardTitle>Voice Quiz</CardTitle>
          <CardSubtitle className="mt-2">
            Speech recognition is not supported in this browser.
          </CardSubtitle>
          <p className="mt-4 text-ink-soft text-sm max-w-sm mx-auto">
            Please use <strong>Chrome</strong> or <strong>Edge</strong> on desktop / Android.
            iOS Safari does not support microphone-based speech recognition.
          </p>
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800 max-w-sm mx-auto">
            You can still practice pronunciation using the 🔊 audio button in Flashcards.
          </div>
        </div>
      </Card>
    );
  }

  /* ── Done screen ── */
  if (phase === 'done') {
    const avg = Math.round(totalScore / pool.length);
    return (
      <Card>
        <CardTitle>Voice Quiz Complete!</CardTitle>
        <CardSubtitle>HSK {level} · {pool.length} words</CardSubtitle>
        <div className="text-center my-8">
          <div className="text-6xl font-extrabold text-brand">{avg}%</div>
          <div className="text-ink-soft mt-1">Average pronunciation score</div>
        </div>
        <div className={
          'rounded-2xl p-4 text-center text-sm font-medium ' +
          (avg >= 85 ? 'bg-emerald-50 text-emerald-700'
            : avg >= 60 ? 'bg-amber-50 text-amber-700'
            : 'bg-red-50 text-red-700')
        }>
          {avg >= 85 && '🏆 Excellent pronunciation! Your tones are on point.'}
          {avg >= 60 && avg < 85 && '👏 Good effort! Practice difficult tones in Flashcards.'}
          {avg < 60 && '💪 Keep going — listen to the audio button and repeat.'}
        </div>
        <Button
          full size="lg" className="mt-6"
          onClick={() => { setQIdx(0); setTotalScore(0); setPhase('prompt'); stt.reset(); }}
        >
          ↻ New Round
        </Button>
      </Card>
    );
  }

  /* ── Result screen (per question) ── */
  if (phase === 'result') {
    const spoken = stt.result?.transcript ?? '';
    const score  = lastScore;
    const colour = score >= 85 ? 'emerald' : score >= 60 ? 'amber' : 'red';

    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardTitle>Result</CardTitle>
          <span className="text-ink-soft">Q {qIdx + 1} / {pool.length}</span>
        </div>

        {/* Score ring */}
        <div className="flex flex-col items-center my-6 gap-2">
          <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center font-extrabold text-3xl
            ${colour === 'emerald' ? 'border-emerald-400 text-emerald-600 bg-emerald-50'
              : colour === 'amber'  ? 'border-amber-400  text-amber-600  bg-amber-50'
              : 'border-red-400   text-red-600   bg-red-50'}`}>
            {score}%
          </div>
        </div>

        <div className="space-y-3 text-center">
          <div>
            <div className="text-xs text-ink-soft uppercase tracking-wide mb-1">Expected</div>
            <div className="font-hanzi text-4xl text-ink">{q.hanzi}</div>
            <div className="text-brand font-medium">{q.pinyin}</div>
            <AudioButton text={q.hanzi} size="md" className="mx-auto mt-2" />
          </div>
          <div className="border-t border-ink/10 pt-3">
            <div className="text-xs text-ink-soft uppercase tracking-wide mb-1">You said</div>
            <div className="font-hanzi text-3xl text-ink">{spoken || '—'}</div>
            {stt.result && (
              <div className="text-xs text-ink-soft mt-1">
                Confidence: {Math.round(stt.result.confidence * 100)}%
              </div>
            )}
          </div>
        </div>

        <Button
          full size="lg" className="mt-6"
          onClick={() => {
            stt.reset();
            if (qIdx + 1 >= pool.length) {
              setPhase('done');
            } else {
              setQIdx(i => i + 1);
              setPhase('prompt');
            }
          }}
        >
          {qIdx + 1 >= pool.length ? 'See Results →' : 'Next Word →'}
        </Button>
      </Card>
    );
  }

  /* ── Prompt / Listening screen ── */
  const isListening = phase === 'listening';

  function handleSpeak() {
    tts.stop();
    stt.reset();
    setPhase('listening');
    stt.startListening();
  }

  function handleStop() {
    stt.stopListening();
    const spoken = stt.result?.transcript ?? '';
    const score  = scoreAnswer(spoken, q.hanzi);
    setLastScore(score);
    setTotalScore(t => t + score);

    const entry: VoiceAttempt = {
      vocabId:    q.id,
      hanzi:      q.hanzi,
      transcript: spoken,
      isCorrect:  score >= 80,
      confidence: stt.result?.confidence ?? 0,
      date:       new Date().toISOString(),
    };
    setAttempts(prev => [entry, ...prev].slice(0, 500));
    setPhase('result');
  }

  // Auto-advance when speech recognition finishes
  if (stt.recState === 'done' && phase === 'listening') {
    const spoken = stt.result?.transcript ?? '';
    const score  = scoreAnswer(spoken, q.hanzi);
    setLastScore(score);
    setTotalScore(t => t + score);
    const entry: VoiceAttempt = {
      vocabId:    q.id,
      hanzi:      q.hanzi,
      transcript: spoken,
      isCorrect:  score >= 80,
      confidence: stt.result?.confidence ?? 0,
      date:       new Date().toISOString(),
    };
    setAttempts(prev => [entry, ...prev].slice(0, 500));
    setPhase('result');
  }

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <CardTitle>Voice Quiz · HSK {level}</CardTitle>
        <span className="text-ink-soft font-semibold">Q {qIdx + 1} / {pool.length}</span>
      </div>
      <div className="h-2 bg-ink/10 rounded-full overflow-hidden mb-6">
        <div className="h-full bg-brand transition-all" style={{ width: `${(qIdx / pool.length) * 100}%` }} />
      </div>

      {/* Prompt */}
      <div className="text-center">
        <div className="text-ink-soft text-sm mb-2">Say this word in Mandarin:</div>
        <div className="font-hanzi text-[96px] sm:text-[128px] leading-none text-ink">{q.hanzi}</div>
        <div className="text-brand font-bold text-xl mt-2">{q.pinyin}</div>
        <div className="text-ink-soft mt-1">{q.en}</div>

        {/* Listen first */}
        <div className="flex justify-center mt-4">
          <AudioButton text={q.hanzi} size="lg" />
        </div>
      </div>

      {/* Recording area */}
      <div className="mt-8 flex flex-col items-center gap-4">
        {isListening ? (
          <>
            {/* Animated mic indicator */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
              <span className="absolute inset-2 rounded-full bg-red-500/30 animate-ping animation-delay-150" />
              <div className="relative w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg text-2xl">
                🎤
              </div>
            </div>
            <div className="text-red-600 font-semibold animate-pulse">Listening…</div>
            <Button variant="danger" size="lg" onClick={handleStop}>⏹ Stop Recording</Button>
          </>
        ) : (
          <>
            <Button size="lg" className="px-10" onClick={handleSpeak}>
              🎤 Start Speaking
            </Button>
            <p className="text-xs text-ink-soft text-center max-w-xs">
              Tap the button, then speak the Chinese word clearly.
              The mic will stop automatically after you speak.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
