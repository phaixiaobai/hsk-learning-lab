/**
 * @file voiceScoring.ts
 * @description Voice pronunciation scoring utility.
 *
 * The grader evaluates four INDEPENDENT dimensions and combines them into an
 * overall score, instead of collapsing everything into one number. This is the
 * fix for "the system accepts incorrect pronunciation": e.g. answering with
 * bare pinyin ("ping guo") for 苹果 (píng guǒ) gets the syllables right but the
 * tones and the literal transcript wrong, so it can no longer score 100.
 *
 * Dimensions
 * ──────────
 *   1. Transcript match      – did the recogniser return the exact expected hanzi?
 *   2. Pronunciation (sound) – are the initials + finals correct (tone-agnostic)?
 *   3. Tone accuracy         – are the tone marks correct on the syllables that
 *                              were pronounced?
 *   4. Fluency               – penalises empty/very short/noisy responses.
 *
 *   Overall = 0.30·transcript + 0.40·pronunciation + 0.20·tone + 0.10·fluency
 *
 * Score thresholds (overall)
 * ──────────────────────────
 *   90–100  Excellent      75–89  Very good     60–74  Understandable
 *   40–59   Needs work     0–39   Incorrect
 *
 * Character comparison tags (for the per-character UI):
 *   'correct' exact hanzi · 'partial' similar sound · 'wrong' · 'missing' · 'extra'
 */

import vocab from '../data/vocabulary.json';
import type { VocabItem } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────

export type CharMatch = 'correct' | 'partial' | 'wrong' | 'missing' | 'extra';

export interface CharComparison {
  expected: string;
  detected: string | null;
  match: CharMatch;
}

export type ScoreGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'incorrect';

export interface VoiceScoreResult {
  /** 0–100 composite score. */
  score: number;
  /** Exact-transcript match (did they say the right word, literally). */
  transcriptScore: number;
  /** Sound accuracy — initials + finals, tone-agnostic. */
  pronunciationScore: number;
  /** Tone-mark accuracy on pronounced syllables. */
  toneScore: number;
  grade: ScoreGrade;
  /** Short label shown prominently in UI. */
  label: string;
  /** Detailed feedback sentence. */
  feedback: string;
  /** Per-character comparison for visual display. */
  comparison: CharComparison[];
  /** True if score >= passing threshold. */
  isCorrect: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PASSING_SCORE = 60;

const GRADE_THRESHOLDS: Array<[number, ScoreGrade, string, string]> = [
  [90, 'excellent', '🏆 Excellent!',    'Perfect pronunciation — your tones are spot on.'],
  [75, 'good',      '✓ Very Good',      'Good pronunciation with minor variations.'],
  [60, 'fair',      '⚡ Understandable', 'Recognisable but some tone/sound issues. Keep practising!'],
  [40, 'poor',      '📚 Needs Work',    'Some correct elements but significant pronunciation issues.'],
  [ 0, 'incorrect', '✗ Try Again',      "The speech wasn't recognised clearly. Speak closer to the mic."],
];

// ── Pinyin lookup table (built from vocabulary.json) ──────────────────────

/** Map hanzi char → first-seen pinyin syllable (with tone), e.g. "苹" → "píng". */
const _pinyinMap = new Map<string, string>();

(function buildMap() {
  for (const w of vocab as VocabItem[]) {
    const chars = [...w.hanzi];
    const syllables = String(w.pinyin).trim().split(/\s+/);
    if (chars.length === syllables.length) {
      chars.forEach((ch, i) => {
        if (!_pinyinMap.has(ch)) _pinyinMap.set(ch, syllables[i]);
      });
    }
  }
})();

function getPinyin(char: string): string {
  return _pinyinMap.get(char) ?? '';
}

const CJK = /[㐀-鿿]/;
function isHanzi(s: string): boolean {
  return CJK.test(s);
}

/** Strip tone marks → bare romanisation (initial+final, lowercased). */
function stripTone(syllable: string): string {
  return syllable
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ü/g, 'v')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * Tone number of a pinyin syllable from its diacritic.
 *   1 macron · 2 acute · 3 caron · 4 grave · 0 = neutral/unmarked
 *   -1 = no tone information (bare latin syllable). Tone-less input returns -1
 *   so that it is not rewarded by the tone score.
 */
function toneOf(syllable: string): number {
  const d = syllable.normalize('NFD');
  if (/̄/.test(d)) return 1; // macron
  if (/́/.test(d)) return 2; // acute
  if (/̌/.test(d)) return 3; // caron
  if (/̀/.test(d)) return 4; // grave
  return -1;
}

/**
 * Apply third-tone sandhi to a sequence of tones.
 * Standard rule: a 3rd tone immediately followed by another 3rd tone is
 * pronounced as a 2nd tone (你好 nǐ hǎo → ní hǎo). Without this, a correct
 * spoken answer would be unfairly marked as a tone error, which is the most
 * common false-negative for third tones.
 */
function applyToneSandhi(tones: number[]): number[] {
  const out = tones.slice();
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i] === 3 && out[i + 1] === 3) out[i] = 2;
  }
  return out;
}

/**
 * Compare an expected vs detected tone with partial credit.
 *   1.0  exact match (after sandhi)
 *   0.5  a 2↔3 confusion — the single most common error for learners AND
 *        speech recognisers, since the half-third tone sounds like a rising 2.
 *   0.0  otherwise / tone information missing
 */
function toneCredit(expected: number, detected: number): number {
  if (detected < 0) return 0;          // no tone info in the input
  if (expected === detected) return 1;
  if ((expected === 3 && detected === 2) || (expected === 2 && detected === 3)) return 0.5;
  return 0;
}

/** Extract initial consonant (≤2 chars) from a bare pinyin syllable. */
function initial(bare: string): string {
  const two = bare.slice(0, 2);
  if (['zh', 'ch', 'sh'].includes(two)) return two;
  const one = bare[0];
  const singles = ['b','p','m','f','d','t','n','l','g','k','h','j','q','x','r','y','w','z','c','s'];
  return singles.includes(one) ? one : '';
}

// ── Syllable extraction for the spoken transcript ──────────────────────────

/** Normalise: drop whitespace and punctuation. */
function normalise(s: string): string {
  return s.replace(/[\s　，。！？,.!?·]/g, '');
}

/**
 * Turn the spoken transcript into syllables-with-tone aligned to the expected
 * word. Handles both hanzi transcripts (the normal case) and bare-pinyin
 * transcripts (some engines / accents return romanisation).
 */
function spokenSyllables(rawSpoken: string, expectedBare: string[]): {
  syllables: string[];      // with tone where known
  hanzi: string[] | null;   // present only when the transcript was hanzi
} {
  const spoken = normalise(rawSpoken);
  if (!spoken) return { syllables: [], hanzi: null };

  if (isHanzi(spoken)) {
    const chars = [...spoken];
    return { syllables: chars.map(getPinyin), hanzi: chars };
  }

  // Latin / pinyin transcript. Prefer the engine's own spacing.
  const spaced = rawSpoken.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (spaced.length > 1) return { syllables: spaced, hanzi: null };

  // Single token — greedily segment against the expected bare syllables.
  const token = spoken.toLowerCase();
  const out: string[] = [];
  let rest = token;
  for (const bare of expectedBare) {
    if (bare && rest.startsWith(bare)) {
      out.push(rest.slice(0, bare.length));
      rest = rest.slice(bare.length);
    } else {
      break;
    }
  }
  if (rest.length === 0 && out.length === expectedBare.length) return { syllables: out, hanzi: null };
  return { syllables: [token], hanzi: null };
}

// ── Character comparison (drives the per-character UI) ──────────────────────

function compareChar(expChar: string, detChar: string): CharMatch {
  if (expChar === detChar) return 'correct';
  const expBare = stripTone(getPinyin(expChar));
  const detBare = stripTone(isHanzi(detChar) ? getPinyin(detChar) : detChar);
  if (!expBare || !detBare) return 'wrong';
  if (expBare === detBare) return 'partial';
  if (initial(expBare) && initial(expBare) === initial(detBare)) return 'partial';
  return 'wrong';
}

function buildComparison(expHanzi: string[], detected: string[]): CharComparison[] {
  const out: CharComparison[] = [];
  const maxLen = Math.max(expHanzi.length, detected.length);
  for (let i = 0; i < maxLen; i++) {
    const e = expHanzi[i];
    const d = detected[i];
    if (!e) out.push({ expected: '', detected: d ?? null, match: 'extra' });
    else if (!d) out.push({ expected: e, detected: null, match: 'missing' });
    else out.push({ expected: e, detected: d, match: compareChar(e, d) });
  }
  return out;
}

// ── Feedback ───────────────────────────────────────────────────────────────

function generateFeedback(
  expected: string,
  grade: ScoreGrade,
  transcriptScore: number,
  pronunciationScore: number,
  toneScore: number,
): string {
  if (grade === 'excellent') return 'Your pronunciation and tones are excellent — keep it up!';

  // Diagnose the weakest dimension and coach on it.
  if (pronunciationScore >= 70 && toneScore < 60 && transcriptScore < 90) {
    return `Your sounds are close, but the tones need work. Use the 🐢 slow button and match the tone of "${expected}".`;
  }
  if (transcriptScore < 50 && pronunciationScore >= 70) {
    return `The sounds were recognisable but not the exact word — try saying the hanzi "${expected}" clearly, not just the pinyin.`;
  }
  if (grade === 'good') return 'Very good — only a minor tone or sound variation detected.';
  if (grade === 'fair') return `Recognisable. Focus on "${expected}" syllable by syllable using the slow audio.`;
  if (grade === 'poor') return `Keep practising "${expected}" — listen to the slow audio and repeat each syllable.`;
  return 'Speak clearly and close to the microphone. Try the slow audio first.';
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Score a voice recognition result against the expected word.
 * @param spokenTranscript Raw transcript from the SpeechRecognition API.
 * @param expectedWord     The VocabItem being tested.
 */
export function scoreVoice(
  spokenTranscript: string,
  expectedWord: VocabItem,
): VoiceScoreResult {
  const expHanzi = [...normalise(expectedWord.hanzi)];
  const expSyll = String(expectedWord.pinyin).trim().split(/\s+/);
  const expBare = expSyll.map(stripTone);
  // Apply third-tone sandhi to the expected tones so naturally-spoken answers
  // aren't penalised for the 3→2 shift before another third tone.
  const expTones = applyToneSandhi(expSyll.map(toneOf));

  const spoken = normalise(spokenTranscript);

  // ── Empty transcript ──
  if (!spoken) {
    return {
      score: 0,
      transcriptScore: 0,
      pronunciationScore: 0,
      toneScore: 0,
      grade: 'incorrect',
      label: '✗ No speech detected',
      feedback: 'No speech was detected. Speak clearly and close to the microphone.',
      comparison: expHanzi.map(ch => ({ expected: ch, detected: null, match: 'missing' as CharMatch })),
      isCorrect: false,
    };
  }

  const { syllables: detSyll, hanzi: detHanzi } = spokenSyllables(spokenTranscript, expBare);
  const detBare = detSyll.map(stripTone);
  const detTones = applyToneSandhi(detSyll.map(toneOf));

  const n = expBare.length || 1;

  // 1. Transcript match — exact hanzi only (pinyin-only answers score low here).
  let exactChars = 0;
  if (detHanzi) {
    for (let i = 0; i < expHanzi.length; i++) {
      if (detHanzi[i] && detHanzi[i] === expHanzi[i]) exactChars++;
    }
  }
  const transcriptScore = Math.round((exactChars / expHanzi.length) * 100);

  // 2. Pronunciation — bare-syllable (initial+final) match, tone-agnostic.
  let soundHits = 0;
  for (let i = 0; i < expBare.length; i++) {
    const e = expBare[i];
    const d = detBare[i];
    if (!d) continue;
    if (e === d) soundHits += 1;
    else if (initial(e) && initial(e) === initial(d)) soundHits += 0.5; // shared onset
  }
  const pronunciationScore = Math.round((soundHits / n) * 100);

  // 3. Tone — only on syllables whose sound matched; tone-less input scores 0.
  //    Uses sandhi-adjusted tones and partial credit for 2↔3 confusion, with
  //    extra tracking of third-tone errors for targeted feedback.
  let toneEligible = 0;
  let toneHits = 0;
  let thirdToneTotal = 0;
  let thirdToneMissed = 0;
  for (let i = 0; i < expBare.length; i++) {
    if (detBare[i] && expBare[i] === detBare[i]) {
      toneEligible += 1;
      const credit = toneCredit(expTones[i], detTones[i]);
      toneHits += credit;
      if (expTones[i] === 3) {
        thirdToneTotal += 1;
        if (credit < 1) thirdToneMissed += 1;
      }
    }
  }
  const toneScore = toneEligible > 0 ? Math.round((toneHits / toneEligible) * 100) : 0;

  // 4. Fluency — penalise noise (extra syllables) and reward full-length answers.
  const extra = Math.max(0, detSyll.length - expSyll.length);
  const lengthRatio = Math.min(1, detSyll.length / n);
  const fluencyScore = Math.round(Math.max(0, 100 * lengthRatio - extra * 15));

  // ── Overall (weighted) ──
  const overall = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        0.30 * transcriptScore +
        0.40 * pronunciationScore +
        0.20 * toneScore +
        0.10 * fluencyScore,
      ),
    ),
  );

  // Exact, fully-toned hanzi match → guarantee 100.
  const perfect = !!detHanzi && exactChars === expHanzi.length && expHanzi.length > 0;
  const score = perfect ? 100 : overall;

  const [, grade, label, defaultFeedback] =
    GRADE_THRESHOLDS.find(([t]) => score >= t)!;

  const comparison = buildComparison(expHanzi, detHanzi ?? detSyll);
  let feedback = perfect
    ? 'Perfect pronunciation!'
    : (generateFeedback(expectedWord.hanzi, grade, transcriptScore, pronunciationScore, toneScore) || defaultFeedback);
  // Targeted third-tone coaching — the hardest tone for most learners.
  if (!perfect && thirdToneMissed > 0) {
    feedback += ' Tip: the third tone (ˇ) dips low then rises — let your voice drop fully before it comes back up.';
  }

  return {
    score,
    transcriptScore: perfect ? 100 : transcriptScore,
    pronunciationScore: perfect ? 100 : pronunciationScore,
    toneScore: perfect ? 100 : toneScore,
    grade,
    label,
    feedback,
    comparison,
    isCorrect: score >= PASSING_SCORE,
  };
}
