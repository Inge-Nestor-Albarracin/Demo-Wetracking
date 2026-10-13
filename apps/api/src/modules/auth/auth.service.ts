import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password.js';
import type { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  // Apply the same password work when the account does not exist.
  private readonly dummyHash = hashPassword('Dummy-account-never-used-for-login');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = await verifyPassword(dto.password, user?.passwordHash ?? await this.dummyHash);
    if (!user || !user.active || !valid) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    const token = await this.jwt.signAsync({ sub: user.id });
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        defaultInventoryLocationId: user.defaultInventoryLocationId,
      },
    };
  }
}
