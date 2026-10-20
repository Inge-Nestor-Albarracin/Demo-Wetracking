import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { createE2eApp, uniqueSuffix } from './support/e2e.js';
import { createInventoryFixtures } from './support/inventory-fixtures.js';

// Temporary database conditions must answer 503 + Retry-After (the request
// was not applied and can be retried unchanged), never a generic 500.
// This app gets a pool of 2 connections so it can be exhausted on purpose.
describe('Transient database errors (e2e)', () => {
  const suffix = uniqueSuffix();
  let app: INestApplication<App>;
  let fx: Awaited<ReturnType<typeof createInventoryFixtures>>;

  beforeAll(async () => {
    process.env.DATABASE_POOL_MAX = '2';
    app = await createE2eApp();
    delete process.env.DATABASE_POOL_MAX;
    fx = await createInventoryFixtures(app, suffix, ['WAREHOUSE']);
  });

  afterAll(async () => {
    await fx?.cleanup();
    await app?.close();
  });

  it('pool exhausted: 503 retryable, nothing applied, and the retry succeeds once', async () => {
    const bundle = await fx.register({ quantity: 10 });
    const prisma = app.get(PrismaService);

    // Hold both pool connections with open transactions.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const started: Promise<void>[] = [];
    const holders = [1, 2].map(() => {
      let ready!: () => void;
      started.push(new Promise<void>((resolve) => (ready = resolve)));
      return prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1`;
          ready();
          await released;
        },
        { timeout: 60000 },
      );
    });
    await Promise.all(started);

    const key = randomUUID();
    const [read, write] = await Promise.all([
      request(app.getHttpServer()).get('/inventory/summary').set(fx.headers.WAREHOUSE),
      request(app.getHttpServer())
        .post(`/inventory/bundles/${bundle.id}/exit`)
        .set(fx.headers.WAREHOUSE)
        .send({ operationKey: key, quantity: 3 }),
    ]);
    release();
    await Promise.all(holders);

    for (const res of [read, write]) {
      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('2');
      expect(res.body).toMatchObject({ retryable: true });
      expect(JSON.stringify(res.body)).not.toMatch(/timeout exceeded|prisma|P20\d\d/i);
    }
    expect((await prisma.bundle.findUniqueOrThrow({ where: { id: bundle.id } })).quantity).toBe(10);

    // Same key once the database is free again: applied exactly once.
    await request(app.getHttpServer())
      .post(`/inventory/bundles/${bundle.id}/exit`)
      .set(fx.headers.WAREHOUSE)
      .send({ operationKey: key, quantity: 3 })
      .expect(201);
    expect((await prisma.bundle.findUniqueOrThrow({ where: { id: bundle.id } })).quantity).toBe(7);
  }, 60000);
});
