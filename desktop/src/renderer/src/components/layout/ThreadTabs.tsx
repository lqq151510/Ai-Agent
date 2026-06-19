import { useRef, useEffect } from 'react';
import type { ThreadSummary } from '../../../../../main/thread-manager';

// --------------- Types ---------------

type ThreadTab = ThreadSummary & {
  /** Terminal id if one is attached */
  terminalId?: string;
};

type ThreadTabsProps = {
  threads: ThreadTab[];
  activeThreadId: string | null;
  terminalOpen: boolean;
  onSwitchThread: (id: string) => void;
  onCloseThread: (id: string) => void;
  onToggleTerminal: () => void;
};

// --------------- Component ---------------

/**
 * Bottom terminal bar with horizontal thread tabs.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ [terminal toggle] │ [tab A] [tab B] [tab C] │ [+] │
 * └──────────────────────────────────────────────────┘
 */
export function ThreadTabs({
  threads,
  activeThreadId,
  terminalOpen,
  onSwitchThread,
  onCloseThread,
  onToggleTerminal,
}: ThreadTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to show the active tab
  useEffect(() => {
    if (!tabsRef.current) return;
    const activeTab = tabsRef.current.querySelector('.thread-tab--active') as HTMLElement | null;
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeThreadId, threads.length]);

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onCloseThread(id);
  };

  return (
    <div className="thread-tabs">
      {/* Terminal toggle button */}
      <button
        className={`thread-tabs__toggle${terminalOpen ? ' active' : ''}`}
        onClick={onToggleTerminal}
        title="切换终端面板"
      >
        <span className="thread-tabs__icon">⌨</span>
      </button>

      {/* Thread tabs */}
      <div className="thread-tabs__list" ref={tabsRef}>
        {threads.length === 0 && (
          <span className="thread-tabs__empty">没有活跃的线程</span>
        )}
        {threads.map(t => (
          <div
            key={t.id}
            className={`thread-tab${t.id === activeThreadId ? ' thread-tab--active' : ''}`}
            onClick={() => onSwitchThread(t.id)}
            title={`${t.name} (${t.branch})`}
          >
            <span className="thread-tab__status-dot" data-status={t.status} />
            <span className="thread-tab__name">{t.name}</span>
            <span className="thread-tab__branch">{t.branch}</span>
            <button
              className="thread-tab__close"
              onClick={(e) => handleClose(e, t.id)}
              title="关闭线程"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* New thread button — handled by the parent component */}
      <div className="thread-tabs__spacer" />

      {/* Terminal open/close indicator */}
      <span className="thread-tabs__meta">
        {terminalOpen ? '终端 已打开' : '终端 已关闭'}
      </span>
    </div>
  );
}
