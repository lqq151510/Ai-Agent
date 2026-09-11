import * as fs from 'fs';
import * as path from 'path';
import type { DesktopSecrets } from './utils/secrets';

/**
 * Managed local backend runtime resolution.
 *
 * Two baselines can be packaged side by side:
 *
 * - `java`   — the historical Spring Boot `backend.jar` plus its bundled JRE.
 * - `python` — the FastAPI MVP shipped as a PyInstaller executable.
 *
 * Which one runs is decided by an **explicit** configuration, in this order:
 *
 * 1. `KD_BACKEND_RUNTIME` (development only; ignored in a packaged build so a
 *    user-controlled environment variable can never redirect a signed app).
 * 2. `backend-runtime.json`, written by the build and shipped as an
 *    extraResource.
 * 3. The default below.
 *
 * There is deliberately **no fallback**: when the selected runtime is
 * incomplete we report the missing artifacts instead of silently starting the
 * other baseline, otherwise a broken Python bundle would quietly change the
 * product's data path.
 */

export type BackendRuntimeKind = 'java' | 'python';

export const BACKEND_RUNTIME_CONFIG_FILENAME = 'backend-runtime.json';
export const BACKEND_RUNTIME_ENV_VAR = 'KD_BACKEND_RUNTIME';
export const PYTHON_BACKEND_PATH_ENV_VAR = 'KD_PYTHON_BACKEND_PATH';
export const DEFAULT_BACKEND_RUNTIME: BackendRuntimeKind = 'java';

export const JAVA_RUNTIME_DIRNAME = 'backend-jre';
export const PYTHON_RUNTIME_DIRNAME = 'backend-python';
export const PYTHON_BACKEND_EXECUTABLE = 'knowledge-desk-backend';

export type BackendLaunchContext = {
  port: number;
  dataDir: string;
  secrets: DesktopSecrets;
};

export type BackendRuntimeDescriptor = {
  kind: BackendRuntimeKind;
  /** Executable that will be spawned. */
  command: string;
  /** Arguments that depend on the live port / data directory / secrets. */
  resolveArgs: (context: BackendLaunchContext) => string[];
  /** Runtime specific environment; merged on top of the inherited process env. */
  resolveEnv: (context: BackendLaunchContext) => NodeJS.ProcessEnv;
  /** Artifacts that must exist before the runtime can be spawned. */
  requiredArtifacts: string[];
  describe: () => string;
};

export type BackendRuntimeResolution = {
  runtime: BackendRuntimeDescriptor;
  source: 'env' | 'build-config' | 'default';
  /** Human readable note for the desktop log; never contains secrets. */
  notice: string | null;
  /** Non-empty when the selected runtime is incomplete. */
  missingArtifacts: string[];
};

export type ResolveBackendRuntimeOptions = {
  resourceRoot: string;
  isPackaged: boolean;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

const JAVA_EXECUTABLE = (platform: NodeJS.Platform) => (platform === 'win32' ? 'java.exe' : 'java');

const PYTHON_EXECUTABLE = (platform: NodeJS.Platform) =>
  platform === 'win32' ? `${PYTHON_BACKEND_EXECUTABLE}.exe` : PYTHON_BACKEND_EXECUTABLE;

export function parseBackendRuntimeKind(value: unknown): BackendRuntimeKind | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'java' || normalized === 'python') {
    return normalized;
  }
  return null;
}

export function getJavaRuntimePaths(resourceRoot: string, platform: NodeJS.Platform = process.platform) {
  const runtimeDir = path.join(resourceRoot, JAVA_RUNTIME_DIRNAME);
  return {
    command: path.join(runtimeDir, 'jre', 'bin', JAVA_EXECUTABLE(platform)),
    jarPath: path.join(runtimeDir, 'backend.jar'),
  };
}

export function getPythonRuntimePaths(resourceRoot: string, platform: NodeJS.Platform = process.platform) {
  const runtimeDir = path.join(resourceRoot, PYTHON_RUNTIME_DIRNAME);
  return {
    command: path.join(runtimeDir, PYTHON_BACKEND_EXECUTABLE, PYTHON_EXECUTABLE(platform)),
    runtimeDir,
  };
}

export function getBackendRuntimeConfigPath(resourceRoot: string): string {
  return path.join(resourceRoot, BACKEND_RUNTIME_CONFIG_FILENAME);
}

export function readBackendRuntimeConfig(configPath: string): {
  kind: BackendRuntimeKind | null;
  notice: string | null;
} {
  if (!fs.existsSync(configPath)) {
    return { kind: null, notice: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { backendRuntime?: unknown };
    const kind = parseBackendRuntimeKind(parsed.backendRuntime);
    if (!kind) {
      return {
        kind: null,
        notice: `Ignoring ${path.basename(configPath)}: "backendRuntime" must be "java" or "python"`,
      };
    }
    return { kind, notice: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: null, notice: `Ignoring unreadable ${path.basename(configPath)}: ${message}` };
  }
}

export function createJavaRuntime(
  jrePath: string,
  jarPath: string,
  platform: NodeJS.Platform = process.platform,
): BackendRuntimeDescriptor {
  return {
    kind: 'java',
    command: jrePath,
    requiredArtifacts: [jrePath, jarPath],
    resolveArgs: ({ port, dataDir }) => [
      '-jar',
      jarPath,
      '--spring.profiles.active=desktop',
      `--server.port=${port}`,
      '--server.address=127.0.0.1',
      `--app.data-dir=${dataDir}`,
    ],
    resolveEnv: ({ secrets }) => ({
      SPRING_OUTPUT_ANSI_ENABLED: 'never',
      APP_DESKTOP_MODE: 'true',
      JWT_SECRET: secrets.jwtSecret,
      SECURITY_DB_ENCRYPTION_KEY: secrets.dbEncryptionKey,
    }),
    describe: () => `java (${path.basename(jrePath)} -jar ${path.basename(jarPath)})`,
  };
}

export function createPythonRuntime(
  executablePath: string,
  platform: NodeJS.Platform = process.platform,
): BackendRuntimeDescriptor {
  return {
    kind: 'python',
    command: executablePath,
    requiredArtifacts: [executablePath],
    // The Python backend is fully environment driven: no CLI arguments.
    resolveArgs: () => [],
    resolveEnv: ({ port, dataDir, secrets }) => ({
      KD_DATA_DIR: dataDir,
      KD_HOST: '127.0.0.1',
      KD_PORT: String(port),
      KD_DESKTOP_MODE: 'true',
      KD_JWT_SECRET: secrets.jwtSecret,
      KD_DB_ENCRYPTION_KEY: secrets.dbEncryptionKey,
      // Keep the log stream unbuffered so the desktop log tail stays live, and
      // avoid writing __pycache__ next to the bundled executable.
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    }),
    describe: () => `python (${path.basename(executablePath)})`,
  };
}

export function resolveBackendRuntime(options: ResolveBackendRuntimeOptions): BackendRuntimeResolution {
  const { resourceRoot, isPackaged } = options;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  let kind: BackendRuntimeKind | null = null;
  let source: BackendRuntimeResolution['source'] = 'default';
  let notice: string | null = null;

  const envOverride = parseBackendRuntimeKind(env[BACKEND_RUNTIME_ENV_VAR]);
  if (envOverride) {
    if (isPackaged) {
      notice = `Ignoring ${BACKEND_RUNTIME_ENV_VAR}: packaged builds use the bundled runtime config`;
    } else {
      kind = envOverride;
      source = 'env';
    }
  }

  if (!kind) {
    const configPath = getBackendRuntimeConfigPath(resourceRoot);
    const config = readBackendRuntimeConfig(configPath);
    if (config.notice) {
      notice = notice ? `${notice}; ${config.notice}` : config.notice;
    }
    if (config.kind) {
      kind = config.kind;
      source = 'build-config';
    }
  }

  if (!kind) {
    kind = DEFAULT_BACKEND_RUNTIME;
  }

  const runtime =
    kind === 'python'
      ? createPythonRuntime(resolvePythonExecutable(resourceRoot, isPackaged, env, platform), platform)
      : (() => {
          const javaPaths = getJavaRuntimePaths(resourceRoot, platform);
          return createJavaRuntime(javaPaths.command, javaPaths.jarPath, platform);
        })();

  const missingArtifacts = runtime.requiredArtifacts.filter((artifact) => !fs.existsSync(artifact));

  return { runtime, source, notice, missingArtifacts };
}

/**
 * A development checkout has no PyInstaller bundle yet, so an explicit path
 * override is accepted there only.
 */
function resolvePythonExecutable(
  resourceRoot: string,
  isPackaged: boolean,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string {
  const override = isPackaged ? undefined : env[PYTHON_BACKEND_PATH_ENV_VAR]?.trim();
  if (override) {
    return override;
  }
  return getPythonRuntimePaths(resourceRoot, platform).command;
}

export function describeMissingArtifacts(resolution: BackendRuntimeResolution): string | null {
  if (resolution.missingArtifacts.length === 0) {
    return null;
  }
  return (
    `Selected backend runtime "${resolution.runtime.kind}" is incomplete; ` +
    `missing: ${resolution.missingArtifacts.join(', ')}`
  );
}
