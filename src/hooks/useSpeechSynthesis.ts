/**
 * @file useSpeechSynthesis.ts
 * @description TTS hook with Azure Neural TTS (primary) and Web Speech API (fallback).
 *
 * Azure mode (when VITE_AZURE_SPEECH_KEY + VITE_AZURE_SPEECH_REGION are set):
 * ─────────────────────────────────────────────────────────────────────────────
 * • Uses zh-CN-XiaoxiaoNeural — Microsoft's best Mandarin neural voice.
 *   Accurate 4-tone reproduction, natural rhythm, no robotic artefacts.
 * • SSML prosody for slow mode: rate="-45%" sounds genuinely deliberate while
 *   preserving natural pitch contour (unlike Web Speech rate=0.35 which
 *   artificially stretches audio and distorts tones).
 * • REST API → MP3 blob → <audio> element. No SDK, no extra bundle weight.
 * • In-memory LRU cache (64 entries) avoids redundant round-trips for the
 *   same word. Common vocabulary is fetched once per session.
 *
 * Web Speech fallback (no Azure key):
 * ─────────────────────────────────────
 * • Selects best available zh-CN voice (Microsoft Neural > Google > system).
 * • Normal: rate 1.0, Slow: rate 0.35 / pitch 0.9.
 *
 * Public API (unchanged — AudioButton and VoiceMode use this interface):
 *   speak(text, lang?, rate?)  — play at normal or slow speed
 *   speakSlow(text, lang?)     — convenience wrapper for slow
 *   stop()                     — cancel current playback
 *   state: SpeakState          — 'idle' | 'loading' | 'playing' | 'error' | 'unsupported'
 *   isSupported: boolean
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeakState = 'idle' | 'loading' | 'playing' | 'error' | 'unsupported';
export type PlaybackRate = 'normal' | 'slow';

// ── Azure config (Vite env vars) ──────────────────────────────────────────

const AZURE_KEY    = import.meta.env.VITE_AZURE_SPEECH_KEY    as string | undefined;
const AZURE_REGION = import.meta.env.VITE_AZURE_SPEECH_REGION as string | undefined;
const USE_AZURE    = Boolean(AZURE_KEY && AZURE_REGION);

// Azure neural voice — best Mandarin tone reproduction available.
const AZURE_VOICE  = 'zh-CN-XiaoxiaoNeural';

// Output format: 24 kHz mono MP3 — good quality, small payload (~8 KB/word).
const AZURE_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

// Prosody rates for SSML.
// Slow: -25% (not -45%) — too slow sounds mechanical; -25% stays natural.
const AZURE_RATES: Record<PlaybackRate, string> = {
  normal: '0%',
  slow:   '-25%',
};

// ── Audio cache ──────────────────────────────────────────────────────────

/** Simple FIFO cache keyed by "{text}:{rate}". Prevents duplicate fetches. */
const audioCache = new Map<string, string>(); // key → object URL
const CACHE_LIMIT = 64;

function cacheKey(text: string, rate: PlaybackRate) {
  return `${rate}:${text}`;
}

function cacheGet(text: string, rate: PlaybackRate): string | undefined {
  return audioCache.get(cacheKey(text, rate));
}

function cacheSet(text: string, rate: PlaybackRate, url: string) {
  if (audioCache.size >= CACHE_LIMIT) {
    // Evict oldest entry
    const firstKey = audioCache.keys().next().value;
    const oldUrl = audioCache.get(firstKey!);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    audioCache.delete(firstKey!);
  }
  audioCache.set(cacheKey(text, rate), url);
}

// ── SSML builder ─────────────────────────────────────────────────────────

function buildSSML(text: string, rate: PlaybackRate): string {
  // Escape XML special chars in the spoken text
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  if (rate === 'slow') {
    // Slow mode: "gentle" speaking style simulates a patient teacher.
    // Xiaoxiao's gentle style = soft, warm, clearly enunciated — not robotic.
    // styledegree="1.8" amplifies softness without losing clarity.
    // rate="-25%" reduces speed naturally; pitch stays at 0% to preserve tones.
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="${AZURE_VOICE}">
    <mstts:express-as style="gentle" styledegree="1.8">
      <prosody rate="${AZURE_RATES[rate]}" pitch="0%">${escaped}</prosody>
    </mstts:express-as>
  </voice>
</speak>`;
  }

  // Normal mode: default Xiaoxiao delivery — natural, native-speaker cadence.
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${AZURE_VOICE}">
    <prosody rate="${AZURE_RATES[rate]}" pitch="0%">${escaped}</prosody>
  </voice>
</speak>`;
}

// ── Azure REST fetch ──────────────────────────────────────────────────────

async function fetchAzureAudio(text: string, rate: PlaybackRate): Promise<string> {
  // Return cached URL if available
  const cached = cacheGet(text, rate);
  if (cached) return cached;

  const endpoint = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = buildSSML(text, rate);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_KEY!,
      'Content-Type':              'application/ssml+xml',
      'X-Microsoft-OutputFormat':  AZURE_FORMAT,
    },
    body: ssml,
  });

  if (!response.ok) {
    throw new Error(`Azure TTS ${response.status}: ${await response.text()}`);
  }

  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  cacheSet(text, rate, url);
  return url;
}

// ── Web Speech API fallback ───────────────────────────────────────────────

const NEURAL_PATTERNS = [
  /Yunxi|Xiaoxiao|XiaoXiao|Yunyang|Xiaochen|Yunjian/i,
  /Microsoft.*Neural/i,
  /Neural.*zh/i,
];
const GOOD_PATTERNS = [/Google.*普通话|Google.*zh/i, /Google/i];

function rankVoice(v: SpeechSynthesisVoice): number {
  if (!v.lang.startsWith('zh')) return -1;
  const langScore = v.lang === 'zh-CN' ? 10 : v.lang === 'zh-TW' ? 5 : 2;
  for (const p of NEURAL_PATTERNS) if (p.test(v.name)) return 100 + langScore;
  for (const p of GOOD_PATTERNS)   if (p.test(v.name)) return  50 + langScore;
  return langScore;
}

function getBestVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const zh = voices.filter(v => v.lang.startsWith('zh'));
  if (!zh.length) return null;
  zh.sort((a, b) => rankVoice(b) - rankVoice(a));
  const exact = zh.find(v => v.lang === lang);
  const top   = zh[0];
  return (exact && rankVoice(exact) === rankVoice(top)) ? exact : top;
}

const WEB_RATE: Record<PlaybackRate, number>  = { normal: 1.0, slow: 0.35 };
const WEB_PITCH: Record<PlaybackRate, number> = { normal: 1.0, slow: 0.9  };

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSpeechSynthesis() {
  const [state, setState] = useState<SpeakState>('idle');

  // Azure: current <audio> element
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  // Web Speech: current utterance + timer
  const utterRef  = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    (USE_AZURE || 'speechSynthesis' in window);

  // Warm up Web Speech voice list on mount (Chrome async population)
  useEffect(() => {
    if (!USE_AZURE && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const stop = useCallback(() => {
    // Stop Azure audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    // Stop Web Speech
    if (timerRef.current) clearTimeout(timerRef.current);
    if ('speechSynthesis' in window) window.speechSynthesis?.cancel();
    utterRef.current = null;
    setState('idle');
  }, []);

  // ── Azure speak ───────────────────────────────────────────────────────
  const speakAzure = useCallback(
    async (text: string, rate: PlaybackRate) => {
      stop();
      setState('loading');
      try {
        const url = await fetchAzureAudio(text, rate);

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onplay    = () => setState('playing');
        audio.onended   = () => { audioRef.current = null; setState('idle'); };
        audio.onerror   = () => { audioRef.current = null; setState('error'); };

        await audio.play();
      } catch (err) {
        console.error('[Azure TTS]', err);
        setState('error');
      }
    },
    [stop],
  );

  // ── Web Speech speak ──────────────────────────────────────────────────
  const speakWebSpeech = useCallback(
    (text: string, lang: string, rate: PlaybackRate) => {
      if (!('speechSynthesis' in window)) { setState('unsupported'); return; }
      stop();
      setState('loading');

      timerRef.current = setTimeout(() => {
        const utter   = new SpeechSynthesisUtterance(text);
        utter.lang    = lang;
        utter.rate    = WEB_RATE[rate];
        utter.pitch   = WEB_PITCH[rate];
        utter.volume  = 1.0;

        const attachVoice = () => {
          const voice = getBestVoice(lang);
          if (voice) utter.voice = voice;
        };
        attachVoice();
        if (!utter.voice) {
          window.speechSynthesis.addEventListener('voiceschanged', attachVoice, { once: true });
        }

        utter.onstart = () => setState('playing');
        utter.onend   = () => setState('idle');
        utter.onerror = (e) => {
          if (e.error === 'interrupted') { setState('idle'); return; }
          setState('error');
        };

        utterRef.current = utter;
        window.speechSynthesis.speak(utter);
      }, 120);
    },
    [stop],
  );

  // ── Unified speak ─────────────────────────────────────────────────────

  const speak = useCallback(
    (text: string, lang = 'zh-CN', rate: PlaybackRate = 'normal') => {
      if (!isSupported) { setState('unsupported'); return; }
      if (USE_AZURE) {
        speakAzure(text, rate);
      } else {
        speakWebSpeech(text, lang, rate);
      }
    },
    [isSupported, speakAzure, speakWebSpeech],
  );

  const speakSlow = useCallback(
    (text: string, lang = 'zh-CN') => speak(text, lang, 'slow'),
    [speak],
  );

  return { speak, speakSlow, stop, state, isSupported };
}
