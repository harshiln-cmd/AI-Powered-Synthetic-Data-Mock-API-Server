import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium ' +
  'px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-white hover:bg-brand/90',
  secondary: 'bg-panel text-ink border border-border hover:bg-border/60',
};

export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button className={[BASE, VARIANTS[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}
