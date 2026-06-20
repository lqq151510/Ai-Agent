import { useCallback, useEffect, useState } from 'react';
import { Camera, Keyboard, MousePointerClick, RefreshCw } from 'lucide-react';
import './computer-use.css';

type ComputerUseResult = {
  ok: boolean;
  action: string;
  message?: string;
  data?: Record<string, any>;
  error?: string;
};

type ComputerUsePanelProps = {
  onClose?: () => void;
};

export function ComputerUsePanel({ onClose }: ComputerUsePanelProps) {
  const [permissions, setPermissions] = useState<ComputerUseResult | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('未检测');
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

  const refreshPermissions = useCallback(async () => {
    const result = await run('权限检测', () => window.electronAPI?.computer?.permissions());
    if (result) setPermissions(result);
  }, [run]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

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

  const accessibility = permissions?.data?.accessibility ?? 'unknown';
  const screen = permissions?.data?.screenRecording ?? 'unknown';

  return (
    <div className="computer-panel">
      <div className="computer-panel__header">
        <span className="computer-panel__title">Computer Use</span>
        <div className="computer-panel__actions">
          <button className="computer-panel__icon-btn" onClick={refreshPermissions} disabled={busy} title="刷新权限">
            <RefreshCw size={14} />
          </button>
          {onClose && (
            <button className="computer-panel__close-btn" onClick={onClose}>x</button>
          )}
        </div>
      </div>

      <div className="computer-panel__status">
        <div className="computer-panel__status-row">
          <span>Screen</span>
          <strong>{String(screen)}</strong>
        </div>
        <div className="computer-panel__status-row">
          <span>Accessibility</span>
          <strong>{String(accessibility)}</strong>
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
