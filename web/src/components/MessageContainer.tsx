import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Message, Session } from '../types';
import { MessageItem } from './MessageItem';
import { SkeletonMessage } from './Skeleton';
import { AlertCircle, Bot, Download, Loader2, MessageSquare, RefreshCw, Send, Sparkles } from 'lucide-react';
import type { StreamState } from '../stores/chatStore';

interface MessageContainerProps {
  activeSession: Session | null;
  messages: Message[];
  prompt: string;
  setPrompt: (val: string) => void;
  sending: boolean;
  loading: boolean;
  error: string;
  streamState: StreamState;
  exporting: boolean;
  canRetry: boolean;
  errorActionLabel?: string;
  onErrorAction?: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onRetryLast: () => void;
  onSendMessage: () => void;
}

export const MessageContainer: React.FC<MessageContainerProps> = ({
  activeSession,
  messages,
  prompt,
  setPrompt,
  sending,
  loading,
  error,
  streamState,
  exporting,
  canRetry,
  errorActionLabel,
  onErrorAction,
  onExportJson,
  onExportMarkdown,
  onRetryLast,
  onSendMessage
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      onSendMessage();
    }
  };

  const statusText = (() => {
    if (streamState === 'connecting') return '连接中';
    if (streamState === 'streaming') return '生成中';
    if (streamState === 'error') return '错误';
    return activeSession ? '就绪' : '空闲';
  })();

  const statusColor = (() => {
    if (streamState === 'streaming') return 'status-streaming';
    if (streamState === 'connecting') return 'status-connecting';
    if (streamState === 'error') return 'status-error';
    return 'status-idle';
  })();

  return (
    <main className="chat panel">
      <header className="chat-header">
        <div className="chat-header-main">
          <div className="chat-header-info">
            <p className="badge">{activeSession ? '当前会话' : '未选择会话'}</p>
            <h2>{activeSession?.title || '选择或创建会话'}</h2>
            {activeSession && (
              <div className="chat-header-meta">
                <span className="meta-badge">{activeSession.provider}</span>
                <span className="meta-badge">{activeSession.model}</span>
              </div>
            )}
          </div>
          <div className={`live-pill ${statusColor}`}>
            <span className="live-dot" />
            {statusText}
          </div>
        </div>
        <div className="chat-header-actions">
          <button type="button" className="ghost export-btn" onClick={onExportJson} disabled={!activeSession || exporting} title="导出 JSON">
            <Download size={14} />
            JSON
          </button>
          <button type="button" className="ghost export-btn" onClick={onExportMarkdown} disabled={!activeSession || exporting} title="导出 Markdown">
            <Download size={14} />
            MD
          </button>
        </div>
      </header>

      <section className="message-list">
        {loading && messages.length === 0 ? (
          <div className="skeleton-container">
            <SkeletonMessage />
            <SkeletonMessage />
            <SkeletonMessage />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              {activeSession ? <Sparkles size={32} /> : <MessageSquare size={32} />}
            </div>
            <h3>{activeSession ? '开始一次 agent 任务' : '选择或创建会话'}</h3>
            <p>{activeSession ? '提出问题、粘贴代码片段，或让它读取工具 trace 后继续分析。' : '左侧创建会话后，这里会展示完整上下文。'}</p>
          </div>
        ) : (
          <Virtuoso
            className="message-virtual-list"
            data={messages}
            followOutput="auto"
            itemContent={(_, msg) => (
              <div className="message-row" key={msg.id}>
                <MessageItem message={msg} />
              </div>
            )}
          />
        )}
        {loading && messages.length > 0 && (
          <div className="loading-indicator">
            <Loader2 className="animate-spin" size={20} />
            <span>加载消息中...</span>
          </div>
        )}
      </section>

      <footer className="composer">
        {error ? (
          <div className="inline-error">
            <div className="error-content">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <div className="error-actions">
              {canRetry ? (
                <button type="button" className="ghost retry-btn" onClick={onRetryLast}>
                  <RefreshCw size={14} />
                  重试
                </button>
              ) : null}
              {errorActionLabel && onErrorAction ? (
                <button type="button" className="ghost retry-btn" onClick={onErrorAction}>
                  <RefreshCw size={14} />
                  {errorActionLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="composer-inner">
          <Bot size={18} className="composer-mark" />
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeSession ? '输入任务、问题或代码片段...' : '先选择一个会话'}
            rows={2}
          />
          <div className="composer-actions">
            <span className="muted text-xs">Cmd + Enter 发送</span>
            <button className="primary send-btn" onClick={onSendMessage} disabled={sending || !activeSession || !prompt.trim()}>
              {sending ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  生成中...
                </>
              ) : (
                <>
                  <Send size={16} />
                  发送
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
};
