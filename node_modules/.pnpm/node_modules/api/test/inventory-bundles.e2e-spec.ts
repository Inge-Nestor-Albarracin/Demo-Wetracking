import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { createE2eApp, createTestUser, uniqueSuffix } from './support/e2e.js';

// Integration test against the local database. Fixtures use a unique suffix
// and are deleted by exact ID / exact EPC in afterAll.
describe('Inventory bundles (e2e)', () => {
  const suffix = uniqueSuffix();
  const epc = (label: string) => `E2E${suffix}${label}`;
  const usedEpcs = new Set<string>();

  const created = {
    users: [] as string[],
    families: [] as string[],
    references: [] as string[],
    finishes: [] as string[],
    branches: [] as string[],
    locations: [] as string[],
    aisles: [] as string[],
    racks: [] as string[],
  };

  let app: INestApplication<App>;
  let prisma: PrismaService;
  const headers: Record<string, Record<string, string>> = {};
  const userIds: Record<string, string> = {};
  const ids = {} as Record<
    | 'family'
    | 'reference'
    | 'inactiveReference'
    | 'finish'
    | 'inactiveFinish'
    | 'location'
    | 'otherLocation'
    | 'rack'
    | 'inactiveRack'
    | 'otherRack',
    string
  >;

  const http = () => request(app.getHttpServer());

  const payload = (overrides: Record<string, unknown> = {}) => ({
    epc: epc('X'),
    referenceId: ids.reference,
    finishId: ids.finish,
    quantity: 10,
    inventoryLocationId: ids.location,
    rackId: ids.rack,
    registrationType: 'INITIAL_STOCK',
    arrivalDatePrecision: 'UNKNOWN',
    ...overrides,
  });

  const post = (body: Record<string, unknown>, role = 'WAREHOUSE') => {
    if (typeof body.epc === 'string') {
      usedEpcs.add(body.epc.trim().toUpperCase());
    }
    return http().post('/inventory/bundles').set(headers[role]).send(body);
  };

  const countFor = async (value: string) => {
    const bundles = await prisma.bundle.findMany({
      where: { epc: value },
      select: { id: true },
    });
    const movements = await prisma.inventoryMovement.count({
      where: { bundleId: { in: bundles.map((b) => b.id) } },
    });
    return { bundles: bundles.length, movements };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);

    for (const role of ['ADMIN', 'WAREHOUSE', 'SALES', 'READ_ONLY'] as const) {
      const user = await createTestUser(app, role, suffix);
      created.users.push(user.id);
      headers[role] = user.headers;
      userIds[role] = user.id;
    }

    const family = await prisma.productFamily.create({
      data: { code: `E2E-FAM-${suffix}`, name: 'Familia prueba' },
    });
    created.families.push((ids.family = family.id));

    for (const [key, active] of [
      ['reference', true],
      ['inactiveReference', false],
    ] as const) {
      const ref = await prisma.reference.create({
        data: {
          code: `E2E-REF-${key.toUpperCase()}-${suffix}`,
          familyId: family.id,
          active,
        },
      });
      created.references.push((ids[key] = ref.id));
    }

    for (const [key, active] of [
      ['finish', true],
      ['inactiveFinish', false],
    ] as const) {
      const finish = await prisma.finish.create({
        data: {
          code: `E2E-FIN-${key.toUpperCase()}-${suffix}`,
          description: 'Acabado prueba',
          active,
        },
      });
      created.finishes.push((ids[key] = finish.id));
    }

    const branch = await prisma.branch.create({
      data: { code: `E2E-BR-${suffix}`, name: 'Sucursal prueba' },
    });
    created.branches.push(branch.id);

    for (const key of ['location', 'otherLocation'] as const) {
      const location = await prisma.inventoryLocation.create({
        data: {
          branchId: branch.id,
          code: `E2E-${key.toUpperCase()}-${suffix}`,
          name: `Bodega prueba ${key}`,
        },
      });
      created.locations.push((ids[key] = location.id));

      const aisle = await prisma.aisle.create({
        data: { inventoryLocationId: location.id, number: 12 },
      });
      created.aisles.push(aisle.id);

      const rack = await prisma.rack.create({
        data: { aisleId: aisle.id, number: 7 },
      });
      created.racks.push(rack.id);

      if (key === 'location') {
        ids.rack = rack.id;
        const inactiveRack = await prisma.rack.create({
          data: { aisleId: aisle.id, number: 8, active: false },
        });
        created.racks.push((ids.inactiveRack = inactiveRack.id));
      } else {
        ids.otherRack = rack.id;
      }
    }
  });

  afterAll(async () => {
    if (prisma) {
      const epcs = [...usedEpcs];
      const bundles = await prisma.bundle.findMany({
        where: { epc: { in: epcs } },
        select: { id: true },
      });
      const bundleIds = bundles.map((b) => b.id);
      await prisma.inventoryMovement.deleteMany({
        where: { bundleId: { in: bundleIds } },
      });
      await prisma.bundle.deleteMany({ where: { id: { in: bundleIds } } });
      await prisma.rack.deleteMany({ where: { id: { in: created.racks } } });
      await prisma.aisle.deleteMany({ where: { id: { in: created.aisles } } });
      await prisma.inventoryLocation.deleteMany({
        where: { id: { in: created.locations } },
      });
      await prisma.branch.deleteMany({ where: { id: { in: created.branches } } });
      await prisma.reference.deleteMany({
        where: { id: { in: created.references } },
      });
      await prisma.finish.deleteMany({ where: { id: { in: created.finishes } } });
      await prisma.productFamily.deleteMany({
        where: { id: { in: created.families } },
      });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
      console.info(
        'E2E records removed:',
        JSON.stringify({ ...created, bundles: bundleIds }),
      );
    }
    await app?.close();
  });

  it('WAREHOUSE registers initial stock with exactly one INITIAL_STOCK movement', async () => {
    const before = Date.now();
    const raw = `  0000${suffix.toLowerCase()}a1 `;
    const res = await post(
      payload({
        epc: raw,
        quantity: 25,
        arrivalDatePrecision: 'MONTH',
        arrivalYear: 2024,
        arrivalMonth: 3,
        notes: '  Conteo físico inicial  ',
      }),
    ).expect(201);

    const body = res.body;
    expect(body.epc).toBe(`0000${suffix}A1`);
    expect(body.quantity).toBe(25);
    expect(body.arrivalDatePrecision).toBe('MONTH');
    expect(body.arrivalYear).toBe(2024);
    expect(body.arrivalMonth).toBe(3);
    expect(body.arrivalDate).toBeNull();
    expect(body.notes).toBe('Conteo físico inicial');
    expect(body.reference.family.id).toBe(ids.family);
    expect(body.rack.id).toBe(ids.rack);
    expect(body.rack.aisle.number).toBe(12);
    expect(body.inventoryLocation.id).toBe(ids.location);

    expect(body.movements).toHaveLength(1);
    const [movement] = body.movements;
    expect(movement).toMatchObject({
      type: 'INITIAL_STOCK',
      quantity: 25,
      quantityBefore: 0,
      quantityAfter: 25,
      sourceLocationId: null,
      sourceRackId: null,
      destinationLocationId: ids.location,
      destinationRackId: ids.rack,
      performedById: userIds.WAREHOUSE,
    });
    expect(movement.operationKey).toMatch(/^bundle-registration:/);
    // occurredAt is the digital registration time, not the 2024 arrival.
    const occurredAt = new Date(movement.occurredAt).getTime();
    expect(occurredAt).toBeGreaterThanOrEqual(before - 5000);
    expect(occurredAt).toBeLessThanOrEqual(Date.now() + 5000);

    expect(await countFor(body.epc)).toEqual({ bundles: 1, movements: 1 });
  });

  it('ADMIN registers a new ENTRY; the responsible user comes from the session', async () => {
    const res = await post(
      payload({
        epc: epc('ENTRY'),
        quantity: 8,
        registrationType: 'ENTRY',
        arrivalDatePrecision: 'EXACT',
        arrivalDate: '2025-12-20',
      }),
      'ADMIN',
    ).expect(201);

    expect(res.body.arrivalDate).toBe('2025-12-20T00:00:00.000Z');
    expect(res.body.arrivalYear).toBeNull();
    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0]).toMatchObject({
      type: 'ENTRY',
      quantityBefore: 0,
      quantityAfter: 8,
      performedById: userIds.ADMIN,
    });
    expect(res.body.movements[0].performedBy).toEqual({
      id: userIds.ADMIN,
      name: `E2E ADMIN ${suffix}`,
      role: 'ADMIN',
    });

    // A client cannot choose the responsible user.
    await post(
      payload({ epc: epc('SPOOF'), performedById: userIds.READ_ONLY }),
    ).expect(400);
    expect(await countFor(epc('SPOOF'))).toEqual({ bundles: 0, movements: 0 });

    await post(payload({ epc: epc('UNKNOWN') })).expect(201);
  });

  it('duplicate EPC returns 409 without a second bundle or movement', async () => {
    const value = epc('DUP');
    await post(payload({ epc: value })).expect(201);
    await post(payload({ epc: ` ${value.toLowerCase()} `, quantity: 99 })).expect(409);
    await post(payload({ epc: value, registrationType: 'ENTRY' }), 'ADMIN').expect(409);

    expect(await countFor(value)).toEqual({ bundles: 1, movements: 1 });
    const bundle = await prisma.bundle.findUniqueOrThrow({ where: { epc: value } });
    expect(bundle.quantity).toBe(10);
  });

  it('two simultaneous requests with the same EPC create only one bundle', async () => {
    const value = epc('RACE');
    const results = await Promise.all([
      post(payload({ epc: value, quantity: 3 })),
      post(payload({ epc: value, quantity: 4 }), 'ADMIN'),
      post(payload({ epc: value, quantity: 5 })),
    ]);

    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409, 409]);
    expect(await countFor(value)).toEqual({ bundles: 1, movements: 1 });
  });

  it('validates quantity, arrival dates, catalog state and rack ownership', async () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const cases: [string, Record<string, unknown>, number][] = [
      ['Q0', { quantity: 0 }, 400],
      ['QNEG', { quantity: -3 }, 400],
      ['QDEC', { quantity: 2.5 }, 400],
      ['QSTR', { quantity: '10' }, 400],
      ['EXNODATE', { arrivalDatePrecision: 'EXACT' }, 400],
      ['EXYEAR', { arrivalDatePrecision: 'EXACT', arrivalDate: '2025-01-10', arrivalYear: 2025 }, 400],
      ['EXBAD', { arrivalDatePrecision: 'EXACT', arrivalDate: '2025-02-30' }, 400],
      ['EXFMT', { arrivalDatePrecision: 'EXACT', arrivalDate: '10/01/2025' }, 400],
      ['EXFUT', { arrivalDatePrecision: 'EXACT', arrivalDate: future }, 400],
      ['MONOMONTH', { arrivalDatePrecision: 'MONTH', arrivalYear: 2024 }, 400],
      ['MO13', { arrivalDatePrecision: 'MONTH', arrivalYear: 2024, arrivalMonth: 13 }, 400],
      ['MOFUT', { arrivalDatePrecision: 'MONTH', arrivalYear: 9999, arrivalMonth: 12 }, 400],
      ['MODATE', { arrivalDatePrecision: 'MONTH', arrivalYear: 2024, arrivalMonth: 2, arrivalDate: '2024-02-01' }, 400],
      ['UNDATE', { arrivalDatePrecision: 'UNKNOWN', arrivalDate: '2024-02-01' }, 400],
      ['NOPREC', { arrivalDatePrecision: undefined }, 400],
      ['TYPE', { registrationType: 'EXIT' }, 400],
      ['OTHERRACK', { rackId: ids.otherRack }, 400],
      ['INACTRACK', { rackId: ids.inactiveRack }, 400],
      ['INACTREF', { referenceId: ids.inactiveReference }, 400],
      ['INACTFIN', { finishId: ids.inactiveFinish }, 400],
      ['NOREF', { referenceId: `missing-${suffix}` }, 404],
      ['NOFIN', { finishId: `missing-${suffix}` }, 404],
      ['NORACK', { rackId: `missing-${suffix}` }, 404],
      ['NOLOC', { inventoryLocationId: `missing-${suffix}` }, 404],
      ['NORACKID', { rackId: undefined }, 400],
      ['LENGTH', { length: 6 }, 400],
    ];

    for (const [label, overrides, expected] of cases) {
      const res = await post(payload({ epc: epc(label), ...overrides }));
      expect(`${label}:${res.status}`).toBe(`${label}:${expected}`);
      expect(await countFor(epc(label))).toEqual({ bundles: 0, movements: 0 });
    }

    for (const bad of ['', '   ', `E2E ${suffix} SPACE`, `E2E-${suffix}`]) {
      await post(payload({ epc: bad })).expect(400);
    }
  });

  it('rejects missing session (401) and roles without permission (403)', async () => {
    await http()
      .post('/inventory/bundles')
      .send(payload({ epc: epc('NOAUTH') }))
      .expect(401);
    await post(payload({ epc: epc('RO') }), 'READ_ONLY').expect(403);
    await post(payload({ epc: epc('SALES') }), 'SALES').expect(403);
    for (const label of ['NOAUTH', 'RO', 'SALES']) {
      usedEpcs.add(epc(label));
      expect(await countFor(epc(label))).toEqual({ bundles: 0, movements: 0 });
    }

    await http().get(`/inventory/bundles/epc/${epc('ENTRY')}`).expect(401);
    await http().get('/inventory/bundles/any-id').expect(401);
  });

  it('a failure after creating the bundle rolls back everything', async () => {
    const value = epc('ROLLBACK');
    const original = prisma.$transaction.bind(prisma) as (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => Promise<unknown>;
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      original((tx) =>
        fn(
          new Proxy(tx, {
            get(target, property, receiver) {
              if (property === 'inventoryMovement') {
                return {
                  create: () => Promise.reject(new Error('Fallo simulado de prueba')),
                };
              }
              return Reflect.get(target, property, receiver) as unknown;
            },
          }),
        ),
      )) as never);

    try {
      await post(payload({ epc: value })).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await countFor(value)).toEqual({ bundles: 0, movements: 0 });

    // The EPC is still free: nothing partial was left behind.
    await post(payload({ epc: value })).expect(201);
    expect(await countFor(value)).toEqual({ bundles: 1, movements: 1 });
  });

  it('looks up by exact EPC and by ID without creating inventory', async () => {
    const value = epc('ENTRY');
    const before = await prisma.bundle.count();
    const movementsBefore = await prisma.inventoryMovement.count();

    const byEpc = await http()
      .get(`/inventory/bundles/epc/${value.toLowerCase()}`)
      .set(headers.READ_ONLY)
      .expect(200);
    expect(byEpc.body.epc).toBe(value);
    expect(byEpc.body.movements).toHaveLength(1);

    await http()
      .get(`/inventory/bundles/epc/${value}`)
      .set(headers.SALES)
      .expect(200);

    const leadingZeros = await http()
      .get(`/inventory/bundles/epc/0000${suffix}A1`)
      .set(headers.READ_ONLY)
      .expect(200);
    expect(leadingZeros.body.quantity).toBe(25);

    const byId = await http()
      .get(`/inventory/bundles/${byEpc.body.id}`)
      .set(headers.READ_ONLY)
      .expect(200);
    expect(byId.body).toEqual(byEpc.body);

    // Prefix of an existing EPC is not a match: lookup is exact.
    await http()
      .get(`/inventory/bundles/epc/${value.slice(0, -1)}`)
      .set(headers.READ_ONLY)
      .expect(404);
    await http()
      .get(`/inventory/bundles/missing-${suffix}`)
      .set(headers.READ_ONLY)
      .expect(404);

    expect(await prisma.bundle.count()).toBe(before);
    expect(await prisma.inventoryMovement.count()).toBe(movementsBefore);
  });
});
