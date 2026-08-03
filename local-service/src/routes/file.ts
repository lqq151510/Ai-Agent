import { Router } from 'express';
import * as path from 'path';
import { readTextFileFromWorkspace } from '../file-access.js';

const MAX_FILE_SIZE = 200 * 1024;
const MAX_CONTENT_CHARS = 50_000;
const REDACT_LINE_RE = /(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)/i;
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar', '.exe', '.dll', '.so', '.dylib', '.mp3', '.mp4', '.mov', '.avi', '.woff', '.woff2', '.ttf', '.eot', '.jar', '.class']);

function sanitize(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]+/g, 'sk-[redacted]').split('\n')
    .map(line => (REDACT_LINE_RE.test(line) ? '[redacted sensitive line]' : line)).join('\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u4E00-\u9FFF\u3000-\u303F]/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
}

export function createFileRouter(root: string): Router {
  const router = Router();
  router.get('/', (req, res) => {
    try {
      const file = readTextFileFromWorkspace(root, req.query.path, MAX_FILE_SIZE);
      const ext = path.extname(file.file.absolute).toLowerCase();
      if (BINARY_EXT.has(ext)) return res.status(415).json({ error: 'binary file type not supported for text read' });
      const content = sanitize(file.content).slice(0, MAX_CONTENT_CHARS);
      return res.json({ path: file.file.relative, name: path.basename(file.file.absolute), ext, size: file.size, content, truncated: content.length >= MAX_CONTENT_CHARS });
    } catch (error) {
      if (error instanceof Error && error.message === 'path is not a file') return res.status(400).json({ error: error.message });
      if (error instanceof Error && error.message === 'file too large') return res.status(413).json({ error: `file too large (>${MAX_FILE_SIZE / 1024}KB)` });
      if (error instanceof Error && (error.message === 'path does not exist' || error.message.includes('symlink'))) return res.status(400).json({ error: error.message });
      return res.status(500).json({ error: 'failed to read file' });
    }
  });
  return router;
}
