import { useState, useRef, useEffect } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import type { ChatMessage } from './MainLayout';

interface ChatAreaProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  workspacePath: string | null;
  selectedFiles: string[];
}

export function ChatArea({
  messages, onSendMessage, terminalOpen, onToggleTerminal, workspacePath, selectedFiles
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!terminalOpen || !terminalRef.current || xtermRef.current) {
      return;
    }

    const term = new Terminal({
      theme: {
        background: '#15171c',
        foreground: '#d7dae0',
        cursor: '#3b82f6',
        selectionBackground: 'rgba(59,130,246,0.28)',
      },
      fontFamily: 'JetBrains Mono, Fira Code, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xtermRef.current = term;

    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    void window.electronAPI?.terminal?.spawn(workspacePath ?? undefined);

    const disposeIncoming = window.electronAPI?.terminal?.onData?.((data: string) => {
      term.write(data);
    });

    term.onData(data => {
      window.electronAPI?.terminal?.write(data);
    });

    term.onResize(({ cols, rows }) => {
      window.electronAPI?.terminal?.resize(cols, rows);
    });

    const onResize = () => fitAddon.fit();
    window.addEventListener('resize', onResize);
    setTimeout(() => fitAddon.fit(), 0);

    return () => {
      window.removeEventListener('resize', onResize);
      if (typeof disposeIncoming === 'function') {
        disposeIncoming();
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalOpen, workspacePath]);

  useEffect(() => {
    if (!terminalOpen || !xtermRef.current) {
      return;
    }
    void window.electronAPI?.terminal?.spawn(workspacePath ?? undefined);
    fitAddonRef.current?.fit();
  }, [terminalOpen, workspacePath]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText('');
    setSending(true);
    try {
      await onSendMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  const roleLabel: Record<string, string> = {
    user: '你',
    agent: 'Agent',
    system: '系统',
    error: '错误',
  };

  const roleCssClass: Record<string, string> = {
    user: 'chat-msg--user',
    agent: 'chat-msg--agent',
    system: 'chat-msg--system',
    error: 'chat-msg--error',
  };

  return (
    <div className="chat-area">
      {/* Header bar */}
      <div className="chat-area__header">
        <span className="chat-area__title">
          {workspacePath
            ? workspacePath.split('/').pop()
            : '未选择工作区'}
        </span>
        {selectedFiles.length > 0 && (
          <span className="chat-area__file-badge" title={selectedFiles.join('\n')}>
            📎 {selectedFiles.length} 个文件
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="chat-area__messages" id="chat-messages-list">
        {messages.length === 0 && (
          <div className="chat-area__empty">
            <p>👋 发送第一条消息开始对话</p>
            {workspacePath && (
              <p className="chat-area__empty-hint">
                工作区：{workspacePath}
                {selectedFiles.length > 0 && `  ·  已选 ${selectedFiles.length} 个文件`}
              </p>
            )}
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            id={`msg-${msg.id}`}
            className={`chat-msg ${roleCssClass[msg.role] || 'chat-msg--system'}`}
          >
            <div className="chat-msg__header">
              <span className="chat-msg__role">{roleLabel[msg.role] || msg.role}</span>
              <span className="chat-msg__time">{msg.time}</span>
            </div>
            <div className="chat-msg__content">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Terminal Panel (collapsible) */}
      {terminalOpen && (
        <div className="chat-area__terminal">
          <div className="chat-area__terminal-header">
            <span>终端</span>
            <span className="chat-area__terminal-cwd" title={workspacePath ?? ''}>
              {workspacePath ?? '~'}
            </span>
            <button
              id="btn-close-terminal"
              className="chat-area__terminal-close"
              onClick={onToggleTerminal}
            >
              ✕
            </button>
          </div>
          <div className="chat-area__terminal-body" id="terminal-container" ref={terminalRef} />
        </div>
      )}

      {/* Input Area */}
      <div className="chat-area__input-wrapper">
        <button
          id="btn-toggle-terminal"
          className={`chat-area__terminal-btn${terminalOpen ? ' active' : ''}`}
          onClick={onToggleTerminal}
          title="切换终端面板"
        >
          ⌨️
        </button>

        <textarea
          ref={textareaRef}
          id="chat-input-textarea"
          className="chat-area__textarea"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息… (Cmd/Ctrl+Enter 发送)"
          rows={3}
          disabled={sending}
        />

        <button
          id="btn-send-message"
          className="chat-area__send-btn"
          onClick={() => void handleSend()}
          disabled={!inputText.trim() || sending}
          title="发送 (Cmd+Enter)"
        >
          {sending ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}
