import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client.js';

export const PUBLIC_KEY = 'solaluminios.public';
export const ROLES_KEY = 'solaluminios.roles';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
