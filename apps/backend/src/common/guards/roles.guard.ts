import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@malodge/shared';
import { ROLES_KEY, RESTRICTED_ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const roleHierarchy: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 5,
  [Role.ADMIN]: 4,
  [Role.MANAGER]: 3,
  [Role.PROVIDER]: 2,
  [Role.CLIENT]: 1,
  // Restricted roles: no implicit access, see RESTRICTED_ROLES below.
  [Role.OWNER]: 0,
  [Role.EMPLOYEE]: 0,
};

const RESTRICTED_ROLES = new Set<string>([Role.OWNER, Role.EMPLOYEE]);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requestUser = context.switchToHttp().getRequest().user;
    if (requestUser && RESTRICTED_ROLES.has(requestUser.role)) {
      const allowed = this.reflector.getAllAndOverride<boolean>(RESTRICTED_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) throw new ForbiddenException('Insufficient permissions');
      return true;
    }

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
