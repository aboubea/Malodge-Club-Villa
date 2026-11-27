import { describe, expect, it } from 'vitest';
import { AuthController } from './auth.controller';

describe('accounts by invitation only', () => {
  it('has no public sign-up', () => {
    expect((AuthController.prototype as unknown as Record<string, unknown>).register).toBeUndefined();
  });
});
