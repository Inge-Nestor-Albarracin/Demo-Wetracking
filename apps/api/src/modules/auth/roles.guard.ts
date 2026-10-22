import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../generated/prisma/client.js';
import { PUBLIC_KEY, ROLES_KEY } from './auth.metadata.js';
import type { AuthenticatedRequest } from './auth.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException('Debes iniciar sesión');
    const allowed = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    if (allowed) {
      if (allowed.includes(request.user.role)) return true;
    } else {
      // Routes without @Roles: reads for any authenticated user,
      // writes only for administrators.
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
      if (request.user.role === 'ADMIN') return true;
    }
    throw new ForbiddenException('No tienes permisos para esta operación');
  }
}
