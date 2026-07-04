import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'bottom-right';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface ToasterProps {
  position?: ToastPosition;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener([...toasts]));
}

function push(item: Omit<ToastItem, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toasts = [...toasts, { ...item, id }];
  notify();

  const duration = item.duration ?? 4000;
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export const toast = {
  success: (message: string, title?: string, duration?: number) =>
    push({ type: 'success', message, title, duration }),
  error: (message: string, title?: string, duration?: number) =>
    push({ type: 'error', message, title, duration }),
  warning: (message: string, title?: string, duration?: number) =>
    push({ type: 'warning', message, title, duration }),
  info: (message: string, title?: string, duration?: number) =>
    push({ type: 'info', message, title, duration }),
  dismiss,
};

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="text-[var(--success)]" />,
  error: <AlertCircle size={18} className="text-[var(--error)]" />,
  warning: <AlertTriangle size={18} className="text-[var(--warning)]" />,
  info: <Info size={18} className="text-[var(--accent)]" />,
};

const typeStyles: Record<ToastType, string> = {
  success: 'bg-[var(--success-alpha-8)] border-[var(--success-alpha-20)]',
  error: 'bg-[var(--error-alpha-8)] border-[var(--error-alpha-20)]',
  warning: 'bg-[var(--warning-alpha-5)] border-[var(--warning-alpha-15)]',
  info: 'bg-[var(--accent-alpha-8)] border-[var(--accent-alpha-20)]',
};

function ToastCard({ toast: item }: { toast: ToastItem }) {
  return (
    <div
      className={[
        'flex items-start gap-3 w-80 p-4 rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)]',
        'animate-[ui-slide-in-right_0.2s_ease-out]',
        typeStyles[item.type],
      ].join(' ')}
      role="alert"
    >
      <span className="mt-0.5 shrink-0">{icons[item.type]}</span>
      <div className="flex-1 min-w-0">
        {item.title && <p className="text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</p>}
        <p className={['text-[13px] leading-relaxed text-[var(--text-secondary)]', item.title ? 'mt-0.5' : ''].join(' ')}>
          {item.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-black/5 hover:text-[var(--text-primary)] transition-colors"
        aria-label="关闭通知"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster({ position = 'top-right' }: ToasterProps) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) return null;

  const positionClass =
    position === 'top-right'
      ? 'top-4 right-4 flex-col'
      : 'bottom-4 right-4 flex-col-reverse';

  return createPortal(
    <div
      className={['fixed z-[var(--z-toast)] flex gap-2 pointer-events-none', positionClass].join(' ')}
      aria-live="polite"
      aria-atomic="true"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastCard toast={item} />
        </div>
      ))}
    </div>,
    document.body
  );
}

export default Toaster;
