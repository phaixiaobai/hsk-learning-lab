import { HTMLAttributes, PropsWithChildren } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className = '', children, ...rest }: PropsWithChildren<Props>) {
  return (
    <div
      className={
        'bg-white rounded-3xl shadow-lg border border-ink/5 ' +
        (padded ? 'p-6 sm:p-8 ' : '') + className
      }
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <h2 className={`text-2xl sm:text-3xl font-extrabold text-ink ${className}`}>{children}</h2>;
}

export function CardSubtitle({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <p className={`text-ink-soft mt-1 ${className}`}>{children}</p>;
}
