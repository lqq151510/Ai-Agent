import type { ElementType, ReactNode } from 'react';
import { Button } from '../../components/ui';

export interface EmptyStateProps {
  icon: ElementType;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  className?: string;
  children?: ReactNode;
}

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
  children,
}: EmptyStateProps) => (
  <div
    className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center shadow-sm ${className}`}
  >
    <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-alpha-10)] text-[var(--accent)]">
      <Icon size={24} />
    </div>
    <div className="flex flex-col gap-1">
      <strong className="text-base font-bold text-[var(--text-primary)]">{title}</strong>
      <span className="max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">{description}</span>
    </div>
    {action ? (
      <Button className="mt-1" onClick={action.onClick} variant="primary">
        {action.icon ?? null}
        {action.label}
      </Button>
    ) : null}
    {children}
  </div>
);
