import { useEffect, useState } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Tabs, TabPanel } from './components/ui/Tabs';
import { Button } from './components/ui/Button';
import { LanguageToggle, UiLang } from './components/ui/LanguageToggle';
import { PreTest } from './modules/PreTest';
import { Flashcards } from './modules/Flashcards';
import { Quiz } from './modules/Quiz';
import { WritingPad } from './modules/WritingPad';
import { Progress } from './modules/Progress';
import type { HskLevel, PreTestResult } from './types';

/* ================================================================
 * App shell – owns tab routing, level selection, and bootstraps the
 * pre-test on first run. All persistence goes through useLocalStorage
 * so absolutely nothing talks to a server.
 * ================================================================ */

type ModuleId = 'pretest' | 'flashcards' | 'quiz' | 'writing' | 'progress';

const TABS = [
  { id: 'flashcards' as const, label: 'Flashcards', icon: '🎴' },
  { id: 'writing'    as const, label: 'Writing',    icon: '✍️' },
  { id: 'progress'   as const, label: 'Progress',   icon: '📊' },
  { id: 'quiz'       as const, label: 'Quiz',       icon: '🧠' },
  { id: 'pretest'    as const, label: 'Re-test',    icon: '📋' },
];

export default function App() {
  // Persistent preferences
  const [level, setLevel]       = useLocalStorage<HskLevel>('hsk-master:level', 2);
  const [lang,  setLang]        = useLocalStorage<UiLang>('hsk-master:lang', 'both');
  const [preResult, setPre]     = useLocalStorage<PreTestResult | null>('hsk-master:preResult', null);

  // Has the user ever taken the pre-test?
  const firstRun = preResult === null;
  const [tab, setTab] = useState<ModuleId>(firstRun ? 'pretest' : 'flashcards');

  // Flashcard section – lifted so Progress can navigate to a specific section
  const [flashcardSection, setFlashcardSection] = useState(0);

  // Deep-link support for PWA shortcuts (?m=flashcards)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('m');
    if (m && ['flashcards', 'quiz', 'writing', 'progress', 'pretest'].includes(m)) {
      setTab(m as ModuleId);
    }
  }, []);

  function handlePreTestDone(result: PreTestResult) {
    setPre(result);
    setLevel(result.recommendedLevel);
  }

  function handleLevelChange(l: HskLevel) {
    setLevel(l);
    setFlashcardSection(0);   // reset to section 1 on level change
  }

  /** Called from the Progress page to jump to a specific section. */
  function handleNavigateToSection(l: HskLevel, sectionIndex: number) {
    setLevel(l);
    setFlashcardSection(sectionIndex);
    setTab('flashcards');
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-brand-light/40 via-white to-white pb-24">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-ink/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand text-white font-extrabold grid place-items-center shadow-md">汉</div>
            <div>
              <div className="font-extrabold text-lg leading-none">HSK Master</div>
              <div className="text-xs text-ink-soft">HSK 2 · 3 · 4 Trainer</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle value={lang} onChange={setLang} />
            <LevelPicker level={level} onChange={handleLevelChange} />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <Tabs items={TABS} value={tab} onChange={id => setTab(id as ModuleId)} />
        </div>
      </header>

      {/* ───────── Main ───────── */}
      <main className="max-w-5xl mx-auto px-4 mt-6">
        {tab === 'pretest' && (
          <TabPanel>
            <PreTest lang={lang} onComplete={handlePreTestDone} onSkip={() => setTab('flashcards')} />
          </TabPanel>
        )}

        {tab === 'flashcards' && (
          <TabPanel>
            <Flashcards
              level={level}
              lang={lang}
              section={flashcardSection}
              onSectionChange={setFlashcardSection}
            />
          </TabPanel>
        )}

        {tab === 'quiz' && (
          <TabPanel>
            <Quiz level={level} />
          </TabPanel>
        )}

        {tab === 'writing' && (
          <TabPanel>
            <WritingPad level={level} />
          </TabPanel>
        )}

        {tab === 'progress' && (
          <TabPanel>
            <Progress level={level} onNavigate={handleNavigateToSection} />
          </TabPanel>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 mt-12 text-center text-xs text-ink-soft">
        100% client-side · data lives only in your browser ·
        <button className="underline ml-1" onClick={() => { localStorage.clear(); location.reload(); }}>
          reset progress
        </button>
      </footer>
    </div>
  );
}

/* ───────── Level picker (2 / 3 / 4) ───────── */
function LevelPicker({ level, onChange }: { level: HskLevel; onChange: (l: HskLevel) => void }) {
  return (
    <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1">
      {([2, 3, 4] as const).map(l => (
        <Button
          key={l}
          variant={level === l ? 'primary' : 'ghost'}
          onClick={() => onChange(l)}
          className="min-h-[44px] px-3 text-sm"
        >
          HSK {l}
        </Button>
      ))}
    </div>
  );
}
