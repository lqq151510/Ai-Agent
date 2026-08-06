export type LocalBackendEndpoint = {
  baseUrl: string;
  port: number;
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Parses the optional development-only backend attachment target.
 *
 * The Electron main process carries credentials and local file capabilities, so
 * this must never turn an environment variable into an arbitrary network
 * target.  Keep the contract deliberately narrow: plain HTTP and an exact
 * loopback host, with no credentials, path, query, or fragment.
 */
export function parseLocalBackendEndpoint(value: string): LocalBackendEndpoint {
  const configured = value.trim();
  if (!configured) {
    throw new Error('DESKTOP_BACKEND_URL must not be empty when it is set');
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('DESKTOP_BACKEND_URL must be a valid http:// loopback URL');
  }

  if (url.protocol !== 'http:') {
    throw new Error('DESKTOP_BACKEND_URL must use http://');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('DESKTOP_BACKEND_URL must point to 127.0.0.1, localhost, or [::1]');
  }
  if (url.username || url.password) {
    throw new Error('DESKTOP_BACKEND_URL must not contain credentials');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DESKTOP_BACKEND_URL must not contain a path, query, or fragment');
  }

  const port = url.port ? Number.parseInt(url.port, 10) : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('DESKTOP_BACKEND_URL contains an invalid port');
  }

  return { baseUrl: url.origin, port };
}

export function getLocalBackendEndpoint(value = process.env.DESKTOP_BACKEND_URL): LocalBackendEndpoint | null {
  if (value === undefined) {
    return null;
  }
  return parseLocalBackendEndpoint(value);
}

export function localBackendRequestUrl(baseUrl: string, pathname: string): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error('Local backend request paths must begin with one slash');
  }
  return `${baseUrl.replace(/\/$/, '')}${pathname}`;
}
