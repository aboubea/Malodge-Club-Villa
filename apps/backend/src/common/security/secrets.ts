import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Secrets that sign sessions (JWT) and links sent to providers.
 *
 * They come from JWT_SECRET / JWT_REFRESH_SECRET. If one is missing or is a
 * well-known placeholder ("default-secret"…), anybody could sign an admin session
 * with it: a secret is then derived from DATABASE_URL instead (private to the
 * server), and the configuration check reports it so it gets set properly.
 */
const PLACEHOLDERS = new Set(['default-secret', 'default-refresh-secret', 'secret', 'changeme', 'change-me', 'your-secret', 'jwt-secret']);

type Kind = 'access' | 'refresh';
const VARIABLE: Record<Kind, string> = { access: 'JWT_SECRET', refresh: 'JWT_REFRESH_SECRET' };

function configured(kind: Kind): string | null {
  const v = (process.env[VARIABLE[kind]] ?? '').trim();
  return v && !PLACEHOLDERS.has(v.toLowerCase()) ? v : null;
}

export function appSecret(kind: Kind): string {
  const v = configured(kind);
  if (v) return v;
  const seed = process.env.DATABASE_URL || process.env.VERCEL_PROJECT_ID || '';
  if (!seed) throw new Error(`${VARIABLE[kind]} manquante : impossible de signer les sessions en sécurité.`);
  return createHash('sha256').update(`malodge:${kind}:${seed}`).digest('hex');
}

/** Whether each secret is set in the environment ("derived" = to be configured). */
export function secretsStatus() {
  return { jwtSecret: configured('access') ? 'configured' : 'derived', jwtRefreshSecret: configured('refresh') ? 'configured' : 'derived' } as const;
}

/** Signature of a link (e.g. a provider accepting an order): only the server can make one. */
export function signLink(payload: string): string {
  return createHmac('sha256', appSecret('access')).update(`link:${payload}`).digest('base64url').slice(0, 32);
}

export function verifyLink(payload: string, signature: string | null | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signLink(payload));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
