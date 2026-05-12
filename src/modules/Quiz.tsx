import { useEffect, useMemo, useState } from 'react';
import vocab from '../data/vocabulary.json';
import type { HskLevel, QuizResult, VocabItem } from '../types';
import { generateQuiz } from '../utils/quizGenerator';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';

interface Props {
  level: HskLevel;
}

/**
 * Module D – Dynamic Quiz Engine
 * Pulls from the static vocab JSON, builds 10 randomized questions,
 * and stores high scores in localStorage under "hsk-master:scores".
 *
 * Refresh / "New Quiz" regenerates the question set with new
 * randomization, satisfying the "new randomized question set on
 * refresh" requirement.
 */
export function Quiz({ level }: Props) {
  const bank = vocab as VocabItem[];
  const [seed, setSeed] = useState(() => Date.now());
  const questions = useMemo(
    () => generateQuiz(bank, { level, totalQuestions: 10 }),
    // include `seed` so a reset rebuilds new questions
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bank, level, seed],
  );

  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [matchSelections, setMatchSelections] = useState<Record<string, string>>({});

  const [scores, setScores] = useLocalStorage<QuizResult[]>('hsk-master:scores', []);

  useEffect(() => {
    setIndex(0); setScore(0); setPicked(null); setDone(false); setMatchSelections({});
  }, [seed, level]);

  if (questions.length === 0) {
    return <Card><CardTitle>Quiz needs more vocabulary at this level.</CardTitle></Card>;
  }

  const q = questions[index];
  const progress = Math.round((index / questions.length) * 100);

  function commit(correct: boolean) {
    if (correct) setScore(s => s + 1);
    setTimeout(() => {
      setPicked(null);
      setMatchSelections({});
      if (index + 1 >= questions.length) {
        const final = correct ? score + 1 : score;
        setDone(true);
        setScores([
          { score: final, total: questions.length, level, date: new Date().toISOString() },
          ...scores,
        ].slice(0, 20));
      } else {
        setIndex(i => i + 1);
      }
    }, 700);
  }

  /* ------------------ render: completed state ------------------ */
  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    const best = Math.max(...scores.filter(s => s.level === level).map(s => s.score / s.total), 0);
    return (
      <Card>
        <CardTitle>Quiz Complete · HSK {level}</CardTitle>
        <CardSubtitle>Refresh for a brand-new randomized set.</CardSubtitle>

        <div className="text-center my-8">
          <div className="text-6xl font-extrabold text-brand">{score}/{questions.length}</div>
          <div className="text-2xl text-ink-soft mt-1">{pct}%</div>
          <div className="mt-3 text-ink-soft">
            Best at HSK {level}: <strong>{Math.round(best * 100)}%</strong>
          </div>
        </div>

        <p className="bg-brand-light/40 border border-brand/30 rounded-2xl p-4 text-ink">
          {pct >= 90 && '🏆 Outstanding! Move up a level or try mock HSK papers.'}
          {pct >= 70 && pct < 90 && '👏 Good work. Review the items you missed in Flashcards.'}
          {pct >= 50 && pct < 70 && '💪 Decent foundation. Keep drilling – consistency wins.'}
          {pct < 50 && '🌱 Take it slow – revisit Flashcards before retaking.'}
        </p>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button size="lg" variant="secondary" onClick={() => setSeed(Date.now())}>↻ New Quiz</Button>
          <Button size="lg" onClick={() => setSeed(Date.now())}>Try Again</Button>
        </div>
      </Card>
    );
  }

  /* ------------------ render: in-progress state ------------------ */
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <CardTitle>Quiz · HSK {level}</CardTitle>
        <span className="text-ink-soft font-semibold">Q {index + 1} / {questions.length}</span>
      </div>
      <div className="h-2 bg-ink/10 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="text-sm uppercase tracking-wider text-brand font-bold mb-2">
        {q.kind === 'multiple-choice' && 'Multiple Choice'}
        {q.kind === 'fill-blank'      && 'Fill in the Blank'}
        {q.kind === 'matching'        && 'Matching'}
      </div>

      {q.kind === 'multiple-choice' && (
        <>
          <p className="text-2xl text-ink mb-2">{q.prompt}</p>
          <div className="font-hanzi text-7xl text-center my-6">{q.hanzi}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {q.choices.map((c, i) => (
              <Button
                key={i}
                size="lg"
                variant={picked === c.text
                  ? (c.correct ? 'success' : 'danger')
                  : 'secondary'}
                disabled={picked !== null}
                onClick={() => { setPicked(c.text); commit(c.correct); }}
              >
                {c.text}
              </Button>
            ))}
          </div>
        </>
      )}

      {q.kind === 'fill-blank' && (
        <>
          <p className="text-xl text-ink font-hanzi leading-relaxed bg-ink/5 rounded-2xl p-4">
            {q.sentence}
          </p>
          <p className="text-ink-soft text-sm mt-2">Pick the missing word:</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {q.choices.map((c, i) => (
              <Button
                key={i}
                size="lg"
                variant={picked === c.text
                  ? (c.correct ? 'success' : 'danger')
                  : 'secondary'}
                disabled={picked !== null}
                onClick={() => { setPicked(c.text); commit(c.correct); }}
                className="font-hanzi text-2xl"
              >
                {c.text}
              </Button>
            ))}
          </div>
        </>
      )}

      {q.kind === 'matching' && (
        <MatchingBlock
          pairs={q.pairs}
          selections={matchSelections}
          setSelections={setMatchSelections}
          onSubmit={isCorrect => commit(isCorrect)}
        />
      )}
    </Card>
  );
}

/* ─────────────────────────  Matching sub-component  ───────────────────────── */
function MatchingBlock({
  pairs, selections, setSelections, onSubmit,
}: {
  pairs: { hanzi: string; meaning: string }[];
  selections: Record<string, string>;
  setSelections: (s: Record<string, string>) => void;
  onSubmit: (correct: boolean) => void;
}) {
  const meanings = useMemo(
    () => pairs.map(p => p.meaning).sort(() => Math.random() - 0.5),
    [pairs],
  );
  const allMatched = pairs.every(p => selections[p.hanzi]);

  function check() {
    const correct = pairs.every(p => selections[p.hanzi] === p.meaning);
    onSubmit(correct);
  }

  return (
    <div>
      <p className="text-ink-soft mb-3">Tap a hanzi, then tap its meaning.</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {pairs.map(p => (
            <div
              key={p.hanzi}
              className="rounded-2xl bg-white border-2 border-ink/10 p-4 flex items-center justify-between"
            >
              <span className="font-hanzi text-2xl">{p.hanzi}</span>
              <span className="text-brand font-semibold">
                {selections[p.hanzi] ?? '—'}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {meanings.map(m => {
            const used = Object.values(selections).includes(m);
            return (
              <button
                key={m}
                disabled={used}
                onClick={() => {
                  // assign to the first unmatched hanzi
                  const target = pairs.find(p => !selections[p.hanzi]);
                  if (target) setSelections({ ...selections, [target.hanzi]: m });
                }}
                className={
                  'w-full rounded-2xl p-4 text-left font-medium ' +
                  (used
                    ? 'bg-ink/10 text-ink-soft line-through'
                    : 'bg-white border-2 border-ink/10 hover:border-brand/40')
                }
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <Button variant="ghost" onClick={() => setSelections({})}>Reset</Button>
        <Button onClick={check} disabled={!allMatched}>Submit Match</Button>
      </div>
    </div>
  );
}
