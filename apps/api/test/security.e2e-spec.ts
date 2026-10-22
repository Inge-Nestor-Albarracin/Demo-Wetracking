import { randomBytes } from 'node:crypto';
import { HttpException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hashPassword } from '../src/infrastructure/security/password.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { createE2eApp, createTestUser, uniqueSuffix } from './support/e2e.js';

interface Fixtures {
  prisma: PrismaService;
  userIds: Record<'ADMIN' | 'OPERATOR', string>;
  headers: Record<'ADMIN' | 'OPERATOR', Record<string, string>>;
}

// Security fixes from the audit of 15/10/2026.
describe('Security hardening (e2e)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let fx: Fixtures;
  const extraUsers: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    const admin = await createTestUser(app, 'ADMIN', suffix);
    const operator = await createTestUser(app, 'OPERATOR', suffix);
    fx = {
      prisma: app.get(PrismaService),
      userIds: { ADMIN: admin.id, OPERATOR: operator.id },
      headers: { ADMIN: admin.headers, OPERATOR: operator.headers },
    };
    extraUsers.push(admin.id, operator.id);
  });

  afterAll(async () => {
    if (fx) await fx.prisma.user.deleteMany({ where: { id: { in: extraUsers } } });
    await app?.close();
  });

  it('deactivating an account rejects its already-issued token on the next request', async () => {
    const server = app.getHttpServer();
    const operatorId = fx.userIds.OPERATOR;
    await request(server).get('/auth/me').set(fx.headers.OPERATOR).expect(200);

    await request(server)
      .patch(`/users/${operatorId}/active`)
      .set(fx.headers.ADMIN)
      .send({ active: false })
      .expect(200);
    // Same token, no new login: the guard re-reads `active` on every request.
    const rejected = await request(server).get('/auth/me').set(fx.headers.OPERATOR).expect(401);
    expect(rejected.body.message).toBe('La sesión ya no está habilitada');
    await request(server).get('/assets').set(fx.headers.OPERATOR).expect(401);

    // Known limit (documented): reactivating within the token lifetime (1 h)
    // makes that same token valid again; there is no per-token revocation.
    await request(server)
      .patch(`/users/${operatorId}/active`)
      .set(fx.headers.ADMIN)
      .send({ active: true })
      .expect(200);
    await request(server).get('/auth/me').set(fx.headers.OPERATOR).expect(200);
  });

  it('sends defensive headers and hides the framework', async () => {
    for (const res of [
      await request(app.getHttpServer()).get('/assets').set(fx.headers.ADMIN),
      await request(app.getHttpServer()).get('/assets'),
    ]) {
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('locks an account after 5 failed logins, even with the right password', async () => {
    const password = randomBytes(12).toString('base64url');
    const email = `e2e-lock-${suffix.toLowerCase()}@test.local`;
    const user = await fx.prisma.user.create({
      data: { name: 'E2E lock', email, passwordHash: await hashPassword(password), role: 'OPERATOR' },
    });
    extraUsers.push(user.id);
    // Called on the service: the per-IP throttler (5/min on /auth/login)
    // would otherwise answer 429 first and hide the per-account rule.
    const auth = app.get(AuthService);
    const status = async (pwd: string) => {
      try {
        await auth.login({ email, password: pwd });
        return 200;
      } catch (error) {
        return error instanceof HttpException ? error.getStatus() : 500;
      }
    };

    expect(await status(password)).toBe(200);
    for (let i = 0; i < 5; i += 1) expect(await status('wrong-password')).toBe(401);
    expect(await status(password)).toBe(429);
    // Unknown emails are counted the same way (no account enumeration).
    const ghost = `e2e-ghost-${suffix.toLowerCase()}@test.local`;
    for (let i = 0; i < 5; i += 1) {
      await auth.login({ email: ghost, password: 'x' }).catch(() => undefined);
    }
    await expect(auth.login({ email: ghost, password: 'x' })).rejects.toMatchObject({ status: 429 });
  }, 60000);
});
