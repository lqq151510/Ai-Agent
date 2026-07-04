import { useEffect, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';

export type BackendStatus = 'starting' | 'running' | 'stopped' | 'error';

export interface SplashScreenProps {
  status?: { status: BackendStatus } | null;
  isReady?: boolean;
}

const STATUS_MESSAGES: Record<BackendStatus, string> = {
  starting: '正在启动本地服务...',
  running: '服务已就绪',
  stopped: '服务未启动',
  error: '服务启动失败',
};

export const SplashScreen = ({ status, isReady }: SplashScreenProps) => {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { appVersion?: () => Promise<string> } }).electronAPI;
    if (api?.appVersion) {
      api
        .appVersion()
        .then((v) => setVersion(v))
        .catch(() => setVersion(''));
    }
  }, []);

  const backendStatus = status?.status ?? 'starting';
  const message = STATUS_MESSAGES[backendStatus] ?? '正在初始化...';

  return (
    <div className={`splash-screen ${isReady ? 'splash-screen--ready' : ''}`}>
      <div className="splash-screen__card">
        <div className="splash-screen__logo">
          <Bot size={48} strokeWidth={1.5} />
        </div>
        <h1 className="splash-screen__title">AI Agent</h1>
        <p className="splash-screen__version">v{version || '0.1.0'}</p>
        <div className="splash-screen__status">
          <Loader2 size={16} className="splash-screen__spinner" />
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
