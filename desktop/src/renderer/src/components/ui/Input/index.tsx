import React, { forwardRef } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  inputSize?: InputSize;
  error?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-[13px]',
  lg: 'h-11 px-4 text-sm',
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', error = false, prefix, suffix, className = '', ...props }, ref) => {
    const base =
      'w-full bg-[var(--surface-card)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] ' +
      'border rounded-[var(--radius-md)] outline-none transition-all duration-200 ' +
      'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 ' +
      'disabled:bg-[var(--surface-disabled)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed';
    const errorClass = error
      ? 'border-[var(--border-error)] focus:border-[var(--border-error)] focus:ring-[var(--error)]/15'
      : 'border-[var(--border-default)] hover:border-[var(--border-hover)]';

    const inputNode = (
      <input
        ref={ref}
        className={[base, sizeStyles[inputSize], errorClass, className].filter(Boolean).join(' ')}
        {...props}
      />
    );

    if (!prefix && !suffix) return inputNode;

    return (
      <div
        className={[
          'inline-flex items-center w-full bg-[var(--surface-card)] border rounded-[var(--radius-md)]',
          'focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/15',
          error
            ? 'border-[var(--border-error)] focus-within:border-[var(--border-error)] focus-within:ring-[var(--error)]/15'
            : 'border-[var(--border-default)] hover:border-[var(--border-hover)]',
          sizeStyles[inputSize],
        ].join(' ')}
      >
        {prefix && <span className="inline-flex items-center text-[var(--text-secondary)] mr-2">{prefix}</span>}
        <input
          ref={ref}
          className="flex-1 min-w-0 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed"
          {...props}
        />
        {suffix && <span className="inline-flex items-center text-[var(--text-secondary)] ml-2">{suffix}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
