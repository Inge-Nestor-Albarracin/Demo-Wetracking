import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import type { UserRole } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { hashPassword } from '../../src/infrastructure/security/password.js';

// e2e tests run against the local database configured in apps/api/.env.
// They never use the real administrator: each test file creates temporary
// users with a random, discarded password and signs their tokens in-process
// with the application's JwtService. Tokens are never printed.

export function uniqueSuffix(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export async function createE2eApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

export async function createTestUser(
  app: INestApplication,
  role: UserRole,
  suffix: string,
): Promise<{ id: string; headers: Record<string, string> }> {
  const prisma = app.get(PrismaService);
  const user = await prisma.user.create({
    data: {
      name: `E2E ${role} ${suffix}`,
      email: `e2e-${role.toLowerCase()}-${suffix.toLowerCase()}@test.local`,
      passwordHash: await hashPassword(randomBytes(24).toString('hex')),
      role,
    },
  });
  const token = await app.get(JwtService).signAsync({ sub: user.id });
  return { id: user.id, headers: { Authorization: `Bearer ${token}` } };
}
