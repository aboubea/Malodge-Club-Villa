import { SetMetadata } from '@nestjs/common';
import { Role } from '@malodge/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Opens a controller or handler to the restricted roles (OWNER, EMPLOYEE).
 * Those roles are denied everywhere else, so endpoints that assume
 * "not a client = staff" never leak data to them.
 */
export const RESTRICTED_ROLES_KEY = 'restrictedRolesAllowed';
export const AllowRestrictedRoles = () => SetMetadata(RESTRICTED_ROLES_KEY, true);
