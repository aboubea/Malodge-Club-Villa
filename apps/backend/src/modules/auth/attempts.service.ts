import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Limits on public endpoints (login, password reset, sign-up), kept in the database
 * (AuditLog) so that they hold across the server's parallel instances.
 *
 *  - login: 5 failures for one e-mail, or 20 from one address, in 15 minutes lock
 *    the login for the rest of that time (a success clears the e-mail's count);
 *  - password reset: 3 requests per e-mail and 10 per address per hour;
 *  - sign-up: 5 per address per hour.
 */
export const LIMITS = {
  login: { windowMs: 15 * 60_000, perEmail: 5, perIp: 20 },
  reset: { windowMs: 60 * 60_000, perEmail: 3, perIp: 10 },
  signup: { windowMs: 60 * 60_000, perIp: 5 },
};

export const ACTIONS = {
  loginFailed: 'LOGIN_FAILED',
  loginSucceeded: 'LOGIN_SUCCESS',
  reset: 'PASSWORD_RESET_REQUEST',
  signup: 'SIGNUP',
} as const;

export interface Client {
  ip: string | null;
  userAgent: string | null;
}

/** The caller's address, as given by the platform's proxy (Vercel sets it, clients cannot). */
export function clientOf(req: { headers: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string } }): Client {
  const h = (k: string) => {
    const v = req.headers[k];
    return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() || null;
  };
  return {
    ip: h('x-vercel-forwarded-for') ?? h('x-real-ip') ?? h('x-forwarded-for') ?? req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: h('user-agent')?.slice(0, 300) ?? null,
  };
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
const tooMany = (message: string) => new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message, error: 'Too Many Requests' }, HttpStatus.TOO_MANY_REQUESTS);

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService) {}

  private record(action: string, key: string, client: Client, userId?: string | null) {
    return this.prisma.auditLog.create({
      data: { action, entity: 'auth', entityId: key, ipAddress: client.ip, userAgent: client.userAgent, userId: userId ?? null },
    });
  }

  /** Dates of `action` in the window, oldest first. */
  private async times(action: string, where: { entityId?: string; ipAddress?: string }, since: Date) {
    const rows = await this.prisma.auditLog.findMany({ where: { action, ...where, createdAt: { gt: since } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => r.createdAt.getTime());
  }

  /** Throws 429 when `count` attempts already happened in the window (the message says until when). */
  private check(times: number[], max: number, windowMs: number, what: string) {
    if (times.length < max) return;
    // Unlocked when enough of them leave the window.
    const until = times[times.length - max] + windowMs;
    throw tooMany(`${what} Réessayez dans ${minutes(until - Date.now())} minute${minutes(until - Date.now()) > 1 ? 's' : ''}.`);
  }

  async assertLoginAllowed(email: string, client: Client) {
    const { windowMs, perEmail, perIp } = LIMITS.login;
    const since = new Date(Date.now() - windowMs);
    const lastSuccess = await this.prisma.auditLog.findFirst({
      where: { action: ACTIONS.loginSucceeded, entityId: email, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const [byEmail, byIp] = await Promise.all([
      this.times(ACTIONS.loginFailed, { entityId: email }, lastSuccess?.createdAt ?? since),
      client.ip ? this.times(ACTIONS.loginFailed, { ipAddress: client.ip }, since) : Promise.resolve([]),
    ]);
    this.check(byEmail, perEmail, windowMs, 'Trop de tentatives de connexion pour ce compte.');
    this.check(byIp, perIp, windowMs, 'Trop de tentatives de connexion depuis cette adresse.');
  }

  loginFailed(email: string, client: Client) {
    return this.record(ACTIONS.loginFailed, email, client);
  }

  loginSucceeded(email: string, client: Client, userId: string) {
    return this.record(ACTIONS.loginSucceeded, email, client, userId);
  }

  /** False when too many reset e-mails were asked for: the request is then silently ignored. */
  async resetAllowed(email: string, client: Client): Promise<boolean> {
    const { windowMs, perEmail, perIp } = LIMITS.reset;
    const since = new Date(Date.now() - windowMs);
    const [byEmail, byIp] = await Promise.all([
      this.times(ACTIONS.reset, { entityId: email }, since),
      client.ip ? this.times(ACTIONS.reset, { ipAddress: client.ip }, since) : Promise.resolve([]),
    ]);
    if (byEmail.length >= perEmail || byIp.length >= perIp) return false;
    await this.record(ACTIONS.reset, email, client);
    return true;
  }

  async assertSignupAllowed(email: string, client: Client) {
    const { windowMs, perIp } = LIMITS.signup;
    if (client.ip) this.check(await this.times(ACTIONS.signup, { ipAddress: client.ip }, new Date(Date.now() - windowMs)), perIp, windowMs, 'Trop de créations de compte depuis cette adresse.');
    await this.record(ACTIONS.signup, email, client);
  }

  /** Login failures of the last 24 h and accounts locked right now (for the health panel). */
  async summary() {
    const { windowMs, perEmail } = LIMITS.login;
    const [failures24h, recent] = await Promise.all([
      this.prisma.auditLog.count({ where: { action: ACTIONS.loginFailed, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
      this.prisma.auditLog.groupBy({
        by: ['entityId'],
        where: { action: ACTIONS.loginFailed, createdAt: { gt: new Date(Date.now() - windowMs) } },
        _count: { _all: true },
      }),
    ]);
    return { loginFailures24h: failures24h, lockedAccounts: recent.filter((r) => r._count._all >= perEmail).map((r) => r.entityId) };
  }
}
