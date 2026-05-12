import type { HskLevel, PreTestQuestion, PreTestResult } from '../types';

/* ================================================================
 * PRE-TEST GRADING LOGIC (Module A)
 * ================================================================
 * The diagnostic pre-test presents 15 mixed questions:
 *    5 × HSK-2   5 × HSK-3   5 × HSK-4
 *
 * Our goal isn't just total score – it's to recommend which level
 * the student should START studying. The algorithm below mimics
 * a teacher's judgement with three simple rules:
 *
 *   Rule 1 – "Highest mastered level"
 *     A level is considered "mastered" if the student got at least
 *     4 out of 5 questions correct at that level (≥ 80%).
 *     Start them at the next level up.
 *
 *   Rule 2 – "Sliding-window"
 *     If no level is fully mastered, pick the highest level where
 *     they scored ≥ 60 % (3 / 5) – that's where they need practice
 *     but already have a foothold.
 *
 *   Rule 3 – "Default"
 *     If they score < 60 % on every level, start at HSK 2
 *     (the lowest band we support).
 *
 * The function also emits a human-readable `rationale` string so
 * the UI can show the reasoning, e.g.:
 *   "You scored 5/5 on HSK-2 and 4/5 on HSK-3 – jump into HSK 4."
 * ================================================================ */

export interface AnsweredQuestion {
  question: PreTestQuestion;
  selectedIndex: number;
}

export function gradePreTest(answers: AnsweredQuestion[]): PreTestResult {
  const perLevel: Record<HskLevel, { correct: number; total: number }> = {
    2: { correct: 0, total: 0 },
    3: { correct: 0, total: 0 },
    4: { correct: 0, total: 0 },
  };

  for (const { question, selectedIndex } of answers) {
    perLevel[question.level].total += 1;
    if (selectedIndex === question.answerIndex) {
      perLevel[question.level].correct += 1;
    }
  }

  const totalCorrect = perLevel[2].correct + perLevel[3].correct + perLevel[4].correct;

  // Evaluate each level (≥ 80 % = mastered, ≥ 60 % = foothold).
  const mastered: HskLevel[] = [];
  const foothold: HskLevel[] = [];
  (Object.keys(perLevel) as unknown as HskLevel[]).forEach(l => {
    const { correct, total } = perLevel[l];
    if (total === 0) return;
    const ratio = correct / total;
    if (ratio >= 0.8) mastered.push(l);
    else if (ratio >= 0.6) foothold.push(l);
  });

  let recommendedLevel: HskLevel;
  let rationale: string;

  if (mastered.length > 0) {
    // Rule 1 – move up from the highest mastered level (cap at 4)
    const highest = Math.max(...mastered) as HskLevel;
    recommendedLevel = (Math.min(highest + 1, 4) as HskLevel);
    rationale = highest === 4
      ? `You already mastered HSK 4 in the pre-test – stay at HSK 4 to polish and drill advanced items.`
      : `You mastered HSK ${highest} (${perLevel[highest].correct}/${perLevel[highest].total}). Jumping you into HSK ${recommendedLevel}.`;
  } else if (foothold.length > 0) {
    // Rule 2 – highest level with ≥ 60 %
    recommendedLevel = Math.max(...foothold) as HskLevel;
    rationale = `You have a foothold at HSK ${recommendedLevel} (${perLevel[recommendedLevel].correct}/${perLevel[recommendedLevel].total}). Start here to consolidate.`;
  } else {
    // Rule 3 – default to HSK 2
    recommendedLevel = 2;
    rationale = `Your score is below 60% at every level, so we'll start you at HSK 2 to build a solid foundation.`;
  }

  return {
    totalCorrect,
    perLevel,
    recommendedLevel,
    rationale,
    takenAt: new Date().toISOString(),
  };
}
