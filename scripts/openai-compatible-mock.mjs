#!/usr/bin/env node

import http from 'node:http';

const host = process.env.MOCK_OPENAI_HOST || '0.0.0.0';
const port = Number(process.env.MOCK_OPENAI_PORT || 18081);
const model = process.env.MOCK_OPENAI_MODEL || 'qwen/qwen3.5-9b';

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'smoke ok' } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    sendJson(res, 200, {
      object: 'list',
      data: [{ id: model, object: 'model', owned_by: 'local-smoke' }]
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const rawBody = await collectBody(req);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    if (payload.stream) {
      sendStream(res);
      return;
    }

    sendJson(res, 200, {
      id: 'chatcmpl-smoke',
      object: 'chat.completion',
      model: payload.model || model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'smoke ok' },
        finish_reason: 'stop'
      }]
    });
    return;
  }

  sendJson(res, 404, { error: { message: `No mock route for ${req.method} ${url.pathname}` } });
});

server.listen(port, host, () => {
  console.log(`[openai-mock] listening on http://${host}:${port}/v1 with model ${model}`);
});
