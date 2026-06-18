import express from 'express';
import cors from 'cors';
import { workspaceRouter } from './routes/workspace.js';
import { fileRouter } from './routes/file.js';
import { execRouter } from './routes/exec.js';
import { contextRouter } from './routes/context.js';

const PORT = parseInt(process.env.LOCAL_SERVICE_PORT || '8765', 10);

const app = express();
app.use(cors({ origin: ['http://localhost:*', 'file://'] }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', pid: process.pid, port: PORT });
});

// Routes
app.use('/workspace', workspaceRouter);
app.use('/file', fileRouter);
app.use('/exec', execRouter);
app.use('/context', contextRouter);

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
