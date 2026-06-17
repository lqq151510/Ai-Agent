import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Message, ToolExecutionResult } from '../types';
import { Bot, ChevronDown, ChevronUp, Clock3, User, Wrench } from 'lucide-react';
import { useStreamStore } from '../stores/streamStore';
import { CodeBlock } from './CodeBlock';
import { PlanStepper } from './PlanStepper';

interface MessageItemProps {
  message: Message;
}

function parseToolTrace(raw?: string): ToolExecutionResult[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        toolName: String(item.toolName ?? 'unknown'),
        argsJson: String(item.argsJson ?? ''),
        status: String(item.status ?? 'UNKNOWN'),
        durationMs: Number(item.durationMs ?? 0),
        output: String(item.output ?? '')
      }));
    }
  } catch {
    return [{ toolName: 'trace', argsJson: '{}', status: 'RAW', durationMs: 0, output: raw! }];
  }
  return [];
}

import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const streamBuffer = useStreamStore(state => state.activeId === message.id ? state.buffer : null);
  const finalContent = streamBuffer !== null ? streamBuffer : message.content;
  const smoothContent = useSmoothTypewriter(finalContent, streamBuffer !== null);
  const isAssistant = message.role === 'assistant';
  const traces = useMemo(() => parseToolTrace(message.toolTrace), [message.toolTrace]);
  const [showTrace, setShowTrace] = React.useState(false);
  const displayTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  const isPlanJson = isAssistant && smoothContent.trim().startsWith('[') && smoothContent.trim().endsWith(']') && smoothContent.includes('"step"');

  return (
    <article className={`message ${isAssistant ? 'assistant' : 'user'}`}>
      <div className="message-meta">
        <span className="icon">
          {isAssistant ? <Bot size={14} /> : <User size={14} />}
        </span>
        <strong>{isAssistant ? 'AI Assistant' : 'You'}</strong>
        <span><Clock3 size={12} /> {displayTime}</span>
      </div>
      
      <div className="message-bubble">
        <div className="markdown-body">
          {isPlanJson ? (
            <PlanStepper planJson={smoothContent} taskId={message.id} />
          ) : (
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]} 
              rehypePlugins={[rehypeSanitize]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <CodeBlock
                      language={match[1]}
                      value={String(children).replace(/\n$/, '')}
                    />
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {smoothContent}
            </ReactMarkdown>
          )}
        </div>
      </div>

      {traces.length > 0 && (
        <div className="trace-container">
          <button 
            className="trace-summary ghost" 
            onClick={() => setShowTrace(!showTrace)}
          >
            {showTrace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <Wrench size={14} />
            Tool Trace ({traces.length})
          </button>
          
          {showTrace && (
            <div className="trace-content animate-rise">
              {traces.map((trace, idx) => (
                <div key={idx} className="trace-item">
                  <div className="trace-item-head">
                    <strong>{trace.toolName}</strong>
                    <span className={`status-badge ${trace.status.toLowerCase()}`}>
                      {trace.status}
                    </span>
                    <span className="duration">{trace.durationMs}ms</span>
                  </div>
                  {trace.argsJson && <pre className="trace-code">{trace.argsJson}</pre>}
                  {trace.output && <pre className="trace-code">{trace.output}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
};
