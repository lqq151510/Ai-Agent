import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Desktop 本地密钥管理。
 *
 * 首次启动时生成随机 JWT secret 与数据库加密密钥，持久化到 dataDir/secrets.json（权限 0600）。
 * 后续启动复用已有密钥，避免令牌失效或数据库字段无法解密。
 */

export interface DesktopSecrets {
  /** JWT 签名密钥，base64url 编码的 48 字节随机数。 */
  jwtSecret: string;
  /** AES-256 数据库字段加密密钥，base64 编码的 32 字节随机数。 */
  dbEncryptionKey: string;
}

const SECRETS_FILE = 'secrets.json';

/**
 * 读取或生成 Desktop 运行所需的本地密钥。
 *
 * 文件权限固定为 0600，仅当前用户可读写。若文件已存在且内容合法则复用，
 * 否则重新生成（生成后会覆盖旧文件并修复权限）。
 */
export function ensureDesktopSecrets(dataDir: string): DesktopSecrets {
  const secretsPath = path.join(dataDir, SECRETS_FILE);

  const existing = readExisting(secretsPath);
  if (existing) {
    return existing;
  }

  const secrets: DesktopSecrets = {
    jwtSecret: crypto.randomBytes(48).toString('base64url'),
    dbEncryptionKey: crypto.randomBytes(32).toString('base64'),
  };

  fs.mkdirSync(dataDir, { recursive: true });
  // 先写入再收紧权限，避免在已有文件上 mode 被.umask 削弱
  const tmpPath = `${secretsPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(secrets, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.chmodSync(tmpPath, 0o600);
  fs.renameSync(tmpPath, secretsPath);
  fs.chmodSync(secretsPath, 0o600);

  return secrets;
}

function readExisting(secretsPath: string): DesktopSecrets | null {
  try {
    const content = fs.readFileSync(secretsPath, 'utf8');
    const parsed = JSON.parse(content) as Partial<DesktopSecrets>;
    if (typeof parsed.jwtSecret === 'string' && parsed.jwtSecret.length >= 32
      && typeof parsed.dbEncryptionKey === 'string' && parsed.dbEncryptionKey.length >= 32) {
      // 顺手修复权限，防止历史文件权限过宽
      try {
        fs.chmodSync(secretsPath, 0o600);
      } catch {
        // 忽略权限修复失败
      }
      return { jwtSecret: parsed.jwtSecret, dbEncryptionKey: parsed.dbEncryptionKey };
    }
    return null;
  } catch {
    return null;
  }
}
