import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createE2eApp, uniqueSuffix } from './support/e2e.js';
import { createInventoryFixtures } from './support/inventory-fixtures.js';

type Fixtures = Awaited<ReturnType<typeof createInventoryFixtures>>;

// Bulk RFID reading: POST /inventory/bundles/lookup is read-only.
describe('Bulk reading lookup (e2e)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let fx: Fixtures;

  beforeAll(async () => {
    app = await createE2eApp();
    fx = await createInventoryFixtures(app, suffix, ['ADMIN', 'WAREHOUSE', 'READ_ONLY', 'SALES']);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app?.close();
  });

  const lookup = (epcs: unknown, role: keyof Fixtures['headers'] = 'WAREHOUSE') =>
    request(app.getHttpServer()).post('/inventory/bundles/lookup').set(fx.headers[role]).send({ epcs });

  it('returns found bundles with reference and finish, and lists the unknown chips', async () => {
    const a = await fx.register({ quantity: 12 });
    const b = await fx.register({ quantity: 7, referenceId: fx.ids.referenceB, finishId: fx.ids.finishB });
    const unknown = `E2EBULKX${suffix}`;

    const res = await lookup([b.epc.toLowerCase(), unknown, ` ${a.epc} `, a.epc]).expect(200);

    // Normalised (trim + upper case), de-duplicated and in the order received.
    expect(res.body.bundles.map((x: { epc: string }) => x.epc)).toEqual([b.epc, a.epc]);
    expect(res.body.missing).toEqual([unknown]);
    const first = res.body.bundles[0];
    expect(first.reference.id).toBe(fx.ids.referenceB);
    expect(first.reference.code).toBeDefined();
    expect(first.finish.id).toBe(fx.ids.finishB);
    expect(first.quantity).toBe(7);
    expect(first.inventoryLocation.id).toBe(fx.ids.location1);
  });

  it('is read-only: looking up chips never changes quantities or movements', async () => {
    const bundle = await fx.register({ quantity: 5 });
    const before = await fx.prisma.inventoryMovement.count({ where: { bundleId: bundle.id } });
    for (let i = 0; i < 3; i += 1) await lookup([bundle.epc]).expect(200);
    const row = await fx.prisma.bundle.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(row.quantity).toBe(5);
    expect(await fx.prisma.inventoryMovement.count({ where: { bundleId: bundle.id } })).toBe(before);
  });

  it('is available to every authenticated role and rejects anonymous requests', async () => {
    const bundle = await fx.register();
    for (const role of ['ADMIN', 'WAREHOUSE', 'READ_ONLY', 'SALES'] as const) {
      const res = await lookup([bundle.epc], role).expect(200);
      expect(res.body.bundles).toHaveLength(1);
    }
    await request(app.getHttpServer()).post('/inventory/bundles/lookup').send({ epcs: [bundle.epc] }).expect(401);
  });

  it('validates the list: non-empty, at most 200 codes, letters and digits only', async () => {
    await lookup([]).expect(400);
    await lookup('E2001234').expect(400);
    await lookup(['E200 1234']).expect(400);
    await lookup(['E200-1234']).expect(400);
    await lookup([123]).expect(400);
    await lookup(Array.from({ length: 201 }, (_, i) => `E2EMAX${i}`)).expect(400);
    const ok = await lookup(Array.from({ length: 200 }, (_, i) => `E2EMAX${suffix}${i}`)).expect(200);
    expect(ok.body.missing).toHaveLength(200);
  });
});
