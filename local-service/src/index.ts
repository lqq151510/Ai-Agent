import { createApp } from './app.js';
import { resolveWorkspaceRoot } from './path-access.js';

const PORT = parseInt(process.env.LOCAL_SERVICE_PORT || '8765', 10);
const TOKEN = process.env.LOCAL_SERVICE_TOKEN;
const WORKSPACE_ROOT = process.env.LOCAL_SERVICE_WORKSPACE_ROOT;

if (!TOKEN) {
  console.error('[local-service] LOCAL_SERVICE_TOKEN is required');
  process.exit(1);
}
let workspaceRoot: string;
try {
  workspaceRoot = resolveWorkspaceRoot(WORKSPACE_ROOT);
} catch (error) {
  console.error(`[local-service] ${error instanceof Error ? error.message : 'invalid LOCAL_SERVICE_WORKSPACE_ROOT'}`);
  process.exit(1);
}

const app = createApp(workspaceRoot, TOKEN);

app.listen(PORT, '127.0.0.1', () => {
  // Signal readiness to parent process (Electron main)
  if (process.send) {
    process.send({ type: 'ready', port: PORT });
  }
  console.log(`[local-service] listening on http://127.0.0.1:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
