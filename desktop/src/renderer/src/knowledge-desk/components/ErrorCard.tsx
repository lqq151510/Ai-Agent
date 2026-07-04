import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';

export interface ErrorCardProps {
  title?: string;
  description?: string;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorCard = ({
  title = '出错了',
  description = '请求失败，请检查网络或后端服务状态后重试。',
  error,
  onRetry,
  retryLabel = '重试',
  className = '',
}: ErrorCardProps) => (
  <div
    className={`flex flex-col gap-3 rounded-lg border border-[var(--border-error)] bg-[var(--error-alpha-15)] p-5 ${className}`}
  >
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--error)]/10 text-[var(--error)]">
        <AlertTriangle size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <strong className="block text-[15px] font-bold text-[var(--text-primary)]">{title}</strong>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
        {error ? (
          <p className="mt-2 truncate rounded bg-[var(--error)]/10 px-2 py-1 font-mono text-xs text-[var(--error)]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
    {onRetry ? (
      <div className="flex justify-end">
        <Button onClick={onRetry} variant="secondary">
          <RefreshCw size={15} />
          {retryLabel}
        </Button>
      </div>
    ) : null}
  </div>
);
