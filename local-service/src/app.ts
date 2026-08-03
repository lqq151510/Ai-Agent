import { createHash, timingSafeEqual } from 'crypto';
import express from 'express';
import { createContextRouter } from './routes/context.js';
import { createFileRouter } from './routes/file.js';
import { createWorkspaceRouter } from './routes/workspace.js';
import { resolveWorkspaceRoot } from './path-access.js';

export interface AppOptions {
  treeMaxDepth?: number;
  treeMaxNodes?: number;
}

export function createApp(workspaceRoot: string, token: string, options: AppOptions = {}) {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const expectedTokenHash = tokenHash(`Bearer ${token}`);
  const app = express();

  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const actualTokenHash = tokenHash(req.headers.authorization ?? '');
    if (!timingSafeEqual(actualTokenHash, expectedTokenHash)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/workspace', createWorkspaceRouter(root, options));
  app.use('/file', createFileRouter(root));
  app.use('/context', createContextRouter(root, options));
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: 'invalid request body' });
  });
  return app;
}

function tokenHash(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
