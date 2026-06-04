export type UiLang = 'en' | 'th' | 'both';

interface Props {
  value: UiLang;
  onChange: (v: UiLang) => void;
}

export function LanguageToggle({ value, onChange }: Props) {
  const opts: { id: UiLang; label: string; short: string }[] = [
    { id: 'en',   label: 'EN',    short: 'EN'  },
    { id: 'th',   label: 'ไทย',  short: 'TH'  },
    { id: 'both', label: 'EN+TH', short: '+TH' },
  ];
  return (
    <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={
            'min-h-[36px] sm:min-h-[44px] px-1.5 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition ' +
            (value === o.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-ink/5')
          }
        >
          {/* Short label on phone, full label on tablet+ */}
          <span className="sm:hidden">{o.short}</span>
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
