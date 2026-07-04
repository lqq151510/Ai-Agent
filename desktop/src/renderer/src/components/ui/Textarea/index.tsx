import React, { forwardRef, useEffect, useRef, useState } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
  error?: boolean;
  minRows?: number;
  maxRows?: number;
}

const LINE_HEIGHT = 20;

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { autoResize = false, error = false, minRows = 2, maxRows, className = '', style, ...props },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);

    useEffect(() => {
      if (!autoResize) return;
      const el = innerRef.current;
      if (!el) return;

      const resize = () => {
        el.style.height = 'auto';
        const min = minRows * LINE_HEIGHT;
        const max = maxRows ? maxRows * LINE_HEIGHT : Infinity;
        const next = Math.min(Math.max(el.scrollHeight, min), max);
        el.style.height = `${next}px`;
        setHeight(next);
      };

      resize();
      el.addEventListener('input', resize);
      return () => el.removeEventListener('input', resize);
    }, [autoResize, minRows, maxRows]);

    const setRef = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const base =
      'w-full bg-[var(--surface-card)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] ' +
      'border rounded-[var(--radius-md)] px-3 py-2 text-[13px] leading-5 outline-none transition-all duration-200 ' +
      'resize-none ' +
      'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 ' +
      'disabled:bg-[var(--surface-disabled)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed';
    const errorClass = error
      ? 'border-[var(--border-error)] focus:border-[var(--border-error)] focus:ring-[var(--error)]/15'
      : 'border-[var(--border-default)] hover:border-[var(--border-hover)]';

    return (
      <textarea
        ref={setRef}
        className={[base, errorClass, className].filter(Boolean).join(' ')}
        style={{
          ...style,
          minHeight: autoResize ? (minRows * LINE_HEIGHT) : style?.minHeight,
          height: autoResize ? height : style?.height,
        }}
        rows={autoResize ? undefined : minRows}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
