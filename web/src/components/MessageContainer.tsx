import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Message, Session } from '../types';
import { MessageItem } from './MessageItem';
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
    if (streamState === 'connecting') return 'Connecting';
    if (streamState === 'streaming') return 'Streaming';
    if (streamState === 'error') return 'Error';
    return activeSession ? 'Ready' : 'Idle';
  })();

  return (
    <main className="chat panel">
      <header className="chat-header">
        <div>
          <p className="badge">Active Session</p>
          <h2>{activeSession?.title || 'Select a session'}</h2>
          {activeSession && (
            <p className="muted">
              {activeSession.provider} / {activeSession.model}
            </p>
          )}
        </div>
        <div className={streamState === 'streaming' || streamState === 'connecting' ? 'live-pill active' : 'live-pill'}>
          <span />
          {statusText}
        </div>
        <div className="chat-header-actions">
          <button type="button" className="ghost" onClick={onExportJson} disabled={!activeSession || exporting} title="导出 JSON">
            <Download size={14} />
            导出 JSON
          </button>
          <button type="button" className="ghost" onClick={onExportMarkdown} disabled={!activeSession || exporting} title="导出 Markdown">
            <Download size={14} />
            导出 MD
          </button>
        </div>
      </header>

      <section className="message-list">
        {messages.length === 0 ? (
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
        {loading && (
          <div className="loading-indicator">
            <Loader2 className="animate-spin" size={20} />
            <span>Loading messages...</span>
          </div>
        )}
      </section>

      <footer className="composer">
        {error ? (
          <div className="inline-error">
            <AlertCircle size={16} />
            <span>{error}</span>
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
            <span className="muted text-xs">Cmd + Enter to send</span>
            <button className="primary" onClick={onSendMessage} disabled={sending || !activeSession || !prompt.trim()}>
              {sending ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Generating...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
};
