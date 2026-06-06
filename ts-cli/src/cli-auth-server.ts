import { createServer, Server } from 'node:http';
import { URL } from 'node:url';

export interface CliLoginResult {
  accessToken: string;
  refreshToken: string;
}

export function startAuthServer(): Promise<{ port: number; waitResult: Promise<CliLoginResult> }> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer();
    
    const waitResult = new Promise<CliLoginResult>((resolveResult, rejectResult) => {
      server.on('request', (req, res) => {
        // Handle CORS preflight
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.url && req.url.startsWith('/callback')) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const accessToken = url.searchParams.get('accessToken');
          const refreshToken = url.searchParams.get('refreshToken');

          if (accessToken && refreshToken) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Login successful! You can close this window and return to your terminal.');
            server.close(() => {
              resolveResult({ accessToken, refreshToken });
            });
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Missing tokens in callback URL.');
            server.close(() => {
              rejectResult(new Error('Missing tokens in callback URL'));
            });
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve({
          port: address.port,
          waitResult
        });
      } else {
        reject(new Error('Failed to get server port'));
      }
    });
  });
}
