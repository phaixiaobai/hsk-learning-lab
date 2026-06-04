export type UiLang = 'en' | 'th' | 'both';

interface Props {
  value: UiLang;
  onChange: (v: UiLang) => void;
}

export function LanguageToggle({ value, onChange }: Props) {
  const opts: { id: UiLang; label: string }[] = [
    { id: 'en',   label: 'EN'    },
    { id: 'th',   label: 'ไทย'  },
    { id: 'both', label: 'EN+TH' },
  ];
  return (
    <div className="inline-flex rounded-2xl border border-ink/10 bg-white p-1">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={
            'min-h-[40px] sm:min-h-[44px] px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition ' +
            (value === o.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-ink/5')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
