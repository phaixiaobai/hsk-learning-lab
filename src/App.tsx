import { useEffect, useState } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Tabs, TabPanel } from './components/ui/Tabs';
import { Button } from './components/ui/Button';
import { LanguageToggle, UiLang } from './components/ui/LanguageToggle';
import { LevelEval } from './modules/LevelEval';
import { Flashcards } from './modules/Flashcards';
import { QuizHub } from './modules/quiz/QuizHub';
import { WritingPad } from './modules/WritingPad';
import { Analytics } from './modules/Analytics';
import { VocabBrowser } from './modules/VocabBrowser';
import { Admin } from './modules/Admin';
import { SupportWidget } from './components/SupportWidget';
import { getWordsByCategory } from './utils/categoryUtils';
import { splitIntoChunks } from './hooks/useVocabProgress';
import type { HskLevel, VocabItem } from './types';
import vocab from './data/vocabulary.json';

/** Holds the current custom flashcard deck launched from VocabBrowser. */
interface CustomDeck {
  words: VocabItem[];
  label: string;
  /** Needed for auto-advance to next chunk. */
  categoryId?: string;
  chunkIndex?: number;
  chunkSize?: number;
}

/* ================================================================
 * App shell – owns tab routing, level selection, and bootstraps the
 * pre-test on first run. All persistence goes through useLocalStorage.
 *
 * Level is now display-only in the top-right header.
 * It changes ONLY from VocabBrowser (onLevelChange) or LevelEval.
 * ================================================================ */

type ModuleId =
  | 'vocab'
  | 'flashcards'
  | 'writing'
  | 'quiz'
  | 'analytics'
  | 'pretest';

/** Short labels for the mobile bottom tab bar (space-constrained). */
const MOBILE_TAB_LABELS: Record<string, string> = {
  vocab:      'Vocab',
  flashcards: 'Cards',
  writing:    'Write',
  quiz:       'Quiz',
  analytics:  'Stats',
  pretest:    'Level',
};

/** Navigation order: Vocab → Flashcards → Writing → Quiz → Performance → Your Level */
const TABS = [
  { id: 'vocab'      as const, label: 'Vocab',       icon: '🗂️' },
  { id: 'flashcards' as const, label: 'Flashcards',  icon: '🎴' },
  { id: 'writing'    as const, label: 'Writing',     icon: '✍️' },
  { id: 'quiz'       as const, label: 'Quiz',        icon: '🧩' },
  { id: 'analytics'  as const, label: 'Performance', icon: '📈' },
  { id: 'pretest'    as const, label: 'Your Level',  icon: '🎯' },
];

export default function App() {
  // Persistent preferences
  const [level, setLevel] = useLocalStorage<HskLevel>('hsk-master:level', 2);
  const [lang,  setLang]  = useLocalStorage<UiLang>('hsk-master:lang', 'both');

  // Admin mode: accessible via ?admin=1 in URL
  const isAdminMode = new URLSearchParams(window.location.search).has('admin');

  const [tab, setTab] = useState<ModuleId>('vocab');

  // Flashcard section – lifted so Progress can navigate to a specific section
  const [flashcardSection, setFlashcardSection] = useState(0);

  // Custom deck launched from VocabBrowser
  const [customDeck, setCustomDeck] = useState<CustomDeck | null>(null);

  // Deep-link support for PWA shortcuts (?m=flashcards)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('m');
    const valid: ModuleId[] = ['vocab', 'flashcards', 'writing', 'quiz', 'analytics', 'pretest'];
    if (m && valid.includes(m as ModuleId)) setTab(m as ModuleId);
  }, []);

  function handleLevelChange(l: HskLevel) {
    setLevel(l);
    setFlashcardSection(0);
    setCustomDeck(null);
  }

  /** Called from VocabBrowser's ProgressSection "Study" button. */
  function handleNavigateToSection(l: HskLevel, sectionIndex: number) {
    setLevel(l);
    setFlashcardSection(sectionIndex);
    setCustomDeck(null);
    setTab('flashcards');
  }

  /**
   * Called from VocabBrowser when user taps "Study Part N".
   * Builds the custom deck and navigates to the Flashcards tab.
   */
  function handleStudy(
    wordIds: string[],
    label: string,
    categoryId?: string,
    chunkIndex?: number,
    chunkSize?: number,
  ) {
    const allVocab = vocab as VocabItem[];
    const words = wordIds
      .map(id => allVocab.find(w => w.id === id))
      .filter((w): w is VocabItem => w !== undefined);
    setCustomDeck({ words, label, categoryId, chunkIndex, chunkSize });
    setTab('flashcards');
  }

  /** Called from Flashcards when user finishes a chunk and wants the next one. */
  function handleNextChunk() {
    if (!customDeck?.categoryId || customDeck.chunkIndex === undefined) return;
    const catWords = getWordsByCategory(customDeck.categoryId);
    const size     = customDeck.chunkSize ?? 10;
    const chunks   = splitIntoChunks(catWords, size);
    const nextIdx  = customDeck.chunkIndex + 1;
    if (nextIdx >= chunks.length) return;
    const nextWords = chunks[nextIdx];
    const prefix    = customDeck.label.split(' · ')[0] ?? customDeck.label;
    setCustomDeck({
      words: nextWords,
      label: `${prefix} · Part ${nextIdx + 1}`,
      categoryId: customDeck.categoryId,
      chunkIndex: nextIdx,
      chunkSize:  size,
    });
  }

  function hasNextChunk(): boolean {
    if (!customDeck?.categoryId || customDeck.chunkIndex === undefined) return false;
    const catWords = getWordsByCategory(customDeck.categoryId);
    const size     = customDeck.chunkSize ?? 10;
    const chunks   = splitIntoChunks(catWords, size);
    return customDeck.chunkIndex + 1 < chunks.length;
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-brand-light/40 via-white to-white pb-24">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-ink/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-brand text-white font-extrabold grid place-items-center shadow-md text-sm sm:text-base flex-shrink-0">汉</div>
            {/* App name — hidden on phone, visible sm+ */}
            <div className="hidden sm:block min-w-0">
              <div className="font-extrabold text-lg leading-none">HSK Lab</div>
              <div className="text-xs text-ink-soft">HSK 2 · 3 · 4 Trainer</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            <LanguageToggle value={lang} onChange={setLang} />
            <LevelPicker level={level} onChange={handleLevelChange} />
          </div>
        </div>
        {/* Top tab bar — tablet and desktop only */}
        <div className="hidden sm:block max-w-5xl mx-auto px-4 pb-2">
          <Tabs items={TABS} value={tab} onChange={id => setTab(id as ModuleId)} />
        </div>
      </header>

      {/* ───────── Main ───────── */}
      <main className="max-w-5xl mx-auto px-3 sm:px-4 mt-4 sm:mt-6">
        {tab === 'vocab' && (
          <TabPanel>
            <VocabBrowser
              level={level}
              lang={lang}
              onStudy={handleStudy}
              onNavigate={handleNavigateToSection}
              onLevelChange={handleLevelChange}
            />
          </TabPanel>
        )}

        {tab === 'flashcards' && (
          <TabPanel>
            <Flashcards
              level={level}
              lang={lang}
              section={flashcardSection}
              onSectionChange={setFlashcardSection}
              customDeck={customDeck?.words}
              customDeckLabel={customDeck?.label}
              hasNextChunk={hasNextChunk()}
              onNextChunk={handleNextChunk}
              onClearCustomDeck={() => setCustomDeck(null)}
            />
          </TabPanel>
        )}

        {tab === 'writing' && (
          <TabPanel>
            <WritingPad level={level} section={flashcardSection} />
          </TabPanel>
        )}

        {tab === 'quiz' && (
          <TabPanel>
            <QuizHub
              level={level}
              lang={lang}
              pool={customDeck?.words}
              poolLabel={customDeck?.label}
            />
          </TabPanel>
        )}

        {tab === 'analytics' && (
          <TabPanel>
            <Analytics />
            {/* Admin section — only visible when ?admin=1 in URL */}
            {isAdminMode && (
              <div className="mt-8 border-t-2 border-brand/20 pt-6">
                <Admin />
              </div>
            )}
          </TabPanel>
        )}

        {tab === 'pretest' && (
          <TabPanel>
            <LevelEval onDone={(l) => { handleLevelChange(l); setTab('flashcards'); }} />
          </TabPanel>
        )}
      </main>

      {/* Footer — hidden on mobile */}
      <footer className="hidden sm:block max-w-5xl mx-auto px-4 mt-12 text-center text-xs text-ink-soft">
        100% client-side · data lives only in your browser ·
        <button className="underline ml-1" onClick={() => { localStorage.clear(); location.reload(); }}>
          reset progress
        </button>
      </footer>

      {/* Floating support widget */}
      <SupportWidget />

      {/* ───────── Mobile bottom tab bar (phone only) ───────── */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-sm border-t border-ink/10 flex safe-bottom"
        role="tablist"
        aria-label="Main navigation"
      >
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id as ModuleId)}
              className={
                'flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-2 min-h-[52px] transition-colors ' +
                (active ? 'text-brand' : 'text-ink-soft')
              }
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="text-[10px] font-semibold leading-none mt-0.5">
                {MOBILE_TAB_LABELS[t.id] ?? t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ───────── Level picker (HSK 2 / 3 / 4) ───────── */
function LevelPicker({ level, onChange }: { level: HskLevel; onChange: (l: HskLevel) => void }) {
  return (
    <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1">
      {([2, 3, 4] as const).map(l => (
        <Button
          key={l}
          variant={level === l ? 'primary' : 'ghost'}
          onClick={() => onChange(l)}
          className="min-h-[40px] sm:min-h-[44px] px-2 sm:px-3 text-xs sm:text-sm"
        >
          <span className="sm:hidden">{l}</span>
          <span className="hidden sm:inline">HSK {l}</span>
        </Button>
      ))}
    </div>
  );
}
