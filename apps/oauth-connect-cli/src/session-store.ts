import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { OauthDelegatedTokenSet } from '@shodai-network/agreements-api-client/oauth';

export type StoredOauthSession = {
  clientId: string;
  issuer: string;
  apiBaseUrl: string;
  tokens: OauthDelegatedTokenSet;
  updatedAt: string;
};

export function defaultSessionPath(): string {
  if (process.env.SHODAI_OAUTH_SESSION_PATH?.trim()) {
    return process.env.SHODAI_OAUTH_SESSION_PATH.trim();
  }
  return join(homedir(), '.config', 'shodai', 'oauth-session.json');
}

export function loadSession(path = defaultSessionPath()): StoredOauthSession | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StoredOauthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredOauthSession, path = defaultSessionPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload: StoredOauthSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

export function clearSession(path = defaultSessionPath()): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
