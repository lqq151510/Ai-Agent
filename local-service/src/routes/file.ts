import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const fileRouter = Router();

const MAX_FILE_SIZE = 200 * 1024; // 200 KB hard limit
const MAX_CONTENT_CHARS = 50_000;

// Patterns to redact sensitive lines
const REDACT_LINE_RE = /(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)/i;

function sanitize(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]+/g, 'sk-[redacted]')
    .split('\n')
    .map(line => (REDACT_LINE_RE.test(line) ? '[redacted sensitive line]' : line))
    .join('\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u4E00-\u9FFF\u3000-\u303F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

// Allowed binary/media extensions we refuse to serve as text
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.mov', '.avi',
  '.woff', '.woff2', '.ttf', '.eot',
  '.jar', '.class',
]);

// GET /file?path=<absolute-file-path>
fileRouter.get('/', (req, res) => {
  const filePath = req.query['path'] as string;

  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();

  if (BINARY_EXT.has(ext)) {
    return res.status(415).json({ error: 'binary file type not supported for text read' });
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'file not found' });
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return res.status(400).json({ error: 'path is not a file' });
  }

  if (stat.size > MAX_FILE_SIZE) {
    return res.status(413).json({ error: `file too large (>${MAX_FILE_SIZE / 1024}KB)` });
  }

  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    const content = sanitize(raw).slice(0, MAX_CONTENT_CHARS);
    return res.json({
      path: resolved,
      name: path.basename(resolved),
      ext,
      size: stat.size,
      content,
      truncated: content.length >= MAX_CONTENT_CHARS,
    });
  } catch (err) {
    return res.status(500).json({ error: 'failed to read file', detail: String(err) });
  }
});
