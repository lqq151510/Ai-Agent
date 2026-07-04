import React from 'react';

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--surface-hover)] text-[var(--text-secondary)] border-[var(--border-default)]',
  primary:
    'bg-[var(--accent-alpha-8)] text-[var(--accent)] border-[var(--accent-alpha-20)]',
  success:
    'bg-[var(--success-alpha-8)] text-[var(--success)] border-[var(--success-alpha-20)]',
  warning:
    'bg-[var(--warning-alpha-5)] text-[var(--warning)] border-[var(--warning-alpha-15)]',
  error:
    'bg-[var(--error-alpha-8)] text-[var(--error)] border-[var(--error-alpha-20)]',
};

export default function Badge({
  variant = 'default',
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-full)]',
        'text-[11px] font-semibold border leading-none',
        variantStyles[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  );
}
