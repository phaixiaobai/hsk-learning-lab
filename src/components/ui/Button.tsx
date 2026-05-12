import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  full?: boolean;
}

/**
 * Touch-friendly button. Minimum height 56 px to meet the
 * iPad-accessible-tap-target guideline (Apple HIG recommends 44 pt,
 * we go larger because students often tap through gloves or pencils).
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', full, className = '', children, ...rest }, ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold select-none ' +
    'transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ' +
    'focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/40 ' +
    (size === 'lg' ? 'min-h-[72px] px-8 text-xl ' : 'min-h-touch px-6 text-base ') +
    (full ? 'w-full ' : '');

  const variants: Record<Variant, string> = {
    primary:   'bg-brand text-white hover:bg-brand-dark shadow-md',
    secondary: 'bg-white text-ink border-2 border-ink/10 hover:border-brand/60 shadow-sm',
    ghost:     'bg-transparent text-ink hover:bg-ink/5',
    danger:    'bg-red-600 text-white hover:bg-red-700 shadow-md',
    success:   'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md',
  };

  return (
    <button ref={ref} className={`${base}${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
});
