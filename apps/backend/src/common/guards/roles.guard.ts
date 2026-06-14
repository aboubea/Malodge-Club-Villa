import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@mahodge/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

const roleHierarchy: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 5,
  [Role.ADMIN]: 4,
  [Role.MANAGER]: 3,
  [Role.PROVIDER]: 2,
  [Role.CLIENT]: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Access denied');

    const userLevel = roleHierarchy[user.role as Role] || 0;
    const hasRole = requiredRoles.some(
      (role) => userLevel >= roleHierarchy[role],
    );

    if (!hasRole) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
