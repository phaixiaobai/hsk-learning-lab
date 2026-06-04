/**
 * @file VoiceMode.tsx
 * @description Voice quiz question renderer.
 *
 * Scoring (updated)
 * ─────────────────
 * Uses voiceScoring.ts which provides:
 * • 5-tier grade (excellent / good / fair / poor / incorrect)
 * • Character-by-character comparison with partial credit
 * • Specific improvement feedback
 * • Passing threshold lowered to 60 (was 75) for better UX
 *
 * Flow
 * ────
 * prompt → listening → scored → (user presses Next →) → onAnswer
 *
 * No auto-advance: user reads the score + comparison then clicks Next.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuizQuestion, VocabItem } from '../../../types';
import type { UiLang } from '../../../components/ui/LanguageToggle';
import { useSpeechSynthesis } from '../../../hooks/useSpeechSynthesis';
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition';
import { Button } from '../../../components/ui/Button';
import { AudioButton } from '../../../components/ui/AudioButton';
import { scoreVoice, type VoiceScoreResult, type CharMatch } from '../../../utils/voiceScoring';
import { translationLines } from '../../../utils/translation';
import { db, isSupabaseConfigured } from '../../../lib/supabase';
import { getSessionId } from '../../../lib/session';

type VoiceQuestion = Extract<QuizQuestion, { kind: 'voice' }>;

interface Props {
  question: VoiceQuestion;
  lang?: UiLang;
  onAnswer: (isCorrect: boolean, score: number, word: VocabItem, transcript: string) => void;
}

// ── Char match colour helper ───────────────────────────────────────────────

const CHAR_MATCH_STYLES: Record<CharMatch, string> = {
  correct: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  partial: 'bg-amber-100  text-amber-800  border-amber-300',
  wrong:   'bg-red-100    text-red-800    border-red-300',
  missing: 'bg-red-50     text-red-400    border-red-200 opacity-60',
  extra:   'bg-gray-100   text-gray-500   border-gray-200 opacity-50',
};

const CHAR_MATCH_LABELS: Record<CharMatch, string> = {
  correct: 'correct',
  partial: 'close',
  wrong:   'wrong',
  missing: 'missed',
  extra:   'extra',
};

// ── Grade colour ───────────────────────────────────────────────────────────

const GRADE_BANNER: Record<VoiceScoreResult['grade'], string> = {
  excellent: 'border-emerald-400 bg-emerald-50',
  good:      'border-emerald-300 bg-emerald-50/70',
  fair:      'border-amber-400   bg-amber-50',
  poor:      'border-red-300     bg-red-50',
  incorrect: 'border-red-400     bg-red-50',
};

const SCORE_COLOR: Record<VoiceScoreResult['grade'], string> = {
  excellent: 'text-emerald-600',
  good:      'text-emerald-500',
  fair:      'text-amber-600',
  poor:      'text-red-500',
  incorrect: 'text-red-600',
};

// ── Component ──────────────────────────────────────────────────────────────

type Phase = 'prompt' | 'listening' | 'scored';

export function VoiceMode({ question, lang = 'both', onAnswer }: Props) {
  const { word } = question;
  const tts = useSpeechSynthesis();
  const stt = useSpeechRecognition('zh-CN');

  const [phase,          setPhase]          = useState<Phase>('prompt');
  const [transcript,     setTranscript]     = useState('');
  const [result,         setResult]         = useState<VoiceScoreResult | null>(null);
  const [scoreFeedback,  setScoreFeedback]  = useState<'accurate' | 'too_high' | 'too_low' | null>(null);

  const hasGraded = useRef(false);

  const grade = useCallback((spoken: string) => {
    if (hasGraded.current) return;
    hasGraded.current = true;

    const scored = scoreVoice(spoken, word);
    setTranscript(spoken);
    setResult(scored);
    setPhase('scored');
  }, [word]);

  useEffect(() => {
    if (phase !== 'listening') return;
    if (stt.recState === 'done') {
      grade(stt.result?.transcript ?? '');
    } else if (stt.recState === 'nospeech') {
      grade(''); // produces the "No speech detected" result card
    }
  }, [stt.recState]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleStart() {
    tts.stop();
    stt.reset();
    hasGraded.current = false;
    setResult(null);
    setPhase('listening');
    stt.startListening();
  }

  function handleStop() {
    stt.stopListening();
    grade(stt.result?.transcript ?? '');
  }

  function submitScoreFeedback(verdict: 'accurate' | 'too_high' | 'too_low') {
    if (scoreFeedback || !result || !isSupabaseConfigured) return;
    setScoreFeedback(verdict);
    db.insertVoiceScoreFeedback({
      session_id:   getSessionId(),
      word_id:      word.id,
      hanzi:        word.hanzi,
      pinyin:       word.pinyin,
      transcript,
      system_score: result.score,
      verdict,
    }).catch(() => {/* silent */});
  }

  function handleNext() {
    if (!result) return;
    // Persist pronunciation attempt to Supabase
    if (isSupabaseConfigured) {
      db.insertPronunciation({
        session_id: getSessionId(),
        word_id:    word.id,
        hanzi:      word.hanzi,
        transcript,
        score:      result.score,
        grade:      result.grade,
        is_correct: result.isCorrect,
      }).catch(() => {/* silent — offline resilience */});
    }
    onAnswer(result.isCorrect, result.score, word, transcript);
  }

  // Not-supported banner
  if (!stt.isSupported) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="text-5xl">🎤</div>
        <p className="font-semibold text-ink">Voice not available in this browser</p>
        <p className="text-sm text-ink-soft max-w-xs mx-auto">
          Speech recognition requires Chrome or Edge on desktop/Android.
        </p>
        <Button onClick={() => onAnswer(true, 100, word, '')}>
          Skip (count as correct) →
        </Button>
      </div>
    );
  }

  const isListening = phase === 'listening';

  return (
    <div className="space-y-6">
      {/* Target word */}
      <div className="text-center">
        <p className="text-ink-soft text-sm mb-2">Say this word in Mandarin:</p>
        <div className="font-hanzi text-[80px] sm:text-[96px] leading-none text-ink">
          {word.hanzi}
        </div>
        <div className="text-brand font-bold text-xl mt-2">{word.pinyin}</div>
        {/* Translations — centralized: never blank, consistent fallback */}
        {translationLines(word, lang).map((line, i) => (
          <div
            key={i}
            className={['text-ink-soft text-sm', i === 0 ? 'mt-1' : '', line.lang === 'th' ? 'font-thai' : ''].join(' ')}
          >
            {line.text}
          </div>
        ))}
        <div className="flex justify-center gap-3 mt-3">
          <AudioButton text={word.hanzi} size="md" />
          <AudioButton text={word.hanzi} size="md" slow />
        </div>
      </div>

      {/* Recording controls */}
      <div className="flex flex-col items-center gap-4">

        {phase === 'prompt' && (
          <>
            <Button size="lg" className="px-10" onClick={handleStart}>
              🎤 Start Speaking
            </Button>
            <p className="text-xs text-ink-soft text-center max-w-xs">
              Tap, speak clearly — the mic stops automatically after you finish.
            </p>
          </>
        )}

        {isListening && (() => {
          // Map the recognition state → a clear mic status for the learner.
          const speaking = stt.recState === 'speaking' || (stt.audioDetected && stt.recState === 'listening');
          const status =
            stt.recState === 'processing' ? { label: 'Processing…',         color: 'text-amber-600',  active: true }
            : speaking                    ? { label: 'Audio detected…',      color: 'text-emerald-600', active: true }
            : stt.recState === 'denied'   ? { label: 'Microphone blocked',   color: 'text-red-600',    active: false }
            :                               { label: 'Listening…',           color: 'text-red-600',    active: false };

          return (
            <>
              {/* Mic + voice-activity rings (rings only pulse when audio is detected) */}
              <div className="relative w-20 h-20 flex items-center justify-center">
                {status.active && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping" />
                    <span className="absolute inset-2 rounded-full bg-emerald-400/30 animate-ping [animation-delay:200ms]" />
                  </>
                )}
                <div className={[
                  'relative w-14 h-14 rounded-full text-white flex items-center justify-center shadow-lg text-2xl transition-colors',
                  status.active ? 'bg-emerald-600' : 'bg-red-600',
                ].join(' ')}>
                  🎤
                </div>
              </div>

              {/* Status line */}
              <div className={['font-semibold text-sm flex items-center gap-2', status.color].join(' ')}>
                <span className={status.active ? '' : 'animate-pulse'}>{status.label}</span>
              </div>

              {/* Live activity meter (simple bars that animate while audio is present) */}
              <div className="flex items-end gap-1 h-6" aria-hidden>
                {[0, 1, 2, 3, 4].map(i => (
                  <span
                    key={i}
                    className={[
                      'w-1.5 rounded-full transition-all',
                      status.active ? 'bg-emerald-500 animate-pulse' : 'bg-ink/15',
                    ].join(' ')}
                    style={{ height: status.active ? `${8 + ((i * 7 + 10) % 16)}px` : '6px', animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>

              {/* Live partial transcript */}
              {stt.interim && (
                <div className="font-hanzi text-lg text-ink-soft">{stt.interim}</div>
              )}

              <Button variant="danger" size="lg" onClick={handleStop}>⏹ Stop</Button>
              <p className="text-[11px] text-ink-soft text-center max-w-xs">
                Speak now — the mic stops automatically when you finish. If it doesn't hear you,
                tap Stop and try again a little closer to the mic.
              </p>
            </>
          );
        })()}

        {phase === 'scored' && result && (
          <div className="w-full animate-pop">
            <div className={[
              'rounded-3xl border-2 overflow-hidden',
              GRADE_BANNER[result.grade],
            ].join(' ')}>

              {/* Score header — Overall */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-ink/8">
                <div className={['text-5xl font-extrabold tabular-nums', SCORE_COLOR[result.grade]].join(' ')}>
                  {result.score}%
                </div>
                <div className="text-right">
                  <div className={['text-lg font-bold', SCORE_COLOR[result.grade]].join(' ')}>
                    {result.label}
                  </div>
                  <div className="text-xs text-ink-soft">overall score</div>
                </div>
              </div>

              {/* Sub-scores — Pronunciation / Tone / Transcript evaluated separately */}
              <div className="grid grid-cols-3 divide-x divide-ink/8 border-b border-ink/8 bg-white/50">
                {([
                  { label: 'Pronunciation', value: result.pronunciationScore },
                  { label: 'Tone',          value: result.toneScore },
                  { label: 'Transcript',    value: result.transcriptScore },
                ] as const).map(s => {
                  const c = s.value >= 80 ? 'text-emerald-600' : s.value >= 50 ? 'text-amber-600' : 'text-red-500';
                  return (
                    <div key={s.label} className="px-2 py-3 text-center">
                      <div className={['text-2xl font-extrabold tabular-nums', c].join(' ')}>{s.value}%</div>
                      <div className="text-[10px] text-ink-soft uppercase tracking-wide mt-0.5">{s.label}</div>
                    </div>
                  );
                })}
              </div>

              <div className="px-5 py-4 space-y-4">

                {/* Character comparison */}
                <div>
                  <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2.5">
                    Character Analysis
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {result.comparison.map((c, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className={[
                          'font-hanzi text-2xl w-12 h-12 flex items-center justify-center rounded-xl border-2',
                          CHAR_MATCH_STYLES[c.match],
                        ].join(' ')}>
                          {c.expected || '—'}
                        </div>
                        {c.detected && c.detected !== c.expected && (
                          <div className="text-xs font-hanzi text-ink-soft">
                            → {c.detected}
                          </div>
                        )}
                        <div className={[
                          'text-[9px] font-bold uppercase tracking-wide',
                          c.match === 'correct' ? 'text-emerald-600'
                          : c.match === 'partial' ? 'text-amber-600'
                          : 'text-red-500',
                        ].join(' ')}>
                          {CHAR_MATCH_LABELS[c.match]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Transcript */}
                {transcript && (
                  <div className="rounded-2xl bg-white/60 border border-ink/8 px-4 py-3">
                    <div className="text-xs text-ink-soft font-semibold mb-1">Detected:</div>
                    <div className="font-hanzi text-xl text-ink">{transcript}</div>
                  </div>
                )}

                {/* Feedback message */}
                <p className="text-sm text-ink-soft leading-relaxed">{result.feedback}</p>

                {/* Legend */}
                <div className="flex flex-wrap gap-1.5">
                  {(['correct','partial','wrong'] as CharMatch[]).map(m => (
                    <span key={m} className={[
                      'text-[10px] px-2 py-0.5 rounded-full border font-semibold',
                      CHAR_MATCH_STYLES[m],
                    ].join(' ')}>
                      {CHAR_MATCH_LABELS[m]}
                    </span>
                  ))}
                </div>
              </div>

              {/* Score fairness feedback */}
              {isSupabaseConfigured && (
                <div className="px-5 pb-4">
                  {scoreFeedback ? (
                    <p className="text-xs text-emerald-600 font-semibold text-center">
                      ✓ Thanks for the feedback!
                    </p>
                  ) : (
                    <div>
                      <p className="text-[11px] text-ink-soft text-center mb-2">Was this score fair?</p>
                      <div className="flex gap-2 justify-center">
                        {([
                          { verdict: 'accurate' as const, label: '👍 Fair',     cls: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
                          { verdict: 'too_high' as const, label: '📈 Too high', cls: 'border-amber-300  text-amber-700  hover:bg-amber-50'  },
                          { verdict: 'too_low'  as const, label: '📉 Too low',  cls: 'border-red-300    text-red-600    hover:bg-red-50'    },
                        ]).map(({ verdict, label, cls }) => (
                          <button
                            key={verdict}
                            onClick={() => submitScoreFeedback(verdict)}
                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all active:scale-95 ${cls}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action row */}
              <div className="flex gap-3 px-5 pb-5">
                <button
                  onClick={handleStart}
                  className="flex-1 py-2.5 rounded-2xl border-2 border-ink/15 bg-white text-ink text-sm font-semibold hover:border-brand/30 transition-all active:scale-95"
                >
                  🎤 Try Again
                </button>
                <button
                  onClick={handleNext}
                  className={[
                    'flex-1 py-2.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-95',
                    result.isCorrect
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-brand hover:bg-brand/90',
                  ].join(' ')}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
