import { useCallback, useEffect, useState } from 'react';
import { Camera, Keyboard, MousePointerClick, RefreshCw, Settings, ShieldAlert, ShieldCheck } from 'lucide-react';
import './computer-use.css';

type ComputerUseResult = {
  ok: boolean;
  action: string;
  message?: string;
  data?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  error?: string;
};

type PermissionStatus = 'granted' | 'denied' | 'unknown';

type ComputerUsePanelProps = {
  onClose?: () => void;
};

export function ComputerUsePanel({ onClose }: ComputerUsePanelProps) {
  const [permissions, setPermissions] = useState<{
    accessibility: PermissionStatus;
    screenRecording: PermissionStatus;
  } | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('检测中...');
  const [busy, setBusy] = useState(false);
  const [clickX, setClickX] = useState('100');
  const [clickY, setClickY] = useState('100');
  const [typeText, setTypeText] = useState('AI Agent');

  const run = useCallback(async (
    action: string,
    task: () => Promise<ComputerUseResult | undefined>,
  ) => {
    setBusy(true);
    setMessage(`${action}...`);
    try {
      const result = await task();
      if (!result) {
        setMessage(`${action} 无返回`);
        return null;
      }
      setMessage(result.ok ? (result.message || `${action} 成功`) : (result.error || `${action} 失败`));
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    setPermissionLoading(true);
    try {
      const result = await window.electronAPI?.computer?.permissions();
      if (result?.data) {
        setPermissions({
          accessibility: result.data.accessibility as PermissionStatus,
          screenRecording: result.data.screenRecording as PermissionStatus,
        });
        setMessage(result.message || '');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '权限检测失败');
    } finally {
      setPermissionLoading(false);
    }
  }, []);

  // Auto-check permissions on mount
  useEffect(() => {
    void checkPermissions();
  }, [checkPermissions]);

  const allGranted = permissions &&
    permissions.accessibility === 'granted' &&
    permissions.screenRecording === 'granted';

  const missingPermissions = permissions
    ? [
        ...(permissions.accessibility !== 'granted' ? [{ key: 'accessibility' as const, label: '辅助功能 (Accessibility)' }] : []),
        ...(permissions.screenRecording !== 'granted' ? [{ key: 'screenRecording' as const, label: '屏幕录制 (Screen Recording)' }] : []),
      ]
    : [];

  const capture = useCallback(async () => {
    const result = await run('截图', () => window.electronAPI?.computer?.screenshot());
    const dataUrl = result?.data?.dataUrl;
    if (typeof dataUrl === 'string') {
      setScreenshotUrl(dataUrl);
    }
  }, [run]);

  const click = useCallback(async () => {
    await run('点击', () => window.electronAPI?.computer?.click({
      x: Number(clickX),
      y: Number(clickY),
      button: 'left',
    }));
  }, [clickX, clickY, run]);

  const type = useCallback(async () => {
    await run('输入', () => window.electronAPI?.computer?.type({ text: typeText }));
  }, [run, typeText]);

  const openSettings = useCallback((pane?: 'accessibility' | 'screenRecording') => {
    window.electronAPI?.computer?.openSettings(pane);
  }, []);

  // === Permission Required View ===
  if (!allGranted) {
    return (
      <div className="computer-panel">
        <div className="computer-panel__header">
          <span className="computer-panel__title">Computer Use</span>
          <div className="computer-panel__actions">
            {onClose && (
              <button className="computer-panel__close-btn" onClick={onClose}>x</button>
            )}
          </div>
        </div>

        {permissionLoading ? (
          <div className="computer-permission__loading">
            <RefreshCw size={18} className="computer-permission__spinner" />
            <span>正在检测权限...</span>
          </div>
        ) : (
          <div className="computer-permission__notice">
            <div className="computer-permission__notice-icon">
              <ShieldAlert size={28} />
            </div>
            <h3 className="computer-permission__notice-title">需要授予系统权限</h3>
            <p className="computer-permission__notice-desc">
              Computer Use 需要以下 macOS 权限才能正常工作。请先授予权限，然后点击"重新检测"。
            </p>

            <div className="computer-permission__list">
              {missingPermissions.map(p => (
                <div key={p.key} className="computer-permission__item">
                  <span className="computer-permission__item-dot" />
                  <span className="computer-permission__item-label">{p.label}</span>
                  <button
                    className="computer-permission__settings-btn"
                    onClick={() => openSettings(p.key)}
                  >
                    <Settings size={12} />
                    打开设置
                  </button>
                </div>
              ))}
            </div>

            <div className="computer-permission__hint">
              路径：系统设置 → 隐私与安全性 → {missingPermissions.map(p => p.label.replace(/ \(.*\)$/, '')).join(' / ')}
            </div>

            <div className="computer-permission__actions">
              <button
                className="computer-panel__button computer-permission__retry-btn"
                onClick={checkPermissions}
              >
                <RefreshCw size={14} />
                重新检测
              </button>
            </div>
          </div>
        )}

        <div className="computer-panel__message">{message}</div>
      </div>
    );
  }

  // === Normal Control Panel View ===
  return (
    <div className="computer-panel">
      <div className="computer-panel__header">
        <span className="computer-panel__title">
          Computer Use
          <span className="computer-permission__granted-badge">
            <ShieldCheck size={12} />
            已授权
          </span>
        </span>
        <div className="computer-panel__actions">
          <button className="computer-panel__icon-btn" onClick={checkPermissions} disabled={busy} title="刷新权限">
            <RefreshCw size={14} />
          </button>
          {onClose && (
            <button className="computer-panel__close-btn" onClick={onClose}>x</button>
          )}
        </div>
      </div>

      <div className="computer-panel__status">
        <div className="computer-panel__status-row">
          <span>Screen Recording</span>
          <strong className="computer-status--granted">{permissions?.screenRecording}</strong>
        </div>
        <div className="computer-panel__status-row">
          <span>Accessibility</span>
          <strong className="computer-status--granted">{permissions?.accessibility}</strong>
        </div>
      </div>

      <div className="computer-panel__section">
        <button className="computer-panel__button" onClick={capture} disabled={busy}>
          <Camera size={15} />
          Screenshot
        </button>
        {screenshotUrl && (
          <img className="computer-panel__screenshot" src={screenshotUrl} alt="Latest screenshot" />
        )}
      </div>

      <div className="computer-panel__section">
        <div className="computer-panel__row">
          <input
            className="computer-panel__input"
            value={clickX}
            onChange={event => setClickX(event.target.value)}
            inputMode="numeric"
            aria-label="x"
          />
          <input
            className="computer-panel__input"
            value={clickY}
            onChange={event => setClickY(event.target.value)}
            inputMode="numeric"
            aria-label="y"
          />
        </div>
        <button className="computer-panel__button" onClick={click} disabled={busy}>
          <MousePointerClick size={15} />
          Click
        </button>
      </div>

      <div className="computer-panel__section">
        <input
          className="computer-panel__text-input"
          value={typeText}
          onChange={event => setTypeText(event.target.value)}
          aria-label="text"
        />
        <button className="computer-panel__button" onClick={type} disabled={busy || !typeText}>
          <Keyboard size={15} />
          Type
        </button>
      </div>

      <div className="computer-panel__message">{message}</div>
    </div>
  );
}
