export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
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

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  listener([...toasts]);
  return () => {
    listeners.delete(listener);
  };
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
