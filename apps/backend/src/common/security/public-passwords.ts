import * as bcrypt from 'bcrypt';

/**
 * Passwords that are public (shown on the old login page, written in the code):
 * an account using one of them can be opened by anybody.
 */
export const PUBLIC_PASSWORDS = ['SuperAdmin2024!'];

export function isPublicPassword(password: string) {
  return PUBLIC_PASSWORDS.includes(password);
}

export async function usesPublicPassword(hash: string) {
  for (const p of PUBLIC_PASSWORDS) if (await bcrypt.compare(p, hash).catch(() => false)) return true;
  return false;
}
