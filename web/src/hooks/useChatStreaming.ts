import { Session } from '../types';
import { useStreamStore } from '../stores/streamStore';

export function useChatStreaming(
  api: any,
  chat: any,
  activeSession: Session | null,
  contextTokenLimit: number | null,
  applyError: (e: any) => string,
  armRateLimitAutoRetry: (msg?: string) => void,
  reloadSessions: (nextActiveId?: string) => Promise<void>
) {
  async function sendMessage(outgoing: string) {
    if (!chat.activeSessionId || !outgoing.trim()) return;
    const content = outgoing.trim();
    const assistantMessageId = `stream-assistant-${Date.now()}`;
    const now = new Date().toISOString();
    let streamedAnyChunk = false;
    
    useStreamStore.getState().resetStream();
    
    chat.setSending(true);
    chat.clearError();
    chat.setPrompt('');
    chat.setStreamState('connecting');
    chat.setMessages((prev: any[]) => [
      ...prev,
      { id: `stream-user-${Date.now()}`, role: 'user', content, provider: activeSession?.provider ?? '', model: activeSession?.model ?? '', createdAt: now },
      { id: assistantMessageId, role: 'assistant', content: '', toolTrace: '[]', provider: activeSession?.provider ?? '', model: activeSession?.model ?? '', createdAt: now }
    ]);
    
    try {
      await api.streamChat({
        sessionId: chat.activeSessionId,
        message: content,
        provider: activeSession?.provider,
        model: activeSession?.model,
        maxContextTokens: contextTokenLimit ?? undefined
      }, {
        onChunk: (chunk: string) => {
          if (!streamedAnyChunk) {
            streamedAnyChunk = true;
            chat.setStreamState('streaming');
          }
          useStreamStore.getState().setStream(assistantMessageId, chunk);
        },
        onError: (message: string) => {
          const kind = applyError(message);
          if (kind === 'rate_limit') armRateLimitAutoRetry(content);
          chat.setStreamState('error');
        }
      });
      chat.setStreamState('idle');
      chat.setLastFailedMessage('');
      
      const finalBuffer = useStreamStore.getState().buffer;
      chat.setMessages((prev: any[]) => prev.map(msg => msg.id === assistantMessageId ? { ...msg, content: finalBuffer } : msg));
      useStreamStore.getState().resetStream();
      
      await reloadSessions(chat.activeSessionId);
    } catch (e) {
      chat.setStreamState('error');
      chat.setLastFailedMessage(content);
      const kind = applyError(e);
      if (kind === 'rate_limit') armRateLimitAutoRetry();
      try {
        await reloadSessions(chat.activeSessionId);
      } catch {
        // keep stream failure message.
      }
    } finally {
      chat.setSending(false);
    }
  }

  async function onRetryLast() {
    if (!chat.lastFailedMessage) return;
    await sendMessage(chat.lastFailedMessage);
  }

  return { sendMessage, onRetryLast };
}
