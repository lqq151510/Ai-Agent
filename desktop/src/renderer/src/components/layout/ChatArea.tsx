import { useState, useRef, useEffect } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import type { ChatMessage } from './MainLayout';

interface ChatAreaProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSubmitTask: (text: string) => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  workspacePath: string | null;
  selectedFiles: string[];
  taskRunning: boolean;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  reasoningLevel: string;
  setReasoningLevel: (l: string) => void;
  approvalMode: string;
  setApprovalMode: (mode: string) => void;
}

export function ChatArea({
  messages, onSendMessage, onSubmitTask, terminalOpen, onToggleTerminal, workspacePath, selectedFiles, taskRunning,
  selectedModel, setSelectedModel, reasoningLevel, setReasoningLevel, approvalMode, setApprovalMode
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
    if (!text || sending || taskRunning) return;
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

  const handleSubmitTask = async () => {
    const text = inputText.trim();
    if (!text || sending || taskRunning) return;
    setInputText('');
    setSending(true);
    try {
      await onSubmitTask(text);
    } finally {
      setSending(false);
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

  // ---- Codex Sub-renderers ----

  const renderInputPanel = () => {
    return (
      <div className="codex-input-panel-wrapper">
        <div className="codex-input-panel">
          <textarea
            ref={textareaRef}
            id="chat-input-textarea"
            className="codex-input-panel__textarea"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="随心输入"
            rows={2}
            disabled={sending || taskRunning}
          />
          
          <div className="codex-input-panel__toolbar">
            <div className="codex-input-panel__toolbar-left">
              {/* Add files/attachment button */}
              <button 
                className="codex-input-panel__add-btn" 
                title="添加附件 / 上下文"
                onClick={async () => {
                  if (window.electronAPI?.workspace?.add) {
                    await window.electronAPI.workspace.add();
                  }
                }}
              >
                +
              </button>
              
              {/* Collapsible terminal trigger */}
              <button
                id="btn-toggle-terminal"
                className={`codex-pill-btn${terminalOpen ? ' success' : ''}`}
                onClick={onToggleTerminal}
                title="切换终端面板"
              >
                ⌨️ {terminalOpen ? '关闭终端' : '终端'}
              </button>

              {/* Permission pill dropdown */}
              <select
                value={approvalMode}
                onChange={e => setApprovalMode(e.target.value)}
                className={`codex-pill-btn ${approvalMode === 'full' ? 'success' : approvalMode === 'request' ? 'danger' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <option value="full">🛡️ 完全访问</option>
                <option value="request">🔒 请求批准</option>
                <option value="auto">🤖 自动审核</option>
              </select>
            </div>

            <div className="codex-input-panel__toolbar-right">
              {/* Reasoning Selection dropdown */}
              <select
                value={reasoningLevel}
                onChange={e => setReasoningLevel(e.target.value)}
                className="codex-pill-btn"
                style={{ cursor: 'pointer' }}
              >
                <option value="None">🧠 推理: 无</option>
                <option value="Low">🧠 推理: 低</option>
                <option value="High">🧠 推理: 高</option>
              </select>

              {/* Model selection dropdown */}
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="codex-pill-btn"
                style={{ cursor: 'pointer' }}
              >
                <option value="DeepSeek-V4">5.5 超高 (DeepSeek)</option>
                <option value="Qwen-3.5-Local">5.0 本地 (Qwen)</option>
                <option value="GPT-4o">5.2 高级 (GPT-4o)</option>
              </select>

              {/* Voice Mock indicator */}
              <button className="codex-pill-btn" title="语音输入" onClick={() => alert('语音输入接口已就绪，等待底层适配。')}>
                🎤
              </button>

              {/* Circular send Plan button */}
              <button
                id="btn-submit-task"
                className="codex-pill-btn success"
                onClick={() => void handleSubmitTask()}
                disabled={!inputText.trim() || sending || taskRunning}
                title="启动计划执行 (AI自主执行链路)"
                style={{ padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}
              >
                📋 Plan
              </button>

              {/* Circular send arrow button */}
              <button
                id="btn-send-message"
                className="codex-input-panel__send-btn"
                onClick={() => void handleSend()}
                disabled={!inputText.trim() || sending || taskRunning}
                title="发送 (Cmd/Ctrl+Enter)"
              >
                {sending ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* Directory breadcrumb path hanger */}
        <div 
          className="codex-path-hanger" 
          onClick={async () => {
            if (window.electronAPI?.workspace?.add) {
              await window.electronAPI.workspace.add();
            }
          }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <span>📁 {workspacePath ? workspacePath.split('/').pop() : '选择项目'} ▾</span>
          {selectedFiles.length > 0 && (
            <span 
              style={{ 
                fontSize: '10px', 
                color: '#0969da', 
                backgroundColor: 'rgba(9, 105, 218, 0.08)', 
                padding: '1px 6px', 
                borderRadius: '6px', 
                marginLeft: '8px',
                display: 'inline-flex',
                alignItems: 'center'
              }} 
              title={selectedFiles.join('\n')}
            >
              📎 {selectedFiles.length} 已选
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderSuggestions = () => {
    const suggestions = [
      {
        icon: '⚙️',
        text: `把 AI-agent 的 phase 3 computer use 骨架落地`
      },
      {
        icon: '🔧',
        text: `补完 AI-agent 的 Java 21 编译基线再进 phase 3`
      },
      {
        icon: '🚀',
        text: `把 codex/p0-stable-delivery 的 CLI 迁移补进 AI-agent 主线`
      },
      {
        icon: '🔌',
        text: `将你常用的应用连接到 Codex`
      }
    ];

    return (
      <div className="codex-suggestions">
        {suggestions.map((item, idx) => (
          <div 
            key={idx} 
            className="codex-suggestion-item"
            onClick={() => setInputText(item.text)}
          >
            <span className="codex-suggestion-item__icon">{item.icon}</span>
            <span className="codex-suggestion-item__text">{item.text}</span>
          </div>
        ))}
      </div>
    );
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="codex-workspace">
      {/* Top Header Controls */}
      <div className="chat-area__header" style={{ justifyContent: 'flex-end', borderBottom: '1px solid rgba(0, 0, 0, 0.035)', padding: '10px 20px' }}>
        <div className="chat-area__header-controls" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select 
            className="header-control-select" 
            style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer' }}
            defaultValue="open"
          >
            <option value="open">📂 打开位置</option>
          </select>
          {/* macOS traffic light mock controls on top right */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', opacity: 0.65, marginLeft: '4px' }}>
            <span style={{ cursor: 'pointer', fontSize: '14px' }} title="分栏" onClick={() => alert('已开启多分栏布局')}>◽</span>
            <span style={{ cursor: 'pointer', fontSize: '14px' }} title="全屏" onClick={() => alert('已进入全屏聚焦模式')}>🔳</span>
          </div>
        </div>
      </div>

      {/* Main Workspace content */}
      {!hasMessages ? (
        /* Empty State: Codex Welcome screen */
        <div className="codex-welcome-screen">
          <h1 className="codex-welcome-title">
            我们应该在 {workspacePath ? workspacePath.split('/').pop() : '此项目'} 中做些什么？
          </h1>
          {renderInputPanel()}
          {renderSuggestions()}
        </div>
      ) : (
        /* Active Chat: Messages stream + Fixed input panel */
        <div className="chat-area" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="chat-area__messages" id="chat-messages-list" style={{ flex: 1, overflowY: 'auto' }}>
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

          {/* Bottom input area spacing */}
          <div style={{ padding: '16px 0 24px 0', borderTop: '1px solid rgba(0,0,0,0.035)', background: '#ffffff' }}>
            {renderInputPanel()}
          </div>
        </div>
      )}

      {/* Terminal Panel (collapsible, same bottom tab binding) */}
      {terminalOpen && (
        <div className="chat-area__terminal" style={{ zIndex: 30 }}>
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
    </div>
  );
}
