import { PropsWithChildren } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: string; // emoji
}

interface Props {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

/**
 * Horizontal, large-tap-target tab bar.
 * On narrow screens it scrolls horizontally (perfect for iPad portrait).
 */
export function Tabs({ items, value, onChange }: Props) {
  return (
    <nav
      className="flex gap-2 overflow-x-auto no-scrollbar py-2"
      role="tablist"
      aria-label="Main navigation"
    >
      {items.map(t => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={
              'whitespace-nowrap min-h-touch px-5 rounded-2xl font-semibold text-base transition ' +
              (active
                ? 'bg-brand text-white shadow-md'
                : 'bg-white text-ink border border-ink/10 hover:border-brand/40')
            }
          >
            <span className="mr-2">{t.icon}</span>{t.label}
          </button>
        );
      })}
    </nav>
  );
}

export function TabPanel({ children }: PropsWithChildren) {
  return <section className="mt-6">{children}</section>;
}
