import { useState } from 'react';
import vocab from '../data/vocabulary.json';
import type { VocabItem } from '../types';
import { analyzeSentence } from '../utils/sentenceAnalyzer';
import { Button } from '../components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '../components/ui/Card';
import { UiLang } from '../components/ui/LanguageToggle';
import { translationLines } from '../utils/translation';

interface Props { lang: UiLang; }

const LEVEL_COLORS: Record<number, string> = {
  2: 'bg-emerald-100 text-emerald-800',
  3: 'bg-amber-100 text-amber-800',
  4: 'bg-rose-100 text-rose-800',
};

export function SentenceAnalyzer({ lang }: Props) {
  const [input, setInput] = useState('我觉得努力很重要，因为机会总是留给有准备的人。');
  const [tokens, setTokens] = useState(() =>
    analyzeSentence('我觉得努力很重要，因为机会总是留给有准备的人。', vocab as VocabItem[]),
  );

  function run() {
    setTokens(analyzeSentence(input, vocab as VocabItem[]));
  }

  return (
    <Card>
      <CardTitle>Sentence Analyzer</CardTitle>
      <CardSubtitle>
        Paste a Chinese sentence – we segment it and annotate each
        known word with Pinyin, meaning & HSK level.
      </CardSubtitle>

      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="在这里粘贴中文句子 …"
        rows={3}
        className={
          'w-full mt-6 rounded-2xl border-2 border-ink/10 focus:border-brand ' +
          'focus:outline-none p-4 text-xl font-hanzi resize-none'
        }
      />

      <div className="mt-3 flex gap-3">
        <Button onClick={run} size="lg">Analyze</Button>
        <Button variant="ghost" onClick={() => { setInput(''); setTokens([]); }}>Clear</Button>
      </div>

      <div className="mt-6 grid gap-3">
        {tokens.map((t, i) => (
          <div
            key={i}
            className={
              'rounded-2xl p-4 flex items-center gap-4 border ' +
              (t.known ? 'bg-white border-ink/10' : 'bg-ink/5 border-ink/5')
            }
          >
            <div className="font-hanzi text-4xl min-w-[3ch]">{t.text}</div>
            {t.known && t.item ? (
              <div className="flex-1">
                <div className="font-bold text-brand">{t.item.pinyin}</div>
                {translationLines(t.item, lang).map((line, li) => (
                  <div key={li} className={['text-ink', line.lang === 'th' ? 'font-thai' : ''].join(' ')}>
                    {line.text}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 text-ink-soft italic">Not in HSK 2-4 bank</div>
            )}
            {t.known && t.item && (
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${LEVEL_COLORS[t.item.level]}`}>
                HSK {t.item.level}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
