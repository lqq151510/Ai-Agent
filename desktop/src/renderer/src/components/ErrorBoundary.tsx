import { Component } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  title?: string;
  description?: string;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 可接入 Sentry 等日志服务；此处仅控制台输出避免暴露给用户
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { children, fallback, title, description, showDetails } = this.props;
    const { hasError, error } = this.state;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return fallback;
    }

    return (
      <div className="kd-error-boundary" role="alert">
        <div className="kd-error-boundary__icon">
          <AlertTriangle size={36} />
        </div>
        <h2>{title ?? '出错了'}</h2>
        <p>{description ?? '页面发生异常，请尝试恢复或重新加载应用。'}</p>
        {showDetails && error ? (
          <pre className="kd-error-boundary__details">{error.message}</pre>
        ) : null}
        <div className="kd-error-boundary__actions">
          <button className="kd-action-button" onClick={this.handleRetry} type="button">
            <RefreshCw size={15} />
            重试
          </button>
          <button className="kd-action-button kd-action-button--primary" onClick={this.handleReload} type="button">
            <RotateCcw size={15} />
            重新加载应用
          </button>
        </div>
      </div>
    );
  }
}
