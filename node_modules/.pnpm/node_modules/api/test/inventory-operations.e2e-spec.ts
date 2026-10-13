import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Prisma, UserRole } from '../src/generated/prisma/client.js';
import { createE2eApp, uniqueSuffix } from './support/e2e.js';
import { createInventoryFixtures } from './support/inventory-fixtures.js';

type Fixtures = Awaited<ReturnType<typeof createInventoryFixtures>>;

describe('Inventory exits, transfers and adjustments (e2e)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let fx: Fixtures;

  const op = (
    bundleId: string,
    action: 'exit' | 'transfer' | 'adjustments',
    body: Record<string, unknown>,
    role: UserRole = 'WAREHOUSE',
  ) =>
    request(app.getHttpServer())
      .post(`/inventory/bundles/${bundleId}/${action}`)
      .set(fx.headers[role])
      .send(body);

  const state = async (bundleId: string) => {
    const bundle = await fx.prisma.bundle.findUniqueOrThrow({ where: { id: bundleId } });
    const movements = await fx.prisma.inventoryMovement.findMany({
      where: { bundleId },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    return { bundle, movements };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    fx = await createInventoryFixtures(app, suffix, ['ADMIN', 'WAREHOUSE', 'SALES', 'READ_ONLY']);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app?.close();
  });

  it('partial and full exits update the balance and record EXIT', async () => {
    const bundle = await fx.register({ quantity: 10 });

    const partial = await op(bundle.id, 'exit', {
      operationKey: randomUUID(), quantity: 4, reason: '  Despacho pedido 12 ',
    }).expect(201);
    expect(partial.body.replayed).toBe(false);
    expect(partial.body.bundle.quantity).toBe(6);
    expect(partial.body.movement).toMatchObject({
      type: 'EXIT', quantity: 4, quantityBefore: 10, quantityAfter: 6,
      sourceLocationId: fx.ids.location1, sourceRackId: fx.ids.rack1,
      destinationLocationId: null, reason: 'Despacho pedido 12',
      performedById: fx.userIds.WAREHOUSE,
    });

    await op(bundle.id, 'exit', { operationKey: randomUUID(), quantity: 7 }).expect(409);
    const full = await op(bundle.id, 'exit', { operationKey: randomUUID(), quantity: 6 }, 'ADMIN').expect(201);
    expect(full.body.bundle.quantity).toBe(0);
    expect(full.body.movement.performedById).toBe(fx.userIds.ADMIN);
    await op(bundle.id, 'exit', { operationKey: randomUUID(), quantity: 1 }).expect(409);

    const { bundle: row, movements } = await state(bundle.id);
    expect(row.quantity).toBe(0);
    expect(movements.map((m) => m.type)).toEqual(['INITIAL_STOCK', 'EXIT', 'EXIT']);

    for (const bad of [
      { operationKey: randomUUID(), quantity: 0 },
      { operationKey: randomUUID(), quantity: -1 },
      { operationKey: randomUUID(), quantity: 1.5 },
      { operationKey: 'not-a-uuid', quantity: 1 },
      { quantity: 1 },
      { operationKey: randomUUID(), quantity: 1, performedById: fx.userIds.ADMIN },
      { operationKey: randomUUID(), quantity: 1, inventoryLocationId: fx.ids.location2 },
    ]) {
      await op(bundle.id, 'exit', bad).expect(400);
    }
    await op(`missing-${suffix}`, 'exit', { operationKey: randomUUID(), quantity: 1 }).expect(404);
  });

  it('transfers the whole bundle without changing the total', async () => {
    const bundle = await fx.register({ quantity: 9 });
    const totalBefore = await fx.prisma.bundle.aggregate({
      where: { referenceId: fx.ids.referenceA },
      _sum: { quantity: true },
    });

    const res = await op(bundle.id, 'transfer', {
      operationKey: randomUUID(),
      inventoryLocationId: fx.ids.location2,
      rackId: fx.ids.rack4,
      reason: 'Reorganización',
    }).expect(201);
    expect(res.body.bundle).toMatchObject({
      quantity: 9, inventoryLocationId: fx.ids.location2, rackId: fx.ids.rack4,
    });
    expect(res.body.movement).toMatchObject({
      type: 'TRANSFER', quantity: 9, quantityBefore: 9, quantityAfter: 9,
      sourceLocationId: fx.ids.location1, sourceRackId: fx.ids.rack1,
      destinationLocationId: fx.ids.location2, destinationRackId: fx.ids.rack4,
    });

    const totalAfter = await fx.prisma.bundle.aggregate({
      where: { referenceId: fx.ids.referenceA },
      _sum: { quantity: true },
    });
    expect(totalAfter._sum.quantity).toBe(totalBefore._sum.quantity);

    // Same destination, rack from another location, inactive destination.
    await op(bundle.id, 'transfer', { operationKey: randomUUID(), inventoryLocationId: fx.ids.location2, rackId: fx.ids.rack4 }).expect(400);
    await op(bundle.id, 'transfer', { operationKey: randomUUID(), inventoryLocationId: fx.ids.location2, rackId: fx.ids.rack1 }).expect(400);
    await op(bundle.id, 'transfer', { operationKey: randomUUID(), inventoryLocationId: fx.ids.inactiveLocation, rackId: fx.ids.inactiveRack }).expect(400);
    await op(bundle.id, 'transfer', { operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: `missing-${suffix}` }).expect(404);
    await op(bundle.id, 'transfer', { operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack2, quantity: 3 }).expect(400);

    // Moving to another rack of the same location is allowed.
    const local = await fx.register({ quantity: 1 });
    await op(local.id, 'transfer', { operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack3 }).expect(201);

    const empty = await fx.register({ quantity: 2 });
    await op(empty.id, 'exit', { operationKey: randomUUID(), quantity: 2 }).expect(201);
    await op(empty.id, 'transfer', { operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack2 }).expect(409);

    const { movements } = await state(bundle.id);
    expect(movements.map((m) => m.type)).toEqual(['INITIAL_STOCK', 'TRANSFER']);
  });

  it('adjustments require ADMIN and a reason and never go negative', async () => {
    const bundle = await fx.register({ quantity: 5 });

    const up = await op(bundle.id, 'adjustments', {
      operationKey: randomUUID(), type: 'ADJUSTMENT_IN', quantity: 3, reason: 'Conteo físico',
    }, 'ADMIN').expect(201);
    expect(up.body.movement).toMatchObject({
      type: 'ADJUSTMENT_IN', quantity: 3, quantityBefore: 5, quantityAfter: 8,
      destinationLocationId: fx.ids.location1, reason: 'Conteo físico',
    });

    const down = await op(bundle.id, 'adjustments', {
      operationKey: randomUUID(), type: 'ADJUSTMENT_OUT', quantity: 8, reason: 'Perfiles dañados',
    }, 'ADMIN').expect(201);
    expect(down.body.movement).toMatchObject({ quantityBefore: 8, quantityAfter: 0 });

    await op(bundle.id, 'adjustments', {
      operationKey: randomUUID(), type: 'ADJUSTMENT_OUT', quantity: 1, reason: 'x',
    }, 'ADMIN').expect(409);
    for (const reason of [undefined, '', '   ']) {
      await op(bundle.id, 'adjustments', {
        operationKey: randomUUID(), type: 'ADJUSTMENT_IN', quantity: 1, reason,
      }, 'ADMIN').expect(400);
    }
    await op(bundle.id, 'adjustments', {
      operationKey: randomUUID(), type: 'EXIT', quantity: 1, reason: 'x',
    }, 'ADMIN').expect(400);
    await op(bundle.id, 'adjustments', {
      operationKey: randomUUID(), type: 'ADJUSTMENT_IN', quantity: 1, reason: 'No permitido',
    }, 'WAREHOUSE').expect(403);

    const { bundle: row, movements } = await state(bundle.id);
    expect(row.quantity).toBe(0);
    expect(movements.map((m) => m.type)).toEqual(['INITIAL_STOCK', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']);
  });

  it('rejects roles without permission (403) and missing session (401)', async () => {
    const bundle = await fx.register({ quantity: 4 });
    const exit = { operationKey: randomUUID(), quantity: 1 };
    const transfer = { operationKey: randomUUID(), inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack2 };
    for (const role of ['READ_ONLY', 'SALES'] as const) {
      await op(bundle.id, 'exit', exit, role).expect(403);
      await op(bundle.id, 'transfer', transfer, role).expect(403);
      await op(bundle.id, 'adjustments', { ...exit, type: 'ADJUSTMENT_IN', reason: 'x' }, role).expect(403);
    }
    const server = app.getHttpServer();
    await request(server).post(`/inventory/bundles/${bundle.id}/exit`).send(exit).expect(401);
    await request(server).post(`/inventory/bundles/${bundle.id}/transfer`).send(transfer).expect(401);
    await request(server).post(`/inventory/bundles/${bundle.id}/adjustments`).send(exit).expect(401);

    const { bundle: row, movements } = await state(bundle.id);
    expect(row.quantity).toBe(4);
    expect(movements).toHaveLength(1);
  });

  it('concurrent exits never consume more than the balance', async () => {
    const bundle = await fx.register({ quantity: 10 });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        op(bundle.id, 'exit', { operationKey: randomUUID(), quantity: 3 }, i % 2 ? 'ADMIN' : 'WAREHOUSE'),
      ),
    );
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 201, 201, 409, 409, 409, 409, 409]);

    const { bundle: row, movements } = await state(bundle.id);
    expect(row.quantity).toBe(1);
    const exits = movements.filter((m) => m.type === 'EXIT');
    expect(exits).toHaveLength(3);
    // Balances chain without gaps: 10 → 7 → 4 → 1.
    expect(exits.map((m) => [m.quantityBefore, m.quantityAfter]).sort((a, b) => b[0] - a[0])).toEqual([[10, 7], [7, 4], [4, 1]]);
  });

  it('retries with the same operationKey do not duplicate movements', async () => {
    const bundle = await fx.register({ quantity: 10 });
    const key = randomUUID();
    const body = { operationKey: key, quantity: 2, reason: 'Pedido 7' };

    const first = await op(bundle.id, 'exit', body).expect(201);
    const retry = await op(bundle.id, 'exit', { ...body, operationKey: key.toUpperCase() }).expect(200);
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.movement.id).toBe(first.body.movement.id);
    expect(retry.body.bundle.quantity).toBe(8);

    // Same key with different data, another operation, bundle or user → 409.
    await op(bundle.id, 'exit', { ...body, quantity: 3 }).expect(409);
    await op(bundle.id, 'exit', { ...body, reason: 'Otro' }).expect(409);
    await op(bundle.id, 'transfer', { operationKey: key, inventoryLocationId: fx.ids.location2, rackId: fx.ids.rack4 }).expect(409);
    await op(bundle.id, 'exit', body, 'ADMIN').expect(409);
    const other = await fx.register({ quantity: 5 });
    await op(other.id, 'exit', body).expect(409);

    // Concurrent duplicates of one transfer: exactly one applies.
    const transferKey = randomUUID();
    const transfer = { operationKey: transferKey, inventoryLocationId: fx.ids.location1, rackId: fx.ids.rack3 };
    const results = await Promise.all(Array.from({ length: 4 }, () => op(bundle.id, 'transfer', transfer)));
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 200, 200, 201]);
    // A replay after the fact still answers 200 with the original movement.
    await op(bundle.id, 'transfer', transfer).expect(200);

    const { bundle: row, movements } = await state(bundle.id);
    expect(row.quantity).toBe(8);
    expect(row.rackId).toBe(fx.ids.rack3);
    expect(movements.map((m) => m.type)).toEqual(['INITIAL_STOCK', 'EXIT', 'TRANSFER']);
    expect((await state(other.id)).movements).toHaveLength(1);
  });

  it('a failure after updating the bundle rolls the whole operation back', async () => {
    const bundle = await fx.register({ quantity: 6 });
    const original = fx.prisma.$transaction.bind(fx.prisma) as (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: unknown,
    ) => Promise<unknown>;
    const spy = vi.spyOn(fx.prisma, '$transaction').mockImplementationOnce(((
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: unknown,
    ) =>
      original(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(target, property, receiver) {
                if (property === 'inventoryMovement') {
                  const real = Reflect.get(target, property, receiver) as object;
                  return new Proxy(real, {
                    get(m, p, r) {
                      if (p === 'create') {
                        return () => Promise.reject(new Error('Fallo simulado de prueba'));
                      }
                      return Reflect.get(m, p, r) as unknown;
                    },
                  });
                }
                return Reflect.get(target, property, receiver) as unknown;
              },
            }),
          ),
        options,
      )) as never);

    const key = randomUUID();
    try {
      await op(bundle.id, 'exit', { operationKey: key, quantity: 4 }).expect(500);
    } finally {
      spy.mockRestore();
    }
    const after = await state(bundle.id);
    expect(after.bundle.quantity).toBe(6);
    expect(after.movements).toHaveLength(1);

    // The key was not consumed: the same request now applies normally.
    await op(bundle.id, 'exit', { operationKey: key, quantity: 4 }).expect(201);
    expect((await state(bundle.id)).bundle.quantity).toBe(2);
  });

  it('CORS only allows the configured frontend origin', async () => {
    const server = app.getHttpServer();
    const allowed = await request(server)
      .options('/inventory/bundles')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await request(server)
      .options('/inventory/bundles')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
