import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { createE2eApp, createTestUser, uniqueSuffix } from './support/e2e.js';

// User administration used by the "Administración" screen: create users with
// a role and change roles later. Only test users are touched.
describe('User administration (e2e)', () => {
  const suffix = uniqueSuffix().toLowerCase();
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: { id: string; headers: Record<string, string> };
  let warehouse: { id: string; headers: Record<string, string> };
  const created: string[] = [];

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    admin = await createTestUser(app, 'ADMIN', suffix);
    warehouse = await createTestUser(app, 'WAREHOUSE', suffix);
    created.push(admin.id, warehouse.id);
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: created } } });
    await app?.close();
  });

  it('ADMIN creates a user with a role; the response never includes the password', async () => {
    const password = randomBytes(12).toString('base64url');
    const res = await http()
      .post('/users')
      .set(admin.headers)
      .send({ name: '  Ana Ventas  ', email: ` E2E-Ana-${suffix}@TEST.local `, password, role: 'SALES' })
      .expect(201);
    created.push(res.body.id);
    expect(res.body).toMatchObject({ name: 'Ana Ventas', email: `e2e-ana-${suffix}@test.local`, role: 'SALES', active: true });
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/i);

    // The new account can log in with the password chosen by the admin.
    const login = await http().post('/auth/login').send({ email: `e2e-ana-${suffix}@test.local`, password }).expect(200);
    expect(login.body.user.role).toBe('SALES');

    await http()
      .post('/users')
      .set(admin.headers)
      .send({ name: 'Duplicado', email: `e2e-ana-${suffix}@test.local`, password, role: 'SALES' })
      .expect(409);
    for (const bad of [
      { name: 'Corta', email: `e2e-c-${suffix}@test.local`, password: 'corta', role: 'SALES' },
      { name: 'Rol', email: `e2e-r-${suffix}@test.local`, password, role: 'JEFE' },
      { name: '', email: `e2e-v-${suffix}@test.local`, password },
      { name: 'Correo', email: 'no-es-correo', password },
    ]) {
      await http().post('/users').set(admin.headers).send(bad).expect(400);
    }
  });

  it('ADMIN changes the role of another user; it applies to the existing session', async () => {
    const target = await createTestUser(app, 'READ_ONLY', `${suffix}t`);
    created.push(target.id);
    await http().post('/inventory/bundles/batch').set(target.headers).send({}).expect(403);

    const res = await http().patch(`/users/${target.id}/role`).set(admin.headers).send({ role: 'WAREHOUSE' }).expect(200);
    expect(res.body.role).toBe('WAREHOUSE');
    // Same token, new permissions: the guard reads the role on every request.
    const me = await http().get('/auth/me').set(target.headers).expect(200);
    expect(me.body.role).toBe('WAREHOUSE');
    await http().post('/inventory/bundles/batch').set(target.headers).send({}).expect(400);

    await http().patch(`/users/${target.id}/role`).set(admin.headers).send({ role: 'JEFE' }).expect(400);
    await http().patch(`/users/${target.id}/role`).set(admin.headers).send({}).expect(400);
    await http().patch(`/users/missing-${suffix}/role`).set(admin.headers).send({ role: 'SALES' }).expect(404);
  });

  it('nobody changes their own role and only ADMIN manages users', async () => {
    await http().patch(`/users/${admin.id}/role`).set(admin.headers).send({ role: 'READ_ONLY' }).expect(400);
    await http().patch(`/users/${admin.id}/role`).set(warehouse.headers).send({ role: 'READ_ONLY' }).expect(403);
    await http().patch(`/users/${warehouse.id}/role`).set(warehouse.headers).send({ role: 'ADMIN' }).expect(403);
    await http().get('/users').set(warehouse.headers).expect(403);
    await http()
      .post('/users')
      .set(warehouse.headers)
      .send({ name: 'X', email: `e2e-x-${suffix}@test.local`, password: randomBytes(12).toString('base64url') })
      .expect(403);
    await http().patch(`/users/${admin.id}/role`).send({ role: 'READ_ONLY' }).expect(401);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: warehouse.id } });
    expect(row.role).toBe('WAREHOUSE');
  });
});
