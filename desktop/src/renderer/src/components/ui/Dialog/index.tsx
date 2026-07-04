import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

export interface DialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onOpenChange(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[4px]" />
      <div
        ref={panelRef}
        className={[
          'relative w-full max-w-lg max-h-[calc(100vh-80px)] overflow-auto',
          'bg-[var(--surface-card)] border border-[var(--border-default)] rounded-[var(--radius-xl)]',
          'shadow-[var(--shadow-lg)] p-6 animate-[ui-fade-in_0.2s_ease-out]',
        ].join(' ')}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({ children, className = '' }: DialogTitleProps) {
  return <div className={['flex flex-col gap-1 mb-4', className].join(' ')}>{children}</div>;
}

export function DialogTitle({ children, className = '' }: DialogTitleProps) {
  return (
    <div className={['flex items-start justify-between gap-4', className].join(' ')}>
      <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight">{children}</h2>
    </div>
  );
}

export function DialogDescription({ children, className = '' }: DialogDescriptionProps) {
  return (
    <p className={['text-[13px] text-[var(--text-secondary)] leading-relaxed', className].join(' ')}>
      {children}
    </p>
  );
}

export function DialogFooter({ children, className = '' }: DialogFooterProps) {
  return (
    <div className={['flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[var(--border-default)]', className].join(' ')}>
      {children}
    </div>
  );
}

export interface DialogCloseProps {
  asChild?: boolean;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function DialogClose({ asChild, children, className = '', onClick }: DialogCloseProps) {
  const handleClick = () => {
    onClick?.();
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, {
      onClick: handleClick,
      className: [className, (children.props as { className?: string }).className].filter(Boolean).join(' '),
    } as Record<string, unknown>);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        'absolute top-4 right-4 inline-flex items-center justify-center w-8 h-8',
        'rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        'transition-colors',
        className,
      ].join(' ')}
      aria-label="关闭"
    >
      {children ?? <X size={18} />}
    </button>
  );
}

export default Dialog;
