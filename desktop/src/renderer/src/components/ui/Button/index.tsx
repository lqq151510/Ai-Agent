import React, { cloneElement, isValidElement } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--text-inverse)] border border-transparent ' +
    'hover:bg-[var(--accent-hover)] focus:ring-2 focus:ring-[var(--accent)]/25',
  secondary:
    'bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] ' +
    'hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent ' +
    'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
  danger:
    'bg-[var(--error)] text-[var(--text-inverse)] border border-transparent ' +
    'hover:opacity-90 focus:ring-2 focus:ring-[var(--error)]/25',
  link:
    'bg-transparent text-[var(--accent)] border border-transparent ' +
    'hover:underline underline-offset-2 px-0 py-0 h-auto',
  icon:
    'bg-transparent text-[var(--text-secondary)] border border-transparent ' +
    'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-[var(--radius-md)] gap-1.5',
  md: 'h-9 px-4 text-[13px] rounded-[var(--radius-lg)] gap-2',
  lg: 'h-11 px-5 text-sm rounded-[var(--radius-lg)] gap-2',
};

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 w-7 p-0 text-xs rounded-[var(--radius-md)]',
  md: 'h-9 w-9 p-0 text-[13px] rounded-[var(--radius-lg)]',
  lg: 'h-11 w-11 p-0 text-sm rounded-[var(--radius-lg)]',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  asChild = false,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const isIcon = variant === 'icon';
  const base =
    'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-all duration-200 ' +
    'focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ' +
    'active:scale-[0.98]';
  const sizeClass = isIcon ? iconSizeStyles[size] : sizeStyles[size];
  const classes = [base, variantStyles[variant], sizeClass, className].join(' ');

  const content = loading ? (
    <>
      <Loader2 className="animate-spin" size={isIcon ? 16 : 14} />
      {!isIcon && children}
    </>
  ) : (
    children
  );

  if (asChild && isValidElement(children)) {
    return cloneElement(children as React.ReactElement, {
      className: [classes, (children.props as { className?: string }).className]
        .filter(Boolean)
        .join(' '),
      'aria-disabled': disabled || loading,
      ...props,
    } as Record<string, unknown>);
  }

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
}
