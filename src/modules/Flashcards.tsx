import { useEffect, useMemo, useRef, useState } from 'react';
import vocab from '../data/vocabulary.json';
import type { HskLevel, QuizQuestion, SectionScore, VocabItem } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import { UiLang } from '../components/ui/LanguageToggle';
import { getSections, makeSectionKey } from '../utils/sections';
import { generateQuiz } from '../utils/quizGenerator';

/* ================================================================
 * Module B – Flashcards
 * Two view modes:
 *   📚 Section mode – 15-word sections with section quiz
 *   🔀 Random mode  – all level words shuffled, reshuffle at any time
 * ================================================================ */

type StudyMode = 'study' | 'quiz' | 'result';
type ViewMode  = 'section' | 'random' | 'review';

interface Props {
  level: HskLevel;
  lang: UiLang;
  section: number;
  onSectionChange: (n: number) => void;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Flashcards({ level, lang, section, onSectionChange }: Props) {
  const allVocab   = vocab as VocabItem[];
  const levelWords = useMemo(() => allVocab.filter(v => v.level === level), [level]);
  const sections   = useMemo(() => getSections(level, allVocab), [level]);

  const sectionIdx = Math.min(Math.max(0, section), Math.max(0, sections.length - 1));
  const sectionDeck = sections[sectionIdx] ?? [];

  // ── View mode ──
  const [viewMode, setViewMode]         = useState<ViewMode>('section');
  const [shuffledDeck, setShuffledDeck] = useState<VocabItem[]>([]);

  // ── Persistent ──
  const [reviewIds, setReviewIds] = useLocalStorage<string[]>('hsk-master:review', []);

  // Review deck: only words for this level that are flagged
  const reviewDeck = useMemo(
    () => levelWords.filter(w => reviewIds.includes(w.id)),
    [levelWords, reviewIds],
  );

  // Active deck depends on mode
  const activeDeck = viewMode === 'section' ? sectionDeck
    : viewMode === 'random' ? shuffledDeck
    : reviewDeck;

  // ── Shared card state ──
  const [cardIdx,   setCardIdx]   = useState(0);
  const [revealed,  setRevealed]  = useState(false);

  // ── Section quiz state ──
  const [studyMode, setStudyMode] = useState<StudyMode>('study');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIdx,      setQIdx]      = useState(0);
  const [picked,    setPicked]    = useState<string | null>(null);
  const [matchSels, setMatchSels] = useState<Record<string, string>>({});
  const scoreRef    = useRef(0);
  const [displayScore, setDisplayScore] = useState(0);

  const [sectionScores, setSectionScores] = useLocalStorage<Record<string, SectionScore[]>>(
    'hsk-master:section-scores', {},
  );

  // Reset everything on level change (keep viewMode so Review stays active across levels)
  useEffect(() => {
    setCardIdx(0);
    setRevealed(false);
    setStudyMode('study');
    setShuffledDeck([]);
  }, [level]);

  // Reset card index on section change (section mode)
  useEffect(() => {
    if (viewMode === 'section') {
      setCardIdx(0);
      setRevealed(false);
      setStudyMode('study');
    }
  }, [sectionIdx]);

  const card = activeDeck[cardIdx] ?? null;
  const sKey = makeSectionKey(level, sectionIdx);
  const myScores = sectionScores[sKey] ?? [];
  const bestPct  = myScores.length > 0
    ? Math.round(Math.max(...myScores.map(s => s.score / s.total)) * 100)
    : null;

  /* ─── View-mode switches ─── */
  function enterRandom() {
    setShuffledDeck(shuffleArray(levelWords));
    setCardIdx(0); setRevealed(false); setStudyMode('study');
    setViewMode('random');
  }
  function enterSection() {
    setCardIdx(0); setRevealed(false); setStudyMode('study');
    setViewMode('section');
  }
  function enterReview() {
    setCardIdx(0); setRevealed(false); setStudyMode('study');
    setViewMode('review');
  }
  function reshuffle() {
    setShuffledDeck(shuffleArray(levelWords));
    setCardIdx(0); setRevealed(false);
  }

  /* ─── Card actions ─── */
  function markReview() {
    if (card && !reviewIds.includes(card.id)) setReviewIds([...reviewIds, card.id]);
    nextCard();
  }
  function markKnown() {
    if (!card) return;
    setReviewIds(reviewIds.filter(id => id !== card.id));
    if (viewMode === 'review') {
      // Deck shrinks by 1; stay at same index (it now points at the next word).
      // If this was the last card, clamp to 0 (will show empty state).
      setRevealed(false);
      setCardIdx(i => (activeDeck.length <= 1 ? 0 : Math.min(i, activeDeck.length - 2)));
    } else {
      nextCard();
    }
  }
  function nextCard() {
    setRevealed(false);
    // Guard: if deck is empty avoid % 0
    setCardIdx(i => activeDeck.length <= 1 ? 0 : (i + 1) % activeDeck.length);
  }

  /* ─── Section navigation ─── */
  function prevSection() { onSectionChange(Math.max(0, sectionIdx - 1)); }
  function nextSection() { onSectionChange(Math.min(sections.length - 1, sectionIdx + 1)); }

  /* ─── Section quiz ─── */
  function startQuiz() {
    const qs = generateQuiz(allVocab, {
      level,
      pool: sectionDeck,
      totalQuestions: Math.min(10, sectionDeck.length),
    });
    setQuestions(qs);
    setQIdx(0);
    scoreRef.current = 0;
    setPicked(null);
    setMatchSels({});
    setStudyMode('quiz');
  }

  function commitAnswer(correct: boolean) {
    if (correct) scoreRef.current++;
    setTimeout(() => {
      setPicked(null);
      setMatchSels({});
      const nextQ = qIdx + 1;
      if (nextQ >= questions.length) {
        const final = scoreRef.current;
        setDisplayScore(final);
        const entry: SectionScore = {
          score: final,
          total: questions.length,
          date: new Date().toISOString(),
        };
        setSectionScores(prev => ({
          ...prev,
          [sKey]: [entry, ...(prev[sKey] ?? [])].slice(0, 10),
        }));
        setStudyMode('result');
      } else {
        setQIdx(nextQ);
      }
    }, 700);
  }

  /* ============================================================
   * Render: Section quiz mode
   * ============================================================ */
  if (studyMode === 'quiz' && questions.length > 0) {
    const q        = questions[qIdx];
    const progress = Math.round((qIdx / questions.length) * 100);
    return (
      <div className="space-y-4">
        <Card padded={false} className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Section Quiz · HSK {level}</CardTitle>
              <CardSubtitle>Section {sectionIdx + 1} · Q {qIdx + 1} / {questions.length}</CardSubtitle>
            </div>
            <Button variant="ghost" className="px-4" onClick={() => setStudyMode('study')}>✕ Exit</Button>
          </div>
          <div className="mt-3 h-2 bg-ink/10 rounded-full overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        <Card>
          <div className="text-sm uppercase tracking-wider text-brand font-bold mb-4">
            {q.kind === 'multiple-choice' && 'Multiple Choice'}
            {q.kind === 'fill-blank'      && 'Fill in the Blank'}
            {q.kind === 'matching'        && 'Matching'}
          </div>

          {q.kind === 'multiple-choice' && (
            <>
              <p className="text-2xl text-ink mb-4">{q.prompt}</p>
              <div className="font-hanzi text-7xl text-center my-4">{q.hanzi}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.choices.map((c, i) => (
                  <Button key={i} size="lg"
                    variant={picked === c.text ? (c.correct ? 'success' : 'danger') : 'secondary'}
                    disabled={picked !== null}
                    onClick={() => { setPicked(c.text); commitAnswer(c.correct); }}>
                    {c.text}
                  </Button>
                ))}
              </div>
            </>
          )}

          {q.kind === 'fill-blank' && (
            <>
              <p className="text-xl text-ink font-hanzi leading-relaxed bg-ink/5 rounded-2xl p-4">{q.sentence}</p>
              <p className="text-ink-soft text-sm mt-2">Pick the missing word:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {q.choices.map((c, i) => (
                  <Button key={i} size="lg"
                    variant={picked === c.text ? (c.correct ? 'success' : 'danger') : 'secondary'}
                    disabled={picked !== null}
                    onClick={() => { setPicked(c.text); commitAnswer(c.correct); }}
                    className="font-hanzi text-2xl">
                    {c.text}
                  </Button>
                ))}
              </div>
            </>
          )}

          {q.kind === 'matching' && (
            <MatchingBlock pairs={q.pairs} selections={matchSels}
              setSelections={setMatchSels} onSubmit={commitAnswer} />
          )}
        </Card>
      </div>
    );
  }

  /* ============================================================
   * Render: Quiz result mode
   * ============================================================ */
  if (studyMode === 'result') {
    const total   = questions.length;
    const pct     = Math.round((displayScore / total) * 100);
    const updated = sectionScores[sKey] ?? [];
    const newBest = updated.length > 0
      ? Math.round(Math.max(...updated.map(s => s.score / s.total)) * 100) : pct;

    return (
      <Card>
        <CardTitle>Section Quiz Complete! 🎉</CardTitle>
        <CardSubtitle>Section {sectionIdx + 1} · HSK {level}</CardSubtitle>

        <div className="text-center my-8">
          <div className="text-6xl font-extrabold text-brand">{displayScore}/{total}</div>
          <div className="text-2xl text-ink-soft mt-1">{pct}%</div>
          <div className="mt-2 text-ink-soft text-sm">
            Personal best for this section: <strong>{newBest}%</strong>
            &nbsp;·&nbsp;{updated.length} attempt{updated.length !== 1 ? 's' : ''}
          </div>
        </div>

        <p className="bg-brand-light/40 border border-brand/30 rounded-2xl p-4 text-ink text-center">
          {pct >= 90 && '🏆 Perfect section! Move to the next one.'}
          {pct >= 70 && pct < 90 && '👏 Great work! Try again to reach 90%.'}
          {pct >= 50 && pct < 70 && '💪 Good start — review the cards then retry.'}
          {pct <  50 && '🌱 Keep studying the flashcards before retrying.'}
        </p>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button size="lg" variant="secondary" onClick={startQuiz}>↻ Retry Quiz</Button>
          <Button size="lg" onClick={() => setStudyMode('study')}>← Back to Cards</Button>
        </div>
        {sectionIdx < sections.length - 1 && (
          <div className="mt-3">
            <Button full size="lg" variant="ghost"
              onClick={() => { onSectionChange(sectionIdx + 1); setStudyMode('study'); }}>
              Next Section →
            </Button>
          </div>
        )}
      </Card>
    );
  }

  /* ============================================================
   * Render: Study mode (section OR random)
   * ============================================================ */
  // Empty state for review mode with no flagged words
  if (viewMode === 'review' && reviewDeck.length === 0) {
    return (
      <div className="space-y-4">
        <Card padded={false} className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Flashcards · HSK {level}</CardTitle>
              <CardSubtitle>Review Queue · no words flagged</CardSubtitle>
            </div>
            <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1 flex-shrink-0">
              {(
                [
                  { id: 'section', label: '📚 Section', fn: enterSection },
                  { id: 'random',  label: '🔀 Random',  fn: enterRandom  },
                  { id: 'review',  label: '📌 Review (0)', fn: enterReview },
                ] as const
              ).map(m => (
                <button key={m.id} onClick={m.fn}
                  className={
                    'min-h-[36px] px-3 rounded-xl text-sm font-semibold transition whitespace-nowrap ' +
                    (viewMode === m.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-ink/5')
                  }
                >{m.label}</button>
              ))}
            </div>
          </div>
        </Card>
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">📌</div>
          <CardTitle>No words in your review list</CardTitle>
          <CardSubtitle className="mt-2">
            While studying flashcards, tap <strong>📌 Need Review</strong> on any card to add it here.
            Words you mark <strong>✅ Got It</strong> won't appear in this queue.
          </CardSubtitle>
          <div className="mt-6">
            <Button onClick={enterSection}>← Back to Section Mode</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!card) return <Card><CardTitle>No words available.</CardTitle></Card>;
  const isReview = reviewIds.includes(card.id);

  return (
    <div className="space-y-4">
      {/* ── Mode toggle bar ── */}
      <Card padded={false} className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Left: title + subtitle */}
          <div className="min-w-0">
            <CardTitle>Flashcards · HSK {level}</CardTitle>
            {viewMode === 'section' && (
              <CardSubtitle>
                Section {sectionIdx + 1} of {sections.length}
                &nbsp;·&nbsp;Words {sectionIdx * 15 + 1}–{sectionIdx * 15 + sectionDeck.length}
                {bestPct !== null && (
                  <span className="ml-3 font-semibold text-emerald-600">Best: {bestPct}%</span>
                )}
              </CardSubtitle>
            )}
            {viewMode === 'random' && (
              <CardSubtitle>Random · Card {cardIdx + 1} of {shuffledDeck.length}</CardSubtitle>
            )}
            {viewMode === 'review' && (
              <CardSubtitle>
                Review Queue · {reviewDeck.length} word{reviewDeck.length !== 1 ? 's' : ''} flagged
              </CardSubtitle>
            )}
          </div>

          {/* Right: mode toggle */}
          <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1 flex-shrink-0">
            {(
              [
                { id: 'section', label: '📚 Section', fn: enterSection },
                { id: 'random',  label: '🔀 Random',  fn: enterRandom  },
                { id: 'review',  label: `📌 Review${reviewDeck.length > 0 ? ` (${reviewDeck.length})` : ''}`, fn: enterReview },
              ] as const
            ).map(m => (
              <button
                key={m.id}
                onClick={m.fn}
                className={
                  'min-h-[36px] px-3 rounded-xl text-sm font-semibold transition whitespace-nowrap ' +
                  (viewMode === m.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-ink/5')
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section navigation (section mode only) */}
        {viewMode === 'section' && (
          <div className="flex gap-2 mt-3">
            <Button variant="ghost" onClick={prevSection} disabled={sectionIdx === 0} className="px-4">
              ← Prev
            </Button>
            <Button variant="ghost" onClick={nextSection} disabled={sectionIdx === sections.length - 1} className="px-4">
              Next →
            </Button>
          </div>
        )}

        {/* Random mode: progress bar + reshuffle */}
        {viewMode === 'random' && (
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 h-2 bg-ink/10 rounded-full overflow-hidden">
              <div className="h-full bg-brand transition-all"
                style={{ width: `${Math.round(((cardIdx + 1) / shuffledDeck.length) * 100)}%` }} />
            </div>
            <Button variant="ghost" onClick={reshuffle} className="px-4 text-sm flex-shrink-0">
              🔀 Reshuffle
            </Button>
          </div>
        )}

        {/* Review mode: progress bar */}
        {viewMode === 'review' && reviewDeck.length > 0 && (
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 h-2 bg-amber-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 transition-all"
                style={{ width: `${Math.round(((cardIdx + 1) / reviewDeck.length) * 100)}%` }} />
            </div>
            <span className="text-xs text-ink-soft flex-shrink-0">{cardIdx + 1} / {reviewDeck.length}</span>
          </div>
        )}
      </Card>

      {/* ── Card ── */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-ink-soft font-semibold">
            {viewMode === 'section'
              ? `Card ${cardIdx + 1} / ${sectionDeck.length}`
              : `${cardIdx + 1} / ${shuffledDeck.length}`}
          </span>
          {isReview && (
            <span className="text-sm bg-amber-100 text-amber-700 font-semibold px-3 py-1 rounded-full">
              📌 Marked for review
            </span>
          )}
        </div>

        {/* Dot indicator (section mode only – 15 dots is manageable) */}
        {viewMode === 'section' && (
          <div className="flex gap-1 flex-wrap mb-4">
            {sectionDeck.map((w, i) => (
              <div key={i} className={
                'w-2.5 h-2.5 rounded-full transition ' +
                (i === cardIdx ? 'bg-brand scale-125'
                  : reviewIds.includes(w.id) ? 'bg-amber-400'
                  : 'bg-ink/10')
              } />
            ))}
          </div>
        )}

        {/* Flip card */}
        <button
          aria-label="Reveal translation"
          onClick={() => setRevealed(r => !r)}
          className={
            'w-full mt-2 min-h-[300px] sm:min-h-[380px] rounded-3xl ' +
            'bg-gradient-to-br from-white to-brand-light/50 border-2 border-brand/30 ' +
            'flex flex-col items-center justify-center p-8 text-center ' +
            'active:scale-[0.99] transition select-none'
          }
        >
          <div className="font-hanzi text-[100px] sm:text-[140px] leading-none text-ink">
            {card.hanzi}
          </div>
          {revealed ? (
            <div className="mt-6">
              <div className="text-2xl sm:text-3xl text-brand font-bold tracking-wide">{card.pinyin}</div>
              {(lang === 'en' || lang === 'both') && (
                <div className="text-xl text-ink mt-2">{card.en}</div>
              )}
              {(lang === 'th' || lang === 'both') && card.th && (
                <div className="text-xl text-ink font-thai mt-1">{card.th}</div>
              )}
            </div>
          ) : (
            <div className="text-ink-soft mt-6 text-sm">Tap to reveal</div>
          )}
        </button>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Button size="lg" variant="danger"   onClick={markReview}>📌 Need Review</Button>
          <Button size="lg" variant="success"  onClick={markKnown}>✅ Got It</Button>
        </div>

        {/* Quiz button (section mode only — not meaningful in random/review) */}
        {viewMode === 'section' && (
          <div className="mt-4">
            <Button full size="lg" variant="secondary" onClick={startQuiz}>
              🧠 Quiz This Section
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Matching sub-component ─── */
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
    onSubmit(pairs.every(p => selections[p.hanzi] === p.meaning));
  }

  return (
    <div>
      <p className="text-ink-soft mb-3">Tap a hanzi, then tap its meaning.</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {pairs.map(p => (
            <div key={p.hanzi} className="rounded-2xl bg-white border-2 border-ink/10 p-4 flex items-center justify-between">
              <span className="font-hanzi text-2xl">{p.hanzi}</span>
              <span className="text-brand font-semibold">{selections[p.hanzi] ?? '—'}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {meanings.map(m => {
            const used = Object.values(selections).includes(m);
            return (
              <button key={m} disabled={used}
                onClick={() => {
                  const target = pairs.find(p => !selections[p.hanzi]);
                  if (target) setSelections({ ...selections, [target.hanzi]: m });
                }}
                className={
                  'w-full rounded-2xl p-4 text-left font-medium ' +
                  (used ? 'bg-ink/10 text-ink-soft line-through'
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
