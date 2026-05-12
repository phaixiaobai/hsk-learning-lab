import { useMemo, useState } from 'react';
import type { PreTestQuestion, PreTestResult } from '../types';
import { gradePreTest, AnsweredQuestion } from '../utils/preTestGrading';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import preTestData from '../data/preTest.json';
import { UiLang } from '../components/ui/LanguageToggle';

/**
 * Module A – Diagnostic Pre-Test
 * Presents 15 mixed questions (5 per HSK level 2/3/4), then calls
 * `gradePreTest` and hands the result back to the parent via
 * `onComplete`, which persists it to localStorage.
 */
interface Props {
  lang: UiLang;
  onComplete: (result: PreTestResult) => void;
  onSkip: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PreTest({ lang, onComplete, onSkip }: Props) {
  const questions = useMemo<PreTestQuestion[]>(
    () => shuffle(preTestData as PreTestQuestion[]),
    [],
  );

  const [index, setIndex]       = useState(0);
  const [answers, setAnswers]   = useState<AnsweredQuestion[]>([]);
  const [finished, setFinished] = useState<PreTestResult | null>(null);

  const current = questions[index];
  const progress = Math.round((index / questions.length) * 100);

  function select(choiceIdx: number) {
    const next = [...answers, { question: current, selectedIndex: choiceIdx }];
    setAnswers(next);
    if (index + 1 >= questions.length) {
      const result = gradePreTest(next);
      setFinished(result);
      onComplete(result);
    } else {
      setIndex(index + 1);
    }
  }

  if (finished) return <PreTestSummary lang={lang} result={finished} onSkip={onSkip} />;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <CardTitle>Placement Test</CardTitle>
        <span className="text-ink-soft font-semibold">
          {index + 1} / {questions.length}
        </span>
      </div>
      <div className="h-2 bg-ink/10 rounded-full overflow-hidden mb-6" aria-hidden>
        <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="text-center py-6">
        <p className="text-xl font-semibold text-ink mb-1">
          {lang === 'th' ? current.promptTh : current.prompt}
        </p>
        {lang === 'both' && (
          <p className="text-ink-soft font-thai">{current.promptTh}</p>
        )}
        <p className="mt-2 text-sm uppercase tracking-wider text-brand font-bold">
          HSK {current.level}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {current.choices.map((choice, i) => (
          <Button
            key={choice + i}
            variant="secondary"
            size="lg"
            onClick={() => select(i)}
            className="font-hanzi text-3xl"
          >
            {choice}
          </Button>
        ))}
      </div>

      <div className="mt-8 text-center">
        <button onClick={onSkip} className="text-ink-soft underline text-sm">
          Skip for now
        </button>
      </div>
    </Card>
  );
}

function PreTestSummary({ result, onSkip, lang }: { result: PreTestResult; onSkip: () => void; lang: UiLang }) {
  return (
    <Card>
      <CardTitle>Your Recommended Level: HSK {result.recommendedLevel} 🎉</CardTitle>
      <CardSubtitle>
        {lang === 'th'
          ? `คุณตอบถูก ${result.totalCorrect} จาก 15 ข้อ`
          : `You answered ${result.totalCorrect} / 15 correctly`}
      </CardSubtitle>

      <div className="grid grid-cols-3 gap-3 my-6">
        {([2, 3, 4] as const).map(l => (
          <div key={l} className="rounded-2xl bg-ink/5 p-4 text-center">
            <div className="text-sm text-ink-soft font-semibold">HSK {l}</div>
            <div className="text-3xl font-extrabold text-ink">
              {result.perLevel[l].correct}
              <span className="text-ink-soft text-xl">/{result.perLevel[l].total}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="bg-brand-light/40 border border-brand/30 rounded-2xl p-4 text-ink">
        <strong className="text-brand">Rationale: </strong>{result.rationale}
      </p>

      <div className="mt-6 flex gap-3">
        <Button full size="lg" onClick={onSkip}>Start Studying →</Button>
      </div>
    </Card>
  );
}
