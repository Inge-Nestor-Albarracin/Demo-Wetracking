import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { createE2eApp, createTestUser, uniqueSuffix } from './support/e2e.js';

// Assets of the RFID Demo. Only test users and assets with this run's suffix
// are created, and they are removed by id at the end.
describe('Assets (e2e)', () => {
  const suffix = uniqueSuffix();
  const epc = (n: number) => `E2E${suffix}${n.toString(16).toUpperCase().padStart(4, '0')}`;
  const category = `E2E Categoría ${suffix}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: { id: string; headers: Record<string, string> };
  let operator: { id: string; headers: Record<string, string> };

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    admin = await createTestUser(app, 'ADMIN', suffix);
    operator = await createTestUser(app, 'OPERATOR', suffix);
  });

  afterAll(async () => {
    if (prisma) {
      const users = [admin?.id, operator?.id].filter(Boolean) as string[];
      await prisma.asset.deleteMany({ where: { createdById: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });

  it('requires a session', async () => {
    await http().get('/assets').expect(401);
    await http().post('/assets').send({ epc: epc(1), name: 'X' }).expect(401);
  });

  it('OPERATOR registers an asset; EPC is normalized and the creator comes from the session', async () => {
    const res = await http()
      .post('/assets')
      .set(operator.headers)
      .send({ epc: `  ${epc(1).toLowerCase()} `, name: '  Computador de prueba  ', category, location: '  ', createdById: admin.id })
      .expect(400); // createdById is not accepted from the body
    expect(res.body.message.join(' ')).toMatch(/createdById/);

    const ok = await http()
      .post('/assets')
      .set(operator.headers)
      .send({ epc: `  ${epc(1).toLowerCase()} `, name: '  Computador de prueba  ', category, location: '  ' })
      .expect(201);
    expect(ok.body).toMatchObject({
      epc: epc(1), name: 'Computador de prueba', category, location: null, active: true,
      createdBy: { id: operator.id },
    });

    const detail = await http().get(`/assets/${ok.body.id}`).set(operator.headers).expect(200);
    expect(detail.body.epc).toBe(epc(1));
    await http().get(`/assets/by-epc/${epc(1).toLowerCase()}`).set(operator.headers).expect(200);
  });

  it('rejects invalid data', async () => {
    for (const bad of [
      { epc: '', name: 'Sin EPC' },
      { epc: 'ABC 123', name: 'Con espacio' },
      { epc: epc(2), name: '   ' },
      { epc: epc(2) },
    ]) {
      await http().post('/assets').set(operator.headers).send(bad).expect(400);
    }
  });

  it('a duplicated EPC answers 409 with the existing asset and does not overwrite it', async () => {
    const res = await http()
      .post('/assets')
      .set(admin.headers)
      .send({ epc: epc(1), name: 'Intento de sobrescribir' })
      .expect(409);
    expect(res.body.existingAsset).toMatchObject({ name: 'Computador de prueba' });
    const row = await prisma.asset.findUniqueOrThrow({ where: { epc: epc(1) } });
    expect(row.name).toBe('Computador de prueba');
  });

  it('two simultaneous requests with the same EPC: one asset and one controlled conflict', async () => {
    const send = () => http().post('/assets').set(operator.headers).send({ epc: epc(3), name: 'Doble clic', category });
    const statuses = (await Promise.all([send(), send(), send()])).map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409, 409]);
    expect(await prisma.asset.count({ where: { epc: epc(3) } })).toBe(1);
  });

  it('different assets may share a name', async () => {
    await http().post('/assets').set(operator.headers).send({ epc: epc(4), name: 'Silla', category }).expect(201);
    await http().post('/assets').set(operator.headers).send({ epc: epc(5), name: 'Silla', category }).expect(201);
  });

  it('only ADMIN edits and deactivates; deactivating keeps the record', async () => {
    const asset = await prisma.asset.findUniqueOrThrow({ where: { epc: epc(5) } });
    await http().patch(`/assets/${asset.id}`).set(operator.headers).send({ location: 'Bodega' }).expect(403);
    await http().patch(`/assets/${asset.id}/active`).set(operator.headers).send({ active: false }).expect(403);

    const edited = await http()
      .patch(`/assets/${asset.id}`)
      .set(admin.headers)
      .send({ location: '  Bodega  ', description: '' })
      .expect(200);
    expect(edited.body).toMatchObject({ epc: epc(5), name: 'Silla', location: 'Bodega', description: null });
    await http().patch(`/assets/${asset.id}`).set(admin.headers).send({ name: '  ' }).expect(400);
    await http().patch(`/assets/${asset.id}`).set(admin.headers).send({ name: null }).expect(400);
    await http().patch(`/assets/${asset.id}`).set(admin.headers).send({ epc: epc(9) }).expect(400);

    const off = await http().patch(`/assets/${asset.id}/active`).set(admin.headers).send({ active: false }).expect(200);
    expect(off.body.active).toBe(false);
    expect(await prisma.asset.count({ where: { id: asset.id } })).toBe(1);
  });

  it('resolving reads is read-only: inactive assets keep their status and unknown EPCs are not registered', async () => {
    const before = await prisma.asset.findMany({ where: { category }, orderBy: { id: 'asc' } });
    const res = await http()
      .post('/assets/resolve')
      .set(operator.headers)
      .send({ epcs: [epc(1), epc(1).toLowerCase(), epc(5), epc(0xff)] })
      .expect(200);
    expect(res.body.found.map((a: { epc: string }) => a.epc).sort()).toEqual([epc(1), epc(5)].sort());
    expect(res.body.found.find((a: { epc: string }) => a.epc === epc(5)).active).toBe(false);
    expect(res.body.unknown).toEqual([epc(0xff)]);
    expect(await prisma.asset.count({ where: { epc: epc(0xff) } })).toBe(0);
    const after = await prisma.asset.findMany({ where: { category }, orderBy: { id: 'asc' } });
    expect(after).toEqual(before);

    await http().post('/assets/resolve').set(operator.headers).send({ epcs: [] }).expect(400);
    await http()
      .post('/assets/resolve')
      .set(operator.headers)
      .send({ epcs: Array.from({ length: 201 }, (_, i) => epc(i)) })
      .expect(400);
  });

  it('filters on the whole table with consistent totals and pagination', async () => {
    const list = (query: string) => http().get(`/assets?category=${encodeURIComponent(category)}&${query}`).set(operator.headers).expect(200);

    const all = await list('pageSize=2&page=1');
    expect(all.body.filtered).toEqual({ total: 4, active: 3, inactive: 1 });
    expect(all.body.items).toHaveLength(2);
    expect(all.body.totalPages).toBe(2);
    const second = await list('pageSize=2&page=2');
    const ids = [...all.body.items, ...second.body.items].map((a: { id: string }) => a.id);
    expect(new Set(ids).size).toBe(4);
    expect(all.body.totals.total).toBe(all.body.totals.active + all.body.totals.inactive);
    expect(all.body.totals.total).toBeGreaterThanOrEqual(4);

    const inactive = await list('status=inactive');
    expect(inactive.body.filtered).toEqual({ total: 1, active: 0, inactive: 1 });
    expect(inactive.body.items.map((a: { epc: string }) => a.epc)).toEqual([epc(5)]);

    const byName = await list('name=silla');
    expect(byName.body.filtered.total).toBe(2);
    const byEpc = await list(`epc=${epc(3).toLowerCase()}`);
    expect(byEpc.body.items.map((a: { epc: string }) => a.epc)).toEqual([epc(3)]);
    const byLocation = await list('location=bodega');
    expect(byLocation.body.filtered.total).toBe(1);

    await http().get('/assets?pageSize=101').set(operator.headers).expect(400);
    await http().get('/assets?status=deleted').set(operator.headers).expect(400);
  });
});
