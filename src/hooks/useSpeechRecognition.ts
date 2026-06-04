import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone / recognition lifecycle states.
 *  idle       – not listening
 *  listening  – mic open, waiting for the user to speak
 *  speaking   – audio/voice activity detected (user is talking)
 *  processing – speech ended, recognising
 *  done       – a final transcript is available
 *  nospeech   – mic opened but no speech was detected (recoverable)
 *  denied     – microphone permission denied / unavailable
 *  error      – any other recognition error
 */
export type RecognitionState =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'done'
  | 'nospeech'
  | 'denied'
  | 'error';

export interface RecognitionResult {
  transcript: string;
  confidence: number; // 0–1
}

export interface SpeechRecognitionOptions {
  /** BCP-47 language tag. Default 'zh-CN'. */
  lang?: string;
  /** Hard cap (ms) on a single listen before auto-stopping. Default 10000. */
  maxListenMs?: number;
  /**
   * When the API reports "no-speech", automatically retry this many times
   * before surfacing the `nospeech` state. Helps with the common case where
   * the first audio frames are clipped. Default 1.
   */
  autoRetryOnNoSpeech?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySpeechRecognition = any;
const SpeechRecognitionCtor: AnySpeechRecognition =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null
    : null;

/**
 * Wrapper around the Web Speech API (SpeechRecognition) tuned for short
 * single-word Mandarin prompts.
 *
 * Reliability improvements over the naive version:
 *  • interimResults = true → we get live partial transcripts, which both powers
 *    the voice-activity indicator and lets us keep the best partial if the
 *    final result event is dropped (a known Chrome quirk).
 *  • onspeechstart / onaudiostart drive a real "speaking" state so the UI can
 *    show "Audio detected…" instead of a frozen "Listening…".
 *  • 'no-speech' is handled distinctly (and optionally auto-retried) instead of
 *    being collapsed into a generic error — this is the #1 cause of
 *    "I spoke but nothing was captured".
 *  • a max-listen watchdog stops a stuck session so the mic never hangs open.
 *  • permission errors map to a dedicated `denied` state with guidance.
 *
 * NOTE: SpeechRecognition is supported in Chrome / Edge / Android Chrome.
 * iOS Safari does NOT support it reliably — `isSupported` will be false there.
 */
export function useSpeechRecognition(
  langOrOptions: string | SpeechRecognitionOptions = 'zh-CN',
) {
  const opts: SpeechRecognitionOptions =
    typeof langOrOptions === 'string' ? { lang: langOrOptions } : langOrOptions;
  const lang = opts.lang ?? 'zh-CN';
  const maxListenMs = opts.maxListenMs ?? 10000;
  const maxRetries = opts.autoRetryOnNoSpeech ?? 1;

  const [recState, setRecState] = useState<RecognitionState>('idle');
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [interim, setInterim] = useState('');
  /** True once any audio/voice activity has been detected this session. */
  const [audioDetected, setAudioDetected] = useState(false);

  const recRef = useRef<AnySpeechRecognition>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bestPartialRef = useRef<RecognitionResult | null>(null);
  const retriesRef = useRef(0);
  const finishedRef = useRef(false);

  const isSupported = SpeechRecognitionCtor !== null;

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const begin = useCallback(() => {
    if (!isSupported) {
      setRecState('error');
      return;
    }

    // Abort any in-flight recognition.
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }

    const rec = new SpeechRecognitionCtor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    recRef.current = rec;

    finishedRef.current = false;
    bestPartialRef.current = null;
    setResult(null);
    setInterim('');
    setAudioDetected(false);
    setRecState('listening');

    // Watchdog: never let the mic hang open.
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }, maxListenMs);

    rec.onaudiostart = () => setAudioDetected(true);
    rec.onspeechstart = () => {
      setAudioDetected(true);
      setRecState(s => (s === 'listening' ? 'speaking' : s));
    };

    rec.onresult = (e: any) => {
      let finalText = '';
      let finalConf = 0;
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res[0];
        if (res.isFinal) {
          finalText += alt.transcript;
          finalConf = alt.confidence ?? finalConf;
        } else {
          interimText += alt.transcript;
        }
      }

      if (interimText) {
        setAudioDetected(true);
        setInterim(interimText.trim());
        setRecState(s => (s === 'listening' || s === 'speaking' ? 'speaking' : s));
        // Keep the best partial as a fallback for dropped final events.
        bestPartialRef.current = { transcript: interimText.trim(), confidence: 0.5 };
      }

      if (finalText.trim()) {
        finishedRef.current = true;
        clearWatchdog();
        setRecState('processing');
        const r = { transcript: finalText.trim(), confidence: finalConf || 1 };
        bestPartialRef.current = r;
        setResult(r);
        setInterim('');
        setRecState('done');
      }
    };

    rec.onerror = (e: any) => {
      clearWatchdog();
      const err = e?.error;
      if (err === 'no-speech') {
        if (retriesRef.current < maxRetries) {
          retriesRef.current += 1;
          // Brief restart — first frames are often clipped.
          setTimeout(() => begin(), 150);
          return;
        }
        setRecState('nospeech');
        return;
      }
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setRecState('denied');
        return;
      }
      if (err === 'aborted') {
        // Caused by our own restart/stop — ignore.
        return;
      }
      setRecState('error');
    };

    rec.onend = () => {
      clearWatchdog();
      if (finishedRef.current) return;
      // Final event never arrived — salvage the best partial if we have one.
      const salvaged = bestPartialRef.current;
      if (salvaged && salvaged.transcript) {
        finishedRef.current = true;
        setResult(salvaged);
        setInterim('');
        setRecState('done');
        return;
      }
      // Truly nothing captured.
      setRecState(s =>
        s === 'listening' || s === 'speaking' || s === 'processing' ? 'nospeech' : s,
      );
    };

    try {
      rec.start();
    } catch {
      // start() throws if called while already running — recover gracefully.
      setRecState('error');
    }
  }, [lang, isSupported, maxListenMs, maxRetries, clearWatchdog]);

  const startListening = useCallback(() => {
    retriesRef.current = 0;
    begin();
  }, [begin]);

  const stopListening = useCallback(() => {
    clearWatchdog();
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, [clearWatchdog]);

  const reset = useCallback(() => {
    clearWatchdog();
    retriesRef.current = 0;
    finishedRef.current = false;
    bestPartialRef.current = null;
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    setResult(null);
    setInterim('');
    setAudioDetected(false);
    setRecState('idle');
  }, [clearWatchdog]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      clearWatchdog();
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, [clearWatchdog]);

  return {
    startListening,
    stopListening,
    reset,
    recState,
    result,
    /** Live partial transcript (for the activity indicator). */
    interim,
    /** True once mic audio / voice activity has been detected this session. */
    audioDetected,
    isSupported,
  };
}
