import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AuthState } from './types.js';

const STATE_DIR = join(homedir(), '.ai-agent-cli');
const STATE_FILE = join(STATE_DIR, 'state.json');

function tightenPermissions(path: string, mode: number) {
  try {
    chmodSync(path, mode);
  } catch {
    // Best effort only.
  }
}

export class StateStore {
  read(): AuthState {
    if (!existsSync(STATE_FILE)) {
      return {};
    }

    try {
      const payload = readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(payload) as AuthState;
    } catch {
      return {};
    }
  }

  write(state: AuthState) {
    mkdirSync(STATE_DIR, { recursive: true });
    tightenPermissions(STATE_DIR, 0o700);
    writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    tightenPermissions(STATE_FILE, 0o600);
  }

  clear() {
    this.write({});
  }
}
