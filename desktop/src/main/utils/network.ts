import * as net from 'net';

export function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function findFreePort(startPort: number, endPort: number): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    const free = await checkPortFree(port);
    if (free) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${startPort}-${endPort}`);
}
