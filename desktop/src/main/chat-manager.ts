import * as path from 'path';
import * as fs from 'fs';
import { getDataDir } from './utils/env';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  time: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  branch: string;
  messages: ChatMessage[];
}

export class ChatManager {
  private chatsDir: string;
  private sessions: Map<string, ChatSession> = new Map();

  constructor() {
    this.chatsDir = path.join(getDataDir(), 'chats');
    if (!fs.existsSync(this.chatsDir)) {
      fs.mkdirSync(this.chatsDir, { recursive: true });
    }
    this.loadAllSessions();
  }

  private loadAllSessions() {
    try {
      const files = fs.readdirSync(this.chatsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = fs.readFileSync(path.join(this.chatsDir, file), 'utf8');
          const session = JSON.parse(data) as ChatSession;
          this.sessions.set(session.id, session);
        }
      }
    } catch (e) {
      console.error('Failed to load chat sessions', e);
    }
  }

  private saveSession(session: ChatSession) {
    try {
      fs.writeFileSync(
        path.join(this.chatsDir, `${session.id}.json`),
        JSON.stringify(session, null, 2)
      );
    } catch (e) {
      console.error('Failed to save session', e);
    }
  }

  public getSessionsSummary() {
    const list = Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      branch: s.branch
    }));
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getSession(id: string) {
    return this.sessions.get(id) || null;
  }

  public createSession(branch: string = 'main', options?: { id?: string; title?: string }) {
    const id = options?.id ?? Date.now().toString();
    const newSession: ChatSession = {
      id,
      title: options?.title ?? '新对话',
      updatedAt: Date.now(),
      branch,
      messages: []
    };
    this.sessions.set(id, newSession);
    this.saveSession(newSession);
    return newSession;
  }

  public appendMessage(sessionId: string, message: Omit<ChatMessage, 'id'>) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Create if it doesn't exist
      session = this.createSession();
      sessionId = session.id;
    }
    const fullMessage = { ...message, id: Date.now().toString() };
    session.messages.push(fullMessage);
    session.updatedAt = Date.now();
    this.saveSession(session);
    return { session, message: fullMessage };
  }

  public async summarizeTitle(sessionId: string, firstUserMessage: string) {
    // Basic mock implementation of an AI title generator
    // In a real app, you would call the LLM backend here
    let title = firstUserMessage.substring(0, 15);
    if (firstUserMessage.length > 15) title += '...';
    
    // Simulate AI delay
    await new Promise(r => setTimeout(r, 1000));

    const session = this.sessions.get(sessionId);
    if (session) {
      session.title = title;
      this.saveSession(session);
    }
    return title;
  }

  public deleteSession(id: string) {
    this.sessions.delete(id);
    const sessionFile = path.join(this.chatsDir, `${id}.json`);
    try {
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
      }
      return true;
    } catch (e) {
      console.error(`Failed to delete session file: ${id}`, e);
      return false;
    }
  }
}
