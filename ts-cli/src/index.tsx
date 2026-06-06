#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';

import { createApiClient } from './api-client.js';
import { collectSystemContext } from './context-collector.js';
import { formatReleaseReportSummary, formatSessions, formatToolStatsSummary } from './format.js';
import { ReplApp } from './repl-app.js';
import { StateStore } from './state-store.js';
import type { AuthState, ReleaseReportResponse, ToolStatsResponse } from './types.js';

type ParsedArgs = {
  values: Record<string, string | boolean>;
  positionals: string[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      values[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values[rawKey] = next;
      index += 1;
      continue;
    }

    values[rawKey] = true;
  }

  return { values, positionals };
}

function extractBaseUrl(argv: string[]): { baseUrl: string; remaining: string[] } {
  const remaining: string[] = [];
  let baseUrl = process.env.AGENT_API_BASE_URL || process.env.AGENT_API_BASE || 'http://localhost:8080';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      baseUrl = argv[index + 1] || baseUrl;
      index += 1;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length) || baseUrl;
      continue;
    }
    remaining.push(arg);
  }

  return { baseUrl, remaining };
}

function printHelp() {
  console.log(`agent-cli

Usage:
  agent-cli [--base-url URL] [repl]
  agent-cli login --email you@example.com --password secret
  agent-cli sessions
  agent-cli create-session [--title TITLE] [--provider OPENAI] [--model MODEL] [--context-token-limit N]
  agent-cli chat --message TEXT [--session ID] [--provider OPENAI] [--model MODEL] [--max-context-tokens N]
  agent-cli stream-chat --message TEXT [--session ID] [--provider OPENAI] [--model MODEL] [--max-context-tokens N]
  agent-cli tool-stats [--window-hours N] [--session ID] [--json|--markdown]
  agent-cli release-report [--window-hours N] [--session ID] [--json|--markdown]
  agent-cli logout

If no command is provided, the Ink REPL starts.`);
}

function ensureLoggedIn(state: AuthState) {
  if (!state.accessToken) {
    throw new Error('Please login first.');
  }
}

function readString(values: Record<string, string | boolean>, key: string): string | undefined {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(values: Record<string, string | boolean>, key: string): boolean {
  return values[key] === true;
}

function readNumber(values: Record<string, string | boolean>, key: string): number | undefined {
  const raw = readString(values, key);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const { baseUrl, remaining } = extractBaseUrl(process.argv.slice(2));
  const store = new StateStore();
  const api = createApiClient(baseUrl, {
    getState: () => store.read(),
    setState: state => store.write(state),
  });

  const command = remaining[0];
  if (!command || command === 'repl') {
    const app = render(<ReplApp baseUrl={baseUrl} />);
    await app.waitUntilExit();
    return;
  }

  if (command === 'help' || command === '--help') {
    printHelp();
    return;
  }

  const { values } = parseArgs(remaining.slice(1));
  const state = store.read();

  switch (command) {
    case 'login': {
      const email = readString(values, 'email');
      const password = readString(values, 'password');
      if (!email || !password) {
        throw new Error('Usage: login --email you@example.com --password secret');
      }
      const tokens = await api.login(email, password);
      store.write({
        ...state,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      console.log(`Login success: ${email}`);
      return;
    }
    case 'logout': {
      if (state.refreshToken) {
        try {
          await api.logout(state.refreshToken);
        } catch {
          // Best effort logout.
        }
      }
      store.clear();
      console.log('Logged out.');
      return;
    }
    case 'sessions': {
      ensureLoggedIn(state);
      const sessions = await api.listSessions();
      console.log(formatSessions(sessions, state.activeSessionId));
      return;
    }
    case 'create-session': {
      ensureLoggedIn(state);
      const created = await api.createSession({
        title: readString(values, 'title'),
        provider: (readString(values, 'provider') as 'OPENAI' | undefined) || 'OPENAI',
        model: readString(values, 'model'),
        contextTokenLimit: readNumber(values, 'context-token-limit'),
      });
      store.write({ ...state, activeSessionId: created.id });
      console.log(`Created session: ${created.id}`);
      return;
    }
    case 'chat': {
      ensureLoggedIn(state);
      const message = readString(values, 'message');
      const sessionId = readString(values, 'session') || state.activeSessionId;
      if (!message || !sessionId) {
        throw new Error('Usage: chat --message TEXT [--session ID]');
      }
      const systemContext = await collectSystemContext();
      const response = await api.chat({
        sessionId,
        message,
        provider: (readString(values, 'provider') as 'OPENAI' | undefined) || undefined,
        model: readString(values, 'model'),
        maxContextTokens: readNumber(values, 'max-context-tokens'),
        systemContext,
      });
      console.log(`assistant> ${response.reply}`);
      return;
    }
    case 'stream-chat': {
      ensureLoggedIn(state);
      const message = readString(values, 'message');
      const sessionId = readString(values, 'session') || state.activeSessionId;
      if (!message || !sessionId) {
        throw new Error('Usage: stream-chat --message TEXT [--session ID]');
      }
      const systemContext = await collectSystemContext();
      let started = false;
      let firstTokenAt = 0;
      const startedAt = Date.now();
      console.log(`[status] connecting to session ${sessionId.slice(0, 8)}...`);
      await api.streamChat(
        {
          sessionId,
          message,
          provider: (readString(values, 'provider') as 'OPENAI' | undefined) || undefined,
          model: readString(values, 'model'),
          maxContextTokens: readNumber(values, 'max-context-tokens'),
          systemContext,
        },
        {
          onMeta: payload => {
            console.log(`[meta] provider=${payload.provider} model=${payload.model}`);
          },
          onChunk: chunk => {
            if (!started) {
              started = true;
              firstTokenAt = Date.now();
              process.stdout.write('assistant> ');
            }
            process.stdout.write(chunk);
          },
          onDone: payload => {
            if (!started && payload.reply) {
              console.log(`assistant> ${payload.reply}`);
            } else if (started) {
              process.stdout.write('\n');
            }
            const firstTokenMs = firstTokenAt > 0 ? firstTokenAt - startedAt : '-';
            console.log(
              `[done] provider=${payload.provider} model=${payload.model} firstTokenMs=${firstTokenMs} totalMs=${payload.latencyMs}`,
            );
          },
          onError: errorMessage => {
            throw new Error(errorMessage);
          },
        },
      );
      return;
    }
    case 'tool-stats': {
      ensureLoggedIn(state);
      const windowHours = readNumber(values, 'window-hours') || 24;
      const sessionId = readString(values, 'session');
      if (readBoolean(values, 'json')) {
        const stats = await api.toolStats(windowHours, sessionId);
        printJson(stats);
        return;
      }
      if (readBoolean(values, 'markdown')) {
        const payload = await api.exportToolStats(windowHours, 'markdown', sessionId);
        console.log(payload);
        return;
      }
      const stats = await api.toolStats(windowHours, sessionId);
      console.log(formatToolStatsSummary(stats as ToolStatsResponse));
      return;
    }
    case 'release-report': {
      ensureLoggedIn(state);
      const windowHours = readNumber(values, 'window-hours') || 24;
      const sessionId = readString(values, 'session');
      if (readBoolean(values, 'json')) {
        const report = await api.releaseReport(windowHours, sessionId);
        printJson(report);
        return;
      }
      if (readBoolean(values, 'markdown')) {
        const payload = await api.exportReleaseReport(windowHours, 'markdown', sessionId);
        console.log(payload);
        return;
      }
      const report = await api.releaseReport(windowHours, sessionId);
      console.log(formatReleaseReportSummary(report as ReleaseReportResponse));
      return;
    }
    default:
      printHelp();
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
