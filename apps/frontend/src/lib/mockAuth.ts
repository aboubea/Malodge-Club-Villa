// Demo mode: simulates a successful login when the backend is unreachable.
// Only active when VITE_DEMO_MODE=true is set at build time.

import { LoginResponseDto } from '@malodge/shared';

export const DEMO_CREDENTIALS = {
  email: 'superadmin@malodge.com',
  password: 'SuperAdmin2024!',
};

export const DEMO_USER: LoginResponseDto = {
  accessToken: 'demo-token',
  refreshToken: 'demo-refresh-token',
  user: {
    id: 'demo-superadmin',
    email: 'superadmin@malodge.com',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN' as any,
    isActive: true,
    phone: null,
    avatar: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
