import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { UserRole } from '../src/generated/prisma/client.js';
import { createE2eApp, uniqueSuffix } from './support/e2e.js';
import { createInventoryFixtures } from './support/inventory-fixtures.js';

type Fixtures = Awaited<ReturnType<typeof createInventoryFixtures>>;

// Final save of the registration queue: POST /inventory/bundles/batch.
describe('Inventory batch registration (e2e)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let fx: Fixtures;
  let counter = 0;

  const epc = () => `E2EB${suffix}${String(++counter).padStart(4, '0')}`;

  const item = (overrides: Record<string, unknown> = {}) => ({
    epc: epc(),
    referenceId: fx.ids.referenceA,
    finishId: fx.ids.finishA,
    quantity: 10,
    inventoryLocationId: fx.ids.location1,
    rackId: fx.ids.rack1,
    registrationType: 'INITIAL_STOCK',
    arrivalDatePrecision: 'UNKNOWN',
    ...overrides,
  });

  const batch = (bundles: unknown[], role: UserRole = 'WAREHOUSE', operationKey: string = randomUUID()) =>
    request(app.getHttpServer())
      .post('/inventory/bundles/batch')
      .set(fx.headers[role])
      .send({ operationKey, bundles });

  const countByEpcs = async (epcs: string[]) => {
    const bundles = await fx.prisma.bundle.findMany({
      where: { epc: { in: epcs } },
      select: { id: true },
    });
    const movements = await fx.prisma.inventoryMovement.count({
      where: { bundleId: { in: bundles.map((b) => b.id) } },
    });
    return { bundles: bundles.length, movements };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    fx = await createInventoryFixtures(app, suffix, ['ADMIN', 'WAREHOUSE', 'READ_ONLY']);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app?.close();
  });

  it('saves the whole list with one initial movement per bundle', async () => {
    const items = [
      item({ quantity: 4 }),
      item({
        quantity: 7,
        registrationType: 'ENTRY',
        arrivalDatePrecision: 'EXACT',
        arrivalDate: '2025-12-20',
        rackId: fx.ids.rack2,
      }),
      item({ quantity: 2, finishId: fx.ids.finishB, arrivalDatePrecision: 'MONTH', arrivalYear: 2024, arrivalMonth: 3 }),
    ];
    const res = await batch(items).expect(201);
    expect(res.body.count).toBe(3);
    expect(res.body.bundles.map((b: { epc: string }) => b.epc)).toEqual(items.map((i) => i.epc));

    const movements = await fx.prisma.inventoryMovement.findMany({
      where: { bundle: { epc: { in: items.map((i) => i.epc) } } },
      include: { bundle: { select: { epc: true } } },
    });
    expect(movements).toHaveLength(3);
    for (const movement of movements) {
      const source = items.find((i) => i.epc === movement.bundle.epc)!;
      expect(movement).toMatchObject({
        type: source.registrationType,
        quantity: source.quantity,
        quantityBefore: 0,
        quantityAfter: source.quantity,
        performedById: fx.userIds.WAREHOUSE,
      });
    }
  });

  it('rejects an EPC repeated inside the list without saving anything', async () => {
    const first = item();
    const items = [first, item(), { ...item(), epc: first.epc.toLowerCase() }];
    const res = await batch(items).expect(400);
    expect(res.body.itemIndex).toBe(2);
    expect(res.body.message).toMatch(/Paquete 3/);
    expect(await countByEpcs(items.map((i) => i.epc.toUpperCase()))).toEqual({ bundles: 0, movements: 0 });
  });

  it('rejects EPCs that are already registered, listing them, without saving anything', async () => {
    const existing = item();
    await batch([existing]).expect(201);
    const fresh = [item(), item()];
    const res = await batch([fresh[0], existing, fresh[1]]).expect(409);
    expect(res.body.epcs).toEqual([existing.epc]);
    expect(await countByEpcs(fresh.map((i) => i.epc))).toEqual({ bundles: 0, movements: 0 });
    expect(await countByEpcs([existing.epc])).toEqual({ bundles: 1, movements: 1 });
  });

  it('rolls back every bundle when one item fails inside the transaction', async () => {
    const items = [
      item(),
      item({ rackId: fx.ids.rack4 }), // rack of another location
      item(),
    ];
    const res = await batch(items).expect(400);
    expect(res.body.itemIndex).toBe(1);
    expect(res.body.message).toMatch(/^Paquete 2 \(EPC /);
    expect(await countByEpcs(items.map((i) => i.epc))).toEqual({ bundles: 0, movements: 0 });

    const inactive = [item(), item({ inventoryLocationId: fx.ids.inactiveLocation, rackId: fx.ids.inactiveRack })];
    await batch(inactive).expect(400);
    const missing = [item(), item({ referenceId: `missing-${suffix}` })];
    await batch(missing).expect(404);
    expect(await countByEpcs([...inactive, ...missing].map((i) => i.epc))).toEqual({ bundles: 0, movements: 0 });
  });

  it('validates the list and every item', async () => {
    await batch([]).expect(400);
    await batch(Array.from({ length: 51 }, () => item())).expect(400);
    await request(app.getHttpServer()).post('/inventory/bundles/batch').set(fx.headers.WAREHOUSE).send({}).expect(400);
    // The retry key is mandatory and must be a UUID.
    await request(app.getHttpServer()).post('/inventory/bundles/batch').set(fx.headers.WAREHOUSE).send({ bundles: [item()] }).expect(400);
    await batch([item()], 'WAREHOUSE', 'not-a-uuid').expect(400);
    for (const bad of [
      { quantity: 0 },
      { quantity: 2.5 },
      { epc: 'CON ESPACIO' },
      { arrivalDatePrecision: 'EXACT' },
      { arrivalDatePrecision: 'MONTH', arrivalYear: 9999, arrivalMonth: 12 },
      { performedById: fx.userIds.ADMIN },
      { length: 6 },
    ]) {
      const items = [item(), item(bad)];
      await batch(items).expect(400);
      expect(await countByEpcs(items.map((i) => String(i.epc)))).toEqual({ bundles: 0, movements: 0 });
    }
  });

  it('requires ADMIN or WAREHOUSE (403) and a session (401)', async () => {
    const items = [item()];
    await batch(items, 'READ_ONLY').expect(403);
    await request(app.getHttpServer()).post('/inventory/bundles/batch').send({ operationKey: randomUUID(), bundles: items }).expect(401);
    await batch([item()], 'ADMIN').expect(201);
    expect(await countByEpcs(items.map((i) => i.epc))).toEqual({ bundles: 0, movements: 0 });
  });

  it('two simultaneous lists sharing an EPC: only one is saved', async () => {
    const shared = item();
    const listA = [item(), shared];
    const listB = [shared, item()];
    const results = await Promise.all([batch(listA), batch(listB, 'ADMIN')]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);

    const all = [...listA, ...listB.filter((i) => i !== shared)];
    const saved = await countByEpcs(all.map((i) => i.epc));
    // The winning list saved its 2 bundles; the other saved nothing.
    expect(saved).toEqual({ bundles: 2, movements: 2 });
  });

  it('a retry after a lost response returns the saved list without duplicating it', async () => {
    const key = randomUUID();
    const items = [item({ quantity: 3 }), item({ quantity: 5, arrivalDatePrecision: 'EXACT', arrivalDate: '2025-11-02' })];
    // First attempt commits; pretend the browser never received this response.
    const first = await batch(items, 'WAREHOUSE', key).expect(201);
    expect(first.body.replayed).toBe(false);

    const retry = await batch(items, 'WAREHOUSE', key.toUpperCase()).expect(200);
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.bundles.map((b: { id: string }) => b.id)).toEqual(first.body.bundles.map((b: { id: string }) => b.id));
    expect(await countByEpcs(items.map((i) => i.epc))).toEqual({ bundles: 2, movements: 2 });

    // Still a replay after the bundles change (an exit happened meanwhile).
    await request(app.getHttpServer())
      .post('/inventory/bundles/' + first.body.bundles[0].id + '/exit')
      .set(fx.headers.WAREHOUSE)
      .send({ operationKey: randomUUID(), quantity: 1 })
      .expect(201);
    await batch(items, 'WAREHOUSE', key).expect(200);
    expect(await countByEpcs(items.map((i) => i.epc))).toEqual({ bundles: 2, movements: 3 });
  });

  it('rejects the same key with a different list, without saving anything', async () => {
    const key = randomUUID();
    const items = [item(), item()];
    await batch(items, 'WAREHOUSE', key).expect(201);

    const extra = item();
    const variants: [string, unknown[], UserRole][] = [
      ['otra cantidad', [{ ...items[0], quantity: 99 }, items[1]], 'WAREHOUSE'],
      ['menos paquetes', [items[0]], 'WAREHOUSE'],
      ['un paquete más', [...items, extra], 'WAREHOUSE'],
      ['otro orden', [items[1], items[0]], 'WAREHOUSE'],
      ['otras notas', [{ ...items[0], notes: 'cambio' }, items[1]], 'WAREHOUSE'],
      ['otro usuario', items, 'ADMIN'],
    ];
    for (const [label, list, role] of variants) {
      const res = await batch(list, role, key);
      expect(label + ':' + res.status).toBe(label + ':409');
      expect(res.body.message).toMatch(/clave de guardado ya se usó/);
    }
    expect(await countByEpcs([extra.epc])).toEqual({ bundles: 0, movements: 0 });
    expect(await countByEpcs(items.map((i) => i.epc))).toEqual({ bundles: 2, movements: 2 });
  });

  it('simultaneous retries with the same key save the list once', async () => {
    const key = randomUUID();
    const items = [item(), item(), item()];
    const results = await Promise.all([batch(items, 'WAREHOUSE', key), batch(items, 'WAREHOUSE', key), batch(items, 'WAREHOUSE', key)]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 200, 201]);
    expect(results.every((r) => r.body.count === 3)).toBe(true);
    expect(await countByEpcs(items.map((i) => i.epc))).toEqual({ bundles: 3, movements: 3 });
  });
});
