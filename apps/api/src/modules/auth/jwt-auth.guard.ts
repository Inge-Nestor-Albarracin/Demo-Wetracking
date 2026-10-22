import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { PUBLIC_KEY } from './auth.metadata.js';
import type { AuthenticatedRequest } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ])) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = typeof authorization === 'string'
      ? /^Bearer\s+(\S+)$/i.exec(authorization)
      : null;
    const token = match?.[1];
    if (!token) throw new UnauthorizedException('Debes iniciar sesión');

    let claims: { sub?: unknown; exp?: unknown };
    try {
      claims = await this.jwt.verifyAsync<{ sub?: unknown; exp?: unknown }>(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
      throw new UnauthorizedException('Sesión inválida');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true, name: true, email: true, role: true,
        active: true,
      },
    });
    if (!user?.active) throw new UnauthorizedException('La sesión ya no está habilitada');
    request.user = user;
    return true;
  }
}
