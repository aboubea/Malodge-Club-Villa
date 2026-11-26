import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { appSecret, secretsStatus, signLink, verifyLink } from './secrets';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { fingerprint } from '../../modules/monitoring/monitoring.service';
import { clientOf } from '../../modules/auth/attempts.service';

afterEach(() => vi.unstubAllEnvs());

describe('session secrets', () => {
  it('uses JWT_SECRET when it is set', () => {
    vi.stubEnv('JWT_SECRET', 'a-long-random-value-0123456789');
    expect(appSecret('access')).toBe('a-long-random-value-0123456789');
    expect(secretsStatus().jwtSecret).toBe('configured');
  });

  it('never signs with a public placeholder such as "default-secret"', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@host/db');
    for (const placeholder of ['', 'default-secret', 'secret']) {
      vi.stubEnv('JWT_SECRET', placeholder);
      expect(appSecret('access')).not.toBe(placeholder);
      expect(appSecret('access')).toMatch(/^[0-9a-f]{64}$/);
      expect(secretsStatus().jwtSecret).toBe('derived');
    }
    // Access and refresh tokens never share a secret.
    vi.stubEnv('JWT_REFRESH_SECRET', '');
    expect(appSecret('refresh')).not.toBe(appSecret('access'));
  });
});

describe('signed provider links', () => {
  it('accepts the link made by the server only', () => {
    vi.stubEnv('JWT_SECRET', 'a-long-random-value-0123456789');
    const t = signLink('order123:accept');
    expect(verifyLink('order123:accept', t)).toBe(true);
    // Another action, another order, no signature or a guessed one: refused.
    expect(verifyLink('order123:reject', t)).toBe(false);
    expect(verifyLink('order124:accept', t)).toBe(false);
    expect(verifyLink('order123:accept', undefined)).toBe(false);
    expect(verifyLink('order123:accept', 'x'.repeat(t.length))).toBe(false);
  });
});

describe('caller address', () => {
  it('reads the address set by the platform', () => {
    expect(clientOf({ headers: { 'x-vercel-forwarded-for': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 1.2.3.4', 'user-agent': 'UA' } })).toEqual({ ip: '1.2.3.4', userAgent: 'UA' });
    expect(clientOf({ headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } }).ip).toBe('5.6.7.8');
  });
});

describe('incident journal', () => {
  it('groups the same error whatever the ids and numbers in it', () => {
    expect(fingerprint('api', 'Order clx8k2v0x0000qzrmabcdefgh not found', 'GET /orders/clx8k2v0x0000qzrmabcdefgh')).toBe(
      fingerprint('api', 'Order clx9zzzzz0000qzrmzyxwvuts not found', 'GET /orders/clx9zzzzz0000qzrmzyxwvuts'),
    );
    expect(fingerprint('api', 'Timeout after 30 s')).not.toBe(fingerprint('lodgify', 'Timeout after 30 s'));
  });

  function host(method = 'GET', url = '/finance/dashboard') {
    const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
    return { res, host: { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method, url }) }) } as any };
  }

  it('records server errors and answers normally', async () => {
    const monitoring = { report: vi.fn(async () => undefined) };
    const filter = new GlobalExceptionFilter(monitoring as any);
    const { res, host: h } = host();
    await filter.catch(new Error('Lodgify HTTP 500: boom'), h);
    expect(monitoring.report).toHaveBeenCalledWith('lodgify', 'Lodgify HTTP 500: boom', expect.objectContaining({ route: 'GET /finance/dashboard', status: 500 }));
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does not record user errors (not found, refused…)', async () => {
    const monitoring = { report: vi.fn(async () => undefined) };
    const { res, host: h } = host();
    await new GlobalExceptionFilter(monitoring as any).catch(new NotFoundException('Villa introuvable'), h);
    expect(monitoring.report).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
