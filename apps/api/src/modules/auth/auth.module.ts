import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
          throw new Error('Configura JWT_SECRET con un secreto aleatorio de al menos 32 caracteres');
        }
        return {
          secret,
          signOptions: {
            algorithm: 'HS256' as const,
            expiresIn: '1h' as const,
            issuer: 'rfid-demo-api',
            audience: 'rfid-demo-web',
          },
          verifyOptions: {
            algorithms: ['HS256' as const],
            issuer: 'rfid-demo-api',
            audience: 'rfid-demo-web',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
